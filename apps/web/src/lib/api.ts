/** Thin typed client for the API application layer. */

import { readToken } from './session'

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/** Fired on the window after the operator chooses another chat model. The detail is the model id. */
export const MODEL_CHANGED = 'sps:model-changed'

/** HTTP failure with the status and the raw body kept apart, so panels can react. */
export class ApiError extends Error {
  readonly status: number
  readonly body: string

  constructor(status: number, body: string) {
    super(`${status} ${body}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }

  /** The JSON body when the API returned one (e.g. `{ error, violations }`). */
  json<T = unknown>(): T | null {
    try {
      return JSON.parse(this.body) as T
    } catch {
      return null
    }
  }
}

/**
 * The API could not be reached at all (wrong `NEXT_PUBLIC_API_URL`, server
 * asleep, offline). Kept apart from `ApiError`: it is not a wrong password.
 */
export class NetworkError extends Error {
  constructor(readonly url: string) {
    super(`The API at ${url} did not answer.`)
    this.name = 'NetworkError'
  }
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, init)
  } catch {
    throw new NetworkError(API_URL)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken()
  const response = await send(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) throw new ApiError(response.status, await response.text())
  return (await response.json()) as T
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  const token = readToken()
  const response = await send(path, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) throw new ApiError(response.status, await response.text())
  return response.text()
}

export interface GapDto {
  id: string
  dimension: string
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface DimensionScoreDto {
  dimension: string
  dimensionId: number
  dimensionName: string
  score: number
  maturity: string
  evidence: string[]
  gaps: string[]
  recommendations: string[]
  confidence: number
  causalEffect?: number
  /** Live web sources consulted for this dimension. */
  webSources?: Array<{ title: string; url: string }>
}

export interface ReadinessReportDto {
  country: string
  domain: string
  summary: string
  dimensions: Array<{ dimension: string; dimensionId: number; gaps: GapDto[] }>
  scores: DimensionScoreDto[]
  scenario: { overall: number; composite: number }
}

/** One step of a live assessment, as the API streams it. */
export type ReadinessEventDto =
  | { type: 'start'; country: string; domain: string; dimensions: Array<{ dimension: string; dimensionId: number; name: string }> }
  | { type: 'web'; dimension: string; durationMs: number; sources: Array<{ title: string; url: string }> }
  | { type: 'running'; dimension: string; dimensionId: number; name: string }
  | {
      type: 'result'
      dimension: string
      dimensionId: number
      durationMs: number
      score: DimensionScoreDto
      reasoning: string
      attempts: number
      countryPassages: number
      globalPassages: number
    }
  | { type: 'error'; dimension: string; dimensionId: number; durationMs: number; message: string }
  | { type: 'done'; report: ReadinessReportDto & { generatedAt?: string } }
  | { type: 'saved'; run: ReadinessRunSummaryDto }
  | { type: 'failed'; message: string }

export interface ReadinessRunSummaryDto {
  id: string
  country: string
  domain: string
  createdAt: string
  runBy: string
  composite: number | null
  dimensions: number
}

export interface WhatIfResultDto {
  country: string
  domain: string
  changes: Record<string, number>
  original: DimensionScoreDto[]
  projected: DimensionScoreDto[]
  effects: Record<string, number>
  narrative: string
}

export interface CoTTraceDto {
  id: string
  agentId: string
  step: number
  thought: string
  model: string
  ts: string
}

export interface AssessmentDto {
  agentId: string
  role: string
  mandate: string
  findings: string[]
  citations: Array<{
    filename: string
    articleNumber?: string
    headingPath?: string
    quote?: string
    sourceUrl?: string
    country?: string
    chunkId?: string
    chunkIndex?: number
    documentId?: string
    images?: KbImageDto[]
  }>
  confidence: number
  /** Citation-validator verdict (N2). */
  validation?: { ok: boolean; attempts: number; rejected: string[]; used: unknown[] }
  /** Live web sources the agent consulted; they are not legal sources. */
  webSources?: Array<{ title: string; url: string; snippet?: string }>
}

export interface MandateConflictDto {
  id: string
  between: [string, string]
  summary: string
  positions: Array<{ agentId: string; position: string }>
  severity: 'low' | 'medium' | 'high' | 'critical'
}

export interface JointReportDto {
  runId: string
  tick: number
  summary: string
  agreements: string[]
  conflicts: MandateConflictDto[]
  openQuestions: string[]
  assessments: Array<AssessmentDto & { durationMs?: number }>
}

/** One incident fact, released per chunk, visible to a subset of the agents. */
export interface ScenarioEventDto {
  id: string
  sequence: number
  releaseChunk: number
  title: string
  payload: string
  visibleTo: string[]
  createdAt: string
}

export interface RunResultDto {
  runId: string
  country: string
  domain: string
  ticks: JointReportDto[]
  events: ScenarioEventDto[]
  dossier: { citationCount: number; conflictCount: number; traces: unknown[] }
}

export interface ScenarioAgendaItem {
  sequence: number
  releaseChunk: number
  title: string
  visibleTo: string[]
}

export interface ScenarioStartDto {
  runId: string
  country: string
  domain: string
  totalTicks: number
  agents: string[]
  agenda: ScenarioAgendaItem[]
}

export interface TickResultDto {
  runId: string
  releasedTicks: number
  totalTicks: number
  done: boolean
  tick: number | null
  events: ScenarioEventDto[]
  report: JointReportDto | null
}

export interface ProviderDto {
  mode: 'cloud' | 'sovereign' | 'local'
  label: string
  servedBy: string
  baseURL: string
  models: { reasoning: string; vision: string; segmentation?: string; transcription?: string; embedding: string }
  residency: 'cloud' | 'on-premise'
  openWeights: boolean
  budgetUsd: number
  ready: boolean
  reason?: string
}

/** Scanned-gazette ingestion (N3). Mirrors `@sps/gazette`'s page result. */
export interface GazetteBoxDto {
  x: number
  y: number
  width: number
  height: number
}

export interface GazetteProvenanceDto {
  documentId: string
  filename: string
  page: number
  regionId: string
  column: number
  columns: number
  bbox: GazetteBoxDto
  pageWidth: number
  pageHeight: number
  imageSha256: string
  sourceUrl?: string
  href: string
  geometry: string
  transcriptionModel: string
}

export interface GazetteRegionDto {
  id: string
  kind: 'text' | 'table'
  column: number
  bbox: GazetteBoxDto
  text: string
  articleNumber?: string
  heading: boolean
  characters: number
  blank: boolean
  finishReason?: string
  durationMs: number
  skipped?: boolean
  artifacts: string[]
  provenance: GazetteProvenanceDto
  error?: string
}

export interface GazetteArtifactDto {
  id: string
  label: 'stamp' | 'signature' | 'table'
  bbox: GazetteBoxDto
  confidence?: number
  source: string
}

export interface GazettePageDto {
  documentId: string
  filename: string
  page: number
  image: { width: number; height: number; mime: string; sha256: string }
  layout: { threshold: number; inkRatio: number; columns: GazetteBoxDto[]; regions: GazetteBoxDto[] }
  regions: GazetteRegionDto[]
  artifacts: GazetteArtifactDto[]
  usage: {
    inputTokens: number
    outputTokens: number
    transcriptionCalls: number
    segmentationCalls: number
    costUsd: number
  }
  warnings: string[]
  model: string
  provider: { mode: string; servedBy: string; residency: string; openWeights: boolean; models: Record<string, string | undefined> }
  startedAt: string
  durationMs: number
}

export interface GazetteIngestDto {
  documentId: string
  page: number
  zones: number
  sourceUrl?: string
  success: boolean
  chunksProcessed: number
  chunksInserted: number
  chunksSkipped: number
  usedOcr: boolean
}

/** Voice notes (N6): one transcript, timed turns and timeline facts. */
export interface VoiceTurnDto {
  turnId: number
  startMs: number
  endMs: number
  text: string
  speaker?: string
}

export interface VoiceFactDto {
  id: string
  atMs: number
  at: string
  speaker?: string
  text: string
}

export interface VoiceTranscriptDto {
  sessionId: string
  transcript: string
  durationMs: number
  turns: VoiceTurnDto[]
  facts: VoiceFactDto[]
  engine: 'muse-voice-transcribe' | 'faster-whisper'
  model: string
}

/** Legislative impact on open incidents (N7). */
export interface ImpactFindingDto {  runId: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  reason: string
  affectedArticles: string[]
  action: string
}

export interface ImpactAnalysisDto {
  provision: {
    title: string
    text: string
    articleNumber?: string
    docType?: string
    sourceUrl?: string
    effectiveDate?: string
  }
  summary: string
  findings: ImpactFindingDto[]
  deadlineChanges: string[]
  unaffectedRunIds: string[]
  model: string
  generatedAt: string
}

/** WhatsApp approval link (N4): the decision is taken in this app, not in WhatsApp. */
export interface ApprovalReportDto {
  tick: number
  summary: string
  conflicts: number
  citations: number
}

export interface ApprovalDto {
  runId: string
  subject: string | null
  expiresAt: string
  decision: 'approved' | 'rejected' | null
  decidedAt: string | null
  note: string | null
  reports: ApprovalReportDto[]
}

export interface WhatsappNotifyDto {
  sent: boolean
  reason?: 'dry_run' | 'not_configured'
  to?: string
  template?: string
  language?: string
  bodyParams?: string[]
  approvalUrl?: string
  messageId?: string
}

/** N8 — table-top crisis exercise. Injects are timed; actions are logged by the team. */
export type ExerciseSeverity = 'low' | 'medium' | 'high' | 'critical'
export type ExerciseActionKind = 'action' | 'decision' | 'escalation' | 'note'

export interface ExerciseInjectDto {
  id: string
  atMinute: number
  title: string
  detail: string
  visibleTo: string[]
  expectedAction: string
  responseWindowMinutes?: number
  severity?: ExerciseSeverity
}

export interface ExerciseDefinitionDto {
  id: string
  title: string
  country: string
  domain: string
  scenarioRunId?: string
  durationMinutes: number
  injects: ExerciseInjectDto[]
}

export interface ExerciseActionDto {
  id?: string
  atMinute: number
  actor: string
  kind: ExerciseActionKind
  text: string
  injectId?: string
}

export interface AddressedInjectDto {
  injectId: string
  title: string
  expectedAction: string
  action: string
  actor: string
  atMinute: number
  latencyMinutes: number
  withinWindow: boolean
}

export interface MissedInjectDto {
  injectId: string
  title: string
  expectedAction: string
  releasedAtMinute: number
  reason: 'no_action' | 'late'
  latencyMinutes?: number
}

export interface ExerciseEvaluationDto {
  exerciseId: string
  title: string
  durationMinutes: number
  evaluatedAtMinute: number
  releasedInjects: number
  actionsLogged: number
  addressed: AddressedInjectDto[]
  missed: MissedInjectDto[]
  decisions: ExerciseActionDto[]
  escalations: ExerciseActionDto[]
  /** Share of released injects answered inside their window (0–1). */
  coverage: number
  averageResponseMinutes: number | null
  firstActionMinute: number | null
  gaps: string[]
}

export interface AfterActionNarrativeDto {
  summary: string
  lessons: string[]
  recommendations: string[]
  unresolved: string[]
}

export interface AfterActionDto extends ExerciseEvaluationDto {
  narrative: AfterActionNarrativeDto
  model: string
  generatedAt: string
}

export interface ExerciseBodyDto {
  definition: ExerciseDefinitionDto
  actions: ExerciseActionDto[]
  evaluatedAtMinute: number
}

/** N9 — public-communication drafts in Fulfulde / Hausa, always pending native review. */
export type CommunicationLanguageCode = 'ff' | 'ha'

export interface CommunicationLanguageDto {
  code: CommunicationLanguageCode
  name: string
  script: string
  region: string
  note: string
}

export interface CommunicationKeyTermDto {
  term: string
  translation: string
}

export interface CommunicationDraftDto {
  language: CommunicationLanguageCode
  languageName: string
  script: string
  reviewStatus: 'pending_native_review'
  reviewRequired: true
  title: string
  summary: string
  message: string
  sms: string
  keyTerms: CommunicationKeyTermDto[]
  caveats: string[]
  warnings: string[]
  model: string
  generatedAt: string
}

export interface MetaModelDto {
  id: string
  ownedBy?: string
}

export interface ModelsDto {
  mode: string
  selected: string
  models: MetaModelDto[]
}

/** Server-Sent Events emitted by `POST /v1/agents/ask/stream`. */
import type { AgentUiRequest } from './agent-ui'

export type AgentStreamEvent =
  | { type: 'open'; agentId: string; runId?: string }
  | { type: 'stage'; stage: string; attempt?: number; rejected?: number; grounded?: boolean; country?: string }
  | { type: 'delta'; text: string }
  | { type: 'reasoning'; text: string }
  /** A tool the agent called: `start` opens a trail step, `end` closes it. */
  | { type: 'tool'; phase: 'start' | 'end'; id: string; name: string; summary?: string; ok?: boolean }
  /** An interactive card: a question, an input request or a proposed side effect. */
  | { type: 'ui'; ui: AgentUiRequest }
  | { type: 'done'; assessment: AssessmentDto }
  | { type: 'error'; message: string }

export interface AgentStreamHandlers {
  onOpen?: (agentId: string) => void
  onStage?: (stage: string, detail: { attempt?: number; rejected?: number; grounded?: boolean }) => void
  onDelta?: (text: string) => void
  onReasoning?: (text: string) => void
  onTool?: (event: Extract<AgentStreamEvent, { type: 'tool' }>) => void
  onUi?: (ui: AgentUiRequest) => void
  signal?: AbortSignal
}

/**
 * Streamed agent answer. The SSE stream carries progress stages, text deltas
 * and the final assessment; if anything goes wrong before the first delta the
 * caller can fall back to the buffered `api.ask`.
 */
async function streamAgentAnswer(
  body: {
    institutionId: string
    question: string
    country: string
    domain: string
    lens: string
    attachments?: Array<{ mime: string; dataBase64: string }>
  },
  handlers: AgentStreamHandlers = {},
): Promise<AssessmentDto> {
  const token = readToken()
  const response = await fetch(`${API_URL}/v1/agents/ask/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: handlers.signal,
  })
  if (!response.ok) throw new ApiError(response.status, await response.text())
  if (!response.body) throw new Error('This browser cannot read a streamed response.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assessment: AssessmentDto | null = null

  const handle = (event: AgentStreamEvent) => {
    if (event.type === 'open') handlers.onOpen?.(event.agentId)
    else if (event.type === 'stage')
      handlers.onStage?.(event.stage, {
        attempt: event.attempt,
        rejected: event.rejected,
        grounded: event.grounded,
      })
    else if (event.type === 'delta') handlers.onDelta?.(event.text)
    else if (event.type === 'reasoning') handlers.onReasoning?.(event.text)
    else if (event.type === 'tool') handlers.onTool?.(event)
    else if (event.type === 'ui') handlers.onUi?.(event.ui)
    else if (event.type === 'done') assessment = event.assessment
    else if (event.type === 'error') throw new Error(event.message)
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data) handle(JSON.parse(data) as AgentStreamEvent)
      boundary = buffer.indexOf('\n\n')
    }
  }

  if (!assessment) throw new Error('The stream ended before an answer was produced.')
  return assessment
}

