import { describe, expect, test } from 'bun:test'
import type { TurnAttachment } from '@/components/ai/display/chat-message'
import type { AttachmentRefDto } from './api'
import { galleryRefs, storedRefFromTurn } from './attachment-gallery'

const ref = (id: string): AttachmentRefDto => ({
  id,
  provider: 's3',
  mime: 'image/png',
  name: `${id}.png`,
  size: 10,
  url: `/v1/attachments/${id}.png/full?sig=x`,
  thumbnailUrl: `/v1/attachments/${id}.png/thumb?sig=x`,
})

const turnImage = (id: string): TurnAttachment => ({
  id,
  url: `/v1/attachments/${id}.png/full?sig=x`,
  thumbnailUrl: `/v1/attachments/${id}.png/thumb?sig=x`,
  mime: 'image/png',
  name: `${id}.png`,
  provider: 's3',
})

describe('media picker library', () => {
  test('a stored turn image becomes a re-attachable reference', () => {
    const image = storedRefFromTurn(turnImage('a'))
    expect(image).toMatchObject({ id: 'a', mime: 'image/png', provider: 's3' })
    expect(image?.thumbnailUrl).toContain('/thumb?sig=')
  })

  test('a legacy data URL is not offered: its bytes left the store', () => {
    expect(storedRefFromTurn({ url: 'data:image/png;base64,AAAA', mime: 'image/png' })).toBeNull()
    expect(storedRefFromTurn({ url: 'blob:http://localhost/1', mime: 'image/png' })).toBeNull()
    expect(storedRefFromTurn({ url: '/v1/attachments/x.png/full?sig=y' })).toBeNull()
  })

  test('the composer holds the newest images, then turns newest to oldest', () => {
    const turns = [
      { attachments: [turnImage('old')] },
      { content: 'no image' },
      { attachments: [turnImage('new')] },
    ]
    expect(galleryRefs(turns, [ref('held')]).map((image) => image.id)).toEqual(['held', 'new', 'old'])
  })

  test('the same image on many turns appears once', () => {
    const turns = [
      { attachments: [turnImage('same')] },
      { attachments: [turnImage('same'), turnImage('other')] },
    ]
    // The newest turn is read first, in the order the message showed its images.
    expect(galleryRefs(turns).map((image) => image.id)).toEqual(['same', 'other'])
  })

  test('a conversation with no stored image has an empty library', () => {
    expect(galleryRefs([{ attachments: [{ url: 'data:image/png;base64,AAAA' }] }])).toEqual([])
    expect(galleryRefs([])).toEqual([])
  })
})
