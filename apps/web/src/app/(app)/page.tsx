'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  FileCheck2,
  Gauge,
  Languages,
  LayoutDashboard,
  Loader,
  Network,
  Newspaper,
  ScrollText,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Waypoints,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@sps/ui'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { authApi, knowledgeApi, type AuditEventDto } from '@/lib/api'

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

export default function OverviewPage() {
  const { t, locale } = useI18n()
  const { operator } = useAuth()
  const { country, domain } = useWorkspace()
  const [corpus, setCorpus] = React.useState<{ documents: number; chunks: number } | null>(null)
  const [events, setEvents] = React.useState<AuditEventDto[]>([])
  const [chain, setChain] = React.useState<{ valid: boolean; brokenAt?: string } | null>(null)
  const [auditState, setAuditState] = React.useState<'loading' | 'ready' | 'unavailable'>('loading')

  React.useEffect(() => {
    let cancelled = false
    void knowledgeApi
      .status()
      .then((status) => {
        if (!cancelled) setCorpus({ documents: status.totals.documents, chunks: status.totals.activeChunks })
      })
      .catch(() => {})
    void authApi
      .auditEvents(8)
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

  const modules = [
    { href: '/console', icon: SlidersHorizontal, title: t('nav.console'), body: t('app.tagline') },
    { href: '/readiness', icon: Gauge, title: t('nav.readiness'), body: t('readiness.pageSubtitle') },
    { href: '/scenarios', icon: Network, title: t('nav.scenarios'), body: t('scenarios.pageSubtitle') },
    { href: '/gazette', icon: Newspaper, title: t('nav.gazette'), body: t('gazette.pageSubtitle') },
    { href: '/exercise', icon: Siren, title: t('nav.exercise'), body: t('exercise.pageSubtitle') },
    { href: '/communications', icon: Languages, title: t('nav.communication'), body: t('communication.pageSubtitle') },
    { href: '/audit', icon: ScrollText, title: t('nav.audit'), body: t('audit.pageSubtitle') },
  ]

  const quick = [
    { href: '/readiness', icon: Gauge, title: t('overview.quick.readiness'), body: t('overview.quick.readinessBody') },
    { href: '/scenarios', icon: Network, title: t('overview.quick.scenario'), body: t('overview.quick.scenario.body') },
    { href: '/gazette', icon: Newspaper, title: t('overview.quick.gazette'), body: t('overview.quick.gazette.body') },
  ]

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-2">
        <div>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t('overview.title')}
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">{t('overview.subtitle')}</p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-[9px] font-medium text-muted-foreground">
              {t('overview.kpi.corpus')}
            </p>
            <p className="truncate font-display text-base font-bold text-foreground">
              {corpus ? corpus.documents.toLocaleString('en-US') : '—'} {t('knowledge.documents').toLowerCase()}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {corpus ? `${corpus.chunks.toLocaleString('en-US')} ${t('knowledge.chunks').toLowerCase()}` : '…'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-[9px] font-medium text-muted-foreground">
              {t('overview.kpi.chain')}
            </p>
            <p className="flex items-center gap-1.5 font-display text-base font-bold">
              {auditState === 'loading' ? (
                <Loader className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : auditState === 'unavailable' ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <>
                  <ShieldCheck
                    className={chain?.valid ? 'h-4 w-4 text-brand-primary dark:text-brand-primary-light' : 'h-4 w-4 text-destructive'}
                  />
                  {chain?.valid ? t('overview.chainOk') : t('overview.chainBroken')}
                </>
              )}
            </p>
            <p className="text-[10px] text-muted-foreground">{t('overview.kpi.records')}: {events.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-[9px] font-medium text-muted-foreground">
              {t('overview.kpi.mfa')}
            </p>
            <p className="flex items-center gap-1.5 font-display text-base font-bold">
              <ShieldCheck
                className={operator?.mfaEnrolled ? 'h-4 w-4 text-brand-primary dark:text-brand-primary-light' : 'h-4 w-4 text-destructive'}
              />
              {operator?.mfaEnrolled ? t('security.mfaOn') : t('security.mfaOff')}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">{operator?.email}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1 py-4">
            <p className="text-[9px] font-medium text-muted-foreground">
              {t('overview.kpi.workspace')}
            </p>
            <p className="flex items-center gap-1.5 font-display text-base font-bold">
              <Waypoints className="h-4 w-4 text-brand-accent" />
              {country.toUpperCase()} · {t(`domain.${domain}` as 'domain.health')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
              <div className="flex items-center gap-2 px-4 py-8 text-xs text-muted-foreground">
                <Loader className="h-4 w-4 animate-spin" /> {t('audit.loading')}
              </div>
            )}
            {auditState === 'unavailable' && (
              <p className="px-4 py-8 text-xs text-muted-foreground">{t('audit.unavailable')}</p>
            )}
            {auditState === 'ready' && events.length === 0 && (
              <p className="px-4 py-8 text-xs text-muted-foreground">{t('overview.recentEmpty')}</p>
            )}
            {events.length > 0 && (
              <ul className="divide-y divide-border/60">
                {events.map((event) => (
                  <li key={event.id} className="flex items-center gap-3 px-4 py-2.5 text-[11px]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary dark:bg-brand-primary-light" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium text-foreground">{event.action}</span>
                      <span className="text-muted-foreground"> · {event.actor}</span>
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(event.ts, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <LayoutDashboard className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('overview.quick')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
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
            <p className="flex items-start gap-1.5 border-t border-border pt-2 text-[10px] text-muted-foreground">
              <FileCheck2 className="mt-0.5 h-3 w-3 shrink-0" />
              {t('overview.auditHint')}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-foreground">{t('overview.modules')}</h3>
          <span className="text-[10px] text-muted-foreground">{t('overview.modules.count', { count: modules.length })}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(({ href, icon: Icon, title, body }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl bg-card p-3 transition-colors hover:bg-brand-primary/5"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary dark:bg-brand-primary-dark/40 dark:text-brand-primary-light">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-semibold text-foreground">{title}</span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{body}</p>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