/** The settings of one assessment, as the operator chose them. */
export interface ReadinessSettingsDto {
  dimensions?: string[]
  perDimensionK?: number
  useWeb?: boolean
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
}

export interface ReadinessReportFileDto {
  filename: string
  mime: string
  content: string
  assets: Array<{ kind: 'chart' | 'diagram' | 'cover'; status: 'included' | 'unavailable' | 'fallback'; tool?: string; message: string }>
}

/** Reads a Server-Sent Events body frame by frame. */
async function streamReadiness(
  body: { country: string; domain: string; globalCountry?: string } & ReadinessSettingsDto,
  onEvent: (event: ReadinessEventDto) => void,
): Promise<ReadinessRunSummaryDto | null> {
  const token = readToken()
  const response = await fetch(`${API_URL}/v1/readiness/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new ApiError(response.status, await response.text())
  if (!response.body) throw new Error('This browser cannot read a streamed response.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let saved: ReadinessRunSummaryDto | null = null
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const data = frame
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
      if (data) {
        const event = JSON.parse(data) as ReadinessEventDto
        if (event.type === 'saved') saved = event.run
        if (event.type === 'failed') throw new Error(event.message)
        onEvent(event)
      }
      boundary = buffer.indexOf('\n\n')
    }
  }
  return saved
}

export const api = {
  /** Active inference provider (secret-free). */
  provider: () => request<ProviderDto>('/v1/provider'),

  /** Chat models from Meta's own list for this key, and the saved selection. */
  models: () => request<ModelsDto>('/v1/models'),

  /** Save the operator's chat model (the API checks it against the Meta list). */
  selectModel: async (model: string) => {
    const result = await request<{ selected: string }>('/v1/models/selection', { method: 'PUT', body: JSON.stringify({ model }) })
    // Every screen showing the active model (overview, assistant, console) follows this change.
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(MODEL_CHANGED, { detail: result.selected }))
    return result
  },

  ask: (body: {
    institutionId: string
    question: string
    country: string
    domain: string
    lens: string
    attachments?: Array<{ mime: string; dataBase64: string }>
  }) => request<AssessmentDto>('/v1/agents/ask', { method: 'POST', body: JSON.stringify(body) }),

  askStream: streamAgentAnswer,

  /** Corrects a dictated text from its own sentence (speech-recognition repair). */
  correctVoice: (body: { text: string }) =>
    request<{ text: string; changed: boolean }>('/v1/voice/correct', { method: 'POST', body: JSON.stringify(body) }),

  /** Auto mode: the institution a question belongs to (one, or several). */
  routeQuestion: (body: { question: string; domain: string }) =>
    request<{ primary: string; others: string[]; reason: string }>('/v1/agents/route', { method: 'POST', body: JSON.stringify(body) }),

  /** Live assessment: `onEvent` receives each step; resolves with the saved run. */
  readinessStream: (
    body: { country: string; domain: string; globalCountry?: string } & ReadinessSettingsDto,
    onEvent: (event: ReadinessEventDto) => void,
  ) => streamReadiness(body, onEvent),

  readinessRuns: () => request<{ runs: ReadinessRunSummaryDto[] }>('/v1/readiness/runs'),

  /** A report of a saved assessment, as a file the browser can download. */
  readinessReport: (id: string, format: 'markdown' | 'html') =>
    request<ReadinessReportFileDto>(`/v1/readiness/runs/${encodeURIComponent(id)}/report`, {
      method: 'POST',
      body: JSON.stringify({ format }),
    }),

  readinessRun: (id: string) => request<ReadinessRunSummaryDto & { report: ReadinessReportDto & { generatedAt?: string } }>(`/v1/readiness/runs/${encodeURIComponent(id)}`),

  readiness: (body: { country: string; domain: string; globalCountry?: string }) =>
    request<ReadinessReportDto>('/v1/readiness/report', { method: 'POST', body: JSON.stringify(body) }),

  runScenario: (body: { id?: string; country: string; domain: string }) =>
    request<RunResultDto>('/v1/scenarios/run', { method: 'POST', body: JSON.stringify(body) }),

  startScenario: (body: { id?: string; country: string; domain: string }) =>
    request<ScenarioStartDto>('/v1/scenarios/start', { method: 'POST', body: JSON.stringify(body) }),

  nextTick: (runId: string) =>
    request<TickResultDto>(`/v1/scenarios/${runId}/next`, { method: 'POST' }),

  whatIf: (body: { country: string; domain: string; changes: Record<string, number>; scores?: DimensionScoreDto[] }) =>
    request<WhatIfResultDto>('/v1/readiness/whatif', { method: 'POST', body: JSON.stringify(body) }),

  auditChain: () => request<{ valid: boolean; brokenAt?: string; forks?: number }>('/v1/audit/chain'),

  auditTrace: (runId: string) => request<{ runId: string; trace: CoTTraceDto[] }>(`/v1/audit/trace/${runId}`),

  /** Segment + transcribe one scanned gazette page (N3). */
  analyzeGazette: (body: {
    filename: string
    imageBase64: string
    mime?: 'image/png' | 'image/jpeg'
    page?: number
    sourceUrl?: string
    maxZones?: number
    concurrency?: number
  }) => request<GazettePageDto>('/v1/gazette/analyze', { method: 'POST', body: JSON.stringify(body) }),

  /** Push a transcribed page into the jurisdiction-scoped knowledge base. */
  ingestGazette: (body: {
    page: GazettePageDto
    country: string
    jurisdiction?: 'national' | 'regional' | 'international'
    docType?: string
    namespace?: string
    version?: string
  }) => request<GazetteIngestDto>('/v1/gazette/ingest', { method: 'POST', body: JSON.stringify(body) }),

  /** Transcribe a voice note (Muse Voice Transcribe in cloud, faster-whisper otherwise). */
  transcribeVoice: (body: {
    audioBase64: string
    filename?: string
    mode?: 'PUSH_TO_TALK' | 'ENDPOINTING' | 'DIARIZATION'
    languageBias?: string[]
    keywords?: string[]
    sessionId?: string
  }) => request<VoiceTranscriptDto>('/v1/voice/transcribe', { method: 'POST', body: JSON.stringify(body) }),

  /** Which open runs a newly published provision changes (N7). */
  analyzeImpact: (body: {
    provision: {
      title: string
      text: string
      articleNumber?: string
      docType?: string
      sourceUrl?: string
      effectiveDate?: string
    }
    runIds: string[]
  }) => request<ImpactAnalysisDto>('/v1/impact/analyze', { method: 'POST', body: JSON.stringify(body) }),

  /** Human-approval page (N4). The signed token comes from a WhatsApp link. */
  approval: (token: string) =>
    request<ApprovalDto>(`/v1/whatsapp/approvals/${encodeURIComponent(token)}`),

  decideApproval: (token: string, decision: 'approved' | 'rejected', note?: string) =>
    request<{ recorded: boolean; decision: string; decidedAt: string }>(
      `/v1/whatsapp/approvals/${encodeURIComponent(token)}`,
      { method: 'POST', body: JSON.stringify({ decision, ...(note ? { note } : {}) }) },
    ),

  /** Send an approved template (or build the approval link in dry-run mode). */
  notifyWhatsApp: (body:
    | { kind: 'joint_report'; to?: string; runId: string; tick: number; summary: string; dryRun?: boolean }
    | { kind: 'deadline_alert'; to?: string; title: string; deadline: string; actionUrl?: string; dryRun?: boolean }
    | { kind: 'approval_request'; to?: string; runId: string; summary: string; dryRun?: boolean }
  ) => request<WhatsappNotifyDto>('/v1/whatsapp/notify', { method: 'POST', body: JSON.stringify(body) }),

  /** N8 — authored sample exercise (timed injects) for a country. */
  exerciseSample: (country: string) =>
    request<ExerciseDefinitionDto>(`/v1/exercise/sample?country=${encodeURIComponent(country)}`),

  /** Score the action log deterministically (no model call). */
  evaluateExercise: (body: ExerciseBodyDto) =>
    request<ExerciseEvaluationDto>('/v1/exercise/evaluate', { method: 'POST', body: JSON.stringify(body) }),

  /** Same evidence, then a model-written narrative on top of it. */
  exerciseAfterAction: (body: ExerciseBodyDto) =>
    request<AfterActionDto>('/v1/exercise/after-action', { method: 'POST', body: JSON.stringify(body) }),

  /** N9 — supported drafting languages (Fulfulde, Hausa). */
  communicationLanguages: () => request<CommunicationLanguageDto[]>('/v1/communications/languages'),

  /** N9 — draft a public message. Political or medical content is refused with 422. */
  draftCommunication: (body: {
    language: CommunicationLanguageCode
    sourceLanguage?: 'en' | 'fr'
    audience: string
    jurisdiction: string
    incidentSummary: string
    channels?: Array<'radio' | 'sms' | 'social' | 'press'>
    constraints?: string[]
  }) => request<CommunicationDraftDto>('/v1/communications/draft', { method: 'POST', body: JSON.stringify(body) }),

  /**
   * Run dossier, fetched with the operator Bearer token. The API rejects
   * anonymous downloads, so the console turns the response into a blob instead
   * of linking to a URL that would arrive without the Authorization header.
   */
  dossier: (runId: string, format: 'json' | 'markdown' = 'markdown') =>
    requestText(`/v1/audit/dossier/${runId}?format=${format}`),
}

// ── Operator auth, preferences, audit feed ──────────────────────────────────

export type OperatorRole = 'operator' | 'admin'

export interface PreferencesDto {
  theme: 'light' | 'dark' | 'system'
  pack: string
  locale: 'en' | 'fr'
  density: 'comfortable' | 'compact'
  radius: 'rounded' | 'square'
  notifications: { whatsapp: boolean; email: boolean; digest: boolean }
}

export interface OperatorDto {
  email: string
  name: string
  firstName?: string
  lastName?: string
  role: OperatorRole
  mfaEnrolled: boolean
  mustChangePassword: boolean
  lastLoginAt?: string
  createdAt: string
  preferences: PreferencesDto
}

export interface SessionDto {
  token: string
  expiresAt: string
  operator: OperatorDto
  backupCodes?: string[]
}

/** A sign-in step that carries a challenge to the next form. */
export type ChallengeDto =
  | { status: 'mfa_required'; challenge: string; expiresAt: string; operator: OperatorDto }
  | { status: 'enrollment_required'; challenge: string; expiresAt: string; operator: OperatorDto }
  | { status: 'password_change_required'; challenge: string; expiresAt: string; operator: OperatorDto }

/** Sign-up done: the confirmation link has to be opened before any challenge. */
export interface VerificationDto {
  status: 'email_verification_required'
  expiresAt: string
  operator: OperatorDto
}

export type LoginResultDto = ChallengeDto | VerificationDto

export interface SetupStatusDto {
  initialized: boolean
  storage: 'mongo' | 'memory'
  /** Public self-service sign-up is open (cloud demo only). */
  signup: boolean
}

export interface SetupResultDto {
  ok: boolean
  email: string
  storage: 'mongo' | 'memory'
}

export interface EnrollmentDto {
  secret: string
  otpauthUrl: string
  account: string
}

export interface AuditEventDto {
  id: string
  runId?: string
  ts: string
  actor: string
  action: string
  target?: string
  lens: string
  citations: Array<{ filename: string }>
  hash: string
  prevHash?: string
}

export interface AuditFeedDto {
  events: AuditEventDto[]
  chain: { valid: boolean; brokenAt?: string; forks?: number }
}

export const authApi = {
  setupStatus: () => request<SetupStatusDto>('/v1/auth/setup'),
  setup: (body: { firstName: string; lastName: string; email: string }) =>
    request<SetupResultDto>('/v1/auth/setup', { method: 'POST', body: JSON.stringify(body) }),
  signup: (body: { firstName: string; lastName: string; email: string; password: string }) =>
    request<VerificationDto>('/v1/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<ChallengeDto>('/v1/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  verifyEmail: (token: string) =>
    request<{ ok: boolean; email: string }>('/v1/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  resendVerification: (email: string) =>
    request<{ ok: boolean }>('/v1/auth/email/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  forgotPassword: (email: string) =>
    request<{ ok: boolean }>('/v1/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ ok: boolean }>('/v1/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
  changePassword: (challenge: string, password: string) =>
    request<ChallengeDto>('/v1/auth/password', {
      method: 'POST',
      body: JSON.stringify({ challenge, password }),
    }),
  enroll: (challenge: string) =>
    request<EnrollmentDto>('/v1/auth/mfa/enroll', {
      method: 'POST',
      body: JSON.stringify({ challenge }),
    }),
  confirmEnrollment: (challenge: string, code: string) =>
    request<SessionDto>('/v1/auth/mfa/confirm', {
      method: 'POST',
      body: JSON.stringify({ challenge, code }),
    }),
  verify: (challenge: string, code: string) =>
    request<SessionDto>('/v1/auth/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ challenge, code }),
    }),
  me: () => request<{ operator: OperatorDto }>('/v1/auth/me'),
  logout: () => request<{ ok: boolean }>('/v1/auth/logout', { method: 'POST' }),
  preferences: () => request<{ preferences: PreferencesDto }>('/v1/preferences'),
  updatePreferences: (patch: Partial<PreferencesDto>) =>
    request<{ preferences: PreferencesDto }>('/v1/preferences', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  auditEvents: (limit = 50) => request<AuditFeedDto>(`/v1/audit/events?limit=${limit}`),
}


// ── Knowledge base / RAG ────────────────────────────────────────────────────

export type IngestStepStatus = 'ok' | 'skipped' | 'warning' | 'error'

export interface KbIndexStatusDto {
  name: string
  type: string
  status: string
  queryable: boolean
}

export interface KbIndexesDto {
  supported: boolean
  collectionExists: boolean
  indexes: KbIndexStatusDto[]
  error?: string
}

export interface KbIngestStepDto {
  id: string
  status: IngestStepStatus
  label: string
  detail: string
  count?: number
  ms: number
}

export interface KbIngestResultDto {
  ok: boolean
  documentId: string
  filename: string
  country: string
  docType: string
  collection: string
  chunks: number
  inserted: number
  unchanged: number
  deactivated: number
  characters: number
  embeddingModel: string
  dimensions: number | null
  durationMs: number
  steps: KbIngestStepDto[]
  error?: string
}

export interface KbStatusDto {
  backend: 'atlas' | 'qdrant'
  provider: { mode: string; reasoning?: string }
  collection: string
  collectionExists: boolean
  totals: {
    chunks: number
    activeChunks: number
    documents: number
    characters: number
    lastIngestedAt: string | null
  }
  byCountry: Array<{ value: string; chunks: number }>
  byDocType: Array<{ value: string; chunks: number }>
  indexes: KbIndexesDto
  expectedIndexes: string[]
  embedding: {
    model: string
    rerankModel: string
    dimensions: number | null
    missingVectors: number
    mismatchedVectors: number
    voyageConfigured: boolean
  }
  recentRuns: KbIngestResultDto[]
}

export interface KbDocumentDto {
  filename: string
  documentId: string
  chunks: number
  activeChunks: number
  characters: number
  country: string
  docType: string
  namespace?: string
  version?: string
  sourceUrl?: string
  lastIngestedAt: string | null
  title?: string
  summary?: string
  images?: KbImageDto[]
}

/** A figure attached to a document or cited with a passage. `url` may be relative to the API. */
export interface KbImageDto {
  id: string
  url: string
  caption: string
  alt?: string
  tags?: string[]
  dimension?: string
  articleNumber?: string
  headingPath?: string
  source?: 'upload' | 'meta-image' | 'sample'
}

export interface KbChunkDto {
  id: string
  chunkIndex: number
  text: string
  isActive: boolean
  headingPath?: string
  articleNumber?: string
}

export interface KbPreviewDto {
  document: KbDocumentDto | null
  chunks: Array<KbChunkDto & { images: KbImageDto[] }>
  images: KbImageDto[]
  selected: number
}

/** Absolute URL of a figure: API paths are served by the API host. */
export function assetUrl(url: string): string {
  return url.startsWith('http') ? url : `${API_URL}${url}`
}

export interface KbStageItemDto {
  id: string
  rank: number
  score?: number
  filename: string
  text: string
  chunkIndex: number
  country: string
  jurisdiction: string
  docType: string
  headingPath?: string
  articleNumber?: string
  sourceUrl?: string
}

export interface KbExplorationDto {
  query: string
  filter: Record<string, string | boolean>
  topK: number
  models: { embedding: string; rerank: string }
  timings: { embedMs: number; denseMs: number; sparseMs: number; rerankMs: number; totalMs: number }
  stages: {
    dense: KbStageItemDto[]
    sparse: KbStageItemDto[]
    fused: KbStageItemDto[]
    reranked: KbStageItemDto[]
    final: KbStageItemDto[]
  }
  warnings: string[]
}

export const knowledgeApi = {
  status: () => request<KbStatusDto>('/v1/kb/status'),
  documents: (options: { limit?: number; q?: string; includeRetired?: boolean } = {}) => {
    const params = new URLSearchParams()
    params.set('limit', String(options.limit ?? 50))
    if (options.q) params.set('q', options.q)
    if (options.includeRetired) params.set('includeRetired', 'true')
    return request<{ documents: KbDocumentDto[] }>(`/v1/kb/documents?${params.toString()}`)
  },
  ensureIndexes: () => request<{ inspection: KbIndexesDto; ensured: { supported: boolean; created: string[]; updated: string[]; unchanged: string[] } }>('/v1/kb/indexes', { method: 'POST', body: '{}' }),
  ingestText: (body: {
    text: string
    filename: string
    country: string
    jurisdiction: 'national' | 'regional' | 'international'
    docType: string
    namespace?: string
    version?: string
    sourceUrl?: string
    maxChars?: number
    overlapChars?: number
  }) => request<KbIngestResultDto>('/v1/kb/ingest/text', { method: 'POST', body: JSON.stringify(body) }),
  search: (body: {
    text: string
    country?: string
    jurisdiction?: 'national' | 'regional' | 'international'
    docType?: string
    namespace?: string
    topK?: number
  }) => request<KbExplorationDto>('/v1/kb/search', { method: 'POST', body: JSON.stringify(body) }),
  /** PDF or text file, sent as base64; the API extracts the text and ingests it. */
  ingestFile: (body: {
    filename: string
    contentBase64: string
    country: string
    jurisdiction: 'national' | 'regional' | 'international'
    docType: string
    namespace?: string
    version?: string
  }) => request<KbIngestResultDto>('/v1/kb/ingest/file', { method: 'POST', body: JSON.stringify(body) }),
  setDocumentActive: (filename: string, active: boolean) =>
    request<{ filename: string; active: boolean; modified: number }>('/v1/kb/documents/active', {
      method: 'POST',
      body: JSON.stringify({ filename, active }),
    }),

  /** One document with its passages (the selected one first) and figures, for the citation modal. */
  preview: (filename: string, chunkIndex?: number) => {
    const params = new URLSearchParams({ filename })
    if (chunkIndex !== undefined) params.set('chunkIndex', String(chunkIndex))
    return request<KbPreviewDto>(`/v1/kb/documents/preview?${params.toString()}`)
  },

  chunks: (filename: string) =>
    request<{ chunks: KbChunkDto[] }>(`/v1/kb/documents/chunks?${new URLSearchParams({ filename }).toString()}`),

  updateDocument: (body: {
    filename: string
    title?: string
    summary?: string
    country?: string
    docType?: string
    namespace?: string
    version?: string
    sourceUrl?: string
  }) => request<{ filename: string; modified: number }>('/v1/kb/documents', { method: 'PATCH', body: JSON.stringify(body) }),

  updateChunk: (id: string, body: { text?: string; active?: boolean }) =>
    request<{ id: string; updated: boolean }>(`/v1/kb/chunks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  attachImages: (body: {
    filename: string
    images: Array<{ caption: string; alt?: string; tags?: string[]; dimension?: string; mime: string; dataBase64: string }>
  }) => request<{ filename: string; images: KbImageDto[] }>('/v1/kb/documents/images', { method: 'POST', body: JSON.stringify(body) }),

  updateImage: (id: string, body: { caption?: string; alt?: string; tags?: string[]; dimension?: string | null }) =>
    request<{ id: string; updated: boolean }>(`/v1/kb/images/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteImage: (id: string) =>
    request<{ id: string; deleted: boolean }>(`/v1/kb/images/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /** Generates the 13 readiness reference figures (Meta Image, or labelled samples) and attaches them. */
  seedReferenceImages: () =>
    request<{ generated: number; skipped: number; documents: number; source: string }>('/v1/kb/images/reference', {
      method: 'POST',
      body: '{}',
    }),
}
