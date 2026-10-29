'use client'

/**
 * Incident timeline.
 *
 * Facts arrive in batches, and not to everyone: the health ministry does not
 * see what the cyber agency sees. Rendering the releases *and* who received
 * them makes the information asymmetry the engine models visible to the
 * audience instead of a line in the docs.
 */

import * as React from 'react'
import { Clock, Eye, Lock, Play } from 'lucide-react'
import { cn } from '@sps/ui'
import { institutionsForDomain, type Domain } from '@sps/shared'
import { useI18n } from '@/lib/i18n'

export interface TimelineItem {
  sequence: number
  releaseChunk: number
  title: string
  payload?: string
  visibleTo: string[]
}

export function IncidentTimeline({
  items,
  releasedChunks,
  totalTicks,
  domain,
  onStartChunk,
  starting = false,
}: {
  items: TimelineItem[]
  /** Chunks (ticks) already released. */
  releasedChunks: number
  totalTicks: number
  domain: Domain
  /** Facilitator mode: releases the next batch from the timeline itself. */
  onStartChunk?: () => void
  /** A batch is being released: the start buttons wait. */
  starting?: boolean
}) {
  const { t } = useI18n()

  const names = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const institution of institutionsForDomain(domain)) map.set(institution.id, institution.name)
    return map
  }, [domain])

  if (items.length === 0) return null

  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {items.map((item) => {
        const released = item.releaseChunk < releasedChunks
        const current = item.releaseChunk === releasedChunks && releasedChunks < totalTicks
        return (
          <li key={item.sequence} className="relative">
            <span
              className={cn(
                'absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2',
                released
                  ? 'border-primary bg-primary'
                  : current
                    ? 'animate-pulse border-primary bg-background'
                    : 'border-border bg-background',
              )}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-muted-foreground">
                {t('timeline.batch', { n: item.releaseChunk + 1 })}
              </span>
              <span className={cn('text-xs font-semibold', !released && 'text-muted-foreground')}>{item.title}</span>
              {released ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                  <Clock className="h-3 w-3" aria-hidden="true" />
                  {t('timeline.released')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  {t('timeline.pending')}
                </span>
              )}
              {current && onStartChunk && (
                <button
                  type="button"
                  onClick={onStartChunk}
                  disabled={starting}
                  aria-label={t('scenario.timeline.start')}
                  title={t('scenario.timeline.start')}
                  className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-brand-primary transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  <Play className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </div>

            {released && item.payload && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{item.payload}</p>
            )}

            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground/80">
              <Eye className="h-3 w-3" aria-hidden="true" />
              {t('timeline.visibleTo')}:
              {item.visibleTo.map((id) => (
                <span key={id} className="rounded-md bg-secondary px-1.5 py-0.5">
                  {names.get(id) ?? id}
                </span>
              ))}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
