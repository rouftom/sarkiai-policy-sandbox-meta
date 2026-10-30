'use client'

/**
 * Action center: the operator's stored side effects, newest first, filtered by
 * status and searched by text. Pending actions can be decided inline. The
 * component makes no network call: the parent loads `actions` (see
 * `listActions`) and handles `onDecide` (see `decideAction`).
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Clock, ListChecks, Loader, Play, RefreshCw, Search, X, XCircle } from 'lucide-react'
import { AnimatedTabsList, Badge, Button, Card, Input, type TabItem } from '@sps/ui'
import { useI18n } from '@/lib/i18n'
import type { ActionRecord, ActionStatus } from '@/lib/agent-ui'
import { ACTION_KIND_KEY, ACTION_RISK_KEY, ACTION_RISK_TONE, ACTION_STATUS_KEY } from './approval-card'

// An approved action runs at once and becomes "executed": the approved tab shows both.
const STATUS_FILTERS: ActionStatus[] = ['pending', 'approved', 'rejected', 'failed']
const STATUSES_OF_FILTER: Partial<Record<ActionStatus, ActionStatus[]>> = { approved: ['approved', 'executed'] }

const STATUS_ICON: Record<ActionStatus | 'all', TabItem['icon']> = {
  all: ListChecks,
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  executed: Play,
  failed: AlertTriangle,
}

const STATUS_TONE: Record<ActionStatus, 'warning' | 'success' | 'danger'> = {
  pending: 'warning',
  approved: 'success',
  executed: 'success',
  rejected: 'danger',
  failed: 'danger',
}

export interface ActionCenterProps {
  actions: ActionRecord[]
  /** The list is being fetched. */
  loading?: boolean
  /** Called with the decision on a pending action. The parent should refresh `actions`. */
  onDecide: (id: string, decision: 'approve' | 'reject') => void
  /** Shows a refresh button when provided. */
  onRefresh?: () => void
  /** Shows a close button when provided. */
  onClose?: () => void
}

export function ActionCenter({ actions, loading = false, onDecide, onRefresh, onClose }: ActionCenterProps) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ActionStatus | 'all'>('all')
  const [deciding, setDeciding] = useState<string | null>(null)

  // A decision is locked until the list changes again (the parent refreshes it).
  useEffect(() => {
    setDeciding(null)
  }, [actions])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return actions.filter((action) => {
      if (filter !== 'all' && !(STATUSES_OF_FILTER[filter] ?? [filter]).includes(action.status)) return false
      if (!needle) return true
      return [action.title, action.summary, t(ACTION_KIND_KEY[action.kind])].some((text) =>
        text.toLowerCase().includes(needle),
      )
    })
  }, [actions, filter, query, t])

  const decide = (id: string, decision: 'approve' | 'reject') => {
    setDeciding(id)
    onDecide(id, decision)
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="h-full flex flex-col p-1 space-y-2 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-1">
        <div className="relative group flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-brand-primary transition-colors" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('agentui.action.search')}
            className="pl-10 pr-10 h-7 rounded-3xl bg-slate-200 dark:bg-brand-primary-dark/20 hover:bg-slate-200/50 dark:hover:bg-brand-primary-dark/25 border-none !ring-0 !ring-offset-0 focus-visible:!ring-0 focus-visible:!ring-offset-0 outline-none !outline-0 focus-visible:!outline-none focus-visible:!outline-0 text-xs shadow-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-brand-primary-dark/40 transition-colors"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          )}
        </div>
        {onRefresh && (
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={loading}
            onClick={onRefresh}
            aria-label={t('agentui.action.refresh')}
            className="rounded-lg"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t('agentui.action.close')}
            className="rounded-lg"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <AnimatedTabsList
        items={(['all', ...STATUS_FILTERS] as const).map((value) => ({
          id: value,
          icon: STATUS_ICON[value],
          label: t(value === 'all' ? 'agentui.action.filter.all' : ACTION_STATUS_KEY[value]),
        }))}
        value={filter}
        onValueChange={(value) => setFilter(value as ActionStatus | 'all')}
        dense
        fullWidth
        showScrollButtons
        containerBreakpoint="@xs"
        className="px-1"
      />

      <div className="flex-1 overflow-y-auto p-1 space-y-2">
        {loading && actions.length === 0 && (
          <p className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
            <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t('agentui.action.loading')}
          </p>
        )}

        {visible.map((action) => (
          <Card
            key={action.id}
            className="shadow-none p-3 rounded-2xl border-none bg-slate-200 dark:bg-brand-primary-dark/15 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black tracking-widest text-muted-foreground">
                  {t(ACTION_KIND_KEY[action.kind])}
                </p>
                <p className="text-xs font-semibold text-foreground truncate">{action.title}</p>
              </div>
              <Badge tone={STATUS_TONE[action.status]} className="shrink-0 h-5 px-1.5 text-[9px] font-light tracking-widest">
                {t(ACTION_STATUS_KEY[action.status])}
              </Badge>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">{action.summary}</p>

            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              <Badge tone={ACTION_RISK_TONE[action.risk]} className="h-5 px-1.5 text-[9px] font-light tracking-widest">
                {t(ACTION_RISK_KEY[action.risk])}
              </Badge>
              <span>{formatDate(action.createdAt)}</span>
            </div>

            {action.result && (
              <p className="text-[10px] text-muted-foreground">
                <span className="font-semibold">{t('agentui.action.result')}:</span> {action.result}
              </p>
            )}

            {action.status === 'pending' && (
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  disabled={deciding !== null}
                  onClick={() => decide(action.id, 'reject')}
                  className="rounded-lg h-7 text-[10px] font-medium tracking-widest text-neutral-600 dark:text-neutral-400 px-3"
                >
                  {t('agentui.approval.reject')}
                </Button>
                <Button
                  variant="ghost"
                  disabled={deciding !== null}
                  onClick={() => decide(action.id, 'approve')}
                  className="rounded-lg h-7 text-[10px] font-semibold tracking-widest text-brand-primary hover:text-brand-primary-dark hover:bg-brand-primary/10 px-3"
                >
                  {t('agentui.approval.approve')}
                </Button>
              </div>
            )}
          </Card>
        ))}

        {!loading && visible.length === 0 && (
          <div className="space-y-3 px-2 py-6">
            <div className="flex items-center gap-2 text-foreground">
              <Search className="h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light" aria-hidden="true" />
              <p className="text-xs font-semibold">{t('agentui.action.empty')}</p>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{t('agentui.action.explain')}</p>
            <ul className="space-y-1.5 text-[11px]">
              {(Object.keys(ACTION_KIND_KEY) as Array<keyof typeof ACTION_KIND_KEY>).map((kind) => (
                <li key={kind} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-primary dark:bg-brand-primary-light" />
                  <span>
                    <span className="font-medium text-foreground">{t(ACTION_KIND_KEY[kind])}</span>
                    <span className="text-muted-foreground"> · {t(`agentui.kind.${kind}.hint` as 'agentui.kind.whatsapp_approval')}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </motion.div>
  )
}
