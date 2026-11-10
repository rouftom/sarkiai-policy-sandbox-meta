/**
 * Agents & AI registry: roles, institutions and agents.
 *
 * - A **role** says what an agent does in the pipeline. It is built from a
 *   fixed set of capabilities, so a custom role can only combine abilities the
 *   engine already enforces.
 * - An **institution** says on whose behalf an agent speaks: country, mandate,
 *   legal basis in the corpus, domains, and what it must not do.
 * - An **agent** combines a role, optionally an institution, a Meta model and
 *   instructions. Every change creates a new version; runs record the version
 *   they used.
 *
 * Some guarantees are not settings (see `REGISTRY_GUARANTEES`): no role, agent
 * or instruction can lift them.
 */

import type { Domain } from './types'
import { INSTITUTIONS, type InstitutionSpec } from './agents'

/** What an agent may do. Fixed: the engine enforces each one. */
export const CAPABILITIES = [
  'retrieve', // search the corpus (agentic search)
  'assess', // write an assessment of an event or a question
  'advise', // recommend, without binding effect
  'coordinate', // reconcile other agents' assessments
  'escalate', // flag an issue to a human or another institution
  'review', // re-read another agent's output (adds to the citation check, never replaces it)
  'propose_action', // propose an action; a person decides
  'score', // score against a rubric (readiness dimensions)
  'draft', // write reports and communications
] as const
export type Capability = (typeof CAPABILITIES)[number]

export type RegistryStatus = 'draft' | 'active' | 'retired'

export interface RoleRecord {
  id: string
  name: string
  description: string
  capabilities: Capability[]
  /** Built-in roles ship with the engine; their capabilities cannot change. */
  builtIn: boolean
  /** A mandated role speaks for an institution and must carry one. */
  requiresInstitution: boolean
  status: RegistryStatus
  version: number
  createdAt: string
  updatedAt: string
  updatedBy: string
}

/** A provision of the corpus that founds a mandate: file and article. */
export interface LegalBasis {
  filename: string
  article?: string
  note?: string
}

export interface InstitutionRecord {
  id: string
  name: string
  /** ISO 3166-1 alpha-2, upper case. */
  country: string
  mandate: string
  legalBasis: LegalBasis[]
  domains: Domain[]
  mustNot: string[]
  builtIn: boolean
  status: RegistryStatus
  version: number
  createdAt: string
  updatedAt: string
  updatedBy: string
}

/** What part of an incident an agent sees (information asymmetry). */
export type InformationScope = 'all_events' | 'domain_events' | 'addressed_events'

export interface AgentRecord {
  id: string
  name: string
  roleId: string
  institutionId?: string
  /** A Meta model id; empty means the operator's chosen model. */
  model?: string
  /** Extra instructions, appended to the role's system prompt. Data, reviewed by an admin. */
  instructions: string
  informationScope: InformationScope
  /** Tailwind text colour used in graphs and timelines. */
  color: string
  builtIn: boolean
  status: RegistryStatus
  version: number
  createdAt: string
  updatedAt: string
  updatedBy: string
}

/** One saved state of an agent, role or institution. */
export interface RegistryVersion<T> {
  entity: 'role' | 'institution' | 'agent'
  id: string
  version: number
  snapshot: T
  savedAt: string
  savedBy: string
}

/**
 * What no configuration can change. Shown in the console and enforced in code:
 * the registry validates against it, and the engine keeps these paths fixed.
 */
export const REGISTRY_GUARANTEES = [
  'citation_check', // every quote is checked against the corpus by code, whatever the roles
  'human_decides', // actions with side effects wait for a person
  'rule_based_scores', // exercise scores are computed by rules
  'meta_models_only', // an agent can only use a Meta model
  'admin_only_changes', // only administrators create, edit or retire registry entries
  'versioned_and_audited', // every change is a new version and an audit record
] as const
export type RegistryGuarantee = (typeof REGISTRY_GUARANTEES)[number]

const SEED_DATE = '2026-11-04T00:00:00.000Z'

function role(id: string, name: string, description: string, capabilities: Capability[], requiresInstitution = false): RoleRecord {
  return { id, name, description, capabilities, builtIn: true, requiresInstitution, status: 'active', version: 1, createdAt: SEED_DATE, updatedAt: SEED_DATE, updatedBy: 'system' }
}

