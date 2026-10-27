/** HTTP surface: knowledge base, agents, scenarios, readiness, audit. */

import { providerApiKey, describeProvider } from '@sps/agents'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  analyzeGazettePage,
  META_GAZETTE_PRICING,
  SamClient,
  toKbChunks,
  type GazettePage,
} from '@sps/gazette'
import { CommunicationPolicyError, COMMUNICATION_LANGUAGES, draftCommunication } from '@sps/communications'
import { evaluateExercise, writeAfterAction, type ExerciseDefinition } from '@sps/exercise'
import { analyzeImpact } from '@sps/impact'
import { IngestionClient } from '@sps/kb'
import type { AtlasIngestor } from '@sps/retrieval'
import { whatIf } from '@sps/readiness'
import {
  WhatsAppClient,
  WHATSAPP_TEMPLATES,
  approvalUrl,
  createApprovalToken,
  verifyApprovalToken,
} from '@sps/whatsapp'
import { LocalAsrClient, MetaAsrClient, toVoiceFacts, type VoiceMode } from '@sps/voice'
import { buildRunDossier, renderDossierMarkdown } from '@sps/report'
import { sha256Hex } from '@sps/storage'
import { institutionsForDomain } from '@sps/shared'
import type { DocType, Domain, InstitutionSpec, JointSituationReport, ScenarioEvent, WorkflowLens } from '@sps/shared'
import { createEngine, createKnowledgeIngestor, createScenario, recordProviderSwitch } from '../engine.js'
import { ApprovalStore, type ApprovalDecision } from '../approvals.js'
import { healthDataBreach } from '../scenarios.js'
import { healthBreachExercise } from '../exercises.js'
import { config } from '../config.js'
import { currentOperator, registerAuthRoutes } from '../auth-routes.js'
import { defaultChatModel } from '@sps/agents'
import { auth } from '../auth.js'

const engine = createEngine()
const ingestion = new IngestionClient({ baseUrl: config.ingestion.baseUrl, apiKey: config.ingestion.apiKey })
const knowledge: AtlasIngestor = createKnowledgeIngestor()

const whatsapp = new WhatsAppClient({
  version: config.whatsapp.version,
  phoneNumberId: config.whatsapp.phoneNumberId,
  accessToken: config.whatsapp.accessToken,
  verifyToken: config.whatsapp.verifyToken,
  appSecret: config.whatsapp.appSecret,
  apiBaseUrl: config.whatsapp.apiBaseUrl,
})
const approvals = new ApprovalStore({
  mongodbUri: config.mongodb.uri,
  dbName: config.mongodb.dbName,
})

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


/**
 * The chat model is never read from the environment. On boot the engine takes
 * the model the operator saved last (if still eligible), otherwise the first
 * chat-capable model Meta lists for this key.
 */
