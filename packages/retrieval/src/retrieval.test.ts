import { describe, expect, test } from 'bun:test'
import { rrf } from './index'

describe('reciprocal rank fusion', () => {
  test('an item present in both lists outranks items in a single list', () => {
    const a = [{ id: 'x' }, { id: 'y' }]
    const b = [{ id: 'y' }, { id: 'z' }]
    const fused = rrf([
      { items: a, weight: 0.5 },
      { items: b, weight: 0.5 },
    ])
    expect(fused[0]!.id).toBe('y')
    expect(fused.map((f) => f.id)).toContain('x')
    expect(fused.map((f) => f.id)).toContain('z')
  })

  test('weights bias the ranking', () => {
    const a = [{ id: 'x' }]
    const b = [{ id: 'z' }]
    const fused = rrf([
      { items: a, weight: 0.9 },
      { items: b, weight: 0.1 },
    ])
    expect(fused[0]!.id).toBe('x')
  })
})
