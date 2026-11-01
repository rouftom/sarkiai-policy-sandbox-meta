'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Compass, Globe, Menu, X,
} from 'lucide-react'
import { cn, Select } from '@sps/ui'
import { BrandMark, BrandWordmark } from './brand-mark'
import { OperatorMenu } from './operator-menu'
import { ThemeSwitcher } from './theme-switcher'
import {
  GENERAL_NAV,
  GUIDE_CHILDREN,
  OPERATIONS_NAV,
  SETTINGS_NAV,
  type NavEntry,
} from './nav-items'
import { useI18n, type Locale, type MessageKey } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'

/**
 * The app bar title for each route. The nav arrays are the source of truth, so
 * a page added to the rail and the drawer also gets its title here.
 */
const TITLES: Array<{ href: string; labelKey: MessageKey }> = [
  ...GUIDE_CHILDREN,
  { href: '/guide', labelKey: 'nav.guide' },
  { href: '/', labelKey: 'overview.title' },
  ...GENERAL_NAV.filter((entry) => entry.href !== '/'),
  ...OPERATIONS_NAV,
  ...SETTINGS_NAV,
]

/** Same sections, same order as the desktop rail: the drawer is not a second navigation. */
const MOBILE_NAV: Array<{ groupKey: MessageKey; entries: NavEntry[]; children?: NavEntry[] }> = [
  {
    groupKey: 'nav.group_guide',
    entries: [{ href: '/guide', labelKey: 'nav.guide', icon: Compass }],
    children: GUIDE_CHILDREN,
  },
  { groupKey: 'nav.group_general', entries: GENERAL_NAV },
  { groupKey: 'nav.group_operations', entries: OPERATIONS_NAV },
  { groupKey: 'nav.group_settings', entries: SETTINGS_NAV },
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
