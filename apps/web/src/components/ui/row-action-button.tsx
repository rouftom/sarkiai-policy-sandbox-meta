'use client'

import React, { useState } from 'react'
import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sps/ui'
import { cn } from '@sps/ui'
import { Loader } from 'lucide-react'

interface RowActionButtonProps extends Omit<React.ComponentProps<typeof Button>, 'variant' | 'size'> {
  /** Tooltip + accessible label. */
  label: string
  /** Destructive styling (red hover). */
  tone?: 'default' | 'danger'
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right'
  /** Shows a spinner overlay and disables the button while the action runs. */
  loading?: boolean
}

/**
 * Icon-only row action button used inside the sticky/overlay action cells.
 * On desktop it shows a charte-compliant tooltip; on touch it stays a plain
 * button (no hover), which is why the dropdown/right-click also exists.
 */
export const RowActionButton = React.forwardRef<HTMLButtonElement, RowActionButtonProps>(
  ({ label, tone = 'default', tooltipSide = 'top', className, children, loading = false, disabled, onClick, ...props }, ref) => {
    const [pending, setPending] = useState(false)
    const isLoading = loading || pending

    // Self-guard: if the handler returns a promise, show a loader and block
    // double clicks until it settles (prevents duplicate side effects).
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      if (isLoading || disabled) {
        event.preventDefault()
        return
      }
      const result = (onClick as unknown as ((e: React.MouseEvent<HTMLButtonElement>) => unknown) | undefined)?.(event)
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        setPending(true)
        void Promise.resolve(result as Promise<unknown>).finally(() => setPending(false))
      }
    }

    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={ref}
              variant="ghost"
              size="icon"
              aria-label={label}
              aria-busy={isLoading || undefined}
              disabled={disabled || isLoading}
              onClick={handleClick}
              className={cn(
                'h-7 w-7 rounded-lg bg-slate-100 text-slate-600 transition-colors',
                'dark:bg-brand-primary-dark/50 dark:text-slate-300',
                tone === 'danger'
                  ? 'hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400'
                  : 'hover:bg-brand-primary/10 hover:text-brand-primary dark:hover:bg-brand-primary-dark/70 dark:hover:text-brand-teal',
                isLoading && 'pointer-events-none',
                className,
              )}
              {...props}
            >
              {isLoading ? <Loader className="h-4 w-4 animate-spin" /> : children}
            </Button>
          </TooltipTrigger>
          <TooltipContent
            side={tooltipSide}
            className="rounded-lg font-medium text-[10px] tracking-wide bg-brand-primary text-white border-none py-1.5 px-3"
          >
            {label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  },
)

RowActionButton.displayName = 'RowActionButton'
