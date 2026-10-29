'use client'

/**
 * The funnel filter of a list: a round button that opens a panel of options, with
 * reset, cancel and apply. The options are a draft until they are applied.
 */

import * as React from 'react'
import { Filter } from 'lucide-react'
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@sps/ui'
import { useI18n } from '@/lib/i18n'
import { ICON_BUTTON_OUTLINE } from '@/components/icon-button-styles'

export function FilterPopover({
  label,
  active,
  open,
  onOpenChange,
  onOpen,
  onApply,
  onReset,
  children,
}: {
  label: string
  active: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The panel opens: the draft starts from the applied options. */
  onOpen: () => void
  onApply: () => void
  onReset: () => void
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen()
        onOpenChange(next)
      }}
    >
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={label}
                className={cn(
                  ICON_BUTTON_OUTLINE,
                  active && '!border-brand-primary !bg-brand-primary !text-white hover:!bg-brand-primary/90',
                )}
              >
                <Filter className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-4">{children}</div>
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={onReset} className="rounded-lg">
            {t('readiness.filter.reset')}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="rounded-lg">
              {t('readiness.history.cancel')}
            </Button>
            <Button size="sm" onClick={onApply} className="rounded-lg">
              {t('readiness.filter.apply')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
