/** Multi-agent coordination artifacts. */

import type { AgentAssessment, Citation, Gap } from './types'

/** A genuine conflict detected between two institutional assessments. */
export interface MandateConflict {
  id: string
  /** Agent ids whose independent assessments clash. */
  between: [string, string]
  summary: string
  /** The conflicting positions, one per agent. */
  positions: { agentId: string; position: string }[]
  severity: 'low' | 'medium' | 'high' | 'critical'
  /** Which legal provisions/mandates are in tension. */
  citations: Citation[]
}

/** One tick of a progressive scenario, reconciled across the agents that saw it. */
export interface JointSituationReport {
  runId: string
  tick: number
  domain: string
  country: string
  assessments: AgentAssessment[]
  agreements: string[]
  conflicts: MandateConflict[]
  /** Unresolved items to escalate to the next tick / coordinator. */
  openQuestions: string[]
  gaps: Gap[]
  citations: Citation[]
  summary: string
  generatedAt: string
}
