/**
 * Shared vocabulary of the World page: sectors, display rules and the state
 * metadata the table and the map both render.
 */

import { CircleDashed, CircleSlash2, ShieldCheck, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Domain } from '@sps/shared'
import type { WorldStateDto } from '@/lib/api'
import type { MessageKey } from '@/lib/i18n'

/** The sectors the World page can filter on, in registry order. */
export const SECTORS: readonly Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

/** The defaults of `docs/world-mode/docs/05-readiness-aggregation.md`, §2. */
export const DISPLAY_RULES = { dimensions: 13, minCoverage: 0.4, minConfidence: 0.4, staleAfterDays: 90 } as const

export const STATE_META: Record<
  WorldStateDto,
  { icon: LucideIcon; tone: 'neutral' | 'warning' | 'danger' | 'success'; label: MessageKey; hint: MessageKey }
> = {
  'not-assessed': {
    icon: CircleDashed,
    tone: 'neutral',
    label: 'world.state.not-assessed',
    hint: 'world.state.hint.not-assessed',
  },
  'no-grounded-data': {
    icon: CircleSlash2,
    tone: 'warning',
    label: 'world.state.no-grounded-data',
    hint: 'world.state.hint.no-grounded-data',
  },
  'low-confidence': {
    icon: TriangleAlert,
    tone: 'warning',
    label: 'world.state.low-confidence',
    hint: 'world.state.hint.low-confidence',
  },
  ok: {
    icon: ShieldCheck,
    tone: 'success',
    label: 'world.state.ok',
    hint: 'world.state.hint.ok',
  },
}
