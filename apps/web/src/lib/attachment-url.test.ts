import { describe, expect, test } from 'bun:test'
import { API_URL } from './api'
import { resolveAttachmentUrl } from './attachment-url'

describe('resolveAttachmentUrl', () => {
  test('prefixes a relative signed S3 URL with the API origin', () => {
    expect(resolveAttachmentUrl('/v1/attachments/abc.png/thumb?sig=x')).toBe(
      `${API_URL.replace(/\/$/, '')}/v1/attachments/abc.png/thumb?sig=x`,
    )
  })

  test('leaves an absolute Cloudinary URL alone', () => {
    const url = 'https://res.cloudinary.com/demo/image/upload/v1/sps/attachments/x.webp'
    expect(resolveAttachmentUrl(url)).toBe(url)
  })

  test('leaves a local preview (data or blob) alone', () => {
    expect(resolveAttachmentUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
    expect(resolveAttachmentUrl('blob:http://localhost/123')).toBe('blob:http://localhost/123')
  })
})
