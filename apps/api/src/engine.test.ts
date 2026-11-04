import { describe, expect, test } from 'bun:test'
import { createEngine } from './engine'

/**
 * The engine keeps one stack per model id. Operators on different models must
 * never share an orchestrator, a readiness lens or a retriever.
 */
describe('model stacks', () => {
  test('builds one stack per model id and reuses it', () => {
    const engine = createEngine()
    const glimmer = engine.stackFor('muse-glimmer')
    expect(engine.stackFor('muse-glimmer')).toBe(glimmer)
    expect(engine.stackFor('muse-spark')).not.toBe(glimmer)
    // No preference means the deployment fallback, same stack as an empty id.
    expect(engine.stackFor(undefined)).toBe(engine.stackFor(''))
  })
})
