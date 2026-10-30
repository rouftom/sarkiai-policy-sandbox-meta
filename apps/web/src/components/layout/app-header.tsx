'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Compass, Cpu, Database, Gauge, Globe, LayoutDashboard, Megaphone, Menu, Newspaper, Network,
  Layers, Rocket, ScrollText, Settings, Settings2, ShieldCheck, Siren, SlidersHorizontal, X,
} from 'lucide-react'
import { cn, Select } from '@sps/ui'
import { BrandMark, BrandWordmark } from './brand-mark'
import { OperatorMenu } from './operator-menu'
import { ThemeSwitcher } from './theme-switcher'
import { useI18n, type Locale, type MessageKey } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'

const TITLES: Array<{ href: string; labelKey: MessageKey }> = [
  { href: '/guide/start', labelKey: 'nav.guide_start' },
  { href: '/guide/engine', labelKey: 'nav.guide_engine' },
  { href: '/guide/operations', labelKey: 'nav.guide_operations' },
  { href: '/guide/meta', labelKey: 'nav.guide_meta' },
  { href: '/guide', labelKey: 'nav.guide' },
  { href: '/knowledge', labelKey: 'nav.knowledge' },
  { href: '/readiness', labelKey: 'nav.readiness' },
  { href: '/scenarios', labelKey: 'nav.scenarios' },
  { href: '/exercise', labelKey: 'nav.exercise' },
  { href: '/communications', labelKey: 'nav.communication' },
  { href: '/audit', labelKey: 'nav.audit' },
  { href: '/preferences', labelKey: 'nav.preferences' },
  { href: '/security', labelKey: 'nav.security' },
  { href: '/', labelKey: 'overview.title' },
]

interface MobileNavEntry {
  href: string
  labelKey: MessageKey
  icon: React.ComponentType<{ className?: string }>
  iconClassName?: string
}

/** Same sections, same order as the desktop rail: the drawer is not a second navigation. */
const MOBILE_NAV: Array<{ groupKey: MessageKey; entries: MobileNavEntry[]; children?: MobileNavEntry[] }> = [
  {
    groupKey: 'nav.group_guide',
    entries: [{ href: '/guide', labelKey: 'nav.guide', icon: Compass }],
    children: [
      { href: '/guide/start', labelKey: 'nav.guide_start', icon: Rocket },
      { href: '/guide/engine', labelKey: 'nav.guide_engine', icon: Cpu },
      { href: '/guide/operations', labelKey: 'nav.guide_operations', icon: Settings2 },
      { href: '/guide/meta', labelKey: 'nav.guide_meta', icon: Layers },
    ],
  },
  {
    groupKey: 'nav.group_general',
    entries: [
      { href: '/', labelKey: 'nav.overview', icon: LayoutDashboard },
      { href: '/countries', labelKey: 'nav.countries', icon: Globe },
      { href: '/knowledge', labelKey: 'nav.knowledge', icon: Database },
      { href: '/readiness', labelKey: 'nav.readiness', icon: Gauge },
      { href: '/scenarios', labelKey: 'nav.scenarios', icon: Network },
    ],
  },
  {
    groupKey: 'nav.group_operations',
    entries: [
      { href: '/exercise', labelKey: 'nav.exercise', icon: Siren },
      { href: '/communications', labelKey: 'nav.communication', icon: Megaphone },
      { href: '/audit', labelKey: 'nav.audit', icon: ScrollText },
    ],
  },
  {
    groupKey: 'nav.group_settings',
    entries: [
      { href: '/preferences', labelKey: 'nav.settings', icon: Settings },
      { href: '/security', labelKey: 'nav.security', icon: ShieldCheck },
    ],
  },
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

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-white/80 px-4 backdrop-blur-md dark:bg-brand-ink sm:px-6">
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
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            aria-label={t('nav.collapse')}
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white text-sidebar-foreground shadow-2xl dark:bg-brand-ink">
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
            <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 py-3">
              {MOBILE_NAV.map(({ groupKey, entries, children }, index) => (
                <div
                  key={groupKey}
                  className={index > 0 ? 'mt-3 border-t border-border/70 pt-3' : undefined}
                >
                  <p className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground/55">
                    {t(groupKey)}
                  </p>
                  {entries.map(({ href, labelKey, icon: Icon }) => {
                    const isGuide = href === '/guide'
                    const active = isGuide
                      ? pathname === '/guide'
                      : href === '/'
                        ? pathname === '/'
                        : pathname === href || pathname.startsWith(`${href}/`)
                    return (
                      <React.Fragment key={href}>
                        <Link
                          href={href}
                          onClick={() => setMenuOpen(false)}
                          className={cn(
                            'flex h-9 items-center rounded-lg px-2 text-xs transition-colors',
                            active
                              ? 'bg-sidebar-accent font-medium text-sidebar-primary'
                              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                          )}
                        >
                          <Icon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">{t(labelKey)}</span>
                        </Link>
                        {isGuide && children && (
                          <div className="ml-4 mt-1 space-y-0.5 border-l border-border/70 pl-2">
                            {children.map((child) => {
                              const ChildIcon = child.icon
                              return (
                                <Link
                                  key={child.href}
                                  href={child.href}
                                  onClick={() => setMenuOpen(false)}
                                  className={cn(
                                    'flex h-8 items-center rounded-lg px-2 text-[11px] transition-colors',
                                    pathname === child.href
                                      ? 'bg-sidebar-accent font-medium text-sidebar-primary'
                                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                                  )}
                                >
                                  <ChildIcon className={cn('mr-2 shrink-0', child.iconClassName ?? 'h-3.5 w-3.5')} />
                                  <span className="truncate">{t(child.labelKey)}</span>
                                </Link>
                              )
                            })}
                          </div>
                        )}
                      </React.Fragment>
                    )
                  })}
                </div>
              ))}
            </nav>
            <div className="border-t border-border p-2">
              <OperatorMenu side="top" />
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
