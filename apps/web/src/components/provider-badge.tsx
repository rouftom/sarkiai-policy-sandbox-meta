'use client'

/**
 * Shows what is actually answering: provider mode, model, and where the
 * inference happens. This is the honest answer to "is my data leaving?", the
 * `sovereign` and `local` modes run on-premise, `cloud` calls the Meta Model API.
 */

import * as React from 'react'
import { AlertTriangle, Cloud, Cpu, Lock, Server } from 'lucide-react'
import { cn } from '@sps/ui'
import { api, type ProviderDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const ICONS = {
  cloud: Cloud,
  sovereign: Server,
  local: Cpu,
} as const

export function ProviderBadge({ className }: { className?: string }) {
  const { t } = useI18n()
  const [provider, setProvider] = React.useState<ProviderDto | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    let active = true
    api
      .provider()
      .then((value) => active && setProvider(value))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [])

  if (failed || !provider) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl border border-border px-2 py-1 text-[11px] text-muted-foreground',
          className,
        )}
        title={failed ? 'API unreachable' : 'Loading provider…'}
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {failed ? 'API offline' : '…'}
      </span>
    )
  }

  const Icon = ICONS[provider.mode]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xl border px-2 py-1 text-[11px]',
        provider.ready
          ? 'border-primary/40 bg-primary/5 text-foreground'
          : 'border-amber-500/50 bg-amber-500/10 text-foreground',
        className,
      )}
      title={[
        `${t('provider.title')}: ${provider.label}`,
        `${provider.servedBy} · ${provider.baseURL}`,
        t(`provider.residency.${provider.residency}` as 'provider.residency.cloud'),
        provider.openWeights ? t('provider.openWeights') : '',
        provider.budgetUsd ? `${t('provider.budget')}: $${provider.budgetUsd.toFixed(2)}` : '',
        provider.ready ? '' : `${t('provider.notReady')}, ${provider.reason ?? ''} ${t('provider.switchHint')}`,
      ]
        .filter(Boolean)
        .join('\n')}
    >
      <Icon className="h-3.5 w-3.5 text-primary" />
      <span className="font-semibold">{t(`provider.mode.${provider.mode}` as 'provider.mode.cloud')}</span>
      <span className="text-muted-foreground">·</span>
      <code className="text-[10px] text-muted-foreground">{provider.models.reasoning}</code>
      {provider.residency === 'on-premise' && <Lock className="h-3 w-3 text-emerald-500" />}
      {!provider.ready && <AlertTriangle className="h-3 w-3 text-amber-500" />}
    </span>
  )
}
