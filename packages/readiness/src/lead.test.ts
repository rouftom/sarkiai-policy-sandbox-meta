import { describe, expect, test } from 'bun:test'
import { READINESS_DIMENSIONS } from '@sps/shared'
import { resolveLeadStep, type LeadState } from './index'
import type { ReadinessDimension } from '@sps/shared'

const [first, second, third] = READINESS_DIMENSIONS.map((d) => d.shortName)

const state: LeadState = {
  country: 'cm',
  domain: 'health',
  remaining: [
    { dimension: first!, dimensionId: 1, name: 'First' },
    { dimension: second!, dimensionId: 2, name: 'Second' },
  ],
  done: [{ dimension: third!, dimensionId: 3, name: 'Third', score: 2, confidence: 0.6, gaps: 2 }],
  decisionsLeft: 10,
}

describe('orchestrated readiness: lead decisions', () => {
  test('an evaluation of a pending dimension is taken as decided, with its hint', () => {
    const step = resolveLeadStep({ action: 'evaluate', dimension: second!, hint: 'focus', reason: 'depends on the first' }, state)
    expect(step).toEqual({ action: 'evaluate', dimension: second!, hint: 'focus', reason: 'depends on the first', fallback: false })
  })

  test('re-scoring a scored dimension is allowed; re-scoring a pending one falls back', () => {
    expect(resolveLeadStep({ action: 'reevaluate', dimension: third!, hint: 'x', reason: 'low confidence' }, state).action).toBe('reevaluate')
    const step = resolveLeadStep({ action: 'reevaluate', dimension: second!, reason: 'x' }, state)
    expect(step).toMatchObject({ action: 'evaluate', dimension: first, fallback: true })
  })

  test('an unknown dimension falls back to the next pending one', () => {
    const step = resolveLeadStep({ action: 'evaluate', dimension: 'unknown' as ReadinessDimension, reason: 'x' }, state)
    expect(step).toMatchObject({ action: 'evaluate', dimension: first, fallback: true })
  })

  test('finishing is refused while dimensions are pending', () => {
    expect(resolveLeadStep({ action: 'finish', reason: 'done' }, state)).toMatchObject({ action: 'evaluate', fallback: true })
  })

  test('finishing is accepted once every dimension is scored', () => {
    const complete: LeadState = { ...state, remaining: [] }
    expect(resolveLeadStep({ action: 'finish', reason: 'all scored' }, complete)).toEqual({ action: 'finish', reason: 'all scored', fallback: false })
  })

  test('no decision at all (no lead, or an error) goes in order, then finishes', () => {
    expect(resolveLeadStep(null, state)).toMatchObject({ action: 'evaluate', dimension: first, fallback: true })
    expect(resolveLeadStep(null, { ...state, remaining: [] })).toMatchObject({ action: 'finish', fallback: true })
  })
})
