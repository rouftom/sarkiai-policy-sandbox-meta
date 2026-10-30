/**
 * Human labels for audit actions. The chain stores machine names
 * (`agent.assessment`, `gap.recorded`, …); the console shows what happened.
 * An action without a translation is still readable: its name is humanised.
 */

import type { MessageKey } from './i18n'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export const AUDIT_ACTION_KEYS: Record<string, string> = {
  'agent.assessment': 'audit.action.agentAssessment',
  assessment: 'audit.action.assessment',
  'audit.chain_reset': 'audit.action.chainReset',
  'citation.rejected': 'audit.action.citationRejected',
  'communication.approved': 'audit.action.communicationApproved',
  'notification.email_sent': 'audit.action.notificationEmailSent',
  'notification.whatsapp_sent': 'audit.action.notificationWhatsappSent',
  'notification.contact_added': 'audit.action.notificationContactAdded',
  'notification.contact_removed': 'audit.action.notificationContactRemoved',
  'country.created': 'audit.action.countryCreated',
  'country.updated': 'audit.action.countryUpdated',
  'country.sectors_updated': 'audit.action.countrySectorsUpdated',
  'country.removed': 'audit.action.countryRemoved',
  'exercise.after_action': 'audit.action.exerciseAfterAction',
  'gap.recorded': 'audit.action.gapRecorded',
  'impact.analyzed': 'audit.action.impactAnalyzed',
  'model.selected': 'audit.action.modelSelected',
  'provider.switched': 'audit.action.providerSwitched',
  request_tool: 'audit.action.requestTool',
  'scenario.reconcile': 'audit.action.scenarioReconcile',
  whatsapp_approval: 'audit.action.whatsappApproval',
  'whatsapp.approval': 'audit.action.whatsappApproval',
  ministry_health: 'audit.action.ministryHealth',
  'readiness.assessed': 'audit.action.readinessAssessed',
  'readiness.opened': 'audit.action.readinessOpened',
  'readiness.history.viewed': 'audit.action.readinessHistoryViewed',
  'readiness.report.generated': 'audit.action.readinessReportGenerated',
  'readiness.localized': 'audit.action.readinessLocalized',
  'readiness.deleted': 'audit.action.readinessDeleted',
  'readiness.resumed': 'audit.action.readinessResumed',
}

/**
 * Known actors of the chain. The rest are e-mail addresses or service names and
 * stay as they are: an operator reads its own address in the journal.
 */
export const AUDIT_ACTOR_KEYS: Record<string, string> = {
  operator: 'audit.actor.operator',
  user: 'audit.actor.user',
  agent: 'audit.actor.agent',
  system: 'audit.actor.system',
  service: 'audit.actor.service',
  scenario: 'audit.actor.scenario',
  readiness: 'audit.actor.readiness',
  whatsapp: 'audit.actor.whatsapp',
  api: 'audit.actor.api',
  anonymous: 'audit.actor.anonymous',
  unknown: 'audit.actor.unknown',
}

/** `gap_recorded` → `Gap recorded`: the fallback for an action without a translation. */
export function humaniseAction(action: string): string {
  const words = action.replace(/[._-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** `gap_recorded` → `Gap recorded`: the fallback for an actor without a translation. */
export function humaniseActor(actor: string): string {
  if (actor.includes('@')) return actor
  const words = actor.replace(/[._-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The label of an action in the current language, or its humanised machine name. */
export function auditActionLabel(action: string, t: Translate): string {
  const key = AUDIT_ACTION_KEYS[action]
  return key ? t(key as MessageKey) : humaniseAction(action)
}

/** The label of an actor: known services are translated, an address is kept as is. */
export function auditActorLabel(actor: string, t: Translate, userId?: string): string {
  const normalised = actor.trim().toLowerCase()
  // Role-scoped records carry the role in `actor` and the operator's address in
  // `userId`; the journal names the person, never the anonymous role.
  if (userId && (normalised === 'operator' || normalised === 'user')) return userId
  const key = AUDIT_ACTOR_KEYS[normalised]
  return key ? t(key as MessageKey) : humaniseActor(actor)
}

/** The category of an action (`agent`, `gap`, …), used to group the overview chart. */
export function actionCategory(action: string): string {
  return action.split(/[._]/)[0] ?? action
}