async function selectBootModel(app: FastifyInstance): Promise<void> {
  if (engine.provider.mode !== 'cloud') return
  const saved = await auth.activeModel().catch(() => null)
  try {
    const models = await engine.listModels()
    const pick = models.find((m) => m.id === saved) ?? defaultChatModel(models)
    if (!pick) {
      app.log.error('Meta model list is empty: no chat model selected')
      return
    }
    engine.useModel(pick.id)
    app.log.info({ model: pick.id, eligible: models.length }, 'chat model selected from the Meta model list')
  } catch (error) {
    app.log.error({ error: (error as Error).message }, 'Meta model list unavailable')
    if (saved) engine.useModel(saved)
  }
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerAuthRoutes(app, engine.audit)

  // Announce the active provider in the audit chain (no-op when unchanged).
  void recordProviderSwitch(engine.provider, engine.audit)
  void selectBootModel(app)

  // ── Chat models: Meta's own list, one saved choice per operator ───────────
  app.get('/v1/models', async (request, reply) => {
    if (engine.provider.mode !== 'cloud') {
      return { mode: engine.provider.mode, selected: engine.provider.models.reasoning, models: [] }
    }
    try {
      return {
        mode: engine.provider.mode,
        selected: engine.provider.models.reasoning,
        models: await engine.listModels(),
      }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  app.put('/v1/models/selection', async (request, reply) => {
    const operator = currentOperator(request)
    if (!operator) return reply.status(401).send({ error: 'unauthenticated' })
    const body = z.object({ model: z.string().min(1).max(120) }).safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    if (engine.provider.mode !== 'cloud') {
      return reply.status(409).send({ error: 'Model selection applies to the Meta Model API mode only.' })
    }

    let models: Awaited<ReturnType<typeof engine.listModels>>
    try {
      models = await engine.listModels()
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
    if (!models.some((m) => m.id === body.data.model)) {
      return reply.status(400).send({ error: 'model_not_eligible', message: 'This model is not in the Meta list for this key.' })
    }

    engine.useModel(body.data.model)
    await auth.updatePreferences(operator.email, { model: body.data.model })
    await engine.audit
      .logAction({ actor: operator.email, action: 'model.selected', target: body.data.model, lens: 'hybrid' })
      .catch(() => undefined)
    return { selected: body.data.model }
  })

  app.get('/health', async () => ({
    status: 'ok',
    service: 'sps-api',
    provider: { mode: engine.provider.mode, model: engine.provider.models.reasoning },
  }))

  // ── Active provider (secret-free: what answers, and where) ────────────────
  app.get('/v1/provider', async () => engine.provider)

  // ── Knowledge base ────────────────────────────────────────────────────────
  // Live corpus + Atlas index state. This is the source of truth behind the
  // Knowledge base screen: counts, embeddings, `READY` vs `BUILDING` indexes.
  app.get('/v1/kb/status', async (request, reply) => {
    if (engine.retrievalBackend !== 'atlas') {
      return {
        backend: engine.retrievalBackend,
        provider: { mode: engine.provider.mode, reasoning: engine.provider.models.reasoning },
        collection: config.qdrant.collection,
        collectionExists: undefined,
        totals: { chunks: 0, activeChunks: 0, documents: 0, characters: 0, lastIngestedAt: null },
        byCountry: [],
        byDocType: [],
        indexes: { supported: false, collectionExists: false, indexes: [], error: 'Atlas is only used in cloud mode.' },
        expectedIndexes: [],
        embedding: {
          model: config.embeddings.model,
          rerankModel: config.rerank.model,
          dimensions: null,
          missingVectors: 0,
          mismatchedVectors: 0,
          voyageConfigured: false,
        },
        recentRuns: [],
      }
    }
    try {
      const status = await knowledge.status()
      return {
        backend: engine.retrievalBackend,
        provider: { mode: engine.provider.mode, reasoning: engine.provider.models.reasoning },
        ...status,
      }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: `Knowledge base unavailable: ${(error as Error).message}` })
    }
  })

  app.get('/v1/kb/documents', async (request, reply) => {
    if (engine.retrievalBackend !== 'atlas') return reply.status(409).send({ error: 'Atlas knowledge base is not the active backend.' })
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        q: z.string().max(120).optional(),
        includeRetired: z.coerce.boolean().default(false),
      })
      .safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })
    try {
      return { documents: await knowledge.listDocuments(query.data) }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  app.post('/v1/kb/documents/active', async (request, reply) => {
    if (engine.retrievalBackend !== 'atlas') return reply.status(409).send({ error: 'Atlas knowledge base is not the active backend.' })
    const body = z
      .object({ filename: z.string().min(1), active: z.boolean() })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const modified = await knowledge.setDocumentActive(body.data.filename, body.data.active)
      return { filename: body.data.filename, active: body.data.active, modified }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /** Create or repair the Atlas vector + BM25 indexes, on demand. */
  app.post('/v1/kb/indexes', async (request, reply) => {
    if (engine.retrievalBackend !== 'atlas') return reply.status(409).send({ error: 'Atlas knowledge base is not the active backend.' })
    try {
      const result = await knowledge.ensureIndexes()
      return result
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /** Full-text ingestion: chunk → embed → upsert → ensure indexes. */
  app.post('/v1/kb/ingest/text', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    if (engine.retrievalBackend !== 'atlas') {
      return reply.status(409).send({ error: 'Direct ingestion is available in cloud mode (Atlas + Voyage).' })
    }
    const body = z
      .object({
        text: z.string().min(24).max(2_000_000),
        filename: z.string().min(1).max(200),
        country: z.string().min(2).max(2).or(z.literal('global')),
        jurisdiction: z.enum(['national', 'regional', 'international']).default('national'),
        docType: z.string().min(1).default('policy'),
        namespace: z.string().max(80).optional(),
        version: z.string().max(80).optional(),
        sourceUrl: z.string().url().optional(),
        maxChars: z.number().int().min(300).max(6000).optional(),
        overlapChars: z.number().int().min(0).max(1000).optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const result = await knowledge.ingest({ ...body.data, docType: body.data.docType as DocType })
      if (!result.ok) return reply.status(422).send(result)
      return result
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /**
   * File upload from the console: PDF or plain text, sent as base64 JSON. The
   * API extracts the text (PDF via unpdf, no system binary) and runs the same
   * ingestion path as pasted text. Scans without a text layer are refused with
   * a pointer to the Gazette screen instead of being stored empty.
   */
  app.post('/v1/kb/ingest/file', { bodyLimit: 25 * 1024 * 1024 }, async (request, reply) => {
    if (engine.retrievalBackend !== 'atlas') {
      return reply.status(409).send({ error: 'Direct ingestion is available in cloud mode (Atlas + Voyage).' })
    }
    const body = z
      .object({
        filename: z.string().min(1).max(200),
        contentBase64: z.string().min(4).max(34_000_000),
        country: z.string().min(2).max(2).or(z.literal('global')),
        jurisdiction: z.enum(['national', 'regional', 'international']).default('national'),
        docType: z.string().min(1).default('policy'),
        namespace: z.string().max(80).optional(),
        version: z.string().max(80).optional(),
        sourceUrl: z.string().url().optional(),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const bytes = Buffer.from(body.data.contentBase64, 'base64')
    let text: string
    try {
      if (/\.pdf$/i.test(body.data.filename)) {
        const { extractText, getDocumentProxy } = await import('unpdf')
        const pdf = await getDocumentProxy(new Uint8Array(bytes))
        text = String((await extractText(pdf, { mergePages: true })).text ?? '')
      } else {
        text = bytes.toString('utf8')
      }
    } catch (error) {
      return reply.status(422).send({ error: `Could not read the file: ${(error as Error).message}` })
    }

    if (text.trim().length < 200) {
      return reply.status(422).send({
        error: 'No text layer found. A scanned document goes through the Scanned gazette screen (OCR and zone segmentation).',
      })
    }

    try {
      const result = await knowledge.ingest({
        text,
        filename: body.data.filename.replace(/\.pdf$/i, '.txt'),
        country: body.data.country,
        jurisdiction: body.data.jurisdiction,
        docType: body.data.docType as DocType,
        ...(body.data.namespace ? { namespace: body.data.namespace } : {}),
        ...(body.data.version ? { version: body.data.version } : {}),
        ...(body.data.sourceUrl ? { sourceUrl: body.data.sourceUrl } : {}),
      })
      if (!result.ok) return reply.status(422).send(result)
      return result
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /** Retrieval playground: every stage, with scores and provenance. */
  app.post('/v1/kb/search', async (request, reply) => {
    if (engine.retrievalBackend !== 'atlas') return reply.status(409).send({ error: 'Atlas knowledge base is not the active backend.' })
    const body = z
      .object({
        text: z.string().min(2).max(2000),
        country: z.string().min(2).max(2).or(z.literal('global')).or(z.literal('')).default(''),
        jurisdiction: z.enum(['national', 'regional', 'international']).optional(),
        docType: z.string().optional(),
        namespace: z.string().optional(),
        topK: z.number().int().min(1).max(12).default(6),
      })
      .safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })
    try {
      const exploration = await knowledge.explore({
        text: body.data.text,
        country: body.data.country,
        ...(body.data.jurisdiction ? { jurisdiction: body.data.jurisdiction } : {}),
        ...(body.data.docType ? { docType: body.data.docType as DocType } : {}),
        ...(body.data.namespace ? { namespace: body.data.namespace } : {}),
        topK: body.data.topK,
      })
      return exploration
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  /**
   * Cloud mode does not need the optional Python service: go straight through
   * `AtlasIngestor` so the public demo can vectorise a document. Local and
   * sovereign modes keep the service (Qdrant + bge-m3).
   */
  async function ingestText(input: Parameters<IngestionClient['ingestText']>[0]) {
    if (engine.retrievalBackend === 'atlas') {
      const result = await knowledge.ingest({
        text: input.text,
        filename: input.filename,
        country: input.country,
        jurisdiction: input.jurisdiction,
        docType: input.docType,
        ...(input.namespace ? { namespace: input.namespace } : {}),
        ...(input.version ? { version: input.version } : {}),
        ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      })
      if (!result.ok) throw new Error(result.error ?? 'Knowledge ingestion failed.')
      return {
        success: true,
        filename: result.filename,
        country: result.country,
        docType: result.docType,
        chunksProcessed: result.chunks,
        chunksInserted: result.inserted,
        chunksSkipped: result.unchanged,
        usedOcr: false,
      }
    }
    return ingestion.ingestText(input)
  }

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

    const result = await ingestText({ ...body.data, docType: body.data.docType as DocType })
    return result
  })

  // ── Single mandated agent (text, optionally multimodal) ───────────────────
  const askBody = z.object({
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

  /** Persist attachments (content-addressed, best-effort: works without MinIO). */
  async function storeAttachments(attachments: Array<{ mime: string; dataBase64: string }> | undefined) {
    const meta: Array<{ sha256: string; mime: string; size: number; key: string }> = []
    for (const attachment of attachments ?? []) {
      if (!attachment.mime.startsWith('image/')) {
        return { ok: false as const, status: 415, message: `Unsupported attachment type: ${attachment.mime}` }
      }
      const data = Buffer.from(attachment.dataBase64, 'base64')
      if (data.byteLength > 5 * 1024 * 1024) {
        return { ok: false as const, status: 413, message: 'Attachment too large (max 5 MB).' }
      }
      try {
        const stored = await engine.storage.putContentAddressed(data, attachment.mime)
        meta.push({ sha256: stored.sha256, mime: stored.mime, size: stored.size, key: stored.key })
      } catch {
        meta.push({ sha256: sha256Hex(data), mime: attachment.mime, size: data.byteLength, key: '' })
      }
    }
    return { ok: true as const, meta }
  }

  app.post('/v1/agents/ask', async (request, reply) => {
    const body = askBody.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const institution = institutionsForDomain(body.data.domain as Domain).find((i) => i.id === body.data.institutionId)
    if (!institution) return reply.status(404).send({ error: `Unknown institution "${body.data.institutionId}"` })

    const stored = await storeAttachments(body.data.attachments)
    if (!stored.ok) return reply.status(stored.status).send({ error: stored.message })

    return engine.orchestrator.runAgent({
      institution,
      question: body.data.question,
      country: body.data.country,
      domain: body.data.domain as Domain,
      lens: body.data.lens as WorkflowLens,
      runId: body.data.runId,
      attachments: body.data.attachments,
      attachmentMeta: stored.meta,
    })
  })

  /**
   * Streaming twin of `/v1/agents/ask` (Server-Sent Events).
   *
   * Retrieval, validation and audit are the same code path; the browser gets
   * `stage` events for the processing bar, `delta` events for the answer as it
   * is written, and a final `done` event carrying the very same assessment
   * object the buffered route returns (citations and validation included).
   */
  app.post('/v1/agents/ask/stream', async (request, reply) => {
    const body = askBody.safeParse(request.body)
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const institution = institutionsForDomain(body.data.domain as Domain).find((i) => i.id === body.data.institutionId)
    if (!institution) return reply.status(404).send({ error: `Unknown institution "${body.data.institutionId}"` })

    const stored = await storeAttachments(body.data.attachments)
    if (!stored.ok) return reply.status(stored.status).send({ error: stored.message })

    reply.hijack()
    const raw = reply.raw
    const origin = request.headers.origin
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Render / any reverse proxy: do not buffer the stream.
      'X-Accel-Buffering': 'no',
      // A hijacked response bypasses @fastify/cors, and the console is served
      // from Vercel: the browser needs the CORS header on the stream itself.
      'Access-Control-Allow-Origin': origin ?? '*',
      Vary: 'Origin',
    })
    raw.flushHeaders?.()

    const send = (payload: unknown) => {
      if (raw.writableEnded || raw.destroyed) return
      try {
        raw.write(`data: ${JSON.stringify(payload)}\n\n`)
      } catch {
        /* client went away — the run still completes for the audit trail */
      }
    }

    // A comment frame every 15 s keeps the proxy from closing an idle stream.
    const heartbeat = setInterval(() => {
      if (!raw.writableEnded && !raw.destroyed) raw.write(': ping\n\n')
    }, 15_000)

    try {
      send({ type: 'open', agentId: institution.id, runId: body.data.runId })
      const assessment = await engine.orchestrator.streamAgent(
        {
          institution,
          question: body.data.question,
          country: body.data.country,
          domain: body.data.domain as Domain,
          lens: body.data.lens as WorkflowLens,
          runId: body.data.runId,
          attachments: body.data.attachments,
          attachmentMeta: stored.meta,
        },
        {
          onStage: (stage, detail) => send({ type: 'stage', stage, ...(detail ?? {}) }),
          onDelta: (text) => send({ type: 'delta', text }),
        },
      )
      send({ type: 'done', assessment })
    } catch (error) {
      send({ type: 'error', message: (error as Error).message })
    } finally {
      clearInterval(heartbeat)
      if (!raw.writableEnded) raw.end()
    }
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
      const result = await ingestText({
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

  // ── N4: WhatsApp channel ──────────────────────────────────────────────────
  // Business-initiated messages are approved templates only (names prefixed
  // `meta_hackathon_`); the approval decision itself happens in the web app, so
  // no quick-reply button is needed and no notification gateway is involved.
  app.get('/v1/whatsapp/webhook', async (request, reply) => {
    const result = whatsapp.verifyChallenge(request.query as Record<string, unknown>)
    if (!result.ok) return reply.status(403).send({ error: 'invalid_verify_token' })
    return reply.type('text/plain').send(result.challenge)
  })

  app.post('/v1/whatsapp/webhook', async (request, reply) => {
    const signature = request.headers['x-hub-signature-256']
    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}))
    if (config.whatsapp.appSecret && !whatsapp.verifySignature(raw, typeof signature === 'string' ? signature : undefined)) {
      return reply.status(401).send({ error: 'invalid_signature' })
    }

    const parsed = whatsapp.parseWebhook(request.body)
    if (parsed.statuses.length > 0 || parsed.messages.length > 0) {
      request.log.info(
        { statuses: parsed.statuses.length, messages: parsed.messages.length },
        'whatsapp webhook',
      )
    }
    // Inbound free text is acknowledged, never treated as an approval: the
    // decision requires the authenticated approval page.
    return { received: true }
  })

  const notifySchema = z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('joint_report'),
      to: z.string().min(8).max(20).optional(),
      runId: z.string().min(1).max(120),
      tick: z.number().int().min(0),
      summary: z.string().min(1).max(900),
      dryRun: z.boolean().default(false),
    }),
    z.object({
      kind: z.literal('deadline_alert'),
      to: z.string().min(8).max(20).optional(),
      title: z.string().min(1).max(200),
      deadline: z.string().min(1).max(120),
      actionUrl: z.string().url().optional(),
      dryRun: z.boolean().default(false),
    }),
    z.object({
      kind: z.literal('approval_request'),
      to: z.string().min(8).max(20).optional(),
      runId: z.string().min(1).max(120),
      summary: z.string().min(1).max(600),
      expiresInMinutes: z.number().int().min(5).max(10_080).default(1_440),
      dryRun: z.boolean().default(false),
    }),
  ])

  app.post('/v1/whatsapp/notify', async (request, reply) => {
    const parsed = notifySchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const body = parsed.data
    const to = body.to ?? config.whatsapp.recipient
    if (!to) return reply.status(400).send({ error: 'No recipient: set WHATSAPP_RECIPIENT_WAID or pass `to`.' })

    let template: string
    let bodyParams: string[]
    let buttonUrlParam: string | undefined
    let link: string | undefined

    if (body.kind === 'joint_report') {
      template = WHATSAPP_TEMPLATES.jointReport
      bodyParams = [body.runId, String(body.tick), body.summary]
    } else if (body.kind === 'deadline_alert') {
      template = WHATSAPP_TEMPLATES.deadlineAlert
      bodyParams = [body.title, body.deadline, body.actionUrl ?? 'Open the console']
    } else {
      if (!config.whatsapp.approvalSecret) {
        return reply.status(503).send({ error: 'APPROVAL_SECRET is not configured; cannot sign an approval link.' })
      }
      const { token, claims } = createApprovalToken({
        runId: body.runId,
        secret: config.whatsapp.approvalSecret,
        ttlSeconds: body.expiresInMinutes * 60,
        subject: body.summary,
      })
      template = WHATSAPP_TEMPLATES.approvalRequest
      bodyParams = [body.summary, new Date(claims.exp * 1000).toISOString()]
      buttonUrlParam = token
      link = approvalUrl(config.whatsapp.webPublicUrl, token)
    }

    if (body.dryRun || !whatsapp.configured) {
      return {
        sent: false,
        reason: whatsapp.configured ? 'dry_run' : 'not_configured',
        to,
        template,
        language: config.whatsapp.templateLanguage,
        bodyParams,
        ...(link ? { approvalUrl: link } : {}),
      }
    }

    try {
      const sent = await whatsapp.sendTemplate({
        to,
        name: template,
        language: config.whatsapp.templateLanguage,
        bodyParams,
        ...(buttonUrlParam ? { buttonUrlParam } : {}),
      })
      return { sent: true, messageId: sent.messageId, template, ...(link ? { approvalUrl: link } : {}) }
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  app.get('/v1/whatsapp/approvals/:token', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1).max(4096) }).parse(request.params)
    const verdict = verifyApprovalToken(token, config.whatsapp.approvalSecret)
    if (!verdict.ok) {
      return reply.status(verdict.reason === 'expired' ? 410 : 400).send({ error: verdict.reason })
    }

    const record = await approvals.get(verdict.claims.jti)
    const reports = await engine.reports.getReports(verdict.claims.runId).catch(() => [])
    return {
      runId: verdict.claims.runId,
      subject: verdict.claims.subject ?? null,
      expiresAt: new Date(verdict.claims.exp * 1000).toISOString(),
      decision: record?.decision ?? null,
      decidedAt: record?.decidedAt ?? null,
      note: record?.note ?? null,
      reports: reports.map((report) => ({
        tick: report.tick,
        summary: report.summary,
        conflicts: report.conflicts.length,
        citations: report.citations.length,
      })),
    }
  })

  app.post('/v1/whatsapp/approvals/:token', async (request, reply) => {
    const { token } = z.object({ token: z.string().min(1).max(4096) }).parse(request.params)
    const body = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        note: z.string().max(1000).optional(),
      })
      .safeParse(request.body ?? {})
    if (!body.success) return reply.status(400).send({ error: body.error.flatten() })

    const verdict = verifyApprovalToken(token, config.whatsapp.approvalSecret)
    if (!verdict.ok) {
      return reply.status(verdict.reason === 'expired' ? 410 : 400).send({ error: verdict.reason })
    }

    const decision = body.data.decision as ApprovalDecision
    const decidedAt = new Date().toISOString()
    const result = await approvals.decide({
      jti: verdict.claims.jti,
      runId: verdict.claims.runId,
      decision,
      ...(body.data.note ? { note: body.data.note } : {}),
      decidedAt,
      channel: 'whatsapp',
    })
    if (!result.ok) {
      return reply.status(409).send({
        error: 'already_decided',
        decision: result.existing.decision,
        decidedAt: result.existing.decidedAt,
      })
    }

    try {
      await engine.audit.logAction({
        actor: 'whatsapp',
        action: 'whatsapp.approval',
        target: `run:${verdict.claims.runId}:${decision}`,
        lens: 'hybrid',
        runId: verdict.claims.runId,
      })
    } catch {
      // The decision is recorded; an unreachable audit store must not replay it.
    }

    return { recorded: true, decision, decidedAt }
  })

  // ── N8: table-top crisis exercise ─────────────────────────────────────────
  // Injects are released at fixed minutes; the after-action report is computed
  // from the action log first, then narrated by the model. The model never
  // decides whether an inject was addressed.
  app.get('/v1/exercise/sample', async (request) => {
    const query = z.object({ country: z.string().min(2).max(2).default('cm') }).parse(request.query ?? {})
    return healthBreachExercise(query.country)
  })

  const exerciseInjectSchema = z.object({
    id: z.string().min(1).max(80),
    atMinute: z.number().int().min(0).max(1_440),
    title: z.string().min(1).max(200),
    detail: z.string().min(1).max(4_000),
    visibleTo: z.array(z.string().min(1).max(80)).min(1).max(20),
    expectedAction: z.string().min(1).max(500),
    responseWindowMinutes: z.number().int().min(1).max(240).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  })

  const exerciseSchema = z.object({
    id: z.string().min(1).max(120),
    title: z.string().min(1).max(200),
    country: z.string().min(2).max(2),
    domain: z.enum(['health', 'education', 'telecom', 'public_services', 'agriculture']),
    scenarioRunId: z.string().min(1).max(120).optional(),
    durationMinutes: z.number().int().min(5).max(480),
    injects: z.array(exerciseInjectSchema).min(1).max(40),
  })

  const exerciseLogSchema = z.object({
    id: z.string().min(1).max(80).optional(),
    atMinute: z.number().int().min(0).max(1_440),
    actor: z.string().min(1).max(120),
    kind: z.enum(['action', 'decision', 'escalation', 'note']),
    text: z.string().min(1).max(2_000),
    injectId: z.string().min(1).max(80).optional(),
  })

  const exerciseBodySchema = z.object({
    definition: exerciseSchema,
    actions: z.array(exerciseLogSchema).max(500).default([]),
    evaluatedAtMinute: z.number().int().min(0).max(1_440),
  })

  app.post('/v1/exercise/evaluate', async (request, reply) => {
    const parsed = exerciseBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })
    return evaluateExercise(
      parsed.data.definition as ExerciseDefinition,
      parsed.data.actions,
      parsed.data.evaluatedAtMinute,
    )
  })

  app.post('/v1/exercise/after-action', async (request, reply) => {
    const parsed = exerciseBodySchema.safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    const definition = parsed.data.definition as ExerciseDefinition
    try {
      const report = await writeAfterAction({
        model: engine.model,
        modelLabel: describeProvider(engine.provider),
        definition,
        log: parsed.data.actions,
        evaluatedAtMinute: parsed.data.evaluatedAtMinute,
      })
      try {
        await engine.audit.logAction({
          actor: 'facilitator',
          action: 'exercise.after_action',
          target: `exercise:${definition.id}`,
          lens: 'simulation',
          runId: definition.scenarioRunId ?? definition.id,
        })
      } catch {
        // The report is still returned; an unreachable audit store must not erase it.
      }
      return report
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({ error: (error as Error).message })
    }
  })

  // ── N9: public-communication drafts (Fulfulde / Hausa) ────────────────────
  // The API drafts and gates; it never publishes. Every response is marked
  // `pending_native_review`, and political or medical content is rejected.
  app.get('/v1/communications/languages', async () => Object.values(COMMUNICATION_LANGUAGES))

  app.post('/v1/communications/draft', async (request, reply) => {
    const parsed = z
      .object({
        language: z.enum(['ff', 'ha']),
        sourceLanguage: z.enum(['en', 'fr']).default('en'),
        audience: z.string().min(1).max(300),
        jurisdiction: z.string().min(1).max(120),
        incidentSummary: z.string().min(1).max(8_000),
        channels: z.array(z.enum(['radio', 'sms', 'social', 'press'])).max(4).optional(),
        constraints: z.array(z.string().min(1).max(300)).max(10).optional(),
      })
      .safeParse(request.body ?? {})
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() })

    try {
      return await draftCommunication({
        model: engine.model,
        modelLabel: describeProvider(engine.provider),
        request: parsed.data,
      })
    } catch (error) {
      if (error instanceof CommunicationPolicyError) {
        return reply.status(422).send({ error: 'communication_policy', violations: error.violations })
      }
      return reply.status(502).send({ error: (error as Error).message })
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
