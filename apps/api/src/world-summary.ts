/**
 * World summary read model.
 *
 * World adds no new maturity index: it exposes the latest complete readiness
 * run per (country, sector) together with the measures that say whether the
 * value may be read as a measurement of that country. A score without national
 * grounding is never painted like one, so `state` is derived here, once, and
 * the console renders it as-is.
 *
 * Rules and thresholds: `docs/world-mode/docs/05-readiness-aggregation.md`.
 * Shape: `schemas/world-summary.schema.json` (schemaVersion 1).
 */

import { READINESS_DIMENSIONS, type Domain } from '@sps/shared'
import { maturityLabel } from '@sps/readiness/scoring'
import type { CountryRecord } from './countries.js'
import type { ReadinessRunSummary } from './readiness-runs.js'
import type { RunScope } from './run-sharing.js'

export const WORLD_SCHEMA_VERSION = 1 as const
/** Keep in sync with `data/global/standards/dimensions.json` (`framework_version`). */
export const WORLD_FRAMEWORK_VERSION = '2.0'

export type WorldSector = Domain | 'all'

export type WorldState = 'not-assessed' | 'no-grounded-data' | 'low-confidence' | 'ok'

export type WorldRegistryStatus = 'active' | 'planned' | 'unregistered'

/** Admin defaults from the specification; a settings store will override them. */
export interface WorldThresholds {
  minCountryChunks: number
  minCoverage: number
  minConfidence: number
  rankMinCoverage: number
  rankMinConfidence: number
  staleAfterDays: number
}

export const WORLD_THRESHOLDS: WorldThresholds = {
  minCountryChunks: 1,
  minCoverage: 0.4,
  minConfidence: 0.4,
  rankMinCoverage: 0.6,
  rankMinConfidence: 0.5,
  staleAfterDays: 90,
}

/** The denominator of `coverage`: every dimension the framework defines. */
export const WORLD_DIMENSION_COUNT = READINESS_DIMENSIONS.length

export interface WorldSummaryEntry {
  code: string
  registryStatus: WorldRegistryStatus
  sectors: Domain[]
  state: WorldState
  composite: number | null
  band: string | null
  coverage: number | null
  confidence: number | null
  stale: boolean
  runs: number
  lastRunAt: string | null
}

export interface WorldSummary {
  schemaVersion: typeof WORLD_SCHEMA_VERSION
  frameworkVersion: string
  sector: WorldSector
  scope: RunScope
  generatedAt: string
  countries: WorldSummaryEntry[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function mean(values: number[], digits = 3): number | null {
  if (values.length === 0) return null
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(digits))
}

/** `groundedDimensions / 13`, the share of the framework the country backs. */
export function coverageOf(run: Pick<ReadinessRunSummary, 'groundedDimensions'>): number {
  return clamp01(run.groundedDimensions / WORLD_DIMENSION_COUNT)
}

/**
 * The display rule of `docs/05` §3. "Not assessed" and "No grounded data" are
 * different on purpose: the first means nobody ran it, the second that a run
 * exists but the result is not national evidence.
 */
export function resolveWorldState(
  input: { hasRun: boolean; coverage: number | null; confidence: number | null },
  thresholds: WorldThresholds = WORLD_THRESHOLDS,
): WorldState {
  if (!input.hasRun) return 'not-assessed'
  if (input.coverage === null || input.coverage < thresholds.minCoverage) return 'no-grounded-data'
  if (input.confidence === null || input.confidence < thresholds.minConfidence) return 'low-confidence'
  return 'ok'
}

/** Older than `staleAfterDays`; the corpus-change half of freshness is not wired yet. */
export function isStale(
  createdAt: string | null,
  now: Date,
  thresholds: WorldThresholds = WORLD_THRESHOLDS,
): boolean {
  if (!createdAt) return false
  const at = Date.parse(createdAt)
  if (Number.isNaN(at)) return false
  return now.getTime() - at > thresholds.staleAfterDays * DAY_MS
}

/** Ranks the registry first (active, planned), then the countries seen only in runs. */
function registryRank(status: WorldRegistryStatus): number {
  if (status === 'active') return 0
  if (status === 'planned') return 1
  return 2
}

/**
 * Builds the read model from summaries only.
 *
 * `all` means "mean of the latest composites over the country's enabled sectors
 * that have a complete run", as the specification puts it; each entry's
 * freshness is its most recent run.
 */
export function buildWorldSummary(input: {
  countries: readonly CountryRecord[]
  runs: readonly ReadinessRunSummary[]
  sector: WorldSector
  scope: RunScope
  now?: Date
  thresholds?: WorldThresholds
}): WorldSummary {
  const thresholds = input.thresholds ?? WORLD_THRESHOLDS
  const now = input.now ?? new Date()
  const complete = input.runs.filter((run) => run.status === 'complete')
  const ordered = [...complete].sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // Latest complete run per (country, sector), first one wins: the list is newest first.
  const latest = new Map<string, ReadinessRunSummary>()
  for (const run of ordered) {
    const code = run.country.toLowerCase()
    const key = `${code}|${run.domain}`
    if (!latest.has(key)) latest.set(key, run)
  }

  const registry = new Map(input.countries.map((country) => [country.code.toLowerCase(), country]))
  const codes = new Set<string>([...registry.keys()])
  for (const run of complete) codes.add(run.country.toLowerCase())

  const entries: WorldSummaryEntry[] = []
  for (const code of codes) {
    const record = registry.get(code)
    const sectors = record?.sectors ?? []

    // The runs an entry reads: one sector, or every enabled sector with a run.
    const perSector =
      input.sector === 'all'
        ? [...latest.values()].filter(
            (run) =>
              run.country.toLowerCase() === code &&
              (!record || sectors.includes(run.domain as Domain)),
          )
        : [latest.get(`${code}|${input.sector}`)].filter(
            (run): run is ReadinessRunSummary => Boolean(run),
          )

    const composites = perSector
      .map((run) => run.composite)
      .filter((value): value is number => typeof value === 'number')
    const composite =
      input.sector === 'all' ? mean(composites, 2) : (perSector[0]?.composite ?? null)

    const coverages = perSector.map(coverageOf)
    const coverage = mean(coverages)
    const confidences = perSector
      .map((run) => run.meanConfidence)
      .filter((value): value is number => typeof value === 'number')
    const confidence = mean(confidences)

    const lastRunAt =
      perSector
        .map((run) => run.createdAt)
        .sort()
        .at(-1) ?? null

    const countedSectors =
      input.sector === 'all' ? new Set(perSector.map((run) => run.domain)) : new Set([input.sector])
    const counted = complete.filter(
      (run) => run.country.toLowerCase() === code && countedSectors.has(run.domain),
    )

    entries.push({
      code,
      registryStatus: record?.status ?? 'unregistered',
      sectors,
      state: resolveWorldState(
        { hasRun: perSector.length > 0, coverage, confidence },
        thresholds,
      ),
      composite,
      band: composite !== null ? maturityLabel(composite) : null,
      coverage,
      confidence,
      stale: isStale(lastRunAt, now, thresholds),
      runs: counted.length,
      lastRunAt,
    })
  }

  entries.sort(
    (a, b) => registryRank(a.registryStatus) - registryRank(b.registryStatus) || a.code.localeCompare(b.code),
  )

  return {
    schemaVersion: WORLD_SCHEMA_VERSION,
    frameworkVersion: WORLD_FRAMEWORK_VERSION,
    sector: input.sector,
    scope: input.scope,
    generatedAt: now.toISOString(),
    countries: entries,
  }
}
