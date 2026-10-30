import { describe, expect, test } from 'bun:test'
import { NotificationContactStore } from './notification-contacts'

describe('NotificationContactStore', () => {
  test('edits in place, keeps provenance, and only blocks duplicates of another contact', async () => {
    const store = new NotificationContactStore({})

    const first = await store.add({
      name: 'Focal point',
      email: 'focal@example.org',
      phone: '+237612345678',
      country: 'CM',
      channels: { email: true, whatsapp: true },
      createdBy: 'operator@example.org',
    })
    const second = await store.add({
      name: 'Backup',
      email: 'backup@example.org',
      channels: { email: true, whatsapp: false },
      createdBy: 'operator@example.org',
    })

    const updated = await store.update(first.id, {
      name: 'Focal point (night)',
      email: 'night@example.org',
      channels: { email: true, whatsapp: false },
    })

    expect(updated?.name).toBe('Focal point (night)')
    expect(updated?.phone).toBeUndefined()
    expect(updated?.createdBy).toBe('operator@example.org')
    expect(updated?.createdAt).toBe(first.createdAt)
    expect((await store.get(first.id))?.email).toBe('night@example.org')

    expect((await store.duplicate({ email: 'night@example.org' }))?.id).toBe(first.id)
    expect(await store.duplicate({ email: 'night@example.org' }, first.id)).toBeNull()
    expect(await store.duplicate({ email: 'backup@example.org' }, first.id)).not.toBeNull()

    expect(
      await store.update('nc_missing', { name: 'Ghost', channels: { email: false, whatsapp: false } }),
    ).toBeNull()
    expect(await store.remove(second.id)).toBe(true)
    expect(await store.remove(second.id)).toBe(false)
  })
})
