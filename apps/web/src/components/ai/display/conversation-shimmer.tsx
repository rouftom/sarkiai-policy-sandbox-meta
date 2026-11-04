'use client'

import { Skeleton } from '@sps/ui'

/**
 * The loading placeholders stay quiet: translucent surfaces, a soft neutral
 * fill instead of the contrasty `secondary` token, and a sub-pixel blur so the
 * shapes read as a hint of the content rather than as hard cards.
 */
const SOFT_SURFACE = 'blur-[0.5px]'
const SOFT_BAR = 'bg-foreground/[0.07] dark:bg-white/[0.09]'

/** Placeholder rows for the conversation list while it loads. */
export function HistoryShimmer({ rows = 6 }: { rows?: number }) {
  return (
    <div className={`space-y-2 ${SOFT_SURFACE}`} aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="rounded-xl bg-card/55 px-3 py-2.5 ring-1 ring-border/35 dark:bg-white/[0.04] dark:ring-white/[0.06]"
        >
          <Skeleton
            className={`h-3 rounded ${SOFT_BAR}`}
            style={{ width: `${72 - (index % 3) * 14}%` }}
          />
          <Skeleton className={`mt-2 h-2.5 w-20 rounded ${SOFT_BAR}`} />
        </div>
      ))}
    </div>
  )
}

/** Placeholder thread for a conversation being opened: a question, then an answer. */
export function ConversationShimmer() {
  return (
    <div className={`space-y-5 py-4 ${SOFT_SURFACE}`} aria-busy="true">
      <div className="flex justify-end">
        <Skeleton className="h-9 w-[55%] rounded-2xl bg-foreground/[0.09] dark:bg-white/[0.11]" />
      </div>
      <div className="space-y-2">
        <Skeleton className={`h-3 w-[92%] rounded ${SOFT_BAR}`} />
        <Skeleton className={`h-3 w-[85%] rounded ${SOFT_BAR}`} />
        <Skeleton className={`h-3 w-[60%] rounded ${SOFT_BAR}`} />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-7 w-[40%] rounded-2xl bg-foreground/[0.09] dark:bg-white/[0.11]" />
      </div>
      <div className="space-y-2">
        <Skeleton className={`h-3 w-[88%] rounded ${SOFT_BAR}`} />
        <Skeleton className={`h-3 w-[72%] rounded ${SOFT_BAR}`} />
      </div>
    </div>
  )
}
