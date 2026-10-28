'use client'

import * as React from 'react'
import { cn } from '@sps/ui'
import { useI18n } from '@/lib/i18n'

/** What the knowledge base holds, in one compact line: documents, chunks, last ingestion. */
export interface KbSummary {
  documents: number
  chunks: number
  lastIngestedAt?: string | null
}

export function KbMiniStats({ summary, className }: { summary: KbSummary; className?: string }) {
  const { t, locale } = useI18n()
  const fmt = (value: number) => value.toLocaleString('en-US')
  const last = summary.lastIngestedAt
    ? new Date(summary.lastIngestedAt).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : t('knowledge.never')

  return (
    <div
      className={cn(
        'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-[11px] text-muted-foreground',
        className,
      )}
      title={`${t('knowledge.lastIngest')}: ${last}`}
    >
      <span className="font-semibold text-foreground">{fmt(summary.documents)}</span>
      <span className="truncate">{t('knowledge.documents').toLowerCase()}</span>
      <span className="h-3 w-px shrink-0 bg-border" />
      <span className="font-mono text-foreground">{fmt(summary.chunks)}</span>
      <span className="truncate">{t('knowledge.chunks').toLowerCase()}</span>
    </div>
  )
}
