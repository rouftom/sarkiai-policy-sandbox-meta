'use client'

/**
 * A titled block whose body folds away. Long process views, batch reports and
 * saved-run tables use it so the operator can keep the summary in sight and give
 * the space back to the rest of the page.
 */

import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@sps/ui'

export function CollapsiblePanel({
  title,
  meta,
  defaultOpen = true,
  className,
  headerClassName,
  contentClassName,
  children,
}: {
  title: React.ReactNode
  /** Short line kept in the header, visible even when the body is folded. */
  meta?: React.ReactNode
  defaultOpen?: boolean
  className?: string
  headerClassName?: string
  contentClassName?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const bodyId = React.useId()

  return (
    <section className={cn('rounded-xl border border-border', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-left outline-none transition-colors hover:bg-secondary/40 focus-visible:ring-2 focus-visible:ring-brand-primary/40',
          headerClassName,
        )}
      >
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">{title}</span>
        {meta && (
          <span
            className="min-w-0 max-w-[55%] truncate text-[10px] text-muted-foreground"
            title={typeof meta === 'string' ? meta : undefined}
          >
            {meta}
          </span>
        )}
      </button>
      {open && (
        <div id={bodyId} className={cn('border-t border-border', contentClassName)}>
          {children}
        </div>
      )}
    </section>
  )
}
