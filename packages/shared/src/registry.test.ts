import { describe, expect, test } from 'bun:test'
import { BUILTIN_ROLES, activationProblems, builtinAgents, builtinInstitutions, isMetaModelId, toInstitutionSpec } from './registry'
import { INSTITUTIONS } from './agents'

describe('agents registry', () => {
  test('every built-in role is active and uses known capabilities', () => {
    expect(BUILTIN_ROLES.map((r) => r.id)).toEqual(['mandated', 'legal_advisor', 'coordinator', 'validator', 'worker', 'reporter', 'evaluator'])
    expect(BUILTIN_ROLES.every((r) => r.builtIn && r.status === 'active')).toBe(true)
  })

  test('the engine catalogue becomes built-in agents and institutions', () => {
    const agents = builtinAgents()
    expect(agents).toHaveLength(INSTITUTIONS.length)
    const mandated = agents.filter((a) => a.roleId === 'mandated')
    expect(mandated.every((a) => a.institutionId === a.id)).toBe(true)
    expect(builtinInstitutions().map((i) => i.id)).toEqual(mandated.map((a) => a.id))
  })

  test('a built-in agent maps back to the same engine spec', () => {
    const agent = builtinAgents().find((a) => a.id === 'ministry_health')!
    const institution = builtinInstitutions().find((i) => i.id === 'ministry_health')
    const spec = toInstitutionSpec(agent, BUILTIN_ROLES[0]!, institution)
    const original = INSTITUTIONS.find((i) => i.id === 'ministry_health')!
    expect(spec).toMatchObject({ id: original.id, name: original.name, role: 'institutional', mandate: original.mandate, domains: original.domains })
  })

  test('a mandated agent needs an active institution with a legal basis', () => {
    const agent = { ...builtinAgents()[1]!, builtIn: false, institutionId: 'x' }
    const institution = { ...builtinInstitutions()[0]!, builtIn: false, legalBasis: [] }
    expect(activationProblems(agent, BUILTIN_ROLES[0], undefined)).toContain('institution_required')
    expect(activationProblems(agent, BUILTIN_ROLES[0], institution)).toContain('legal_basis_required')
    expect(activationProblems(agent, BUILTIN_ROLES[0], { ...institution, legalBasis: [{ filename: 'loi.txt', article: '41' }] })).toEqual([])
  })

  test('only Meta model ids are accepted', () => {
    expect(isMetaModelId('muse-spark-1.3')).toBe(true)
    expect(isMetaModelId('meta-models/muse-spark-open-1026')).toBe(true)
    expect(isMetaModelId('muse-glimmer')).toBe(true)
    expect(isMetaModelId('gpt-4o')).toBe(false)
    expect(isMetaModelId('llama3')).toBe(false)
  })
})
