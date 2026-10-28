'use client'

import { useEffect } from 'react'

/** Registers `/sw.js` in production builds only: the dev server keeps its own assets. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  }, [])
  return null
}
