"use client"

/**
 * Tab strip of the console, ported from the sarkiai-enterprise `AnimatedTabsList`:
 * icon + label per tab, a sliding indicator, scroll arrows when the strip
 * overflows, a rounded star border that pulses while saving, and a tooltip on
 * every tab whose label is collapsed (or always, with `showTooltips`).
 *
 * Controlled: the parent owns `value`. The triggers are plain buttons with the
 * tab semantics, so no Radix tabs package is needed.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { StarBorder } from './star-border'
import { TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from './tooltip'

export interface TabItem {
  id: string
  label: string
  icon: LucideIcon
  disabled?: boolean
  /** Short explanation shown on hover or focus. */
  tooltip?: string
}

export interface AnimatedTabsListProps {
  items: TabItem[]
  value: string
  onValueChange: (value: string) => void
  /** Pulses the border while the parent is saving or running. */
  isSaving?: boolean
  showLabels?: boolean
  showScrollButtons?: boolean
  fullWidth?: boolean
  maxWidth?: string
  className?: string
  /** Container breakpoint at which labels appear (`@xl`, `@lg`, ...). */
  containerBreakpoint?: '@xs' | '@sm' | '@md' | '@lg' | '@xl' | '@2xl'
  showTooltips?: boolean
  ariaLabel?: string
}

const LABEL_SHOW: Record<NonNullable<AnimatedTabsListProps['containerBreakpoint']>, string> = {
  '@xs': '@xs:inline',
  '@sm': '@sm:inline',
  '@md': '@md:inline',
  '@lg': '@lg:inline',
  '@xl': '@xl:inline',
  '@2xl': '@2xl:inline',
}

export function AnimatedTabsList({
  items,
  value,
  onValueChange,
  isSaving = false,
  showLabels = true,
  showScrollButtons = false,
  fullWidth = false,
  maxWidth = 'max-w-md',
  className,
  containerBreakpoint = '@xl',
  showTooltips,
  ariaLabel,
}: AnimatedTabsListProps) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = React.useState(false)
  const [showRightArrow, setShowRightArrow] = React.useState(false)
  const [labelsCollapsed, setLabelsCollapsed] = React.useState(true)
  const idPrefix = React.useId()

  const checkScroll = React.useCallback(() => {
    const node = listRef.current
    if (!node) return
    const { scrollLeft, scrollWidth, clientWidth } = node
    setShowLeftArrow(scrollLeft > 0)
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 5)
  }, [])

  React.useEffect(() => {
    const node = listRef.current
    if (!node) return
    const observer = new ResizeObserver(() => {
      checkScroll()
      const label = node.querySelector<HTMLElement>('[data-label]')
      setLabelsCollapsed(!label || label.offsetWidth === 0)
    })
    observer.observe(node)
    checkScroll()
    return () => observer.disconnect()
  }, [checkScroll])

  React.useEffect(() => {
    checkScroll()
  }, [items, checkScroll])

  // Keep the active tab in view when the value changes from elsewhere.
  React.useEffect(() => {
    const node = listRef.current
    if (!node) return
    const trigger = node.querySelector<HTMLElement>(`[data-tab="${value}"]`)
    trigger?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    const timer = window.setTimeout(checkScroll, 350)
    return () => window.clearTimeout(timer)
  }, [value, checkScroll])

  const scroll = (direction: 'left' | 'right') => {
    const node = listRef.current
    if (!node) return
    node.scrollBy({ left: direction === 'left' ? -node.clientWidth * 0.5 : node.clientWidth * 0.5, behavior: 'smooth' })
  }

  const tooltipOpen = showTooltips || labelsCollapsed ? undefined : false

  return (
    <div className={cn('@container relative flex items-center', fullWidth ? 'w-full' : maxWidth, className)}>
      <StarBorder as="div" speed="2s" thickness={2} isAnimate={isSaving} className="w-full rounded-3xl" color="var(--charte-primary)">
        <div className="relative flex w-full items-center overflow-hidden rounded-3xl border border-border bg-card/60 backdrop-blur-sm">
          {showScrollButtons && showLeftArrow && (
            <button
              type="button"
              aria-label="Scroll left"
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur-sm hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          )}

          <TooltipProvider delayDuration={0}>
            <div
              ref={listRef}
              role="tablist"
              aria-label={ariaLabel}
              onScroll={checkScroll}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              className="flex h-9 w-full items-center justify-start gap-1 overflow-x-auto overflow-y-hidden scroll-smooth rounded-3xl [&::-webkit-scrollbar]:hidden"
            >
              {items.map((tab) => {
                const active = value === tab.id
                const Icon = tab.icon
                const trigger = (
                  <button
                    type="button"
                    role="tab"
                    id={`${idPrefix}-${tab.id}`}
                    aria-selected={active}
                    data-tab={tab.id}
                    data-slot="tab-trigger"
                    disabled={tab.disabled}
                    onClick={() => onValueChange(tab.id)}
                    className={cn(
                      'relative flex shrink-0 flex-1 items-center justify-center whitespace-nowrap rounded-none px-3 py-3.5 text-[10px] tracking-widest transition-colors',
                      '@xl:px-6',
                      active
                        ? 'font-bold text-brand-primary-dark dark:text-brand-primary-light'
                        : 'text-muted-foreground hover:text-foreground',
                      tab.disabled && 'cursor-not-allowed opacity-40',
                    )}
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {showLabels && (
                        <span data-label className={LABEL_SHOW[containerBreakpoint]}>
                          {tab.label}
                        </span>
                      )}
                    </span>
                    {active && !isSaving && (
                      <motion.div
                        layoutId={`${idPrefix}-indicator`}
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                        className="absolute inset-x-0 -bottom-px z-10 h-[3px] rounded-full bg-brand-primary dark:bg-brand-primary-light"
                      />
                    )}
                  </button>
                )

                return (
                  <TooltipRoot key={tab.id} open={tooltipOpen}>
                    <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px] tracking-wide">
                      {tab.tooltip ?? tab.label}
                    </TooltipContent>
                  </TooltipRoot>
                )
              })}
            </div>
          </TooltipProvider>

          {showScrollButtons && showRightArrow && (
            <button
              type="button"
              aria-label="Scroll right"
              onClick={() => scroll('right')}
              className="absolute right-px top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-muted-foreground backdrop-blur-sm hover:text-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </StarBorder>
    </div>
  )
}
