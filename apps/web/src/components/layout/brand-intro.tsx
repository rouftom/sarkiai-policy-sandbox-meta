'use client'

/**
 * Boot lockup: the shield is drafted in ink, then the console name rises out of
 * a mask. It replaces the `animate-pulse` placeholder on the loading screen,
 * which read as generated. The sequence plays once and settles: nothing loops,
 * and `prefers-reduced-motion` renders the final state immediately.
 */

import * as React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@sps/ui'

export interface BrandIntroProps {
  /** Localised console name, e.g. "SarkiAI Policy Sandbox". */
  wordmark: string
  /** Mark edge, in pixels. */
  size?: number
  className?: string
}

const SHIELD =
  'M20 2.5 35 7.5v12.2c0 8.4-6 15.6-15 18.8-9-3.2-15-10.4-15-18.8V7.5L20 2.5Z'
const LEAF =
  'M20 10.5c4.6 2.7 7 6.4 7 10.6 0 4.5-3.1 7.6-7 8.9-3.9-1.3-7-4.4-7-8.9 0-4.2 2.4-7.9 7-10.6Z'
const VEINS = 'M20 13.5v14.1M20 19.2c1.9-1.6 4-2.4 6.2-2.4M20 23.5c-1.9-1.6-4-2.4-6.2-2.4'

/** Fast departure, long settle: feels printed, not springy. */
const OUT = [0.16, 1, 0.3, 1] as const
/** Steady hand for line work. */
const IN_OUT = [0.65, 0, 0.35, 1] as const

export function BrandIntro({ wordmark, size = 44, className }: BrandIntroProps) {
  const still = useReducedMotion() === true
  const clip = `sps-ink-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        aria-hidden
        className="shrink-0 text-brand-primary dark:text-brand-primary-light"
      >
        {/* The ink rises from the nib rather than fading in. */}
        <defs>
          <clipPath id={clip}>
            <motion.rect
              x="0"
              width="40"
              height="40"
              {...(still
                ? { initial: false as const, animate: { y: 2 } }
                : {
                    initial: { y: 42 },
                    animate: { y: 2 },
                    transition: { duration: 0.7, delay: 0.3, ease: IN_OUT },
                  })}
            />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clip})`}>
          <path d={SHIELD} fill="currentColor" />
        </g>

        {/* The outline is drawn by hand over the rising ink. */}
        <motion.path
          d={SHIELD}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          {...(still
            ? { initial: false as const }
            : {
                initial: { pathLength: 0 },
                animate: { pathLength: 1 },
                transition: { duration: 0.95, ease: IN_OUT },
              })}
        />

        <motion.g
          style={{ transformOrigin: '20px 20px' }}
          {...(still
            ? { initial: false as const }
            : {
                initial: { opacity: 0, scale: 0.94 },
                animate: { opacity: 1, scale: 1 },
                transition: { duration: 0.5, delay: 0.5, ease: OUT },
              })}
        >
          <path d={LEAF} fill="#FFFFFF" fillOpacity="0.22" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="1" />
          <motion.path
            d={VEINS}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.3"
            strokeLinecap="round"
            {...(still
              ? { initial: false as const }
              : {
                  initial: { pathLength: 0, opacity: 0 },
                  animate: { pathLength: 1, opacity: 1 },
                  transition: { duration: 0.45, delay: 0.85, ease: IN_OUT },
                })}
          />
        </motion.g>
      </svg>

      <span className="min-w-0 overflow-hidden py-0.5">
        <motion.span
          className="block whitespace-nowrap font-display text-[13px] font-bold tracking-tight text-foreground"
          {...(still
            ? { initial: false as const }
            : {
                initial: { y: '110%' },
                animate: { y: '0%' },
                transition: { duration: 0.65, delay: 1.02, ease: OUT },
              })}
        >
          {wordmark}
        </motion.span>
      </span>
    </div>
  )
}
