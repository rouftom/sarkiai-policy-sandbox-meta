import { describe, expect, test } from 'bun:test'
import type { DimensionScore } from '@sps/shared'
import { applyPropagation, computeComposite, computeGapAnalysis, maturityLabel, propagate } from './index'

function score(dimensionId: number, dimension: string, value: number): DimensionScore {
  return {
    dimension: dimension as DimensionScore['dimension'],
    dimensionId,
    dimensionName: dimension,
    score: value,
    maturity: maturityLabel(value),
    evidence: [],
    gaps: [],
    recommendations: [],
    confidence: 0.8,
  }
}

describe('maturity scoring', () => {
  test('maturityLabel maps 0..5', () => {
    expect(maturityLabel(0)).toBe('Not Started')
    expect(maturityLabel(3)).toBe('Established')
    expect(maturityLabel(4.6)).toBe('Leading / Optimizing')
    expect(maturityLabel(9)).toBe('Leading / Optimizing')
  })

  test('computeComposite respects weights and excludes 0-weight', () => {
    const dims = [score(1, 'data_marketplace', 2), score(13, 'digital_infrastructure', 5)]
    expect(computeComposite(dims)).toBe(3.5)
    expect(computeComposite(dims, { digital_infrastructure: 3 })).toBeCloseTo(4.25, 5)
    expect(computeComposite(dims, { data_marketplace: 0 })).toBe(5)
  })

  test('computeGapAnalysis keeps < 3.0 and sorts ascending', () => {
    const dims = [score(1, 'data_marketplace', 4), score(13, 'digital_infrastructure', 1), score(5, 'ai_integration', 2.5)]
    const gaps = computeGapAnalysis(dims)
    expect(gaps.map((g) => g.dimensionId)).toEqual([13, 5])
    expect(gaps[0]!.priority).toBe('HIGH')
    expect(gaps[1]!.priority).toBe('MEDIUM')
  })
})

describe('causal what-if propagation', () => {
  test('propagate D13 infra +1 moves D5/D6/D11 at the first hop', () => {
    const result = propagate({ 13: 1 }, { maxDepth: 1 })
    expect(result[13]).toBe(1)
    expect(result[5]).toBeCloseTo(0.5, 5)
    expect(result[6]).toBeCloseTo(0.3, 5)
    expect(result[11]).toBeCloseTo(0.3, 5)
  })

  test('propagate accumulates multi-hop contributions with decay', () => {
    // depth 1: D5(0.5)->D6 (0.5*0.4*0.5=0.1) and D11(0.3)->D6 (0.3*0.3*0.5=0.045)
    const result = propagate({ 13: 1 }, { maxDepth: 2 })
    expect(result[6]).toBeCloseTo(0.445, 5)
    expect(result[12]).toBeCloseTo(0.075, 5) // D5 -> D12
  })

  test('applyPropagation clamps to 0..5 and records causal effect', () => {
    const dims = [score(13, 'digital_infrastructure', 4), score(5, 'ai_integration', 1)]
    const { projected, effects } = applyPropagation(dims, { digital_infrastructure: 1 })
    const d5 = projected.find((d) => d.dimensionId === 5)!
    expect(d5.score).toBeCloseTo(1.5, 5)
    expect(d5.causalEffect).toBeCloseTo(0.5, 5)
    expect(effects.ai_integration).toBeCloseTo(0.5, 5)
  })

  test('applyPropagation clamps to 5', () => {
    const dims = [score(13, 'digital_infrastructure', 5)]
    const { projected } = applyPropagation(dims, { digital_infrastructure: 1 })
    expect(projected.find((d) => d.dimensionId === 13)!.score).toBe(5)
  })
})
