import { describe, expect, test } from 'bun:test'
import { MATURITY_RAMP, maturityColor } from '@sps/theme'
import type { WorldSummaryEntryDto } from '@/lib/api'
import { MAP_NEUTRAL, mapPaint } from './world-map-style'

const entry = (patch: Partial<WorldSummaryEntryDto>): WorldSummaryEntryDto => ({
  code: 'cm',
  registryStatus: 'active',
  sectors: ['health'],
  state: 'ok',
  composite: 3,
  band: 'established',
  coverage: 0.8,
  confidence: 0.8,
  stale: false,
  runs: 1,
  lastRunAt: '2026-11-01T00:00:00.000Z',
  bySector: [],
  ...patch,
})

describe('map paint rules', () => {
  test('an unassessed or unregistered country stays neutral', () => {
    expect(mapPaint(undefined)).toEqual({ className: MAP_NEUTRAL })
    expect(mapPaint(entry({ state: 'not-assessed', composite: null }))).toEqual({ className: MAP_NEUTRAL })
  })

  test('a grounded run reads the maturity ramp', () => {
    const paint = mapPaint(entry({ composite: 4 }))
    expect(paint.fill).toBe(maturityColor(4))
    expect(paint.fill).toBe(MATURITY_RAMP[4])
    expect(paint.className).toBe('')
  })

  test('low confidence keeps the ramp but fades it', () => {
    const paint = mapPaint(entry({ state: 'low-confidence', composite: 2 }))
    expect(paint.fill).toBe(maturityColor(2))
    expect(paint.className).toContain('opacity')
  })

  test('no grounded data is never painted as a measurement', () => {
    const paint = mapPaint(entry({ state: 'no-grounded-data', composite: 5 }))
    expect(paint.fill).toBeUndefined()
    expect(paint.className).toContain('amber')
  })
})
