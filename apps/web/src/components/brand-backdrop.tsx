'use client'

/**
 * Policy-themed brand backdrop, shared by the unauthenticated brand panel and
 * the assistant side panel. Same quiet visual language as the organization
 * surfaces (soft brand blobs, outlined shapes, governance glyphs), painted from
 * theme tokens so it follows the active pack and mode.
 *
 * `panel` is the compact variant used behind the assistant: fewer glyphs at a
 * lower opacity, so conversation text stays the thing the eye lands on.
 */

import { FileText, Gavel, Landmark, Network, Scale, ScrollText, ShieldCheck } from 'lucide-react'
import { cn } from '@sps/ui'

interface BrandBackdropProps {
  variant?: 'page' | 'panel'
  className?: string
}

export function BrandBackdrop({ variant = 'page', className }: BrandBackdropProps) {
  const panel = variant === 'panel'
  const icon = cn(
    'pointer-events-none absolute',
    panel
      ? 'h-5 w-5 text-brand-primary/15 dark:text-brand-primary-light/10'
      : 'h-7 w-7 text-brand-primary/25 dark:text-brand-primary-light/20',
  )

  return (
    <div className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)} aria-hidden>
      <div
        className={cn(
          'absolute rounded-full blur-3xl',
          panel
            ? '-left-20 top-6 h-56 w-56 bg-brand-primary/15 dark:bg-brand-primary-light/10'
            : '-left-24 top-10 h-72 w-72 bg-brand-primary/25',
        )}
      />
      <div
        className={cn(
          'absolute rounded-full blur-3xl',
          panel
            ? '-right-16 bottom-24 h-48 w-48 bg-brand-accent/10'
            : '-right-16 bottom-16 h-64 w-64 bg-brand-accent/15',
        )}
      />
      <div
        className={cn(
          'absolute rotate-12 rounded-[2rem] border border-brand-primary/15',
          panel ? 'right-5 top-24 h-24 w-24 rounded-[1.5rem]' : 'right-16 top-24 h-40 w-40',
        )}
      />
      <div
        className={cn(
          'absolute -rotate-12 rounded-3xl border border-brand-primary/20',
          panel ? 'bottom-36 left-5 h-16 w-16' : 'bottom-28 left-16 h-24 w-24',
        )}
      />

      {panel ? (
        <>
          <Scale className={cn(icon, 'left-4 top-32 -rotate-12')} />
          <Landmark className={cn(icon, 'right-6 top-1/2 rotate-12')} />
          <Gavel className={cn(icon, 'bottom-32 right-5 rotate-12')} />
          <FileText className={cn(icon, 'bottom-24 left-1/3 -rotate-6')} />
        </>
      ) : (
        <>
          <Scale className={cn(icon, 'left-12 top-28 -rotate-12')} />
          <Landmark className={cn(icon, 'right-24 top-44 h-8 w-8 rotate-12')} />
          <Gavel className={cn(icon, 'bottom-44 right-1/3 h-6 w-6 rotate-12')} />
          <FileText className={cn(icon, 'bottom-28 left-1/3 -rotate-6')} />
          <Network className={cn(icon, 'right-10 top-1/2 h-8 w-8 -rotate-12')} />
          <ScrollText className={cn(icon, 'bottom-16 right-28 rotate-6')} />
          <ShieldCheck className={cn(icon, 'right-1/3 top-16 h-6 w-6 rotate-12')} />
        </>
      )}
    </div>
  )
}
