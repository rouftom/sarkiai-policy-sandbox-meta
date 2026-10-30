'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  Cpu,
  Info,
  Layers,
  ListChecks,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@sps/ui'
import { PageIntro } from '@/components/page-intro'
import { useI18n, type MessageKey } from '@/lib/i18n'

export const GUIDE_ORDER = [
  { href: '/guide/start', key: 'nav.guide_start' as const, icon: Compass, iconClassName: 'h-4 w-4' },
  { href: '/guide/engine', key: 'nav.guide_engine' as const, icon: Cpu, iconClassName: 'h-4 w-4' },
  { href: '/guide/operations', key: 'nav.guide_operations' as const, icon: Settings2, iconClassName: 'h-4 w-4' },
  { href: '/guide/meta', key: 'nav.guide_meta' as const, icon: Layers, iconClassName: 'h-4 w-4' },
]

/**
 * Guide shell, styled after the FSM console documentation: a brand hero banner,
 * a sticky section rail, tonal callouts, and real table headers. The guide is an
 * operations handbook · runbooks, flags, gaps and ownership · not a pitch deck.
 */
export function GuideShell({
  title,
  subtitle,
  current,
  kicker,
  meta,
  children,
}: {
  title: string
  subtitle: string
  current: string
  kicker?: string
  meta?: Array<{ label: string; value: string }>
  children: React.ReactNode
}) {
  const { t } = useI18n()
  const index = GUIDE_ORDER.findIndex((entry) => entry.href === current)
  const previous = index > 0 ? GUIDE_ORDER[index - 1] : null
  const next = index >= 0 && index < GUIDE_ORDER.length - 1 ? GUIDE_ORDER[index + 1] : null

  return (
    <>
      <PageIntro title={title} subtitle={subtitle} />

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="hidden h-fit rounded-xl border border-border bg-card p-2 lg:block">
          <Link
            href="/guide"
            className="mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-3 w-3" /> {t('guide.back')}
          </Link>
          <ol className="space-y-0.5">
            {GUIDE_ORDER.map((entry, position) => {
              const Icon = entry.icon
              return (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    className={cn(
                      'flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] transition-colors',
                      entry.href === current
                        ? 'bg-brand-primary/10 font-medium text-brand-primary-dark dark:bg-brand-primary-dark/40 dark:text-brand-primary-light'
                        : 'text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-current text-[8px]">
                      {position + 1}
                    </span>
                    <Icon className={cn('mt-0.5 shrink-0', entry.iconClassName)} aria-hidden="true" />
                    <span className="min-w-0">{t(entry.key)}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        </nav>

        <article className="min-w-0 space-y-4">
          <GuideHero kicker={kicker} title={title} subtitle={subtitle} meta={meta} />
          <div className="rounded-xl border border-border bg-card p-5 sm:p-7">
            {children}
            <div className="mt-8 flex items-center justify-between border-t border-border pt-4 text-[11px]">
              {previous ? (
                <Link
                  href={previous.href}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> {t(previous.key)}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  href={next.href}
                  className="flex items-center gap-1.5 font-semibold text-brand-primary hover:underline dark:text-brand-primary-light"
                >
                  {t(next.key)} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
        </article>
      </div>
    </>
  )
}

/** Brand banner at the top of every guide page (FSM `HeroBanner` geometry). */
export function GuideHero({
  kicker,
  title,
  subtitle,
  meta,
}: {
  kicker?: string
  title: string
  subtitle: string
  meta?: Array<{ label: string; value: string }>
}) {
  return (
    <section className="brand-glow relative overflow-hidden rounded-2xl border border-brand-primary/20 bg-gradient-to-br from-brand-primary/15 via-card to-brand-accent/10 px-5 py-5 dark:border-brand-primary-dark/40 dark:from-brand-primary-dark/40 dark:via-card dark:to-brand-ink">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-xl">
          <p className="text-[9px] font-medium text-brand-primary-dark dark:text-brand-primary-light">
            {kicker ?? 'SarkiAI Policy Sandbox · Operations handbook'}
          </p>
          <h2 className="mt-1 font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h2>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">{subtitle}</p>
        </div>
        {meta && meta.length > 0 && (
          <dl className="flex flex-wrap gap-2">
            {meta.map((entry) => (
              <div
                key={entry.label}
                className="min-w-[104px] rounded-xl border border-brand-primary/15 bg-background/60 px-2.5 py-1.5 backdrop-blur-sm dark:border-brand-primary-dark/30 dark:bg-brand-ink/40"
              >
                <dt className="text-[8px] font-medium text-muted-foreground">
                  {entry.label}
                </dt>
                <dd className="mt-0.5 truncate text-[11px] font-semibold text-foreground">{entry.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  )
}

type BannerTone = 'info' | 'warning' | 'success' | 'gold'

const BANNER_TONES: Record<BannerTone, { wrapper: string; icon: string; Icon: React.ComponentType<{ className?: string }> }> = {
  info: {
    wrapper:
      'border-brand-primary/20 bg-brand-primary/5 dark:border-brand-primary-light/20 dark:bg-brand-primary-dark/20',
    icon: 'text-brand-primary-dark dark:text-brand-primary-light',
    Icon: Info,
  },
  warning: {
    wrapper: 'border-amber-500/30 bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  success: {
    wrapper: 'border-emerald-500/30 bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  gold: {
    wrapper: 'border-brand-accent/40 bg-brand-accent/10',
    icon: 'text-brand-accent',
    Icon: ShieldCheck,
  },
}

/** Tonal callout: one short claim, an icon and, optionally, a small action row. */
export function GuideBanner({
  tone = 'info',
  title,
  children,
  footer,
}: {
  tone?: BannerTone
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const { wrapper, icon, Icon } = BANNER_TONES[tone]
  return (
    <div className={cn('my-4 rounded-xl border px-3.5 py-3', wrapper)}>
      <p className={cn('flex items-center gap-1.5 text-[11px] font-semibold', icon)}>
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {title}
      </p>
      <div className="mt-1 space-y-1 text-[11px] leading-relaxed text-muted-foreground">{children}</div>
      {footer && <div className="mt-2 flex flex-wrap items-center gap-1.5">{footer}</div>}
    </div>
  )
}

/** Kept for the older call sites: a default info banner. */
export function GuideNote({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <GuideBanner tone="info" title={t('guide.note')}>
      <p>{children}</p>
    </GuideBanner>
  )
}

export function GuideSection({
  title,
  icon: Icon = ListChecks,
  iconClassName,
  children,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  iconClassName?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="flex items-center gap-1.5 font-display text-sm font-bold tracking-tight text-foreground">
        <Icon className={cn('h-3.5 w-3.5 text-brand-primary dark:text-brand-primary-light', iconClassName)} aria-hidden="true" />
        {title}
      </h3>
      <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export function GuideSteps({ steps }: { steps: Array<{ title: string; body: string; owner?: string }> }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-primary/10 text-[10px] font-bold text-brand-primary-dark dark:bg-brand-primary-dark/40 dark:text-brand-primary-light">
            {index + 1}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-foreground">{step.title}</span>
              {step.owner && <Badge tone="brand">{step.owner}</Badge>}
            </span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{step.body}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export interface GuideTableRow {
  a: string
  b: string
  c?: string
}

export function GuideTable({
  headers,
  rows,
  className,
}: {
  headers: [string, string] | [string, string, string]
  rows: GuideTableRow[]
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-xl border border-border', className)}>
      <Table className="min-w-[520px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {headers.map((header, index) => (
              <TableHead key={index}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={`${row.a}-${row.b}`}>
              <TableCell className="whitespace-nowrap font-medium text-foreground">{row.a}</TableCell>
              <TableCell className="text-muted-foreground">{row.b}</TableCell>
              {headers.length === 3 && (
                <TableCell className="font-mono text-[10px] text-muted-foreground">{row.c ?? 'n/a'}</TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** Tick list used by the runbooks: what to check, and what failure looks like. */
export type GuideChecklistState = 'ok' | 'watch' | 'gap'

export function GuideChecklist({
  items,
}: {
  items: Array<{ label: string; detail?: string; state?: GuideChecklistState }>
}) {
  const tone: Record<GuideChecklistState, string> = {
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    watch: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    gap: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  }

  return (
    <ul className="grid gap-1.5">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            'flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]',
            item.state ? tone[item.state] : 'border-border',
          )}
        >
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            <span className="font-medium">{item.label}</span>
            {item.detail && <span className="mt-0.5 block leading-relaxed opacity-80">{item.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

export type { MessageKey }
