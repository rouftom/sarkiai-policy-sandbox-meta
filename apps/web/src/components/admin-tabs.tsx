'use client'

import * as React from 'react'
import { TabsList, TabsTrigger } from '@sps/ui'

export interface AdminTab {
  value: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  /** Short explanation shown on hover/focus, as in the FSM console tabs. */
  tooltip: string
}

/**
 * Segmented tab strip for the console. Each trigger carries a tooltip: a tab
 * name alone ("Gazette", "Exercise") doesn't say why the operator would open it.
 */
export function AdminTabs({
  tabs,
  ariaLabel,
  className,
}: {
  tabs: AdminTab[]
  ariaLabel?: string
  className?: string
}) {
  return (
    <TabsList ariaLabel={ariaLabel} className={className}>
      {tabs.map(({ value, label, icon: Icon, tooltip }) => (
        <TabsTrigger key={value} value={value} tooltip={tooltip}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
