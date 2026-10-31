'use client'

import type { ReactNode } from 'react'

/**
 * A fresh subtree for every navigation.
 *
 * Next keeps a visited route in its client-side cache: returning to the home
 * page could reuse the previous instance, so its mount effects never ran again
 * and the dashboard kept the values of the first visit — or the empty state of
 * a request that raced the session right after sign-in. A template is the
 * supported way to remount the page on navigation, which is what a data page
 * needs. The assistant lives in the layout above it and keeps its conversation.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return children
}
