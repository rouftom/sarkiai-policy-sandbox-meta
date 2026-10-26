/** HTTP surface: knowledge base, agents, scenarios, readiness, audit. */

import { providerApiKey } from '@sps/agents'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  analyzeGazettePage,
  META_GAZETTE_PRICING,
  SamClient,
  toKbChunks,
  type GazettePage,
} from '@sps/gazette'
import { analyzeImpact } from '@sps/impact'
import { IngestionClient } from '@sps/kb'
import { whatIf } from '@sps/readiness'
import { LocalAsrClient, MetaAsrClient, toVoiceFacts, type VoiceMode } from '@sps/voice'
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

/** A page larger than this is a mistake or an attack, not a gazette scan. */
const GAZETTE_MAX_BYTES = 12 * 1024 * 1024

/**
 * SAM 3.1 is a Meta Model API model: it exists in `cloud` mode only. In
 * `sovereign` and `local` the pipeline still segments by projection profile and
 * transcribes zone by zone — the artefact overlay is simply absent.
 */
function gazetteSam(): SamClient | undefined {
  if (engine.provider.mode !== 'cloud' || !engine.provider.models.segmentation) return undefined
  return new SamClient({
    baseUrl: engine.provider.baseURL,
    apiKey: providerApiKey(engine.provider),
    model: engine.provider.models.segmentation,
  })
}

