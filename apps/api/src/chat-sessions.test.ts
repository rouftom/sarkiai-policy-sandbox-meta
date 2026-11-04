import { describe, expect, test } from 'bun:test'
import { ChatSessionStore, sanitizeTurns } from './chat-sessions'

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

const SHA = 'b'.repeat(64)
const url = `/v1/attachments/${SHA}.png/full?sig=abc_DEF-123`
const thumbnailUrl = `/v1/attachments/${SHA}.png/thumb?sig=xyz_789`

describe('sanitizeTurns', () => {
  test('keeps a content-addressed reference and nothing internal', () => {
    const turns = sanitizeTurns([
      {
        role: 'user',
        content: 'What does this chart show?',
        attachments: [
          {
            id: SHA,
            provider: 's3',
            mime: 'image/png',
            name: 'chart.png',
            size: 1234,
            width: 800,
            height: 600,
            sha256: SHA,
            key: `blobs/bb/${SHA}.png`,
            url,
            thumbnailUrl,
            dataBase64: 'AAAA',
          },
        ],
      },
    ])
    expect(turns[0]?.attachments).toEqual([
      {
        id: SHA,
        provider: 's3',
        mime: 'image/png',
        name: 'chart.png',
        size: 1234,
        width: 800,
        height: 600,
        sha256: SHA,
        url,
        thumbnailUrl,
      },
    ])
  })

  test('keeps a Cloudinary reference', () => {
    const cloudinaryUrl = 'https://res.cloudinary.com/demo/image/upload/v1/sps/attachments/x.png'
    const turns = sanitizeTurns([
      {
        attachments: [
          {
            id: 'sps/attachments/x',
            provider: 'cloudinary',
            mime: 'image/png',
            name: 'x.png',
            size: 3,
            url: cloudinaryUrl,
            thumbnailUrl: 'https://res.cloudinary.com/demo/image/upload/c_limit,w_480,f_webp/x.webp',
          },
        ],
      },
    ])
    expect(turns[0]?.attachments).toHaveLength(1)
  })

  test('drops a base64 or data-URL attachment instead of storing it', () => {
    const turns = sanitizeTurns([
      {
        role: 'user',
        content: 'legacy',
        attachments: [
          { url: 'data:image/png;base64,AAAA', mime: 'image/png', name: 'legacy.png' },
          { url, thumbnailUrl, provider: 's3', mime: 'image/png', name: 'keep.png', size: 1 },
        ],
      },
    ])
    expect(turns[0]?.attachments).toHaveLength(1)
    expect((turns[0]?.attachments as Array<{ name: string }>)[0]?.name).toBe('keep.png')
  })

  test('removes the attachments key when nothing valid remains', () => {
    const turns = sanitizeTurns([{ role: 'assistant', content: 'answer', attachments: [{ url: 'https://example.com/a.png' }] }])
    expect(turns[0]).toEqual({ role: 'assistant', content: 'answer' })
  })

  test('leaves turns without attachments untouched', () => {
    const turn = { role: 'assistant', content: 'answer', citations: [] }
    expect(sanitizeTurns([turn])[0]).toBe(turn)
  })
})
