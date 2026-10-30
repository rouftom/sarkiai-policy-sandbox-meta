'use client'

import * as React from 'react'
import { ShieldCheck, ShieldAlert, ListTree } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, cn } from '@sps/ui'
import { api, type CoTTraceDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

export function AuditPanel({ runId }: { runId: string }) {
  const { t } = useI18n()
  const [trace, setTrace] = React.useState<CoTTraceDto[]>([])
  const [integrity, setIntegrity] = React.useState<{ valid: boolean; brokenAt?: string } | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([api.auditTrace(runId), api.auditChain()])
      .then(([t, chain]) => {
        if (!active) return
        setTrace(t.trace)
        setIntegrity(chain)
      })
      .catch(() => {
        if (active) setTrace([])
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [runId])

  const byAgent = React.useMemo(() => {
    const map = new Map<string, CoTTraceDto[]>()
    for (const step of trace) {
      const list = map.get(step.agentId) ?? []
      list.push(step)
      map.set(step.agentId, list)
    }
    return [...map.entries()]
  }, [trace])

  return (
    <Card>
      <CardHeader>
        <ListTree className="h-4 w-4 shrink-0 text-primary" />
        <CardTitle className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="shrink-0">{t('audit.title')}</span>
          <span className="min-w-0 truncate font-mono text-[10px] font-normal text-muted-foreground" title={runId}>
            {runId}
          </span>
        </CardTitle>
        {integrity && (
          <span
            className={cn(
              'ml-auto inline-flex min-w-0 items-center gap-1 text-[10px] font-semibold',
              integrity.valid ? 'text-primary' : 'text-destructive',
            )}
          >
            {integrity.valid ? <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> : <ShieldAlert className="h-3.5 w-3.5 shrink-0" />}
            <span className="min-w-0 truncate">
              {integrity.valid ? t('audit.integrityOk') : t('audit.chainBroken', { at: integrity.brokenAt ?? '' })}
            </span>
          </span>
        )}
      </CardHeader>
      <CardContent>
        {loading && <p className="text-xs text-muted-foreground">{t('audit.loading')}</p>}
        {!loading && trace.length === 0 && <p className="text-xs text-muted-foreground">{t('audit.empty')}</p>}

        <div className="space-y-2">
          {byAgent.map(([agentId, steps]) => (
            <div key={agentId} className="rounded-xl border border-border p-2">
              <p className="text-[10px] font-semibold text-muted-foreground">{agentId}</p>
              <ul className="mt-1 space-y-1 text-xs">
                {steps.map((step) => (
                  <li key={step.id} className="flex gap-2">
                    <span className="shrink-0 text-muted-foreground">#{step.step}</span>
                    <span className="min-w-0">{step.thought.slice(0, 400)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
