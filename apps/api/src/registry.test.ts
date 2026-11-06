import { describe, expect, test } from 'bun:test'
import { RegistryError, RegistryStore } from './registry'

function store() {
  return new RegistryStore({})
}

describe('registry store (memory)', () => {
  test('lists the built-in roles, institutions and agents', async () => {
    const s = store()
    expect((await s.list('role')).length).toBe(7)
    expect((await s.list('agent')).some((a) => a.id === 'ministry_health')).toBe(true)
    expect((await s.list('institution')).some((i) => i.id === 'data_protection_authority')).toBe(true)
  })

  test('the engine view keeps the built-in catalogue by default', async () => {
    const specs = await store().agentSpecs({ domains: ['health'] })
    expect(specs.map((s) => s.id)).toContain('ministry_health')
    expect(specs.find((s) => s.id === 'ministry_health')?.role).toBe('institutional')
  })

  test('an edit creates a new version and overrides the built-in', async () => {
    const s = store()
    const updated = await s.update('institution', 'ministry_health', { legalBasis: [{ filename: 'loi_96_03.txt', article: '2' }] }, 'admin@x')
    expect(updated.version).toBe(2)
    expect((await s.get('institution', 'ministry_health'))?.legalBasis).toHaveLength(1)
    expect((await s.versions('institution', 'ministry_health'))[0]?.version).toBe(2)
  })

  test('the capabilities of a built-in role cannot change', async () => {
    await expect(store().update('role', 'mandated', { capabilities: ['retrieve'] }, 'admin@x')).rejects.toThrow(RegistryError)
  })

  test('a new mandated agent starts as a draft and needs a founded institution to activate', async () => {
    const s = store()
    await s.create('institution', { id: 'cnps', name: 'Social Insurance Fund', country: 'CM', mandate: 'Social security.', legalBasis: [], domains: ['public_services'], mustNot: [] }, 'admin@x')
    const agent = await s.create('agent', { id: 'cnps_agent', name: 'Social Insurance Fund', roleId: 'mandated', institutionId: 'cnps', instructions: '', informationScope: 'domain_events', color: 'text-teal-500' }, 'admin@x')
    expect(agent.status).toBe('draft')
    await expect(s.setStatus('agent', 'cnps_agent', 'active', 'admin@x')).rejects.toMatchObject({ code: 'activation_blocked' })
    await s.update('institution', 'cnps', { legalBasis: [{ filename: 'loi_2024_protection_donnees.txt', article: '1' }] }, 'admin@x')
    await s.setStatus('institution', 'cnps', 'active', 'admin@x')
    expect((await s.setStatus('agent', 'cnps_agent', 'active', 'admin@x')).status).toBe('active')
    expect((await s.agentSpecs({ domains: ['public_services'] })).map((x) => x.id)).toContain('cnps_agent')
  })

  test('a retired agent leaves the engine view; a chosen set is honoured', async () => {
    const s = store()
    await s.setStatus('agent', 'telecom_regulator', 'retired', 'admin@x')
    expect((await s.agentSpecs()).map((x) => x.id)).not.toContain('telecom_regulator')
    expect((await s.agentSpecs({ ids: ['ministry_health'] })).map((x) => x.id)).toEqual(['ministry_health'])
  })

  test('a non-Meta model blocks activation', async () => {
    const s = store()
    await expect(s.update('agent', 'ministry_health', { model: 'gpt-4o' }, 'admin@x')).rejects.toMatchObject({ code: 'activation_blocked' })
  })
})
