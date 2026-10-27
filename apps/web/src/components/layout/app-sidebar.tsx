'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronDown,
  Compass,
  Cpu,
  Database,
  Gauge,
  Languages,
  LayoutDashboard,
  Newspaper,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Rocket,
  ScrollText,
  Settings,
  Settings2,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { cn } from '@sps/ui'
import { BrandMark, BrandWordmark } from './brand-mark'
import { OperatorMenu } from './operator-menu'
import { useI18n, type MessageKey } from '@/lib/i18n'

const COLLAPSE_KEY = 'sps-sidebar-collapsed'

interface NavEntry {
  href: string
  labelKey: MessageKey
  icon: React.ComponentType<{ className?: string }>
  children?: NavEntry[]
}

const GUIDE_NAV: NavEntry[] = [
  { href: '/guide/start', labelKey: 'nav.guide_start', icon: Rocket },
  { href: '/guide/engine', labelKey: 'nav.guide_engine', icon: Cpu },
  { href: '/guide/operations', labelKey: 'nav.guide_operations', icon: Settings2 },
  { href: '/guide/meta', labelKey: 'nav.guide_meta', icon: Sparkles },
]

const GENERAL_NAV: NavEntry[] = [
  { href: '/', labelKey: 'nav.overview', icon: LayoutDashboard },
  { href: '/console', labelKey: 'nav.console', icon: SlidersHorizontal },
  { href: '/knowledge', labelKey: 'nav.knowledge', icon: Database },
  { href: '/readiness', labelKey: 'nav.readiness', icon: Gauge },
  { href: '/scenarios', labelKey: 'nav.scenarios', icon: Network },
  { href: '/gazette', labelKey: 'nav.gazette', icon: Newspaper },
]

const OPERATIONS_NAV: NavEntry[] = [
  { href: '/exercise', labelKey: 'nav.exercise', icon: Siren },
  { href: '/communications', labelKey: 'nav.communication', icon: Languages },
  { href: '/audit', labelKey: 'nav.audit', icon: ScrollText },
]

const SETTINGS_NAV: NavEntry[] = [
  { href: '/preferences', labelKey: 'nav.settings', icon: Settings },
  { href: '/security', labelKey: 'nav.security', icon: ShieldCheck },
]

/**
 * Sidebar shell modelled on the FSM console: a product block, grouped sections
 * (Guide with sub-items, Explore, Operations, Settings), and the operator menu
 * pinned at the bottom. The whole bar collapses.
 */
