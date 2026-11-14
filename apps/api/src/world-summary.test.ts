import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { Domain } from '@sps/shared'
import type { CountryRecord } from './countries'
import type { ReadinessRunSummary } from './readiness-runs'
import {
  WORLD_DIMENSION_COUNT,
  WORLD_FRAMEWORK_VERSION,
  buildWorldSummary,
  coverageOf,
  isStale,
  resolveWorldState,
} from './world-summary'

function country(
  code: string,
  sectors: Domain[] = ['health', 'education'],
  status: CountryRecord['status'] = 'active',
): CountryRecord {
  return {
    code,
    name: code.toUpperCase(),
    nameFr: code.toUpperCase(),
    jurisdiction: 'national',
    region: '',
    authority: '',
    currency: '',
    languages: ['en'],
    timezone: '',
    sectors,
    status,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'test',
  }
}

let seq = 0
function run(overrides: Partial<ReadinessRunSummary> = {}): ReadinessRunSummary {
  seq += 1
  return {
    id: `rr_${seq}`,
    country: 'cm',
    domain: 'health',
    createdAt: '2026-11-01T00:00:00.000Z',
    runBy: 'alice',
    composite: 3.2,
    dimensions: 13,
    groundedDimensions: 13,
    meanConfidence: 0.8,
    sharing: 'shared',
    status: 'complete',
    ...overrides,
  }
}

describe('world display rules', () => {
  test('no run, no grounded data, low confidence, ok', () => {
    expect(resolveWorldState({ hasRun: false, coverage: null, confidence: null })).toBe('not-assessed')
    expect(resolveWorldState({ hasRun: true, coverage: 0.3, confidence: 0.9 })).toBe('no-grounded-data')
    expect(resolveWorldState({ hasRun: true, coverage: 0.5, confidence: 0.2 })).toBe('low-confidence')
    expect(resolveWorldState({ hasRun: true, coverage: 0.5, confidence: 0.5 })).toBe('ok')
  })

  test('coverage is the share of the thirteen framework dimensions', () => {
    expect(WORLD_DIMENSION_COUNT).toBe(13)
    expect(coverageOf({ groundedDimensions: 5 })).toBeCloseTo(5 / 13, 6)
    expect(coverageOf({ groundedDimensions: 13 })).toBe(1)
  })

  test('stale after the configured number of days, never for a missing date', () => {
    const now = new Date('2026-11-10T00:00:00.000Z')
    expect(isStale('2026-05-01T00:00:00.000Z', now)).toBe(true)
    expect(isStale('2026-10-01T00:00:00.000Z', now)).toBe(false)
    expect(isStale(null, now)).toBe(false)
    expect(isStale('not-a-date', now)).toBe(false)
  })

  test('the framework version matches the canonical dimensions file', () => {
    const raw = readFileSync(
      new URL('../../../data/global/standards/dimensions.json', import.meta.url),
      'utf8',
    )
    const data = JSON.parse(raw) as { framework_version?: string }
    expect(data.framework_version).toBe(WORLD_FRAMEWORK_VERSION)
  })
})

