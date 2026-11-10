'use client'

import * as React from 'react'
import Link from 'next/link'
import { Bot } from 'lucide-react'
import { cn } from '@sps/ui'
import type { Domain } from '@sps/shared'
import { registryApi, type AgentSpecDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

/** The active agents of the chosen sectors, from the Agents & AI registry. */
export function useRegistryAgents(domains: Domain[]) {
  const [agents, setAgents] = React.useState<AgentSpecDto[] | null>(null)
  const key = domains.join(',')
  React.useEffect(() => {
    let cancelled = false
    registryApi
      .agentSpecs({ domains })
      .then((result) => !cancelled && setAgents(result.agents))
      .catch(() => !cancelled && setAgents([]))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return agents
}

/**
 * Which agents take part in a run. Nothing selected means every active agent
 * of the sector, the behaviour the engine had before the registry.
 */
export function AgentPicker({
  domains,
  value,
  onChange,
  disabled,
}: {
  domains: Domain[]
  value: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  const agents = useRegistryAgents(domains)
  if (!agents || agents.length === 0) return null
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((entry) => entry !== id) : [...value, id])
  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Bot className="h-3.5 w-3.5 text-brand-primary" />
        <p className="text-xs font-medium">{t('registry.picker.title')}</p>
        <span className="text-[11px] text-muted-foreground">
          {value.length === 0 ? t('registry.picker.all') : t('registry.picker.count', { count: value.length })}
        </span>
        <Link href="/agents" className="ml-auto text-[11px] text-brand-primary hover:underline">
          {t('registry.picker.manage')}
        </Link>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {agents.map((agent) => {
          const on = value.includes(agent.id)
          return (
            <button
              key={agent.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(agent.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-60',
                on ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-border text-muted-foreground hover:border-brand-primary/50',
              )}
            >
              <Bot className={cn('h-3 w-3', agent.color)} />
              {agent.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
