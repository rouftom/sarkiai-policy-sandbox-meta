'use client'

/**
 * Card for a side effect the agent proposes and cannot run without the
 * operator: title, summary, risk, expandable payload, approve or reject. The
 * decision goes to the action API (see `decideAction`), not to the chat.
 */

import * as React from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ShieldAlert, XCircle, Loader } from 'lucide-react'
import { Badge, Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@sps/ui'
import { useI18n, type MessageKey } from '@/lib/i18n'
import type { ActionKind, ActionRisk, ActionStatus, ApprovalRequest } from '@/lib/agent-ui'

export const ACTION_KIND_KEY: Record<ActionKind, MessageKey> = {
  whatsapp_approval: 'agentui.kind.whatsapp_approval',
  publish_communication: 'agentui.kind.publish_communication',
  record_gap: 'agentui.kind.record_gap',
  request_tool: 'agentui.kind.request_tool',
  delete_record: 'agentui.kind.delete_record',
}

export const ACTION_RISK_KEY: Record<ActionRisk, MessageKey> = {
  low: 'agentui.risk.low',
  medium: 'agentui.risk.medium',
  high: 'agentui.risk.high',
}

export const ACTION_RISK_TONE: Record<ActionRisk, 'success' | 'warning' | 'danger'> = {
  low: 'success',
  medium: 'warning',
  high: 'danger',
}

export const ACTION_STATUS_KEY: Record<ActionStatus, MessageKey> = {
  pending: 'agentui.status.pending',
  approved: 'agentui.status.approved',
  rejected: 'agentui.status.rejected',
  executed: 'agentui.status.executed',
  failed: 'agentui.status.failed',
}

export interface ApprovalCardProps {
  request: ApprovalRequest
  /** Current status of the stored action. Absent or `pending` shows the buttons. */
  status?: ActionStatus
  /** A decision is being sent: the buttons stay disabled. */
  busy?: boolean
  onDecision: (decision: 'approve' | 'reject') => void
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function ApprovalCard({ request, status, busy = false, onDecision }: ApprovalCardProps) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const isPending = !status || status === 'pending'
  const details = Object.entries(request.payload ?? {}).filter(([, value]) => value !== undefined)

  return (
    <div className="w-full max-w-full my-1 bg-neutral-50/50 dark:bg-brand-primary-dark/10 rounded-xl border-none overflow-hidden">
      <div className="flex flex-col gap-1.5 p-2 px-3 bg-amber-500/5 border-none">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
          <span className="text-[10px] font-light tracking-widest text-foreground/60 truncate">
            {t('agentui.approval.title')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={ACTION_RISK_TONE[request.risk]} className="h-5 px-1.5 text-[9px] font-light tracking-widest">
            {t(ACTION_RISK_KEY[request.risk])}
          </Badge>
          <Badge tone="brand" className="h-5 px-1.5 text-[9px] font-light tracking-widest">
            {t(ACTION_KIND_KEY[request.action])}
          </Badge>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-xs font-normal text-foreground tracking-tight">{request.title}</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{request.summary}</p>
          </div>
        </div>

        {details.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 pl-1 text-[10px] font-light tracking-widest text-muted-foreground hover:text-foreground transition-colors">
              <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
              {t('agentui.approval.details')}
            </CollapsibleTrigger>
            <CollapsibleContent className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-1 pt-1.5">
              {details.map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/60 dark:bg-brand-primary-dark/20 border-none px-2 py-1"
                >
                  <span className="text-[9px] font-light tracking-widest text-muted-foreground truncate">{key}</span>
                  <span className="text-[11px] font-medium text-foreground truncate max-w-[60%]">
                    {formatValue(value)}
                  </span>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      {isPending && (
        <div className="p-2 py-1.5 bg-neutral-50/50 dark:bg-brand-primary-dark/10 border-none flex justify-end gap-2">
          {busy ? (
            <span className="flex items-center gap-1 text-muted-foreground text-[10px] font-light tracking-widest">
              <Loader className="w-3 h-3 animate-spin text-brand-primary" aria-hidden="true" />
              {t('agentui.approval.processing')}
            </span>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => onDecision('reject')}
                className="rounded-lg h-7 text-[10px] font-medium tracking-widest text-neutral-600 dark:text-neutral-400 px-3"
              >
                {t('agentui.approval.reject')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => onDecision('approve')}
                className="rounded-lg h-7 text-[10px] font-semibold tracking-widest text-brand-primary hover:text-brand-primary-dark hover:bg-brand-primary/10 px-3"
              >
                {t('agentui.approval.approve')}
              </Button>
            </>
          )}
        </div>
      )}

      {!isPending && status && (
        <div className="p-2 py-1.5 border-none flex items-center gap-1.5">
          <span
            className={`flex items-center gap-1 text-[10px] font-light tracking-widest ${
              status === 'approved' || status === 'executed'
                ? 'text-emerald-600 dark:text-emerald-500'
                : 'text-red-600 dark:text-red-500'
            }`}
          >
            {status === 'approved' || status === 'executed' ? (
              <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
            ) : (
              <XCircle className="w-3 h-3" aria-hidden="true" />
            )}
            {t(ACTION_STATUS_KEY[status])}
          </span>
        </div>
      )}
    </div>
  )
}
