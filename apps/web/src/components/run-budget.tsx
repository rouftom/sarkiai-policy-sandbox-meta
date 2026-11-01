'use client'

/**
 * Per-run spend against the deployment's ceiling (`RUN_BUDGET_USD`).
 * Alert only: crossing the line never stops the run, it only says so.
 */

import * as React from 'react'
import { AlertTriangle, Coins } from 'lucide-react'
import { cn } from '@sps/ui'
import { observabilityApi, type ObservabilityRunDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

function usd(value: number, locale: string): string {
  if (value > 0 && value < 0.01) return `$${value.toFixed(5)}`
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

export function RunBudgetBadge({ runId, className }: { runId: string; className?: string }) {
  const { t, locale } = useI18n()
  const [run, setRun] = React.useState<ObservabilityRunDto | null>(null)

  React.useEffect(() => {
    let active = true
    observabilityApi
      .run(runId)
      .then((value) => active && setRun(value))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [runId])

  // No metered call yet, or an API without the route: show nothing.
  if (!run || run.totals.requests === 0) return null

  const ceiling = run.ceilingUsd
  const title = [
    ceiling > 0
      ? t('observability.budget.runTitle', { ceiling: usd(ceiling, locale) })
      : t('observability.budget.runNoCeiling'),
    run.totals.unpriced > 0 ? t('observability.budget.partial', { count: run.totals.unpriced }) : '',
    run.overBudget ? t('observability.budget.overRun') : '',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl border px-2 py-1 text-[11px]',
        run.overBudget
          ? 'border-amber-500/50 bg-amber-500/10 text-foreground'
          : 'border-border text-muted-foreground',
        className,
      )}
    >
      {run.overBudget ? (
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
      ) : (
        <Coins className="h-3.5 w-3.5 text-primary" />
      )}
      <span className="font-semibold tabular-nums text-foreground">{usd(run.totals.costUsd, locale)}</span>
      {ceiling > 0 && (
        <>
          <span className="text-muted-foreground">/</span>
          <span className="tabular-nums">{usd(ceiling, locale)}</span>
        </>
      )}
    </span>
  )
}
