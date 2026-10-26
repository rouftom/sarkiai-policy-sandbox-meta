/**
 * Core domain types shared by the whole engine.
 *
 * Everything is jurisdiction-aware: a knowledge-base chunk, a citation, a gap
 * and an agent assessment all carry the (country, jurisdiction, docType) tuple
 * so cross-national retrieval stays unambiguous.
 */

export type Domain =
  | 'health'
  | 'education'
  | 'telecom'
  | 'public_services'
  | 'agriculture'

export type Jurisdiction = 'national' | 'regional' | 'international'

export type DocType =
  | 'law'
  | 'strategy'
  | 'regulation'
  | 'policy'
  | 'treaty'
  | 'standard'
  | 'guidance'
  | 'report'

/** A workflow lens is a profile, never a duplicated code path. */
export type WorkflowLens = 'simulation' | 'readiness' | 'hybrid'

export type AgentRole =
  | 'legal_advisor'
  | 'institutional'
  | 'coordinator'
  | 'innovator'

/**
 * National AI-readiness framework: 6 factors and 13 dimensions.
 *
 * The canonical machine-readable definition is `data/global/standards/dimensions.json`
 * (factor descriptions + 111 dimension metrics).
 */
export type ReadinessFactor =
  | 'data'
  | 'research'
  | 'deployment'
  | 'standards'
  | 'opensource'
  | 'sandbox'

export const READINESS_FACTORS: ReadinessFactor[] = [
  'data',
  'research',
  'deployment',
  'standards',
  'opensource',
  'sandbox',
]

export type ReadinessDimension =
  | 'data_marketplace'
  | 'generated_content'
  | 'cross_domain'
  | 'contextualization'
  | 'ai_integration'
  | 'human_interface'
  | 'strategy_alignment'
  | 'collaboration'
  | 'human_impact'
  | 'ai_policies'
  | 'ai_inclusion'
  | 'granular_priorities'
  | 'digital_infrastructure'

export interface ReadinessDimensionDef {
  id: number
  name: string
  shortName: ReadinessDimension
  factors: ReadinessFactor[]
}

export const READINESS_DIMENSIONS: ReadinessDimensionDef[] = [
  { id: 1, name: 'Data/Model Marketplace', shortName: 'data_marketplace', factors: ['data', 'opensource'] },
  { id: 2, name: 'Generated Content Marketplace', shortName: 'generated_content', factors: ['data', 'opensource'] },
  { id: 3, name: 'Cross-Domain Correlation Analysis', shortName: 'cross_domain', factors: ['data', 'standards'] },
  {
    id: 4,
    name: 'Contextualization and Regional Impact',
    shortName: 'contextualization',
    factors: ['data', 'research', 'deployment'],
  },
  { id: 5, name: 'Level of Integration of AI in Workflows', shortName: 'ai_integration', factors: ['standards'] },
  { id: 6, name: 'Human Interface', shortName: 'human_interface', factors: ['standards', 'deployment'] },
  { id: 7, name: 'Strategy Alignment', shortName: 'strategy_alignment', factors: ['standards'] },
  { id: 8, name: 'Collaboration with AI', shortName: 'collaboration', factors: ['opensource', 'standards'] },
  { id: 9, name: 'Impacts of Humans in AI Integration', shortName: 'human_impact', factors: ['sandbox'] },
  { id: 10, name: 'AI & Policies', shortName: 'ai_policies', factors: ['sandbox', 'deployment'] },
  { id: 11, name: 'AI for Inclusion', shortName: 'ai_inclusion', factors: ['sandbox'] },
  { id: 12, name: 'Granular Priorities', shortName: 'granular_priorities', factors: ['deployment'] },
  { id: 13, name: 'Digital Infrastructure', shortName: 'digital_infrastructure', factors: ['deployment'] },
]

/** Dimension short names in canonical 1..13 order (for iteration/display). */
export const READINESS_DIMENSION_IDS: ReadinessDimension[] = READINESS_DIMENSIONS.map((d) => d.shortName)

export const DIMENSION_FACTORS: Record<ReadinessDimension, ReadinessFactor[]> = Object.fromEntries(
  READINESS_DIMENSIONS.map((d) => [d.shortName, d.factors]),
) as Record<ReadinessDimension, ReadinessFactor[]>

/** A single dimension scored on the 0–5 maturity scale. */
export interface DimensionScore {
  dimension: ReadinessDimension
  dimensionId: number
  dimensionName: string
  score: number // 0..5
  maturity: string
  evidence: string[]
  gaps: string[]
  recommendations: string[]
  confidence: number // 0..1
  /** Set when the value moved due to causal propagation. */
  causalEffect?: number
}

export interface ReadinessScenario {
  country: string
  domain: Domain
  generatedAt: string
  dimensions: DimensionScore[]
  overall: number
  composite: number
  weights?: Partial<Record<ReadinessDimension, number>>
}

