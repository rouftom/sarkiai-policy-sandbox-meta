'use client'

import * as React from 'react'

/**
 * Row navigation state for tables whose rows open another route. `startTransition`
 * keeps the list on screen while the next route is prepared, and `pendingId` lets
 * the clicked row swap its action for a spinner until the navigation commits.
 * The id is cleared from the caller's point of view as soon as the transition ends,
 * so the spinner never outlives the route change.
 */
export function useRowNavigation() {
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const [isPending, startTransition] = React.useTransition()

  const navigate = React.useCallback((id: string, go: () => void) => {
    setPendingId(id)
    startTransition(go)
  }, [])

  return { pendingId: isPending ? pendingId : null, navigate }
}
