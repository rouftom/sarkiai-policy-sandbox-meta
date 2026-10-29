'use client'

/**
 * Long-running work in the console: a labelled indeterminate bar instead of a
 * bare spinner, so the operator sees *what* is happening (retrieval, model call,
 * transcription, ingestion) and that the request has not stalled.
 */

import * as React from 'react'
import { IndeterminateBar, cn } from '@sps/ui'

export function ProcessingBar({
  label,
  detail,
  className,
  compact = false,
}: {
  label: string
  detail?: string
  className?: string
  /** One line, for a toolbar: the same bar without the card around it. */
  compact?: boolean
}) {
  if (compact) {
    return (
      <div role="status" aria-live="polite" className={cn('flex min-w-0 items-center gap-2', className)}>
        <p className="shrink-0 text-[10px] font-medium text-foreground">{label}</p>
        <IndeterminateBar label={label} className="min-w-0 flex-1" />
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('space-y-1.5 rounded-lg border border-border bg-card px-3 py-2', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-foreground">{label}</p>
        {detail && <p className="min-w-0 truncate text-[10px] text-muted-foreground">{detail}</p>}
      </div>
      <IndeterminateBar label={label} />
    </div>
  )
}
