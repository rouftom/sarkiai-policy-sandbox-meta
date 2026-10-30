'use client'

import { Skeleton } from '@sps/ui'

/** Placeholder rows for the conversation list while it loads. */
export function HistoryShimmer({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="rounded-xl bg-card px-3 py-2.5 shadow-sm">
          <Skeleton className="h-3 rounded" style={{ width: `${72 - (index % 3) * 14}%` }} />
          <Skeleton className="mt-2 h-2.5 w-20 rounded" />
        </div>
      ))}
    </div>
  )
}

/** Placeholder thread for a conversation being opened: a question, then an answer. */
export function ConversationShimmer() {
  return (
    <div className="space-y-5 py-4" aria-busy="true">
      <div className="flex justify-end">
        <Skeleton className="h-9 w-[55%] rounded-2xl" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-[92%] rounded" />
        <Skeleton className="h-3 w-[85%] rounded" />
        <Skeleton className="h-3 w-[60%] rounded" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-7 w-[40%] rounded-2xl" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-[88%] rounded" />
        <Skeleton className="h-3 w-[72%] rounded" />
      </div>
    </div>
  )
}
