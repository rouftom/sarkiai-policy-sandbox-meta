'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Compass, Cpu, Database, Gauge, Globe, Languages, LayoutDashboard, Menu, Newspaper, Network,
  Rocket, ScrollText, Settings, Settings2, ShieldCheck, Siren, SlidersHorizontal, Sparkles, X,
} from 'lucide-react'
import { cn, Select } from '@sps/ui'
import { BrandMark, BrandWordmark } from './brand-mark'
import { ThemeSwitcher } from './theme-switcher'
import { useI18n, type Locale, type MessageKey } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'

const TITLES: Array<{ href: string; labelKey: MessageKey }> = [
  { href: '/guide/start', labelKey: 'nav.guide_start' },
  { href: '/guide/engine', labelKey: 'nav.guide_engine' },
  { href: '/guide/operations', labelKey: 'nav.guide_operations' },
  { href: '/guide/meta', labelKey: 'nav.guide_meta' },
  { href: '/guide', labelKey: 'nav.guide' },
  { href: '/console', labelKey: 'nav.console' },
  { href: '/knowledge', labelKey: 'nav.knowledge' },
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
  { href: '/knowledge', labelKey: 'nav.knowledge', icon: Database },
  { href: '/readiness', labelKey: 'nav.readiness', icon: Gauge },
  { href: '/scenarios', labelKey: 'nav.scenarios', icon: Network },
  { href: '/gazette', labelKey: 'nav.gazette', icon: Newspaper },
  { href: '/exercise', labelKey: 'nav.exercise', icon: Siren },
  { href: '/communications', labelKey: 'nav.communication', icon: Languages },
  { href: '/audit', labelKey: 'nav.audit', icon: ScrollText },
  { href: '/guide', labelKey: 'nav.guide', icon: Compass },
  { href: '/guide/start', labelKey: 'nav.guide_start', icon: Rocket },
  { href: '/guide/engine', labelKey: 'nav.guide_engine', icon: Cpu },
  { href: '/guide/operations', labelKey: 'nav.guide_operations', icon: Settings2 },
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
  const { savePreferences } = useAuth()
  const [menuOpen, setMenuOpen] = React.useState(false)

  // The header is the place where the language is chosen: it is saved to the profile so it survives a reload and a new sign-in.
  const chooseLocale = (value: Locale) => {
    setLocale(value)
    void savePreferences({ locale: value }).catch(() => undefined)
  }

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
          <div className="flex items-center gap-1">
            <Globe className="h-3.5 w-3.5 shrink-0 text-brand-primary-dark dark:text-brand-primary-light" />
            <Select
              ariaLabel={t('app.language')}
              value={locale}
              onValueChange={(value) => chooseLocale(value as Locale)}
              options={[
                { value: 'en', label: 'EN' },
                { value: 'fr', label: 'FR' },
              ]}
              className="w-[74px]"
            />
          </div>

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
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar text-sidebar-foreground shadow-2xl">
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
                      ? 'bg-sidebar-accent font-medium text-sidebar-primary'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
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
