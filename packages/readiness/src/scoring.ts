/** 0–5 maturity scoring, composite aggregation and gap prioritization. */

import type { DimensionScore, ReadinessDimension, ReadinessScenario } from '@sps/shared'

export const MATURITY_LEVELS: Record<number, string> = {
  0: 'Not Started',
  1: 'Initial / Ad-hoc',
  2: 'Developing',
  3: 'Established',
  4: 'Advanced',
  5: 'Leading / Optimizing',
}

export function maturityLabel(score: number): string {
  const rounded = Math.max(0, Math.min(5, Math.round(score)))
  return MATURITY_LEVELS[rounded] ?? 'Unknown'
}

/** Weighted average across dimensions (default weight 1; 0 excludes). */
export function computeComposite(
  dimensions: DimensionScore[],
  weights: Partial<Record<ReadinessDimension, number>> = {},
): number {
  let weightedSum = 0
  let totalWeight = 0
  for (const dim of dimensions) {
    const weight = weights[dim.dimension] ?? 1
    if (weight <= 0) continue
    weightedSum += dim.score * weight
    totalWeight += weight
  }
  return totalWeight === 0 ? 0 : Number((weightedSum / totalWeight).toFixed(2))
}

export function computeOverall(dimensions: DimensionScore[]): number {
  if (dimensions.length === 0) return 0
  const sum = dimensions.reduce((acc, d) => acc + d.score, 0)
  return Number((sum / dimensions.length).toFixed(2))
}

export interface GapEntry {
  dimension: ReadinessDimension
  dimensionId: number
  score: number
  maturity: string
  gaps: string[]
  recommendations: string[]
  priority: 'HIGH' | 'MEDIUM'
}

/** Dimensions below "Established" (< 3.0), most severe first. */
export function computeGapAnalysis(dimensions: DimensionScore[]): GapEntry[] {
  return dimensions
    .filter((d) => d.score < 3)
    .map((d) => ({
      dimension: d.dimension,
      dimensionId: d.dimensionId,
      score: d.score,
      maturity: maturityLabel(d.score),
      gaps: d.gaps,
      recommendations: d.recommendations,
      priority: d.score < 1.5 ? ('HIGH' as const) : ('MEDIUM' as const),
    }))
    .sort((a, b) => a.score - b.score)
}

export function buildScenario(
  country: string,
  domain: ReadinessScenario['domain'],
  dimensions: DimensionScore[],
  weights?: Partial<Record<ReadinessDimension, number>>,
): ReadinessScenario {
  return {
    country,
    domain,
    generatedAt: new Date().toISOString(),
    dimensions,
    overall: computeOverall(dimensions),
    composite: computeComposite(dimensions, weights),
    weights,
  }
}