export const BUILTIN_ROLES: RoleRecord[] = [
  role('mandated', 'Mandated agent', 'Speaks for one institution, under its legal mandate: retrieves the law, assesses, escalates.', ['retrieve', 'assess', 'escalate'], true),
  role('legal_advisor', 'Legal adviser', 'Interprets law and policy, cites the exact provision, maps it to global practice.', ['retrieve', 'assess', 'advise']),
  role('coordinator', 'Coordinator', 'Reconciles the assessments into a joint report: agreements, mandate conflicts, open questions.', ['coordinate', 'draft']),
  role('validator', 'Validator', "Re-reads another agent's output. Adds to the code citation check, never replaces it.", ['review', 'retrieve']),
  role('worker', 'Worker', 'Runs a bounded task for another agent, such as a search or a summary.', ['retrieve']),
  role('reporter', 'Reporter', 'Drafts reports and communications from validated material.', ['draft']),
  role('evaluator', 'Evaluator', 'Scores a dimension against a rubric with evidence (AI readiness).', ['retrieve', 'score']),
]

const BUILTIN_TO_ROLE: Record<string, string> = { legal_advisor: 'legal_advisor', institutional: 'mandated', coordinator: 'coordinator', innovator: 'worker' }

/** Built-in institutions and agents, derived from the engine's catalogue. */
export function builtinInstitutions(country = 'CM'): InstitutionRecord[] {
  return INSTITUTIONS.filter((spec) => spec.role === 'institutional').map((spec) => ({
    id: spec.id,
    name: spec.name,
    country,
    mandate: spec.mandate,
    legalBasis: [],
    domains: spec.domains,
    mustNot: spec.mustNot ?? [],
    builtIn: true,
    status: 'active' as const,
    version: 1,
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    updatedBy: 'system',
  }))
}

export function builtinAgents(): AgentRecord[] {
  return INSTITUTIONS.map((spec) => ({
    id: spec.id,
    name: spec.name,
    roleId: BUILTIN_TO_ROLE[spec.role] ?? 'worker',
    ...(spec.role === 'institutional' ? { institutionId: spec.id } : {}),
    instructions: '',
    informationScope: 'domain_events' as const,
    color: spec.color,
    builtIn: true,
    status: 'active' as const,
    version: 1,
    createdAt: SEED_DATE,
    updatedAt: SEED_DATE,
    updatedBy: 'system',
  }))
}

/** Capabilities the engine's `InstitutionSpec.can` understands. */
const SPEC_CAPABILITIES = ['retrieve', 'assess', 'advise', 'coordinate', 'escalate'] as const

/**
 * The engine-facing view of an active agent: what scenarios, the assistant and
 * the exercise consume. A mandated agent takes its mandate, domains and limits
 * from its institution; any other agent from its role.
 */
export function toInstitutionSpec(agent: AgentRecord, roleRecord: RoleRecord, institution?: InstitutionRecord): InstitutionSpec {
  const can = roleRecord.capabilities.filter((c): c is (typeof SPEC_CAPABILITIES)[number] => (SPEC_CAPABILITIES as readonly string[]).includes(c))
  const engineRole = roleRecord.id === 'legal_advisor' ? 'legal_advisor' : roleRecord.id === 'coordinator' ? 'coordinator' : institution ? 'institutional' : 'innovator'
  const mandate = [institution?.mandate ?? roleRecord.description, agent.instructions.trim()].filter(Boolean).join('\n')
  return {
    id: agent.id,
    name: agent.name,
    role: engineRole,
    mandate,
    domains: institution?.domains ?? (['health', 'education', 'telecom', 'public_services', 'agriculture'] as Domain[]),
    can,
    ...(institution?.mustNot.length ? { mustNot: institution.mustNot } : {}),
    color: agent.color,
  }
}

/** Why an agent cannot be activated, or an empty list. */
export function activationProblems(agent: AgentRecord, roleRecord: RoleRecord | undefined, institution: InstitutionRecord | undefined): string[] {
  const problems: string[] = []
  if (!roleRecord || roleRecord.status !== 'active') problems.push('role_inactive')
  if (roleRecord?.requiresInstitution && !institution) problems.push('institution_required')
  if (institution && institution.status !== 'active') problems.push('institution_inactive')
  if (roleRecord?.requiresInstitution && institution && institution.legalBasis.length === 0 && !institution.builtIn) problems.push('legal_basis_required')
  if (agent.model && !isMetaModelId(agent.model)) problems.push('model_not_meta')
  return problems
}

/** Meta model ids the registry accepts: the Meta Model API, Baseten's Muse Spark Open, local Muse Glimmer. */
export function isMetaModelId(model: string): boolean {
  const value = model.trim().toLowerCase()
  return /^(muse-[a-z0-9.\-]+|meta-models\/[a-z0-9.\-]+|sam-[0-9.]+)$/.test(value)
}
