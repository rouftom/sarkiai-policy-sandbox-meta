/** Thin typed client for the API application layer. */

import { readToken } from './session'

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = readToken()
  const response = await fetch(`${API_URL}${path}`, {
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
}

export interface ReadinessReportDto {
  country: string
  domain: string
  summary: string
  dimensions: Array<{ dimension: string; dimensionId: number; gaps: GapDto[] }>
  scores: DimensionScoreDto[]
  scenario: { overall: number; composite: number }
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
  }>
  confidence: number
  /** Citation-validator verdict (N2). */
  validation?: { ok: boolean; attempts: number; rejected: string[]; used: unknown[] }
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
  assessments: AssessmentDto[]
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

export const api = {
  /** Active inference provider (secret-free). */
  provider: () => request<ProviderDto>('/v1/provider'),

  ask: (body: {
    institutionId: string
    question: string
    country: string
    domain: string
    lens: string
    attachments?: Array<{ mime: string; dataBase64: string }>
  }) => request<AssessmentDto>('/v1/agents/ask', { method: 'POST', body: JSON.stringify(body) }),

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

  auditChain: () => request<{ valid: boolean; brokenAt?: string }>('/v1/audit/chain'),

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

  dossierUrl: (runId: string, format: 'json' | 'markdown' = 'markdown') =>
    `${API_URL}/v1/audit/dossier/${runId}?format=${format}`,

  /** Opens the progressive scenario SSE stream. */
  releaseScenario(id: string, country: string): EventSource {
    return new EventSource(`${API_URL}/v1/scenarios/${id}/release?country=${country}`)
  },
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

export type LoginResultDto =
  | { status: 'mfa_required'; challenge: string; expiresAt: string; operator: OperatorDto }
  | { status: 'enrollment_required'; challenge: string; expiresAt: string; operator: OperatorDto }
  | { status: 'password_change_required'; challenge: string; expiresAt: string; operator: OperatorDto }

export interface SetupStatusDto {
  initialized: boolean
  storage: 'mongo' | 'memory'
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
  chain: { valid: boolean; brokenAt?: string }
}

export const authApi = {
  setupStatus: () => request<SetupStatusDto>('/v1/auth/setup'),
  setup: (body: { firstName: string; lastName: string; email: string }) =>
    request<SetupResultDto>('/v1/auth/setup', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<LoginResultDto>('/v1/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  changePassword: (challenge: string, password: string) =>
    request<LoginResultDto>('/v1/auth/password', {
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
