'use client'

/**
 * The saved assessments, as a list inside the readiness screen (like the
 * assistant's history): newest first, the one open is highlighted, a click opens it.
 */

import * as React from 'react'
import { Check, Loader } from 'lucide-react'
import { cn } from '@sps/ui'
import type { ReadinessRunSummaryDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

export function ReadinessHistory({
  runs,
  activeId,
  onOpen,
}: {
  runs: ReadinessRunSummaryDto[] | null
  activeId?: string
  onOpen: (id: string) => void
}) {
  const { t, locale } = useI18n()
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <section className="space-y-2">
      {runs === null && (
        <p className="flex items-center gap-2 py-10 text-[11px] text-muted-foreground">
          <Loader className="h-3.5 w-3.5 animate-spin" /> {t('readiness.historyLoading')}
        </p>
      )}
      {runs?.length === 0 && <p className="py-10 text-center text-[11px] text-muted-foreground">{t('readiness.historyEmpty')}</p>}

      {runs && runs.length > 0 && (
        <ol className="space-y-1">
          {runs.map((entry) => {
            const active = entry.id === activeId
            return (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onOpen(entry.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-brand-primary/5',
                    active ? 'bg-brand-primary/10' : 'bg-secondary/40',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-foreground">
                      {formatDate(entry.createdAt)} · {entry.country.toUpperCase()}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {entry.runBy} · {t('readiness.composite')} {entry.composite ?? '—'}/5 · {entry.dimensions} {t('readiness.dimensionsWord')}
                    </span>
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-brand-primary-light" />}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
