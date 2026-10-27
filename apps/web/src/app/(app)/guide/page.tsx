'use client'

import Link from 'next/link'
import { ArrowUpRight, Compass, Cpu, PlayCircle, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@sps/ui'
import { PageIntro } from '@/components/page-intro'
import { useI18n, type MessageKey } from '@/lib/i18n'

const PAGES = [
  { href: '/guide/start', icon: Compass, title: 'nav.guide_start', subtitle: 'guide.subtitle.short' },
  { href: '/guide/engine', icon: Cpu, title: 'nav.guide_engine', subtitle: 'guide.engine.subtitle' },
  { href: '/guide/demo', icon: PlayCircle, title: 'nav.guide_demo', subtitle: 'guide.demo.subtitle' },
  { href: '/guide/meta', icon: Sparkles, title: 'nav.guide_meta', subtitle: 'guide.meta.subtitle' },
] as const

export default function GuidePage() {
  const { t, locale } = useI18n()

  return (
    <>
      <PageIntro title={t('guide.title')} subtitle={t('guide.subtitle')} />

      <div className="grid gap-3 sm:grid-cols-2">
        {PAGES.map(({ href, icon: Icon, title, subtitle }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors group-hover:border-brand-primary/40 group-hover:bg-brand-primary/5">
              <CardContent className="flex h-full flex-col gap-2 py-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary dark:bg-brand-primary-dark/40 dark:text-brand-primary-light">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
                  {t(title)}
                  <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-60" />
                </span>
                <p className="text-[11px] leading-relaxed text-muted-foreground">{t(subtitle as MessageKey)}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-border bg-secondary/40 p-4 text-[11px] leading-relaxed text-muted-foreground">
        {locale === 'fr'
          ? 'Ce guide est aussi le support de démonstration : chaque page correspond à un moment du parcours de trois minutes (connexion 2FA, console, scénario, audit).'
          : 'This guide doubles as the demo script: each page maps to a moment of the three-minute walkthrough (2FA sign-in, console, scenario, audit).'}
      </div>
    </>
  )
}
