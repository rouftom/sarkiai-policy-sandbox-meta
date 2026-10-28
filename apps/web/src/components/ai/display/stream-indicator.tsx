'use client'

/**
 * A small 3D cube that turns while the answer is being written. The faces are
 * placed in 3D space and the cube rotates on two axes, so it reads as an object
 * rather than a flat pulse. Decorative: the status text carries the meaning.
 */

import * as React from 'react'
import { motion } from 'framer-motion'

const FACE = 'absolute inset-0 rounded-[3px] border border-white/40 bg-brand-primary/85 dark:bg-brand-primary-light/80'

export function StreamIndicator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-block h-4 w-4 ${className ?? ''}`}
      style={{ perspective: 60 }}
    >
      <motion.span
        className="absolute inset-0"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateX: [0, 360], rotateY: [0, 360] }}
        transition={{ duration: 3.2, ease: 'linear', repeat: Infinity }}
      >
        <span className={FACE} style={{ transform: 'translateZ(8px)' }} />
        <span className={FACE} style={{ transform: 'rotateY(180deg) translateZ(8px)' }} />
        <span className={FACE} style={{ transform: 'rotateY(90deg) translateZ(8px)', opacity: 0.8 }} />
        <span className={FACE} style={{ transform: 'rotateY(-90deg) translateZ(8px)', opacity: 0.8 }} />
        <span className={FACE} style={{ transform: 'rotateX(90deg) translateZ(8px)', opacity: 0.6 }} />
        <span className={FACE} style={{ transform: 'rotateX(-90deg) translateZ(8px)', opacity: 0.6 }} />
      </motion.span>
    </span>
  )
}

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
