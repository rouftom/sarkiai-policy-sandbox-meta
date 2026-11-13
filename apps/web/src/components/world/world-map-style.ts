/**
 * Paint rules for the World map.
 *
 * The map reads the same rule as the table: a composite is only painted like a
 * measurement when the summary's `state` says the run is grounded. A
 * `no-grounded-data` run keeps a neutral tint even when a composite exists,
 * and a `low-confidence` run is painted at reduced opacity.
 */

import { maturityColor } from '@sps/theme'
import type { WorldSummaryEntryDto } from '@/lib/api'

export interface MapPaint {
  /** Inline fill (maturity ramp); wins over `className` when present. */
  fill?: string
  /** Tailwind classes for the neutral / warning states. */
  className: string
}

/** Unregistered and unassessed countries share the quiet neutral fill. */
export const MAP_NEUTRAL = 'fill-slate-200/90 dark:fill-slate-700/50'

export function mapPaint(entry: WorldSummaryEntryDto | undefined): MapPaint {
  if (!entry) return { className: MAP_NEUTRAL }

  if (entry.state === 'ok' && entry.composite !== null) {
    return { fill: maturityColor(entry.composite), className: '' }
  }
  if (entry.state === 'low-confidence' && entry.composite !== null) {
    return { fill: maturityColor(entry.composite), className: 'opacity-55' }
  }
  if (entry.state === 'low-confidence') {
    return { className: 'fill-amber-400/70 dark:fill-amber-300/30' }
  }
  if (entry.state === 'no-grounded-data') {
    return { className: 'fill-amber-200/70 dark:fill-amber-200/20' }
  }
  return { className: MAP_NEUTRAL }
}
