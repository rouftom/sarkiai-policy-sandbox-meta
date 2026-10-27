'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Compass, Cpu, Gauge, Globe, Languages, LayoutDashboard, Menu, Newspaper, Network, PlayCircle,
  Rocket, ScrollText, Settings, ShieldCheck, Siren, SlidersHorizontal, Sparkles, X,
} from 'lucide-react'
import { cn } from '@sps/ui'
import { BrandMark, BrandWordmark } from './brand-mark'
import { ThemeSwitcher } from './theme-switcher'
import { useI18n, type Locale, type MessageKey } from '@/lib/i18n'

const TITLES: Array<{ href: string; labelKey: MessageKey }> = [
  { href: '/guide/start', labelKey: 'nav.guide_start' },
  { href: '/guide/engine', labelKey: 'nav.guide_engine' },
  { href: '/guide/demo', labelKey: 'nav.guide_demo' },
  { href: '/guide/meta', labelKey: 'nav.guide_meta' },
  { href: '/guide', labelKey: 'nav.guide' },
  { href: '/console', labelKey: 'nav.console' },
  { href: '/readiness', labelKey: 'nav.readiness' },
  { href: '/scenarios', labelKey: 'nav.scenarios' },
  { href: '/gazette', labelKey: 'nav.gazette' },
  { href: '/exercise', labelKey: 'nav.exercise' },
  { href: '/communications', labelKey: 'nav.communication' },
  { href: '/audit', labelKey: 'nav.audit' },
  { href: '/preferences', labelKey: 'nav.preferences' },
  { href: '/security', labelKey: 'nav.security' },
  { href: '/', labelKey: 'overview.title' },
]

const MOBILE_NAV: Array<{ href: string; labelKey: MessageKey; icon: React.ComponentType<{ className?: string }> }> = [
  { href: '/', labelKey: 'nav.overview', icon: LayoutDashboard },
  { href: '/console', labelKey: 'nav.console', icon: SlidersHorizontal },
  { href: '/readiness', labelKey: 'nav.readiness', icon: Gauge },
  { href: '/scenarios', labelKey: 'nav.scenarios', icon: Network },
  { href: '/gazette', labelKey: 'nav.gazette', icon: Newspaper },
  { href: '/exercise', labelKey: 'nav.exercise', icon: Siren },
  { href: '/communications', labelKey: 'nav.communication', icon: Languages },
  { href: '/audit', labelKey: 'nav.audit', icon: ScrollText },
  { href: '/guide', labelKey: 'nav.guide', icon: Compass },
  { href: '/guide/start', labelKey: 'nav.guide_start', icon: Rocket },
  { href: '/guide/engine', labelKey: 'nav.guide_engine', icon: Cpu },
  { href: '/guide/demo', labelKey: 'nav.guide_demo', icon: PlayCircle },
  { href: '/guide/meta', labelKey: 'nav.guide_meta', icon: Sparkles },
  { href: '/preferences', labelKey: 'nav.settings', icon: Settings },
  { href: '/security', labelKey: 'nav.security', icon: ShieldCheck },
]

/**
 * App bar copied from the FSM console: same height, translucent surface, title
 * scale, globe language selector and theme control.
 */
export function AppHeader() {
  const pathname = usePathname()
  const { t, locale, setLocale } = useI18n()
  const [menuOpen, setMenuOpen] = React.useState(false)

  const titleKey = TITLES.find((entry) => entry.href === pathname)?.labelKey ?? 'app.name'
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur-md sm:px-6 md:border-0">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary md:hidden"
          aria-label={t('header.openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>

        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground sm:text-base">
          {t(titleKey)}
        </h1>

        <div className="flex items-center gap-2 sm:gap-3">
          <label className="relative flex items-center">
            <Globe className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-brand-primary-dark dark:text-brand-primary-light" />
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
              aria-label={t('app.language')}
              className="h-7 cursor-pointer appearance-none rounded-3xl border-none bg-brand-primary/10 py-0 pl-7 pr-2 text-[10px] font-semibold uppercase tracking-wide text-brand-primary-dark outline-none transition-colors hover:bg-brand-primary/20 dark:bg-brand-primary-dark/30 dark:text-brand-primary-light dark:hover:bg-brand-primary-dark/50"
            >
              <option value="en">EN</option>
              <option value="fr">FR</option>
            </select>
          </label>

          <ThemeSwitcher />
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label={t('nav.collapse')}
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white shadow-2xl dark:bg-brand-ink">
            <div className="flex h-14 items-center justify-between border-b border-border px-3">
              <Link href="/" onClick={() => setMenuOpen(false)} className="flex items-center gap-2">
                <BrandMark className="h-9 w-9" />
                <BrandWordmark short={t('app.shortName')} />
              </Link>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
                aria-label={t('nav.collapse')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 space-y-1 px-2 py-4">
              {MOBILE_NAV.map(({ href, labelKey, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex h-9 items-center rounded-lg px-3 text-xs transition-colors',
                    isActive(href)
                      ? 'bg-brand-primary/10 font-medium text-brand-primary-dark dark:bg-brand-primary-dark/40 dark:text-brand-primary-light'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-brand-primary-dark/20',
                  )}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {t(labelKey)}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}
    </>
  )
}
