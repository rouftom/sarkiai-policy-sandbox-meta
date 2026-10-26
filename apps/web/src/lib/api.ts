/** Thin typed client for the API application layer. */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
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

  dossierUrl: (runId: string, format: 'json' | 'markdown' = 'markdown') =>
    `${API_URL}/v1/audit/dossier/${runId}?format=${format}`,

  /** Opens the progressive scenario SSE stream. */
  releaseScenario(id: string, country: string): EventSource {
    return new EventSource(`${API_URL}/v1/scenarios/${id}/release?country=${country}`)
  },
}
