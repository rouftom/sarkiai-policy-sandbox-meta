'use client'

import * as React from 'react'

/** A quick tab switch is not a new read; only a return after this delay refetches. */
const DEFAULT_MIN_INTERVAL_MS = 20_000

/**
 * Re-run a loader when the operator comes back to the tab.
 *
 * Next keeps a visited route in its client cache, so returning to a page does
 * not always remount it: a mount effect alone leaves the blocks showing what
 * they fetched the first time, or the empty state of a request that raced the
 * session right after sign-in. Focus and visibility are the honest signals that
 * the operator is looking again; the throttle keeps a flick between two tabs
 * from re-reading the same data.
 */
export function useRefreshOnFocus(
  load: () => void | Promise<void>,
  minIntervalMs = DEFAULT_MIN_INTERVAL_MS,
): void {
  const latest = React.useRef(load)
  latest.current = load
  const lastRun = React.useRef(0)
  const running = React.useRef(false)

  React.useEffect(() => {
    const run = () => {
      if (running.current) return
      if (Date.now() - lastRun.current < minIntervalMs) return
      lastRun.current = Date.now()
      running.current = true
      void Promise.resolve(latest.current())
        .catch(() => undefined)
        .finally(() => {
          running.current = false
        })
    }
    const onFocus = () => run()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('pageshow', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pageshow', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [minIntervalMs])
}