/** List prices are only meaningful when the work actually bills Meta. */
function gazettePricing() {
  return engine.provider.mode === 'cloud' ? META_GAZETTE_PRICING : undefined
}


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

  // ── N3: scanned gazette ingestion ─────────────────────────────────────────
  // A gazette has no text layer. The page is segmented geometrically, every zone
  // is transcribed by the vision model, and visual artefacts (stamp, signature,
  // table) are located by SAM 3.1. The response carries page/column/bbox
  // provenance for every line, so the console can show what was read where.
  app.post('/v1/gazette/analyze', { bodyLimit: 20 * 1024 * 1024 }, async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1).max(200),
        imageBase64: z.string().min(1),
        mime: z.enum(['image/png', 'image/jpeg']).optional(),
        page: z.number().int().min(1).max(10_000).default(1),
        sourceUrl: z.string().url().optional(),
        maxZones: z.number().int().min(1).max(48).default(24),
        concurrency: z.number().int().min(1).max(8).default(4),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const bytes = Buffer.from(body.data.imageBase64.replace(/^data:[^,]+,/, ''), 'base64')
    if (bytes.byteLength === 0) return reply.status(400).send({ error: 'Empty image.' })
    if (bytes.byteLength > GAZETTE_MAX_BYTES) {
      return reply.status(413).send({ error: 'Page too large (max 12 MB per page).' })
    }

    try {
      const page = await analyzeGazettePage({
        bytes,
        ...(body.data.mime ? { mime: body.data.mime } : {}),
        filename: body.data.filename,
        page: body.data.page,
        ...(body.data.sourceUrl ? { sourceUrl: body.data.sourceUrl } : {}),
        model: engine.model,
        modelLabel: engine.provider.models.vision,
        provider: engine.provider,
        sam: gazetteSam(),
        maxZones: body.data.maxZones,
        concurrency: body.data.concurrency,
        pricing: gazettePricing(),
      })

      // The page image is content-addressed and kept with the analysis, so a
      // citation opened months later still resolves to the exact scan.
      try {
        await engine.storage.putContentAddressed(Buffer.from(bytes), page.image.mime)
      } catch {
        // Object storage is optional; provenance keeps the sha256 regardless.
      }

      return page
    } catch (error) {
      request.log.error(error)
      return reply.status(422).send({ error: (error as Error).message })
    }
  })

  // Push a transcribed page into the knowledge base. One document per page keeps
  // the ingestion service's structural chunker in charge; every zone heading and
  // the page-level source URL survive in the chunk text.
  app.post('/v1/gazette/ingest', async (request, reply) => {
    const body = z
      .object({
        page: z.custom<GazettePage>((value) => {
          const candidate = value as Partial<GazettePage> | null
          return Boolean(candidate && typeof candidate.documentId === 'string' && Array.isArray(candidate.regions))
        }, 'Expected a page returned by /v1/gazette/analyze.'),
        country: z.string().length(2).or(z.literal('global')),
        jurisdiction: z.enum(['national', 'regional', 'international']).default('national'),
        docType: z.string().default('regulation'),
        namespace: z.string().optional(),
        version: z.string().optional(),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const chunks = toKbChunks(body.data.page, {
      country: body.data.country,
      jurisdiction: body.data.jurisdiction,
      docType: body.data.docType as DocType,
      ...(body.data.namespace ? { namespace: body.data.namespace } : {}),
      ...(body.data.version ? { version: body.data.version } : {}),
    })
    if (chunks.length === 0) {
      return reply.status(422).send({ error: 'No readable text on this page; nothing to ingest.' })
    }

    const text = chunks.map((chunk) => `## ${chunk.headingPath}\n\n${chunk.text}`).join('\n\n')
    const sourceUrl = chunks[0]!.sourceUrl
    try {
      const result = await ingestion.ingestText({
        text,
        filename: body.data.page.filename,
        country: body.data.country,
        jurisdiction: body.data.jurisdiction,
        docType: body.data.docType as DocType,
        ...(body.data.namespace ? { namespace: body.data.namespace } : {}),
        ...(body.data.version ? { version: body.data.version } : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
      })
      return {
        documentId: body.data.page.documentId,
        page: body.data.page.page,
        zones: chunks.length,
        sourceUrl,
        ...result,
      }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: `Ingestion service unavailable: ${(error as Error).message}` })
    }
  })

  // ── N6: voice notes as timed facts ────────────────────────────────────────
  // Cloud calls Muse Voice Transcribe; sovereign/local call the on-premise
  // faster-whisper service. Both come back as the same transcript + turns, and
  // `facts` puts each turn on the incident timeline with its offset.
  app.post('/v1/voice/transcribe', { bodyLimit: 44 * 1024 * 1024 }, async (request, reply) => {
    const body = z
      .object({
        audioBase64: z.string().min(1),
        filename: z.string().min(1).max(200).default('note.wav'),
        mode: z.enum(['PUSH_TO_TALK', 'ENDPOINTING', 'DIARIZATION']).default('ENDPOINTING'),
        languageBias: z.array(z.string().min(2).max(40)).max(4).optional(),
        keywords: z.array(z.string().min(1).max(60)).max(32).optional(),
        sessionId: z.string().min(1).max(80).optional(),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const audio = Buffer.from(body.data.audioBase64.replace(/^data:[^,]+,/, ''), 'base64')
    if (audio.byteLength === 0) return reply.status(400).send({ error: 'Empty audio.' })
    if (audio.byteLength > 32 * 1024 * 1024) {
      return reply.status(413).send({ error: 'Audio too large (max 32 MB per recording).' })
    }

    const client =
      engine.provider.mode === 'cloud' && engine.provider.models.transcription
        ? new MetaAsrClient({
            baseUrl: engine.provider.baseURL,
            apiKey: providerApiKey(engine.provider),
            model: engine.provider.models.transcription,
          })
        : new LocalAsrClient({
            baseUrl: config.transcription.url,
            apiKey: config.serviceApiKey,
            model: 'faster-whisper',
          })

    try {
      const transcript = await client.transcribe({
        audio,
        filename: body.data.filename,
        mode: body.data.mode as VoiceMode,
        ...(body.data.languageBias ? { languageBias: body.data.languageBias } : {}),
        ...(body.data.keywords ? { keywords: body.data.keywords } : {}),
        ...(body.data.sessionId ? { sessionId: body.data.sessionId } : {}),
      })
      return { ...transcript, facts: toVoiceFacts(transcript) }
    } catch (error) {
      request.log.error(error)
      return reply.status(422).send({ error: (error as Error).message })
    }
  })

  // ── N7: legislative impact on open incidents ──────────────────────────────
  // A new provision does not open a new case: it re-opens the ones already
  // persisted. Candidate runs are selected deterministically (same article and
  // instrument) and the model only ranks and explains them.
  app.post('/v1/impact/analyze', async (request, reply) => {
    const body = z
      .object({
        provision: z.object({
          title: z.string().min(1).max(300),
          text: z.string().min(1).max(20_000),
          articleNumber: z.string().max(80).optional(),
          docType: z.string().max(40).optional(),
          sourceUrl: z.string().url().optional(),
          effectiveDate: z.string().max(40).optional(),
        }),
        runIds: z.array(z.string().min(1)).min(1).max(20),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const cases = []
    for (const runId of body.data.runIds) {
      const reports = await engine.reports.getReports(runId).catch(() => [])
      if (reports.length === 0) continue
      const session = scenarioSessions.get(runId)
      cases.push({
        runId,
        country: reports[0]!.country,
        domain: reports[0]!.domain,
        reports: reports.length,
        citations: reports.flatMap((report) => report.citations),
        facts: session ? session.history.map((event) => `${event.title}: ${event.payload}`) : [],
      })
    }
    if (cases.length === 0) {
      return reply.status(404).send({ error: 'No persisted reports for those run ids.' })
    }

    try {
      const analysis = await analyzeImpact({
        model: engine.model,
        modelLabel: engine.provider.models.reasoning,
        provision: body.data.provision,
        cases,
      })
      try {
        await engine.audit.logAction({
          actor: 'system',
          action: 'impact.analyzed',
          target: `provision:${body.data.provision.title}:${body.data.provision.articleNumber ?? '-'}`,
          lens: 'hybrid',
        })
      } catch {
        // The analysis is still returned when the audit store is unreachable.
      }
      return analysis
    } catch (error) {
      request.log.error(error)
      return reply.status(422).send({ error: (error as Error).message })
    }
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