describe('world summary', () => {
  test('keeps the latest complete run per (country, sector) and ignores failed ones', () => {
    const older = run({ createdAt: '2026-10-01T00:00:00.000Z', composite: 1, meanConfidence: 0.3 })
    const latest = run({ createdAt: '2026-11-01T00:00:00.000Z', composite: 4.2, meanConfidence: 0.9 })
    const failed = run({
      createdAt: '2026-11-05T00:00:00.000Z',
      composite: 5,
      status: 'failed',
      failure: 'provider 500',
    })

    const summary = buildWorldSummary({
      countries: [country('cm')],
      runs: [older, latest, failed],
      sector: 'health',
      scope: 'mine',
      now: new Date('2026-11-10T00:00:00.000Z'),
    })

    const [cm] = summary.countries
    expect(summary.countries).toHaveLength(1)
    expect(cm?.composite).toBe(4.2)
    expect(cm?.confidence).toBe(0.9)
    expect(cm?.band).toBe('Advanced')
    expect(cm?.state).toBe('ok')
    expect(cm?.runs).toBe(2) // failed runs never count
    expect(cm?.lastRunAt).toBe('2026-11-01T00:00:00.000Z')
    expect(cm?.sectors).toEqual(['health', 'education'])
  })

  test('a country seen only in runs is listed as unregistered, after the registry', () => {
    const summary = buildWorldSummary({
      countries: [country('cm'), country('fr', ['health'], 'planned')],
      runs: [run({ country: 'ng', composite: 2 })],
      sector: 'health',
      scope: 'shared',
    })

    expect(summary.countries.map((entry) => [entry.code, entry.registryStatus])).toEqual([
      ['cm', 'active'],
      ['fr', 'planned'],
      ['ng', 'unregistered'],
    ])
    expect(summary.countries[2]?.sectors).toEqual([])
    expect(summary.countries[2]?.composite).toBe(2)
  })

  test('all sectors averages the latest composite per enabled sector with a run', () => {
    const summary = buildWorldSummary({
      countries: [country('cm')],
      runs: [
        run({ domain: 'health', composite: 4 }),
        run({ domain: 'education', composite: 2 }),
        // disabled sector: data exists but the registry says it is out of scope
        run({ domain: 'telecom', composite: 5 }),
      ],
      sector: 'all',
      scope: 'mine',
    })

    const [cm] = summary.countries
    expect(cm?.composite).toBe(3)
    expect(cm?.runs).toBe(2)
    expect(cm?.coverage).toBe(1)
    expect(cm?.state).toBe('ok')
    // The comparison rows keep every sector with data, flagged as enabled or
    // not; the `all` aggregate itself reads the enabled ones only.
    expect(cm?.bySector.map((entry) => [entry.sector, entry.enabled, entry.composite])).toEqual([
      ['health', true, 4],
      ['education', true, 2],
      ['telecom', false, 5],
    ])
  })

  test('bySector describes every enabled sector, including the ones without a run', () => {
    const summary = buildWorldSummary({
      countries: [country('cm', ['health', 'education'])],
      runs: [run({ domain: 'health', composite: 4, groundedDimensions: 6, meanConfidence: 0.5 })],
      sector: 'health',
      scope: 'mine',
    })

    const [cm] = summary.countries
    expect(cm?.bySector.map((entry) => [entry.sector, entry.state, entry.composite])).toEqual([
      ['health', 'ok', 4],
      ['education', 'not-assessed', null],
    ])
    expect(cm?.bySector.every((entry) => entry.enabled)).toBe(true)
    expect(cm?.bySector[0]?.coverage).toBeCloseTo(6 / 13, 3)
    expect(cm?.bySector[1]?.runs).toBe(0)
  })

  test('a run with too little national grounding is state-tagged, not coloured', () => {
    const summary = buildWorldSummary({
      countries: [country('cm')],
      runs: [run({ groundedDimensions: 3, meanConfidence: 0.9 })],
      sector: 'health',
      scope: 'mine',
    })

    const [cm] = summary.countries
    expect(cm?.state).toBe('no-grounded-data')
    expect(cm?.coverage).toBe(0.231)
    // The composite stays visible for the sheet; only the map may not colour it.
    expect(cm?.composite).toBe(3.2)
  })

  test('a country with no run for the selected sector is not assessed', () => {
    const summary = buildWorldSummary({
      countries: [country('cm')],
      runs: [run({ domain: 'telecom' })],
      sector: 'health',
      scope: 'mine',
    })

    const [cm] = summary.countries
    expect(cm?.state).toBe('not-assessed')
    expect(cm?.composite).toBeNull()
    expect(cm?.coverage).toBeNull()
    expect(cm?.runs).toBe(0)
    expect(cm?.lastRunAt).toBeNull()
  })
})
