'use client'

import { Gauge, Network, Waypoints } from 'lucide-react'
import { AnimatedTabsList, type TabItem } from '@sps/ui'
import type { WorkflowLens } from '@sps/shared'
import { useI18n } from '@/lib/i18n'

const LENSES: Array<{ id: WorkflowLens; icon: TabItem['icon'] }> = [
  { id: 'simulation', icon: Network },
  { id: 'readiness', icon: Gauge },
  { id: 'hybrid', icon: Waypoints },
]

export function LensSelector({ value, onChange }: { value: WorkflowLens; onChange: (lens: WorkflowLens) => void }) {
  const { t } = useI18n()
  const items: TabItem[] = LENSES.map(({ id, icon }) => ({
    id,
    icon,
    label: t(`lens.${id}.label` as 'lens.hybrid.label'),
    tooltip: t(`lens.${id}.description` as 'lens.hybrid.description'),
  }))
  return (
    <AnimatedTabsList
      items={items}
      value={value}
      onValueChange={(id) => onChange(id as WorkflowLens)}
      dense
      showLabels
      containerBreakpoint="@md"
      maxWidth="max-w-fit"
      className="shrink-0"
    />
  )
}
