import { describe, expect, test } from 'bun:test'
import { WorkGate } from './concurrency.js'

describe('WorkGate', () => {
  test('admits work up to the per-operator cap', () => {
    const gate = new WorkGate({ perOperator: 2, global: 10 })
    expect(gate.tryEnter('a@example.com')).not.toBeNull()
    expect(gate.tryEnter('a@example.com')).not.toBeNull()
    expect(gate.tryEnter('a@example.com')).toBeNull()
    expect(gate.activeFor('a@example.com')).toBe(2)
  })

  test('one operator cannot consume the global cap', () => {
    const gate = new WorkGate({ perOperator: 2, global: 3 })
    gate.tryEnter('a@example.com')
    gate.tryEnter('a@example.com')
    expect(gate.tryEnter('b@example.com')).not.toBeNull()
    expect(gate.tryEnter('c@example.com')).toBeNull()
    expect(gate.active).toBe(3)
  })

  test('a released lease frees its slot', () => {
    const gate = new WorkGate({ perOperator: 1, global: 1 })
    const lease = gate.tryEnter('a@example.com')
    expect(gate.tryEnter('b@example.com')).toBeNull()

    lease?.release()
    expect(gate.active).toBe(0)
    expect(gate.activeFor('a@example.com')).toBe(0)
    expect(gate.tryEnter('b@example.com')).not.toBeNull()
  })

  test('releasing twice does not free a second slot', () => {
    const gate = new WorkGate({ perOperator: 2, global: 2 })
    const first = gate.tryEnter('a@example.com')
    gate.tryEnter('a@example.com')
    first?.release()
    first?.release()

    expect(gate.activeFor('a@example.com')).toBe(1)
    expect(gate.tryEnter('a@example.com')).not.toBeNull()
  })

  test('the caps bound concurrency, not the number of callers', () => {
    const gate = new WorkGate({ perOperator: 1, global: 20 })
    const leases = Array.from({ length: 100 }, (_, index) => gate.tryEnter(`op${index}@example.com`))
    expect(leases.filter(Boolean)).toHaveLength(20)
    for (const lease of leases) lease?.release()
    expect(gate.active).toBe(0)
  })
})
