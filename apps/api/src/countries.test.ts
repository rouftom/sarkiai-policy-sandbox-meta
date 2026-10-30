import { describe, expect, test } from 'bun:test'
import { COUNTRY_SECTORS, CountryStore } from './countries'

describe('CountryStore', () => {
  test('seeds Cameroon only, then creates, edits, re-sectors and deletes a country', async () => {
    const store = new CountryStore({})

    const seeded = await store.list()
    expect(seeded.map((country) => country.code)).toEqual(['cm'])
    expect(seeded[0]?.status).toBe('active')
    expect(seeded[0]?.sectors).toEqual([...COUNTRY_SECTORS])

    expect(await store.add({ code: 'CM', name: 'Duplicate', createdBy: 'operator@example.org' })).toBeNull()

    const created = await store.add({
      code: 'NG',
      name: 'Nigeria',
      nameFr: 'Nigéria',
      region: 'West Africa',
      currency: 'NGN',
      timezone: 'Africa/Lagos',
      languages: ['en'],
      sectors: ['health', 'telecom'],
      status: 'planned',
      createdBy: 'operator@example.org',
    })
    expect(created?.code).toBe('ng')
    expect(created?.sectors).toEqual(['health', 'telecom'])
    expect(created?.status).toBe('planned')
    expect(created?.createdBy).toBe('operator@example.org')

    expect((await store.list()).map((country) => country.code)).toEqual(['cm', 'ng'])

    const updated = await store.update('ng', { name: 'Federal Republic of Nigeria', sectors: ['education'] })
    expect(updated?.name).toBe('Federal Republic of Nigeria')
    expect(updated?.nameFr).toBe('Nigéria')
    expect(updated?.sectors).toEqual(['education'])
    expect(updated?.createdAt).toBe(created?.createdAt)

    expect((await store.setSectors('ng', ['agriculture', 'public_services']))?.sectors).toEqual([
      'public_services',
      'agriculture',
    ])

    // An empty list falls back to every known sector (the API rejects it first).
    expect((await store.update('ng', { sectors: [] }))?.sectors).toEqual([...COUNTRY_SECTORS])

    expect(await store.get('NG')).not.toBeNull()
    expect(await store.get('zz')).toBeNull()
    expect(await store.update('zz', { name: 'Ghost' })).toBeNull()

    expect(await store.remove('ng')).toBe(true)
    expect(await store.remove('ng')).toBe(false)
  })
})
