'use client'

/**
 * The saved assessments, as a list inside the readiness screen (like the
 * assistant's history): newest first, the one open is highlighted, a click opens it.
 * Each row has a delete action, which asks for confirmation in a dialog first.
 */

import * as React from 'react'
import { Check, Loader, Trash2 } from 'lucide-react'
import { cn } from '@sps/ui'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import type { ReadinessRunSummaryDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

export function ReadinessHistory({
  runs,
  activeId,
  onOpen,
  onDelete,
  deletingId,
}: {
  runs: ReadinessRunSummaryDto[] | null
  activeId?: string
  onOpen: (id: string) => void
  onDelete: (id: string) => Promise<void>
  deletingId: string | null
}) {
  const { t, locale } = useI18n()
  const [pending, setPending] = React.useState<ReadinessRunSummaryDto | null>(null)
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  const confirm = async () => {
    if (!pending) return
    await onDelete(pending.id)
    setPending(null)
  }

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
            const deleting = entry.id === deletingId
            return (
              <li
                key={entry.id}
                className={cn(
                  'flex items-center gap-1 rounded-xl pr-1 transition-colors hover:bg-brand-primary/5',
                  active ? 'bg-brand-primary/10' : 'bg-secondary/40',
                )}
              >
                <button
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onOpen(entry.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-medium text-foreground">
                      {formatDate(entry.createdAt)} · {entry.country.toUpperCase()} · {t(`domain.${entry.domain}` as 'domain.health')}
                      {entry.status === 'failed' && (
                        <span className="ml-2 rounded-full bg-destructive/10 px-1.5 py-px text-[9px] font-semibold text-destructive">{t('readiness.status.failed')}</span>
                      )}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {entry.runBy} · {t('readiness.composite')} {entry.composite ?? 'n/a'}/5 · {entry.dimensions} {t('readiness.dimensionsWord')}
                    </span>
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-brand-primary-light" />}
                </button>
                <button
                  type="button"
                  onClick={() => setPending(entry)}
                  disabled={deleting}
                  aria-label={t('readiness.history.delete')}
                  title={t('readiness.history.delete')}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  {deleting ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </li>
            )
          })}
        </ol>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        onConfirm={confirm}
        title={t('readiness.history.deleteTitle')}
        description={pending ? t('readiness.history.deleteBody', { date: formatDate(pending.createdAt), country: pending.country.toUpperCase() }) : ''}
        confirmText={t('readiness.history.deleteConfirm')}
        cancelText={t('readiness.history.cancel')}
      />
    </section>
  )
}