export function AdminSidebar() {
  const pathname = usePathname()
  const { t } = useI18n()
  const [collapsed, setCollapsed] = React.useState(false)
  const [guideOpen, setGuideOpen] = React.useState(false)

  React.useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1')
    setGuideOpen(localStorage.getItem('sps-guide-open') === '1')
  }, [])

  const toggle = () => {
    setCollapsed((value) => {
      const next = !value
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  const toggleGuide = () => {
    setGuideOpen((value) => {
      const next = !value
      localStorage.setItem('sps-guide-open', next ? '1' : '0')
      return next
    })
  }

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  const renderItem = (entry: NavEntry) => {
    const active = isActive(entry.href)
    const Icon = entry.icon
    return (
      <Link
        key={entry.href}
        href={entry.href}
        title={collapsed ? t(entry.labelKey) : undefined}
        className={cn(
          'flex h-9 items-center rounded-lg text-xs transition-colors',
          collapsed ? 'justify-center px-2' : 'px-3',
          active
            ? 'bg-brand-primary/10 font-medium text-brand-primary-dark dark:bg-brand-primary-dark/40 dark:text-brand-primary-light'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-brand-primary-dark/20 dark:hover:text-brand-primary-light',
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', !collapsed && 'mr-2')} />
        {!collapsed && <span className="truncate">{t(entry.labelKey)}</span>}
      </Link>
    )
  }

  const renderChild = (entry: NavEntry) => {
    const active = isActive(entry.href)
    const Icon = entry.icon
    return (
      <Link
        key={entry.href}
        href={entry.href}
        className={cn(
          'flex h-8 items-center gap-2 rounded-lg px-2 text-[11px] transition-colors',
          active
            ? 'bg-brand-primary/10 font-medium text-brand-primary-dark dark:bg-brand-primary-dark/40 dark:text-brand-primary-light'
            : 'text-slate-500 hover:bg-brand-primary/5 hover:text-brand-primary dark:text-slate-400 dark:hover:bg-brand-primary-dark/25 dark:hover:text-brand-primary-light',
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t(entry.labelKey)}</span>
      </Link>
    )
  }

  const groupLabel = (key: MessageKey) =>
    !collapsed && (
      <p className="px-3 pb-1 pt-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {t(key)}
      </p>
    )

  return (
    <aside
      onClick={collapsed ? toggle : undefined}
      className={cn(
        'hidden h-screen flex-col border-r border-slate-100 bg-white transition-all duration-300 dark:border-brand-primary-dark/20 dark:bg-brand-ink md:flex',
        collapsed ? 'w-14 cursor-ew-resize' : 'w-60 md:w-56',
      )}
    >
      <div
        className={cn(
          'relative z-10 flex h-14 items-center justify-between pl-3 pr-2',
          collapsed && 'justify-center px-0',
        )}
      >
        {!collapsed ? (
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <BrandMark className="h-9 w-9 shrink-0" />
            <BrandWordmark short={t('app.shortName')} />
          </Link>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              toggle()
            }}
            aria-label={t('nav.expand')}
            className="group mx-auto flex h-9 w-9 items-center justify-center rounded-xl hover:bg-brand-primary/10"
          >
            <BrandMark className="h-9 w-9 group-hover:hidden" />
            <PanelLeftOpen className="hidden h-4 w-4 group-hover:block" />
          </button>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            aria-label={t('nav.collapse')}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-brand-primary/10 hover:text-brand-primary dark:text-slate-400"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="custom-scrollbar relative z-10 flex-1 overflow-y-auto py-3">
        <nav className="grid gap-1 px-2">
          {groupLabel('nav.group_guide')}
          <div className="space-y-0.5">
            <div className="flex items-center gap-0.5">
              <div className="min-w-0 flex-1">
                {renderItem({ href: '/guide', labelKey: 'nav.guide', icon: Compass })}
              </div>
              {!collapsed && (
                <button
                  type="button"
                  onClick={toggleGuide}
                  aria-expanded={guideOpen}
                  aria-label={t('nav.guide_toggle')}
                  className="flex h-9 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-brand-primary/10 hover:text-brand-primary"
                >
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', !guideOpen && '-rotate-90')} />
                </button>
              )}
            </div>
            {!collapsed && guideOpen && (
              <div className="ml-5 grid gap-0.5 border-l border-slate-100 pl-2 dark:border-brand-primary-dark/30">
                {GUIDE_NAV.map(renderChild)}
              </div>
            )}
          </div>

          <div className="my-1 border-t border-slate-100 dark:border-brand-primary-dark/25" />
          {groupLabel('nav.group_general')}
          {GENERAL_NAV.map(renderItem)}

          {groupLabel('nav.group_operations')}
          {OPERATIONS_NAV.map(renderItem)}

          <div className="my-1 border-t border-slate-100 dark:border-brand-primary-dark/25" />
          {groupLabel('nav.group_settings')}
          {SETTINGS_NAV.map(renderItem)}
        </nav>
      </div>

      <div
        className="relative z-10 mb-3 px-2 py-2"
        onClick={(event) => {
          if (collapsed) event.stopPropagation()
        }}
      >
        <OperatorMenu compact={collapsed} side="top" />
      </div>
    </aside>
  )
}

export const AppSidebar = AdminSidebar
