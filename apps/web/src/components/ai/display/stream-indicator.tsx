'use client'

import * as React from 'react'

/** Words the assistant cycles through while it works, like a thinking indicator. */
export function useThinkingWord(words: string[], active: boolean, intervalMs = 2200): string {
  const [index, setIndex] = React.useState(0)
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setIndex((value) => (value + 1) % words.length), intervalMs)
    return () => window.clearInterval(id)
  }, [active, words.length, intervalMs])
  return words[index % words.length] ?? ''
}