export interface WhatIfResult {
  country: string
  domain: Domain
  changes: Partial<Record<ReadinessDimension, number>>
  original: DimensionScore[]
  projected: DimensionScore[]
  effects: Partial<Record<ReadinessDimension, number>>
  narrative: string
  generatedAt: string
}

export interface Taxonomy {
  country: string // ISO-3166 alpha-2, or 'global'
  jurisdiction: Jurisdiction
  docType: DocType
  pillar?: ReadinessDimension[]
  namespace?: string
  version?: string
}

export interface KbChunk extends Taxonomy {
  id: string
  filename: string
  text: string
  chunkIndex: number
  headingPath?: string
  articleNumber?: string
  unitType?: string
  chunkRole?: 'parent' | 'child'
  sourceUrl?: string
  score?: number
  isActive: boolean
}

export interface Citation {
  country: string
  docType: DocType
  filename: string
  articleNumber?: string
  headingPath?: string
  sourceUrl?: string
  quote: string
}

export interface Gap {
  id: string
  domain: Domain
  dimension: ReadinessDimension
  description: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  countryRef?: Citation
  globalBestPractice?: string
  globalRef?: Citation
}

export interface AgentAssessment {
  agentId: string
  role: AgentRole
  mandate: string
  domain: Domain
  findings: string[]
  citations: Citation[]
  gaps: Gap[]
  confidence: number
  cotTraceId: string
  /** Citation-validator verdict (N2); absent when validation was skipped. */
  validation?: CitationValidation
}

/** A scenario event is released progressively, never all at once. */
export interface ScenarioEvent {
  id: string
  runId: string
  sequence: number
  /** Which chunk index this event belongs to (progressive release). */
  releaseChunk: number
  title: string
  payload: string
  /** Agent ids allowed to see this event (information asymmetry). */
  visibleTo: string[]
  createdAt: string
}

export interface ScenarioRun {
  id: string
  domain: Domain
  country: string
  title: string
  lens: WorkflowLens
  agents: string[]
  events: ScenarioEvent[]
  status: 'draft' | 'running' | 'completed' | 'failed'
  startedAt?: string
  completedAt?: string
}

export interface AuditRecord {
  id: string
  runId?: string
  ts: string
  actor: string
  action: string
  target?: string
  lens: WorkflowLens
  citations: Citation[]
  hash: string
  prevHash?: string
}

export interface CoTTrace {
  id: string
  runId: string
  agentId: string
  step: number
  thought: string
  toolCalls: Array<{ name: string; input: unknown; output?: unknown }>
  model: string
  ts: string
}

export interface RetrievalQuery {
  text: string
  country: string
  jurisdiction?: Jurisdiction
  docType?: DocType
  namespace?: string
  topK?: number
}

/**
 * Where inference happens and whose weights answer.
 *
 * A provider mode is a configuration decision, not a code path: the same
 * engine, the same prompts and the same audit trail run on all three.
 */
export type ProviderMode = 'cloud' | 'sovereign' | 'local'

/** Models backing one provider mode (each field is a model identifier). */
export interface ProviderModels {
  /** Reasoning / generation (text, and images for the vision model). */
  reasoning: string
  /** Vision model used to transcribe what a segmentation pass isolated. */
  vision: string
  /** Image segmentation (scanned gazettes) — cloud mode only. */
  segmentation?: string
  /** Speech-to-text (WhatsApp voice notes) — cloud mode only. */
  transcription?: string
  /** Embeddings — always on-premise, whatever the mode. */
  embedding: string
}

/** Public, secret-free description of the active provider. */
export interface ProviderDescriptor {
  mode: ProviderMode
  /** Human label, e.g. "Meta Model API". */
  label: string
  /** Upstream vendor serving the weights. */
  servedBy: string
  baseURL: string
  models: ProviderModels
  /** `on-premise` means no prompt, document or answer leaves the institution. */
  residency: 'cloud' | 'on-premise'
  openWeights: boolean
  /** Hard ceiling per scenario run, in USD. `0` when nothing is billed. */
  budgetUsd: number
  /** False when the mode is selected but not configured (e.g. missing key). */
  ready: boolean
  /** Why the mode is unusable, when `ready` is false. */
  reason?: string
}

/**
 * Outcome of the citation validator (N2).
 *
 * A policy answer is only admissible when every quoted provision actually
 * appears in the retrieved corpus. Fabricated quotes are rejected and the agent
 * is asked to answer again — the engine never ships an unsourced claim.
 */
export interface CitationValidation {
  /** True when the answer cites at least one provision and quotes nothing invented. */
  ok: boolean
  /** Citations the answer actually refers to (article or heading present). */
  used: Citation[]
  /** Quoted passages that do not appear in the retrieved corpus. */
  rejected: string[]
  /** Generation attempts, including rejected ones. */
  attempts: number
}
