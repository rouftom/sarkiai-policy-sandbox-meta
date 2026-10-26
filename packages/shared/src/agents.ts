/**
 * Institutional agent registry.
 *
 * The mandate is what makes the hackathon multi-agent: each actor receives
 * different information, operates under a different legal mandate, and produces
 * an independent assessment.
 */

import type { AgentRole, Domain } from './types'

export interface InstitutionSpec {
  id: string
  name: string
  role: AgentRole
  mandate: string
  /** Domains this institution speaks to. */
  domains: Domain[]
  /** Capabilities it may exercise during a scenario. */
  can: Array<'retrieve' | 'assess' | 'advise' | 'coordinate' | 'escalate'>
  /** Where it must NOT act (its legal boundaries). */
  mustNot?: string[]
  color: string
}

export const INSTITUTIONS: InstitutionSpec[] = [
  {
    id: 'legal_advisor',
    name: 'Policy & Legal Adviser',
    role: 'legal_advisor',
    mandate:
      'Interpret applicable law and policy, cite the exact article/section, and map the country provision to global best practice. Identify legislative and standards gaps.',
    domains: ['health', 'education', 'telecom', 'public_services', 'agriculture'],
    can: ['retrieve', 'assess', 'advise'],
    mustNot: ['Issue binding regulatory decisions', 'Coordinate other institutions'],
    color: 'text-amber-500',
  },
  {
    id: 'ministry_health',
    name: 'Ministry of Public Health',
    role: 'institutional',
    mandate:
      'Safeguard continuity of care and public-health outcomes; own the sectoral response within its statutory powers.',
    domains: ['health'],
    can: ['retrieve', 'assess', 'escalate'],
    mustNot: ['Adjudicate data-protection complaints'],
    color: 'text-emerald-500',
  },
  {
    id: 'data_protection_authority',
    name: 'Data Protection Authority',
    role: 'institutional',
    mandate:
      'Enforce data-protection and privacy legislation; assess lawfulness of processing and notification duties.',
    domains: ['health', 'education', 'telecom', 'public_services', 'agriculture'],
    can: ['retrieve', 'assess', 'escalate'],
    mustNot: ['Direct clinical or network operations'],
    color: 'text-sky-500',
  },
  {
    id: 'telecom_regulator',
    name: 'Telecommunications Regulator',
    role: 'institutional',
    mandate:
      'Ensure network integrity, quality of service and lawful interception safeguards; coordinate with sector regulators.',
    domains: ['telecom'],
    can: ['retrieve', 'assess', 'escalate'],
    mustNot: ['Enforce health-data confidentiality'],
    color: 'text-violet-500',
  },
  {
    id: 'cyber_agency',
    name: 'National Cybersecurity Agency',
    role: 'institutional',
    mandate:
      'Lead incident response for cyber threats, coordinate CERT duties and national escalation.',
    domains: ['health', 'education', 'telecom', 'public_services'],
    can: ['retrieve', 'assess', 'escalate'],
    mustNot: ['Substitute for sectoral regulators'],
    color: 'text-rose-500',
  },
  {
    id: 'coordinator',
    name: 'Inter-institutional Coordinator',
    role: 'coordinator',
    mandate:
      'Orchestrate the multi-agent protocol: sequence contributions, detect conflicting mandates, and reconcile independent assessments into a joint situation report.',
    domains: ['health', 'education', 'telecom', 'public_services', 'agriculture'],
    can: ['retrieve', 'assess', 'coordinate', 'escalate'],
    color: 'text-primary',
  },
]

export function institutionsForDomain(domain: Domain): InstitutionSpec[] {
  return INSTITUTIONS.filter((i) => i.domains.includes(domain))
}
