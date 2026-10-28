'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  BarChart3,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  Network,
  Newspaper,
  ScrollText,
  ShieldCheck,
  Cpu,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, Skeleton, cn } from '@sps/ui'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { api, authApi, knowledgeApi, type AuditEventDto, type KbDocumentDto, type KbStatusDto, type ProviderDto } from '@/lib/api'
import { actionCategory, AUDIT_ACTION_KEYS, humaniseAction } from '@/lib/audit-labels'

function relativeTime(value: string, locale: string): string {
  const delta = Date.now() - Date.parse(value)
  if (Number.isNaN(delta)) return value
  const minutes = Math.round(delta / 60000)
  const formatter = new Intl.RelativeTimeFormat(locale === 'fr' ? 'fr' : 'en', { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return formatter.format(-minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(-hours, 'hour')
  return formatter.format(-Math.round(hours / 24), 'day')
}

/** The last seven days, oldest first, with the number of audit records on each. */
function lastSevenDays(events: AuditEventDto[]): Array<{ key: string; day: Date; count: number }> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today)
    day.setDate(today.getDate() - (6 - index))
    return { key: day.toDateString(), day, count: 0 }
  })
  for (const event of events) {
    const at = new Date(event.ts)
    const slot = days.find((entry) => entry.key === at.toDateString())
    if (slot) slot.count += 1
  }
  return days
}

/** Loading placeholder for a KPI card: two shimmering lines. */
function KpiShimmer() {
  return (
    <div className="space-y-2 py-0.5" aria-hidden="true">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-2.5 w-20" />
    </div>
  )
}

function Bars({
  rows,
  tone = 'bg-brand-primary dark:bg-brand-primary-light',
}: {
  rows: Array<{ label: string; value: number; hint?: string }>
  tone?: string
}) {
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-2 text-[11px]">
          <span className="w-28 shrink-0 truncate text-muted-foreground" title={row.label}>
            {row.label}
          </span>
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary">
            <span className={cn('block h-full rounded-full', tone)} style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className="w-10 shrink-0 text-right font-mono text-foreground">{row.value}</span>
        </li>
      ))}
    </ul>
  )
}

