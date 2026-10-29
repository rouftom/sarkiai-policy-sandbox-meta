/**
 * Human labels for audit actions. The chain stores machine names
 * (`agent.assessment`, `gap.recorded`, …); the console shows what happened.
 * An action without a translation is still readable: its name is humanised.
 */

export const AUDIT_ACTION_KEYS: Record<string, string> = {
  'agent.assessment': 'audit.action.agentAssessment',
  assessment: 'audit.action.assessment',
  'audit.chain_reset': 'audit.action.chainReset',
  'citation.rejected': 'audit.action.citationRejected',
  'communication.approved': 'audit.action.communicationApproved',
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

/** `gap_recorded` → `Gap recorded`: the fallback for an action without a translation. */
export function humaniseAction(action: string): string {
  const words = action.replace(/[._-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The category of an action (`agent`, `gap`, …), used to group the overview chart. */
export function actionCategory(action: string): string {
  return action.split(/[._]/)[0] ?? action
}
