'use client'

import * as React from 'react'
import { cn } from '../lib/cn'

interface TabsContextValue {
  value: string
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabs() {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error('Tabs components must be used inside <Tabs>')
  return context
}

/**
 * Tabs without a dependency: the console only needs a controlled strip and the
 * matching panel, and the FSM surfaces are all Tailwind anyway.
 */
export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn('flex min-w-0 flex-col', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({
  className,
  children,
  ariaLabel,
}: {
  className?: string
  children: React.ReactNode
  ariaLabel?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-wrap items-center gap-1 border-b border-border pb-1',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  className,
  children,
  disabled = false,
  tooltip,
}: {
  value: string
  className?: string
  children: React.ReactNode
  disabled?: boolean
  tooltip?: string
}) {
  const { value: current, onValueChange } = useTabs()
  const active = current === value

  const trigger = (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={`panel-${value}`}
      id={`tab-${value}`}
      disabled={disabled}
      onClick={() => onValueChange(value)}
      className={cn(
        'group/trigger relative flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        active
          ? 'bg-brand-primary/10 font-medium text-brand-primary-dark dark:text-brand-primary-light'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        className,
      )}
    >
      {children}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-brand-primary dark:bg-brand-primary-light"
        />
      )}
    </button>
  )

  if (!tooltip) return trigger
  return <Tooltip label={tooltip}>{trigger}</Tooltip>
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const { value: current } = useTabs()
  if (current !== value) return null
  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      className={cn('min-w-0', className)}
    >
      {children}
    </div>
  )
}

/**
 * Hover/focus tooltip built on CSS only (no portal, no library). Wrapping the
 * trigger keeps it keyboard reachable: focus-within reveals the same bubble.
 */
export function Tooltip({
  label,
  children,
  side = 'bottom',
  className,
}: {
  label: string
  children: React.ReactNode
  side?: 'top' | 'bottom'
  className?: string
}) {
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-max max-w-56 -translate-x-1/2 rounded-lg border border-border bg-popover px-2 py-1 text-[10px] font-normal leading-relaxed text-popover-foreground shadow-lg',
          'opacity-0 transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
          side === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
        )}
      >
        {label}
      </span>
    </span>
  )
}
