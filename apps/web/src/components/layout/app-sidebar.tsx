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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@sps/ui'
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

const GENERAL_NAV: NavEntry[] = [
  { href: '/', labelKey: 'nav.overview', icon: LayoutDashboard },
  { href: '/knowledge', labelKey: 'nav.knowledge', icon: Database },
  { href: '/readiness', labelKey: 'nav.readiness', icon: Gauge },
  { href: '/scenarios', labelKey: 'nav.scenarios', icon: Network },
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

  React.useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1')
  }, [])

  const toggle = () => {
    setCollapsed((value) => {
      const next = !value
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }


  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  const renderItem = (entry: NavEntry) => {
    const active = isActive(entry.href)
    const Icon = entry.icon
    const link = (
      <Link
        key={entry.href}
        href={entry.href}
        className={cn(
          'flex h-9 items-center rounded-lg text-xs transition-colors',
          collapsed ? 'justify-center px-2' : 'px-3',
          active
            ? 'bg-brand-primary/10 font-medium text-brand-primary-dark dark:bg-brand-primary-dark/40 dark:text-brand-primary-light'
            : 'text-sidebar-foreground/70 hover:bg-brand-primary/5 hover:text-sidebar-foreground',
        )}
      >
        <Icon className={cn('h-4 w-4 shrink-0', !collapsed && 'mr-2')} />
        {!collapsed && <span className="truncate">{t(entry.labelKey)}</span>}
      </Link>
    )
    if (!collapsed) return link
    return (
      <Tooltip key={entry.href}>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="border-0 bg-primary text-primary-foreground">
          {t(entry.labelKey)}
        </TooltipContent>
      </Tooltip>
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
            : 'text-sidebar-foreground/60 hover:bg-brand-primary/5 hover:text-sidebar-foreground',
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t(entry.labelKey)}</span>
      </Link>
    )
  }

  const groupLabel = (key: MessageKey) =>
    !collapsed && (
      <p className="px-3 pb-1 pt-3 text-[11px] font-medium text-sidebar-foreground/55">
        {t(key)}
      </p>
    )

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        onClick={
          collapsed
            ? (event) => {
                // A menu link navigates and keeps the rail collapsed; the rest of the body opens it.
                if ((event.target as HTMLElement).closest('a[href]')) return
                toggle()
              }
            : undefined
        }
        className={cn(
          'hidden h-screen flex-col bg-white text-sidebar-foreground transition-all duration-300 md:flex dark:bg-brand-ink',
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
              className="group mx-auto flex h-9 w-9 items-center justify-center rounded-xl hover:bg-sidebar-accent"
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
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="custom-scrollbar relative z-10 flex-1 overflow-y-auto py-3">
          <nav className="grid gap-1 px-2">
            {groupLabel('nav.group_guide')}
            {renderItem({ href: '/guide', labelKey: 'nav.guide', icon: Compass })}

            <div className="my-1 border-t border-sidebar-border" />
            {groupLabel('nav.group_general')}
            {GENERAL_NAV.map(renderItem)}

            {groupLabel('nav.group_operations')}
            {OPERATIONS_NAV.map(renderItem)}

            <div className="my-1 border-t border-sidebar-border" />
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
    </TooltipProvider>
  )
}

export const AppSidebar = AdminSidebar
