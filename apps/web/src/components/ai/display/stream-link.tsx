'use client'

/**
 * The stream loader of a running answer, at the foot of the activity trail. A
 * hairline bar hangs from the brain down to the loader, and a light runs down it
 * while the answer is written, with a soft pulsing glow behind the loader.
 */

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { StreamLoader } from '@/components/ai/display/stream-loaders'

export function StreamLink() {
  const reduce = useReducedMotion()
  return (
    <span className="pointer-events-none absolute bottom-0 left-0 top-1 flex w-4 flex-col items-center" aria-hidden="true">
      <span className="relative mb-1 block w-px flex-1 overflow-hidden rounded-full bg-brand-primary/20">
        {!reduce && (
          <motion.span
            className="absolute inset-x-0 h-1/5 w-px rounded-full bg-gradient-to-b from-transparent via-brand-primary to-transparent"
            initial={{ top: '-20%' }}
            animate={{ top: ['-20%', '100%'] }}
            transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
            style={{ boxShadow: '0 0 8px 2px var(--primary)' }}
          />
        )}
      </span>
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <motion.span
          className="absolute inset-[-6px] rounded-full bg-brand-primary/30 blur-md"
          animate={reduce ? undefined : { opacity: [0.25, 0.9, 0.25], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity }}
        />
        <StreamLoader className="relative h-4 w-4" />
      </span>
    </span>
  )
}
