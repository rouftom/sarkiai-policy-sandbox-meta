'use client'

import * as React from 'react'
import { Check, RotateCcw, Loader } from 'lucide-react'
import { Button, cn } from '@sps/ui'
import { useI18n } from '@/lib/i18n'

/** What the knowledge base holds, in one line: the corpus, the vectors and the indexes. */
export interface KbSummary {
  documents: number
  chunks: number
  dimensions?: number
  model?: string
  lastIngestedAt?: string | null
  pendingIndexes: number
}

export function KbMiniStats({
  summary,
  repairing = false,
  onRepair,
  className,
}: {
  summary: KbSummary
  repairing?: boolean
  onRepair?: () => void
  className?: string
}) {
  const { t, locale } = useI18n()
  const fmt = (value: number) => value.toLocaleString('en-US')
  const ready = summary.pendingIndexes === 0
  const last = summary.lastIngestedAt
    ? new Date(summary.lastIngestedAt).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
    : t('knowledge.never')

  return (
    <div
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[11px] text-muted-foreground',
        className,
      )}
      title={`${t('knowledge.lastIngest')}: ${last}`}
    >
      <span className="font-semibold text-foreground">{fmt(summary.documents)}</span>
      <span>{t('knowledge.documents').toLowerCase()}</span>
      <span className="h-3 w-px bg-border" />
      <span className="font-mono text-foreground">{fmt(summary.chunks)}</span>
      <span>{t('knowledge.chunks').toLowerCase()}</span>
      {summary.dimensions ? (
        <>
          <span className="h-3 w-px bg-border" />
          <span className="font-mono">{summary.dimensions}d</span>
        </>
      ) : null}
      {summary.model ? (
        <>
          <span className="h-3 w-px bg-border" />
          <code className="text-[10px]">{summary.model}</code>
        </>
      ) : null}
      <span className="h-3 w-px bg-border" />
      {ready ? (
        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" />
          {t('knowledge.indexes.allReady')}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          {t('knowledge.indexes.pending', { count: summary.pendingIndexes })}
          {onRepair && (
            <Button variant="ghost" size="icon-sm" className="h-5 w-5 rounded-md" onClick={onRepair} disabled={repairing} aria-label={t('knowledge.indexes.repair')}>
              {repairing ? <Loader className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            </Button>
          )}
        </span>
      )}
    </div>
  )
}
