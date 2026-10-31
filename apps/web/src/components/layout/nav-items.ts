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
  Cpu,
  Database,
  Gauge,
  Globe2,
  LayoutDashboard,
  Layers,
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

export const GENERAL_NAV: NavEntry[] = [
  { href: '/', labelKey: 'nav.overview', icon: LayoutDashboard },
  { href: '/countries', labelKey: 'nav.countries', icon: Globe2 },
  { href: '/knowledge', labelKey: 'nav.knowledge', icon: Database },
  { href: '/readiness', labelKey: 'nav.readiness', icon: Gauge },
  { href: '/scenarios', labelKey: 'nav.scenarios', icon: Network },
]

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
