/**
 * The console's navigation, in one place.
 *
 * The desktop rail and the mobile drawer render the same sections in the same
 * order; sharing these arrays means a new page cannot land in one of them and
 * be forgotten in the other.
 */

import type { ComponentType } from 'react'
import {
  Activity,
  BadgeCheck,
  Bot,
  Building2,
  Landmark,
  Sparkles,
  Cpu,
  Database,
  Gauge,
  Globe2,
  LayoutDashboard,
  Layers,
  Map,
  Megaphone,
  Network,
  Rocket,
  ScrollText,
  Settings,
  Settings2,
  ShieldCheck,
  Siren,
} from 'lucide-react'
import type { MessageKey } from '@/lib/i18n'
import { WORLD_MODE_ENABLED } from '@/lib/world-mode'

export interface NavEntry {
  href: string
  labelKey: MessageKey
  icon: ComponentType<{ className?: string }>
  /** Size of the icon in the sub-items; the default is the small glyph. */
  iconClassName?: string
  children?: NavEntry[]
}

export const GUIDE_CHILDREN: NavEntry[] = [
  { href: '/guide/start', labelKey: 'nav.guide_start', icon: Rocket },
  { href: '/guide/engine', labelKey: 'nav.guide_engine', icon: Cpu },
  { href: '/guide/operations', labelKey: 'nav.guide_operations', icon: Settings2 },
  { href: '/guide/meta', labelKey: 'nav.guide_meta', icon: Layers },
]

/**
 * World lands right after Readiness: it is the same scores, read across
 * countries. The entry disappears with `NEXT_PUBLIC_WORLD_MODE=false`.
 */
const WORLD_NAV: NavEntry[] = WORLD_MODE_ENABLED
  ? [{ href: '/world', labelKey: 'nav.world', icon: Map }]
  : []

/**
 * A section with `children` renders as a collapsible group: its own href is only
 * a key (the group opens, it does not navigate).
 */
export const GENERAL_NAV: NavEntry[] = [
  { href: '/', labelKey: 'nav.overview', icon: LayoutDashboard },
  {
    href: '#institutions',
    labelKey: 'nav.group_institutions',
    icon: Landmark,
    children: [
      { href: '/countries', labelKey: 'nav.countries', icon: Globe2 },
      { href: '/institutions', labelKey: 'nav.institutions', icon: Building2 },
    ],
  },
  {
    href: '#agents-ai',
    labelKey: 'nav.group_agents_ai',
    icon: Sparkles,
    children: [
      { href: '/agents', labelKey: 'nav.agents', icon: Bot },
      { href: '/roles', labelKey: 'nav.roles', icon: BadgeCheck },
      { href: '/knowledge', labelKey: 'nav.knowledge', icon: Database },
    ],
  },
  { href: '/readiness', labelKey: 'nav.readiness', icon: Gauge },
  ...WORLD_NAV,
  { href: '/scenarios', labelKey: 'nav.scenarios', icon: Network },
]

/** Every navigable entry, groups flattened: titles, the mobile drawer, the collapsed rail. */
export function flattenNav(entries: NavEntry[]): NavEntry[] {
  return entries.flatMap((entry) => (entry.children ? entry.children : [entry]))
}

export const OPERATIONS_NAV: NavEntry[] = [
  { href: '/exercise', labelKey: 'nav.exercise', icon: Siren },
  { href: '/communications', labelKey: 'nav.communication', icon: Megaphone },
  { href: '/audit', labelKey: 'nav.audit', icon: ScrollText },
  { href: '/observability', labelKey: 'nav.observability', icon: Activity },
]

export const SETTINGS_NAV: NavEntry[] = [
  { href: '/preferences', labelKey: 'nav.settings', icon: Settings },
  { href: '/security', labelKey: 'nav.security', icon: ShieldCheck },
]
