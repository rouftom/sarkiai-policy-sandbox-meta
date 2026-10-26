import { describe, expect, test } from 'bun:test'
import { ScenarioEngine, type ScenarioDefinition } from './index'

const definition: ScenarioDefinition = {
  id: 'test-scenario',
  domain: 'health',
  country: 'cm',
  title: 'Test breach',
  lens: 'simulation',
  agents: ['ministry_health', 'cyber_agency', 'data_protection_authority', 'coordinator'],
  events: [
    { sequence: 1, releaseChunk: 0, title: 'Detected', payload: 'p1', visibleTo: ['ministry_health', 'cyber_agency'] },
    { sequence: 2, releaseChunk: 1, title: 'Widens', payload: 'p2', visibleTo: ['ministry_health', 'data_protection_authority'] },
    { sequence: 3, releaseChunk: 2, title: 'Pressure', payload: 'p3', visibleTo: ['data_protection_authority', 'coordinator'] },
  ],
}

describe('ScenarioEngine', () => {
  test('toRun assigns ids, runId and draft status', () => {
    const run = new ScenarioEngine(definition).toRun()
    expect(run.id).toBe('test-scenario')
    expect(run.status).toBe('draft')
    expect(run.events).toHaveLength(3)
    for (const event of run.events) {
      expect(event.runId).toBe('test-scenario')
      expect(event.id).toMatch(/^test-scenario-e/)
    }
  })

  test('release yields one batch per tick, in order', async () => {
    const engine = new ScenarioEngine(definition)
    const batches: number[][] = []
    for await (const batch of engine.release()) {
      batches.push(batch.map((e) => e.sequence))
    }
    expect(batches).toEqual([[1], [2], [3]])
  })

  test('release calls onBeforeRelease before each event', async () => {
    const seen: number[] = []
    const engine = new ScenarioEngine(definition)
    for await (const _batch of engine.release({ onBeforeRelease: (e) => void seen.push(e.sequence) })) {
      // drain
    }
    expect(seen).toEqual([1, 2, 3])
  })

  test('information asymmetry: agent only sees its visibleTo events', () => {
    const engine = new ScenarioEngine(definition)
    expect(engine.eventsForAgent('cyber_agency', 2).map((e) => e.sequence)).toEqual([1])
    expect(engine.eventsForAgent('data_protection_authority', 2).map((e) => e.sequence)).toEqual([2, 3])
    expect(engine.eventsForAgent('coordinator', 0)).toEqual([])
  })
})
