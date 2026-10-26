/**
 * Declarative workflow profiles.
 *
 * The engine has ONE orchestration core. A "lens" only toggles which stages are
 * composed. Gap analysis is `always` on, so switching lens never removes an
 * evaluation capability.
 */

import type { WorkflowLens } from './types'

export interface WorkflowProfile {
  lens: WorkflowLens
  label: string
  description: string
  stages: {
    ingest: boolean
    retrieve: boolean
    /** Progressive, chunked scenario event engine. */
    scenario: boolean
    /** Mandated agents + coordination protocol. */
    multiAgent: boolean
    /** Country-vs-global gap analysis (always on). */
    gapAnalysis: boolean
    readinessReport: boolean
    auditAndCot: boolean
  }
}

export const WORKFLOW_PROFILES: Record<WorkflowLens, WorkflowProfile> = {
  simulation: {
    lens: 'simulation',
    label: 'Error-scenario simulation',
    description:
      'Run a progressive, chunked error scenario across mandated agents; emit an audit trail and gap findings.',
    stages: {
      ingest: true,
      retrieve: true,
      scenario: true,
      multiAgent: true,
      gapAnalysis: true,
      readinessReport: false,
      auditAndCot: true,
    },
  },
  readiness: {
    lens: 'readiness',
    label: 'AI readiness assessment',
    description:
      'Assess a country corpus against the 13 AI-readiness dimensions (6 factors) and produce a gap report.',
    stages: {
      ingest: true,
      retrieve: true,
      scenario: false,
      multiAgent: true,
      gapAnalysis: true,
      readinessReport: true,
      auditAndCot: true,
    },
  },
  hybrid: {
    lens: 'hybrid',
    label: 'Simulation + readiness',
    description:
      'Run a simulation that emits the readiness / gap report as a by-product.',
    stages: {
      ingest: true,
      retrieve: true,
      scenario: true,
      multiAgent: true,
      gapAnalysis: true,
      readinessReport: true,
      auditAndCot: true,
    },
  },
}

export function getWorkflowProfile(lens: WorkflowLens): WorkflowProfile {
  return WORKFLOW_PROFILES[lens]
}

export function isLens(value: unknown): value is WorkflowLens {
  return value === 'simulation' || value === 'readiness' || value === 'hybrid'
}
