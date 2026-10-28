'use client'

import React, { useState } from 'react'
import { DropdownMenuItem } from '@sps/ui'
import { cn } from '@sps/ui'
import { Loader } from 'lucide-react'

interface TableActionItemProps extends Omit<React.ComponentPropsWithoutRef<typeof DropdownMenuItem>, 'icon' | 'variant'> {
  variant?: 'default' | 'danger' | 'success'
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>
  children: React.ReactNode
  /** Shows a spinner and disables the item while the action runs. */
  loading?: boolean
}

export const TableActionItem = React.forwardRef<
  HTMLDivElement,
  TableActionItemProps
>(({ className, variant = 'default', icon: Icon, children, loading = false, disabled, onClick, ...props }, ref) => {
  const [pending, setPending] = useState(false)
  const isLoading = loading || pending

  // Self-guard: promise-returning handlers get a loader + double-click lock.
  const handleSelect = (event: Event) => {
    if (isLoading || disabled) {
      event.preventDefault()
      return
    }
    const result = (onClick as unknown as ((e: Event) => unknown) | undefined)?.(event)
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setPending(true)
      void Promise.resolve(result as Promise<unknown>).finally(() => setPending(false))
    }
  }

  const renderIcon = () => {
    if (isLoading) {
      return <Loader className="h-4 w-4 animate-spin text-brand-primary" />
    }
    if (!Icon) return null
    if (React.isValidElement(Icon)) {
      return Icon
    }
    const IconComponent = Icon as React.ComponentType<{ className?: string }>
    return <IconComponent className="h-4 w-4 text-slate-500 transition-colors group-hover:text-current group-focus:text-current" />
  }

  return (
    <DropdownMenuItem
      ref={ref}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      onSelect={handleSelect}
      className={cn(
        "group rounded-lg text-xs font-normal gap-2 cursor-pointer transition-colors text-slate-700 dark:text-slate-300",
        variant === 'danger'
          ? "hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:text-red-600 dark:focus:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20"
          : variant === 'success'
            ? "hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 focus:text-emerald-600 dark:focus:text-emerald-400 focus:bg-emerald-50 dark:focus:bg-emerald-900/20"
            : "hover:text-brand-primary dark:hover:text-brand-teal hover:bg-brand-primary/10 dark:hover:bg-brand-primary-dark/20 focus:text-brand-primary dark:focus:text-brand-teal focus:bg-brand-primary/10 dark:focus:bg-brand-primary-dark/20",
        className
      )}
      {...props}
    >
      {renderIcon()}
      {children}
    </DropdownMenuItem>
  )
})

TableActionItem.displayName = 'TableActionItem'
