'use client'

import Link from 'next/link'
import { ArrowUpRight, Compass, Cpu, Settings2, ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@sps/ui'
import { GuideBanner, GuideHero } from '@/components/guide-shell'
import { PageIntro } from '@/components/page-intro'
import { useI18n, type MessageKey } from '@/lib/i18n'

const PAGES = [
  { href: '/guide/start', icon: Compass, title: 'nav.guide_start', subtitle: 'guide.subtitle.short' },
  { href: '/guide/engine', icon: Cpu, title: 'nav.guide_engine', subtitle: 'guide.engine.subtitle' },
  { href: '/guide/operations', icon: Settings2, title: 'nav.guide_operations', subtitle: 'guide.operations.subtitle' },
  { href: '/guide/meta', icon: ShieldCheck, title: 'nav.guide_meta', subtitle: 'guide.meta.subtitle' },
] as const

export default function GuidePage() {
  const { t, locale } = useI18n()
  const fr = locale === 'fr'

  return (
    <>
      <PageIntro title={t('guide.title')} subtitle={t('guide.subtitle')} />

      <GuideHero
        kicker={fr ? 'Manuel d’exploitation' : 'Operations handbook'}
        title={t('guide.title')}
        subtitle={
          fr
            ? 'Déroulés de prise de poste, fonctionnement du moteur, registre des écarts, incidents et exploitation des capacités Meta. Quatre pages, orientées exécution.'
            : 'Taking-over runbooks, how the engine behaves, the gap register, incidents and how Meta capabilities are operated. Four pages, execution-oriented.'
        }
        meta={[
          { label: fr ? 'Pages' : 'Pages', value: '4' },
          { label: fr ? 'Registre' : 'Register', value: fr ? 'Écarts' : 'Gaps' },
          { label: fr ? 'Preuve' : 'Evidence', value: fr ? 'Audit' : 'Audit' },
        ]}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

      <GuideBanner tone="gold" title={fr ? 'Comment lire ce guide' : 'How to read this guide'}>
        <p>
          {fr
            ? 'Chaque page répond à une question de gestion : qui fait quoi au démarrage, ce que le moteur garantit, comment un écart est traité, et comment les capacités Meta sont exploitées. Aucun scénario de démonstration : ce sont les procédures réelles.'
            : 'Each page answers a management question: who does what at start-up, what the engine guarantees, how a gap is handled, and how Meta capabilities are operated. No demo script: these are the actual procedures.'}
        </p>
      </GuideBanner>
    </>
  )
}
