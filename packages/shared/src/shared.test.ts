import { describe, expect, test } from 'bun:test'
import {
  DIMENSION_FACTORS,
  READINESS_DIMENSION_IDS,
  READINESS_DIMENSIONS,
  READINESS_FACTORS,
  WORKFLOW_PROFILES,
  getWorkflowProfile,
  institutionsForDomain,
  institutionsForDomains,
  isLens,
} from './index'

describe('AI-readiness taxonomy', () => {
  test('6 factors / 13 dimensions', () => {
    expect(READINESS_FACTORS).toHaveLength(6)
    expect(READINESS_DIMENSIONS).toHaveLength(13)
  })

  test('dimensions are numbered 1..13 with unique short names', () => {
    expect(READINESS_DIMENSIONS.map((d) => d.id)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1))
    const names = READINESS_DIMENSIONS.map((d) => d.shortName)
    expect(new Set(names).size).toBe(13)
  })

  test('DIMENSION_FACTORS covers every dimension and only valid factors', () => {
    for (const id of READINESS_DIMENSION_IDS) {
      const factors = DIMENSION_FACTORS[id]
      expect(Array.isArray(factors)).toBe(true)
      expect(factors.length).toBeGreaterThan(0)
      for (const f of factors) expect(READINESS_FACTORS).toContain(f)
    }
  })
})

describe('workflow lenses', () => {
  test('exactly three lenses, gap analysis always on', () => {
    expect(Object.keys(WORKFLOW_PROFILES).sort()).toEqual(['hybrid', 'readiness', 'simulation'])
    for (const profile of Object.values(WORKFLOW_PROFILES)) {
      expect(profile.stages.gapAnalysis).toBe(true)
      expect(profile.stages.auditAndCot).toBe(true)
    }
  })

  test('simulation has neither readinessReport; readiness has no scenario', () => {
    expect(WORKFLOW_PROFILES.simulation.stages.readinessReport).toBe(false)
    expect(WORKFLOW_PROFILES.readiness.stages.scenario).toBe(false)
    expect(WORKFLOW_PROFILES.hybrid.stages.scenario).toBe(true)
    expect(WORKFLOW_PROFILES.hybrid.stages.readinessReport).toBe(true)
  })

  test('getWorkflowProfile / isLens', () => {
    expect(getWorkflowProfile('hybrid').lens).toBe('hybrid')
    expect(isLens('readiness')).toBe(true)
    expect(isLens('nope')).toBe(false)
  })
})

describe('institutions', () => {
  test('health domain exposes legal adviser, sector actors and a coordinator', () => {
    const ids = institutionsForDomain('health').map((i) => i.id)
    expect(ids).toContain('legal_advisor')
    expect(ids).toContain('ministry_health')
    expect(ids).toContain('data_protection_authority')
    expect(ids).toContain('coordinator')
  })

  test('every institution declares a mandate and a role', () => {
    for (const institution of institutionsForDomain('telecom')) {
      expect(institution.mandate.length).toBeGreaterThan(10)
      expect(['legal_advisor', 'institutional', 'coordinator', 'innovator']).toContain(institution.role)
    }
  })
})

describe('institutions of several sectors', () => {
  test('union of the sectors, each institution once', () => {
    const union = institutionsForDomains(['health', 'telecom']).map((i) => i.id)
    expect(new Set(union).size).toBe(union.length)
    for (const id of institutionsForDomain('health').map((i) => i.id)) expect(union).toContain(id)
    for (const id of institutionsForDomain('telecom').map((i) => i.id)) expect(union).toContain(id)
  })

  test('one sector gives the same list as before', () => {
    expect(institutionsForDomains(['education']).map((i) => i.id)).toEqual(institutionsForDomain('education').map((i) => i.id))
  })
})
