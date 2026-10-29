import { describe, expect, test } from 'bun:test'
import { ScenarioRunStore } from './scenario-runs'

const base = {
  id: 'health-data-breach-1',
  userId: 'op',
  country: 'cm',
  domain: 'health',
  lang: 'fr' as const,
  title: 'Fuite de données de santé dans un hôpital public',
  released: 0,
  total: 3,
  reports: [],
  status: 'running' as const,
}

describe('scenario runs', () => {
  test('a failed run keeps its reason, and resuming it clears the reason', async () => {
    const store = new ScenarioRunStore({})
    await store.create(base)
    await store.update(base.id, 'op', { released: 1, status: 'running' })
    await store.update(base.id, 'op', { status: 'failed', failure: 'provider timeout' })
    expect((await store.list('op'))[0]!.failure).toBe('provider timeout')
    await store.update(base.id, 'op', { status: 'running' })
    const resumed = await store.get(base.id, 'op')
    expect(resumed?.status).toBe('running')
    expect(resumed?.failure).toBeUndefined()
    expect(resumed?.released).toBe(1)
  })

  test('progress and completion are saved; each operator only sees their runs', async () => {
    const store = new ScenarioRunStore({})
    await store.create(base)
    await store.update(base.id, 'op', { released: 3, status: 'complete' })
    const list = await store.list('op')
    expect(list).toHaveLength(1)
    expect(list[0]!.status).toBe('complete')
    expect(list[0]!.released).toBe(3)
    expect(await store.list('other')).toEqual([])
    expect(await store.get(base.id, 'other')).toBeNull()
    expect(await store.update(base.id, 'other', { status: 'failed', failure: 'x' })).toBeNull()
  })
})