export default function OverviewPage() {
  const { t, locale } = useI18n()
  const { operator } = useAuth()
  const { country, domain } = useWorkspace()
  const [status, setStatus] = React.useState<KbStatusDto | null>(null)
  const [documents, setDocuments] = React.useState<KbDocumentDto[] | null>(null)
  const [events, setEvents] = React.useState<AuditEventDto[]>([])
  const [chain, setChain] = React.useState<{ valid: boolean; brokenAt?: string } | null>(null)
  const [auditState, setAuditState] = React.useState<'loading' | 'ready' | 'unavailable'>('loading')
  const [provider, setProvider] = React.useState<ProviderDto | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void api
      .provider()
      .then((value) => !cancelled && setProvider(value))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void knowledgeApi
      .status()
      .then((next) => !cancelled && setStatus(next))
      .catch(() => {})
    void knowledgeApi
      .documents({ limit: 200 })
      .then((next) => !cancelled && setDocuments(next.documents))
      .catch(() => !cancelled && setDocuments([]))
    void authApi
      .auditEvents(100)
      .then((feed) => {
        if (cancelled) return
        setEvents(feed.events)
        setChain(feed.chain)
        setAuditState('ready')
      })
      .catch(() => {
        if (!cancelled) setAuditState('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const quick = [
    { href: '/readiness', icon: Gauge, title: t('overview.quick.readiness'), body: t('overview.quick.readinessBody') },
    { href: '/scenarios', icon: Network, title: t('overview.quick.scenario'), body: t('overview.quick.scenario.body') },
    { href: '/gazette', icon: Newspaper, title: t('overview.quick.gazette'), body: t('overview.quick.gazette.body') },
  ]

  const corpus = status?.totals
  const figures = (documents ?? []).reduce((sum, document) => sum + (document.images?.length ?? 0), 0)
  const days = lastSevenDays(events)
  const categories = Object.entries(
    events.reduce<Record<string, number>>((acc, event) => {
      const key = actionCategory(event.action)
      acc[key] = (acc[key] ?? 0) + 1
      return acc
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }))
  const docTypes = (status?.byDocType ?? []).slice(0, 6).map((entry) => ({ label: entry.value, value: entry.chunks }))
  const lastIngest = corpus?.lastIngestedAt
    ? new Date(corpus.lastIngestedAt).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' })
    : t('knowledge.never')

  return (
    <>
      <section className="flex min-w-0 flex-wrap items-end justify-between gap-4 pb-5 pt-2">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="mt-1 truncate font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t('overview.title')}
          </h2>
          <p className="mt-1 max-w-2xl truncate text-xs text-muted-foreground sm:text-sm">{t('overview.subtitle')}</p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-[9px] font-medium text-muted-foreground">{t('overview.kpi.corpus')}</p>
            {corpus ? (
              <>
                <p className="truncate font-display text-base font-bold text-foreground">
                  {corpus.documents.toLocaleString('en-US')} {t('knowledge.documents').toLowerCase()}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {`${corpus.activeChunks.toLocaleString('en-US')} ${t('knowledge.chunks').toLowerCase()} · ${figures} ${t('kbdoc.figures').toLowerCase()}`}
                </p>
              </>
            ) : (
              <KpiShimmer />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-[9px] font-medium text-muted-foreground">{t('overview.kpi.chain')}</p>
            {auditState === 'loading' ? (
              <KpiShimmer />
            ) : auditState === 'unavailable' ? (
              <p className="font-display text-base font-bold text-muted-foreground">{t('audit.unavailable')}</p>
            ) : (
              <>
                <p className="flex items-center gap-1.5 font-display text-base font-bold">
                  <ShieldCheck
                    className={chain?.valid ? 'h-4 w-4 text-brand-primary dark:text-brand-primary-light' : 'h-4 w-4 text-destructive'}
                  />
                  {chain?.valid ? t('overview.chainOk') : t('overview.chainBroken')}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {t('overview.kpi.records')}: {events.length}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-[9px] font-medium text-muted-foreground">{t('overview.kpi.mfa')}</p>
            {operator ? (
              <>
                <p className="flex items-center gap-1.5 font-display text-base font-bold">
                  <ShieldCheck
                    className={operator.mfaEnrolled ? 'h-4 w-4 text-brand-primary dark:text-brand-primary-light' : 'h-4 w-4 text-destructive'}
                  />
                  {operator.mfaEnrolled ? t('security.mfaOn') : t('security.mfaOff')}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">{operator.email}</p>
              </>
            ) : (
              <KpiShimmer />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-[9px] font-medium text-muted-foreground">{t('overview.kpi.model')}</p>
            {provider ? (
              <>
                <p className="flex items-center gap-1.5 truncate font-display text-base font-bold">
                  <Cpu className="h-4 w-4 shrink-0 text-brand-accent" />
                  <span className="truncate">{provider.models.reasoning || '—'}</span>
                </p>
                <p className="truncate text-[10px] text-muted-foreground">{provider.label}</p>
              </>
            ) : (
              <KpiShimmer />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <BarChart3 className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('overview.chart.activity')}</CardTitle>
            <span className="ml-auto text-[10px] text-muted-foreground">{t('overview.chart.activityHint')}</span>
          </CardHeader>
          <CardContent>
            {auditState === 'loading' ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="flex h-40 items-end gap-2">
                {days.map((entry) => {
                  const max = Math.max(1, ...days.map((item) => item.count))
                  return (
                    <div key={entry.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <span className="font-mono text-[10px] text-foreground">{entry.count}</span>
                      <span
                        className="w-full max-w-10 rounded-t-md bg-brand-primary/80 transition-all dark:bg-brand-primary-light/80"
                        style={{ height: `${Math.max(4, (entry.count / max) * 100)}%` }}
                        title={`${entry.count}`}
                      />
                      <span className="truncate text-[9px] text-muted-foreground">
                        {entry.day.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'short' })}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <FileCheck2 className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('overview.synthesis')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-[11px] leading-relaxed text-foreground/90">
            <p>{t('overview.synthesis.corpus', { documents: corpus?.documents ?? 0, chunks: corpus?.activeChunks ?? 0, figures })}</p>
            <p>
              {auditState === 'ready'
                ? t('overview.synthesis.audit', { records: events.length, status: chain?.valid ? t('overview.chainOk') : t('overview.chainBroken') })
                : t('audit.unavailable')}
            </p>
            <p className="text-muted-foreground">{t('overview.synthesis.last', { date: lastIngest })}</p>
            <p className="text-muted-foreground">{t('overview.synthesis.workspace', { country: country.toUpperCase(), domain: t(`domain.${domain}` as 'domain.health') })}</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <ScrollText className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('overview.recent')}</CardTitle>
            <Link
              href="/audit"
              className="ml-auto flex items-center gap-1 text-[10px] font-semibold text-brand-primary hover:underline dark:text-brand-primary-light"
            >
              {t('overview.open')} <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {auditState === 'loading' && (
              <div className="space-y-2 p-4" aria-label={t('audit.loading')}>
                {[0, 1, 2, 3].map((row) => (
                  <Skeleton key={row} className="h-7 w-full" />
                ))}
              </div>
            )}
            {auditState === 'unavailable' && <p className="px-4 py-8 text-xs text-muted-foreground">{t('audit.unavailable')}</p>}
            {auditState === 'ready' && events.length === 0 && (
              <p className="px-4 py-8 text-xs text-muted-foreground">{t('overview.recentEmpty')}</p>
            )}
            {events.length > 0 && (
              <ul className="divide-y divide-border/60">
                {events.slice(0, 8).map((event) => {
                  const key = AUDIT_ACTION_KEYS[event.action]
                  const label = key ? t(key as 'audit.action.chainReset') : humaniseAction(event.action)
                  return (
                    <li key={event.id} className="flex items-center gap-3 px-4 py-2.5 text-[11px]">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary dark:bg-brand-primary-light" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-foreground">{label}</span>
                        <span className="text-muted-foreground"> · {event.actor}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(event.ts, locale)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <Newspaper className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
              <CardTitle>{t('overview.chart.corpus')}</CardTitle>
            </CardHeader>
            <CardContent>
              {docTypes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">{t('knowledge.corpus.empty')}</p>
              ) : (
                <Bars rows={docTypes} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <BarChart3 className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
              <CardTitle>{t('overview.chart.actions')}</CardTitle>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? <p className="text-[11px] text-muted-foreground">{t('overview.recentEmpty')}</p> : <Bars rows={categories} tone="bg-brand-accent" />}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <LayoutDashboard className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('overview.quick')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {quick.map(({ href, icon: Icon, title, body }) => (
              <Link
                key={href}
                href={href}
                className="group flex items-start gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-brand-primary/5"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                    {title}
                    <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">{body}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <p className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground">
          <FileCheck2 className="mt-0.5 h-3 w-3 shrink-0" />
          {t('overview.auditHint')}
        </p>
      </div>
    </>
  )
}
