/** HTTP surface: knowledge base, agents, scenarios, readiness, audit. */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { IngestionClient } from '@sps/kb'
import { whatIf } from '@sps/readiness'
import { buildRunDossier, renderDossierMarkdown } from '@sps/report'
import { sha256Hex } from '@sps/storage'
import { institutionsForDomain } from '@sps/shared'
import type { DocType, Domain, InstitutionSpec, JointSituationReport, ScenarioEvent, WorkflowLens } from '@sps/shared'
import { createEngine, createScenario, recordProviderSwitch } from '../engine.js'
import { healthDataBreach } from '../scenarios.js'
import { config } from '../config.js'

const engine = createEngine()
const ingestion = new IngestionClient({ baseUrl: config.ingestion.baseUrl, apiKey: config.ingestion.apiKey })

const lensSchema = z.enum(['simulation', 'readiness', 'hybrid'])

/** In-memory facilitator session for tick-by-tick scenario release. */
interface ScenarioSession {
  runId: string
  country: string
  domain: Domain
  institutions: InstitutionSpec[]
  events: ScenarioEvent[]
  ticks: number[]
  released: number
  history: ScenarioEvent[]
  reports: JointSituationReport[]
}

const scenarioSessions = new Map<string, ScenarioSession>()

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Announce the active provider in the audit chain (no-op when unchanged).
  void recordProviderSwitch(engine.provider, engine.audit)

  app.get('/health', async () => ({
    status: 'ok',
    service: 'sps-api',
    provider: { mode: engine.provider.mode, model: engine.provider.models.reasoning },
  }))

  // ── Active provider (secret-free: what answers, and where) ────────────────
  app.get('/v1/provider', async () => engine.provider)

  // ── Knowledge base ────────────────────────────────────────────────────────
  app.post('/v1/kb/ingest', async (request, reply) => {
    const body = z
      .object({
        text: z.string().min(1),
        filename: z.string().min(1),
        country: z.string().length(2).or(z.literal('global')),
        jurisdiction: z.enum(['national', 'regional', 'international']).default('national'),
        docType: z.string().default('policy'),
        namespace: z.string().optional(),
        version: z.string().optional(),
        sourceUrl: z.string().url().optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const result = await ingestion.ingestText({ ...body.data, docType: body.data.docType as DocType })
    return result
  })

  // ── Single mandated agent (text, optionally multimodal) ───────────────────
  app.post('/v1/agents/ask', async (request, reply) => {
    const body = z
      .object({
        institutionId: z.string(),
        question: z.string().min(1),
        country: z.string().length(2),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
        lens: lensSchema.default('hybrid'),
        runId: z.string().optional(),
        // Untrusted user images (context only, never citable).
        attachments: z
          .array(z.object({ mime: z.string(), dataBase64: z.string() }))
          .max(3)
          .optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const institution = institutionsForDomain(body.data.domain as Domain).find((i) => i.id === body.data.institutionId)
    if (!institution) return reply.status(404).send({ error: `Unknown institution "${body.data.institutionId}"` })

    // Persist attachments (content-addressed, best-effort: works without MinIO).
    const attachmentMeta = []
    for (const attachment of body.data.attachments ?? []) {
      if (!attachment.mime.startsWith('image/')) {
        return reply.status(415).send({ error: `Unsupported attachment type: ${attachment.mime}` })
      }
      const data = Buffer.from(attachment.dataBase64, 'base64')
      if (data.byteLength > 5 * 1024 * 1024) {
        return reply.status(413).send({ error: 'Attachment too large (max 5 MB).' })
      }
      try {
        const stored = await engine.storage.putContentAddressed(data, attachment.mime)
        attachmentMeta.push({ sha256: stored.sha256, mime: stored.mime, size: stored.size, key: stored.key })
      } catch {
        attachmentMeta.push({ sha256: sha256Hex(data), mime: attachment.mime, size: data.byteLength, key: '' })
      }
    }

    return engine.orchestrator.runAgent({
      institution,
      question: body.data.question,
      country: body.data.country,
      domain: body.data.domain as Domain,
      lens: body.data.lens as WorkflowLens,
      runId: body.data.runId,
      attachments: body.data.attachments,
      attachmentMeta,
    })
  })

  // ── Scenarios: progressive release + multi-agent reconciliation ───────────

  function buildSession(country: string, domain: Domain): ScenarioSession {
    const run = createScenario(healthDataBreach(country), 'simulation').toRun()
    return {
      runId: run.id,
      country,
      domain,
      institutions: institutionsForDomain(domain),
      events: run.events,
      ticks: [...new Set(run.events.map((e) => e.releaseChunk))].sort((a, b) => a - b),
      released: 0,
      history: [],
      reports: [],
    }
  }

  /** Release the next tick (facilitator gate) and reconcile it. */
  async function releaseNext(session: ScenarioSession) {
    if (session.released >= session.ticks.length) return { done: true as const, tick: null, report: null }
    const tick = session.ticks[session.released]!
    const events = session.events.filter((e) => e.releaseChunk === tick)
    session.history.push(...events)

    const assessments = await engine.coordinator.runTick({
      runId: session.runId,
      tick,
      country: session.country,
      domain: session.domain,
      lens: 'simulation',
      institutions: session.institutions,
      events,
      history: [...session.history],
    })
    const report = await engine.coordinator.reconcile({
      runId: session.runId,
      tick,
      country: session.country,
      domain: session.domain,
      assessments,
    })
    session.reports.push(report)
    session.released += 1
    await engine.reports.saveReports(session.runId, session.reports)
    return { done: session.released >= session.ticks.length, tick, report }
  }

  async function dossierFor(runId: string, reports: JointSituationReport[]) {
    return buildRunDossier({
      runId,
      audit: await engine.audit.getAuditForRun(runId),
      traces: await engine.audit.getTrace(runId),
      reports,
      integrity: await engine.audit.verifyChain(),
    })
  }

  // SSE stream of all ticks (fixed delay) — for passive viewers.
  app.get('/v1/scenarios/:id/release', async (request, reply) => {
    const query = z.object({ country: z.string().default('cm') }).parse(request.query)
    const scenario = createScenario(healthDataBreach(query.country), 'simulation')
    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
    for await (const batch of scenario.release({ chunkDelayMs: 800 })) {
      reply.raw.write(`data: ${JSON.stringify(batch)}\n\n`)
    }
    reply.raw.write('event: done\ndata: {}\n\n')
    reply.raw.end()
  })

  // Start a facilitator session (returns the agenda, not the content).
  app.post('/v1/scenarios/start', async (request, reply) => {
    const body = z
      .object({
        id: z.string().default('health-data-breach'),
        country: z.string().length(2).default('cm'),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']).default('health'),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const session = buildSession(body.data.country, body.data.domain as Domain)
    scenarioSessions.set(session.runId, session)
    return {
      runId: session.runId,
      country: session.country,
      domain: session.domain,
      totalTicks: session.ticks.length,
      agents: session.institutions.map((i) => i.id),
      agenda: session.events.map((e) => ({
        sequence: e.sequence,
        releaseChunk: e.releaseChunk,
        title: e.title,
        visibleTo: e.visibleTo,
      })),
    }
  })

  // Release the next tick (the `onBeforeRelease` facilitator gate).
  app.post('/v1/scenarios/:runId/next', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const session = scenarioSessions.get(runId)
    if (!session) return reply.status(404).send({ error: `Unknown scenario session "${runId}"` })

    const result = await releaseNext(session)
    return {
      runId,
      releasedTicks: session.released,
      totalTicks: session.ticks.length,
      done: result.done,
      tick: result.tick,
      // The facts released in this chunk, as the incident timeline shows them.
      events: result.tick === null ? [] : session.events.filter((e) => e.releaseChunk === result.tick),
      report: result.report,
    }
  })

  // Current state of a session.
  app.get('/v1/scenarios/:runId', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const session = scenarioSessions.get(runId)
    if (!session) return reply.status(404).send({ error: `Unknown scenario session "${runId}"` })
    return {
      runId,
      country: session.country,
      domain: session.domain,
      releasedTicks: session.released,
      totalTicks: session.ticks.length,
      done: session.released >= session.ticks.length,
      reports: session.reports,
    }
  })

  // Auto-run: start + release every tick + dossier.
  app.post('/v1/scenarios/run', async (request, reply) => {
    const body = z
      .object({
        id: z.string().default('health-data-breach'),
        country: z.string().length(2).default('cm'),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']).default('health'),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const session = buildSession(body.data.country, body.data.domain as Domain)
    scenarioSessions.set(session.runId, session)
    while (session.released < session.ticks.length) {
      await releaseNext(session)
    }
    const dossier = await dossierFor(session.runId, session.reports)
    return {
      runId: session.runId,
      country: session.country,
      domain: session.domain,
      ticks: session.reports,
      events: session.events,
      dossier,
    }
  })

  // ── Readiness assessment ──────────────────────────────────────────────────
  app.post('/v1/readiness/report', async (request, reply) => {
    const body = z
      .object({
        country: z.string().length(2),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
        globalCountry: z.string().default('global'),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    return engine.readiness.assess({
      country: body.data.country,
      domain: body.data.domain as Domain,
      globalCountry: body.data.globalCountry,
    })
  })

  // ── Readiness what-if (causal propagation across dimensions) ──────────────
  app.post('/v1/readiness/whatif', async (request, reply) => {
    const body = z
      .object({
        country: z.string().length(2),
        domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
        changes: z.record(z.string(), z.number()),
        /** Optional baseline; if omitted, a full assessment is run first. */
        scores: z.array(z.any()).optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const baseline =
      (body.data.scores as Parameters<typeof whatIf>[0]['scores'] | undefined) ??
      (await engine.readiness.assess({ country: body.data.country, domain: body.data.domain as Domain })).scores

    return whatIf({
      country: body.data.country,
      domain: body.data.domain as Domain,
      scores: baseline,
      changes: body.data.changes as Parameters<typeof whatIf>[0]['changes'],
    })
  })

  // ── Audit ─────────────────────────────────────────────────────────────────
  app.get('/v1/audit/chain', async () => engine.audit.verifyChain())
  app.get('/v1/audit/trace/:runId', async (request) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    return { runId, trace: await engine.audit.getTrace(runId) }
  })

  // ── Run dossier (audit + CoT + reports + citations) ───────────────────────
  app.get('/v1/audit/dossier/:runId', async (request, reply) => {
    const { runId } = z.object({ runId: z.string() }).parse(request.params)
    const format = z.object({ format: z.enum(['json', 'markdown']).default('json') }).parse(request.query)

    const dossier = buildRunDossier({
      runId,
      audit: await engine.audit.getAuditForRun(runId),
      traces: await engine.audit.getTrace(runId),
      reports: await engine.reports.getReports(runId),
      integrity: await engine.audit.verifyChain(),
    })

    if (format.format === 'markdown') {
      return reply.type('text/markdown').send(renderDossierMarkdown(dossier))
    }
    return dossier
  })
}
