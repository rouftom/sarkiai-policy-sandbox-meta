import { describe, expect, test } from 'bun:test'
import { institutionsForDomain, type Domain } from '@sps/shared'
import { SCENARIO_DOMAINS, authoredScenarios, scenarioFor } from './scenarios'

const SECTORS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

describe('authored scenarios', () => {
  test('one scenario per sector, all five', () => {
    expect([...SCENARIO_DOMAINS].sort()).toEqual([...SECTORS].sort())
  })

  test('agents are the institutions of the sector, and each event is visible to agents of the scenario', () => {
    for (const domain of SECTORS) {
      const scenario = scenarioFor(domain, 'cm')
      const agents = institutionsForDomain(domain).map((institution) => institution.id)
      expect(scenario.agents).toEqual(agents)
      for (const event of scenario.events) {
        expect(event.visibleTo.length).toBeGreaterThan(0)
        for (const id of event.visibleTo) expect(scenario.agents).toContain(id)
      }
    }
  })

  test('three events per scenario, released in order, sequences unique', () => {
    for (const scenario of authoredScenarios()) {
      expect(scenario.events).toHaveLength(3)
      expect(scenario.events.map((event) => event.sequence)).toEqual([1, 2, 3])
      expect(scenario.events.map((event) => event.releaseChunk)).toEqual([0, 1, 2])
    }
  })

  test('every title and payload exists in both languages, and the two differ', () => {
    for (const scenario of authoredScenarios()) {
      expect(scenario.title.en.length).toBeGreaterThan(0)
      expect(scenario.title.fr.length).toBeGreaterThan(0)
      expect(scenario.title.fr).not.toBe(scenario.title.en)
      for (const event of scenario.events) {
        for (const text of [event.title, event.payload]) {
          expect(text.en.length).toBeGreaterThan(0)
          expect(text.fr.length).toBeGreaterThan(0)
          expect(text.fr).not.toBe(text.en)
        }
      }
    }
  })

  test('the language of a scenario is the one requested', () => {
    const en = scenarioFor('health', 'cm', 'en')
    const fr = scenarioFor('health', 'cm', 'fr')
    expect(en.title).toBe(authoredScenarios().find((s) => s.domain === 'health')!.title.en)
    expect(fr.title).toBe(authoredScenarios().find((s) => s.domain === 'health')!.title.fr)
    expect(fr.events[0]!.payload).not.toBe(en.events[0]!.payload)
  })

  test('the health scenario keeps the id the table-top drill refers to', () => {
    expect(scenarioFor('health', 'cm').id).toBe('health-data-breach')
  })
})
