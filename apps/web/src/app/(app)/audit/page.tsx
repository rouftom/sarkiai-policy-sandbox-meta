'use client'

import * as React from 'react'
import { AlertTriangle, Loader, RefreshCw, ScrollText, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input } from '@sps/ui'
import { authApi, type AuditEventDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'

const PAGE_SIZE = 100

function formatTime(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

export default function AuditPage() {
  const { t, locale } = useI18n()
  const [events, setEvents] = React.useState<AuditEventDto[]>([])
  const [chain, setChain] = React.useState<{ valid: boolean; brokenAt?: string } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [unreachable, setUnreachable] = React.useState(false)
  const [query, setQuery] = React.useState('')

  const load = React.useCallback(async () => {
    setLoading(true)
    setUnreachable(false)
    try {
      const response = await authApi.auditEvents(PAGE_SIZE)
      setEvents(response.events)
      setChain(response.chain)
    } catch {
      setUnreachable(true)
      setEvents([])
      setChain(null)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return events
    return events.filter((event) =>
      [event.actor, event.action, event.target ?? ''].some((value) => value.toLowerCase().includes(needle)),
    )
  }, [events, query])

  return (
    <>
      <PageIntro title={t('audit.title')} subtitle={t('audit.pageSubtitle')} />

      <Card>
        <CardHeader className="flex-wrap gap-2">
          <ScrollText className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
          <CardTitle>{t('audit.title')}</CardTitle>
          {chain && (
            <Badge tone={chain.valid ? 'success' : 'danger'} className="ml-2">
              {chain.valid ? (
                <ShieldCheck className="h-3 w-3" />
              ) : (
                <AlertTriangle className="h-3 w-3" />
              )}
              {chain.valid ? t('audit.chainOk') : t('audit.chainBroken', { at: chain.brokenAt ?? '—' })}
            </Badge>
          )}
          <span className="text-[10px] text-muted-foreground">{t('audit.count', { count: filtered.length })}</span>
          <div className="ml-auto flex items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('audit.filter')}
              className="h-8 w-48 text-[11px] sm:w-64"
            />
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t('audit.refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && events.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-8 text-xs text-muted-foreground">
              <Loader className="h-4 w-4 animate-spin" />
              {t('audit.loading')}
            </div>
          )}

          {unreachable && (
            <div className="flex items-center gap-2 px-4 py-8 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t('audit.unavailable')}
            </div>
          )}

          {!loading && !unreachable && filtered.length === 0 && (
            <p className="px-4 py-8 text-xs text-muted-foreground">{t('audit.empty')}</p>
          )}

          {filtered.length > 0 && (
            <div className="custom-scrollbar overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[11px]">
                <thead>
                  <tr className="border-b border-border text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-4 py-2 font-semibold">{t('audit.time')}</th>
                    <th className="px-4 py-2 font-semibold">{t('audit.actor')}</th>
                    <th className="px-4 py-2 font-semibold">{t('audit.action')}</th>
                    <th className="px-4 py-2 font-semibold">{t('audit.target')}</th>
                    <th className="px-4 py-2 font-semibold">{t('audit.hash')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((event) => (
                    <tr key={event.id} className="border-b border-border/60 last:border-0 hover:bg-secondary/40">
                      <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">{formatTime(event.ts, locale)}</td>
                      <td className="max-w-[180px] truncate px-4 py-2 font-medium">{event.actor}</td>
                      <td className="px-4 py-2">
                        <span className="rounded bg-brand-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-primary-dark dark:text-brand-primary-light">
                          {event.action}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-2 text-muted-foreground">{event.target ?? '—'}</td>
                      <td className="px-4 py-2 font-mono text-[10px] text-muted-foreground">{event.hash.slice(0, 12)}…</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
