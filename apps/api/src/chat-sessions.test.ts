import { describe, expect, test } from 'bun:test'
import { ChatSessionStore } from './chat-sessions'

describe('chat sessions (memory)', () => {
  test('save, list, reopen and delete, scoped to the owner', async () => {
    const store = new ChatSessionStore({})
    const id = 'sess-abcdef12'
    await store.save({ id, userId: 'ada@sps.dev', title: 'Consentement ?', turns: [{ id: 't1', role: 'user', content: 'Consentement ?' }] })

    const mine = await store.list('ada@sps.dev')
    expect(mine).toEqual([expect.objectContaining({ id, title: 'Consentement ?', turnCount: 1 })])
    expect(await store.list('other@sps.dev')).toEqual([])

    const reopened = await store.get(id, 'ada@sps.dev')
    expect(reopened?.turns).toEqual([{ id: 't1', role: 'user', content: 'Consentement ?' }])
    expect(await store.get(id, 'other@sps.dev')).toBeNull()

    expect(await store.remove(id, 'other@sps.dev')).toBe(false)
    expect(await store.remove(id, 'ada@sps.dev')).toBe(true)
    expect(await store.list('ada@sps.dev')).toEqual([])
  })
})
