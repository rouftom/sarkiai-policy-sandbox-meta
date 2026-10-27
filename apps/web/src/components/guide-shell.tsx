'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Info } from 'lucide-react'
import { PageIntro } from '@/components/page-intro'
import { useI18n } from '@/lib/i18n'

const ORDER = [
  { href: '/guide/start', key: 'nav.guide_start' as const },
  { href: '/guide/engine', key: 'nav.guide_engine' as const },
  { href: '/guide/demo', key: 'nav.guide_demo' as const },
  { href: '/guide/meta', key: 'nav.guide_meta' as const },
]

export function GuideShell({
  title,
  subtitle,
  current,
  children,
}: {
  title: string
  subtitle: string
  current: string
  children: React.ReactNode
}) {
  const { t } = useI18n()
  const index = ORDER.findIndex((entry) => entry.href === current)
  const previous = index > 0 ? ORDER[index - 1] : null
  const next = index >= 0 && index < ORDER.length - 1 ? ORDER[index + 1] : null

  return (
    <>
      <PageIntro title={title} subtitle={subtitle} />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="hidden h-fit rounded-xl border border-border bg-card p-2 lg:block">
          <Link
            href="/guide"
            className="mb-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-3 w-3" /> {t('guide.back')}
          </Link>
          <ol className="space-y-0.5">
            {ORDER.map((entry, position) => (
              <li key={entry.href}>
                <Link
                  href={entry.href}
                  className={
                    entry.href === current
                      ? 'flex items-start gap-2 rounded-lg bg-brand-primary/10 px-2 py-1.5 text-[11px] font-medium text-brand-primary-dark dark:bg-brand-primary-dark/40 dark:text-brand-primary-light'
                      : 'flex items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary'
                  }
                >
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-current text-[8px]">
                    {position + 1}
                  </span>
                  {t(entry.key)}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <article className="min-w-0 rounded-xl border border-border bg-card p-5 sm:p-7">
          {children}
          <div className="mt-8 flex items-center justify-between border-t border-border pt-4 text-[11px]">
            {previous ? (
              <Link href={previous.href} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
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
        </article>
      </div>
    </>
  )
}

export function GuideNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="my-4 flex items-start gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-[11px] leading-relaxed text-brand-primary-dark dark:border-brand-primary-light/20 dark:text-brand-primary-light">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="font-display text-sm font-bold tracking-tight text-foreground">{title}</h3>
      <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

export function GuideSteps({ steps }: { steps: Array<{ title: string; body: string }> }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => (
        <li key={step.title} className="flex gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-primary/10 text-[10px] font-bold text-brand-primary-dark dark:bg-brand-primary-dark/40 dark:text-brand-primary-light">
            {index + 1}
          </span>
          <span>
            <span className="block text-xs font-semibold text-foreground">{step.title}</span>
            <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{step.body}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

export function GuideTable({ rows }: { rows: Array<{ a: string; b: string; c?: string }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-[11px]">
        <tbody>
          {rows.map((row) => (
            <tr key={row.a} className="border-b border-border/60 last:border-0">
              <td className="py-2 pr-4 font-medium text-foreground">{row.a}</td>
              <td className="py-2 pr-4 text-muted-foreground">{row.b}</td>
              {row.c !== undefined && <td className="py-2 font-mono text-[10px] text-muted-foreground">{row.c}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
