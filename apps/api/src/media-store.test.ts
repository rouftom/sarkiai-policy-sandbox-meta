import { describe, expect, test } from 'bun:test'
import { ObjectStore } from '@sps/storage'
import {
  attachmentFileId,
  attachmentPath,
  attachmentSignature,
  createMediaStore,
  parseAttachmentFileId,
  thumbnailKeyFor,
  verifyAttachmentSignature,
} from './media-store.js'

const SHA = 'a'.repeat(64)

describe('attachment identifiers', () => {
  test('a content hash and its MIME make a stable file id', () => {
    expect(attachmentFileId(SHA, 'image/png')).toBe(`${SHA}.png`)
    expect(attachmentFileId(SHA, 'image/jpeg')).toBe(`${SHA}.jpg`)
  })

  test('a MIME the store does not serve is refused', () => {
    expect(() => attachmentFileId(SHA, 'application/pdf')).toThrow()
  })

  test('the file id parses back to the hash and MIME', () => {
    expect(parseAttachmentFileId(`${SHA}.webp`)).toEqual({ sha256: SHA, mime: 'image/webp' })
  })

  test('anything that is not a content-addressed image is rejected', () => {
    expect(parseAttachmentFileId('../../etc/passwd')).toBeNull()
    expect(parseAttachmentFileId(`${SHA}.svg`)).toBeNull()
    expect(parseAttachmentFileId(`${SHA.toUpperCase()}.png`)).toBeNull()
    expect(parseAttachmentFileId(`${SHA}.png/full`)).toBeNull()
  })

  test('thumbnails have their own content-addressed key', () => {
    expect(thumbnailKeyFor(SHA)).toBe(`thumbs/aa/${SHA}.webp`)
  })
})

describe('attachment capabilities', () => {
  test('a signature is stable for the same file, variant and secret', () => {
    const first = attachmentSignature('secret', `${SHA}.png`, 'thumb')
    const second = attachmentSignature('secret', `${SHA}.png`, 'thumb')
    expect(first).toBe(second)
    expect(first).not.toBe(attachmentSignature('secret', `${SHA}.png`, 'full'))
    expect(first).not.toBe(attachmentSignature('other', `${SHA}.png`, 'thumb'))
  })

  test('a URL carries the file, the variant and the signature', () => {
    const url = attachmentPath('secret', `${SHA}.png`, 'thumb')
    expect(url.startsWith(`/v1/attachments/${SHA}.png/thumb?sig=`)).toBe(true)
  })

  test('verification accepts the emitted signature and rejects tampering', () => {
    const signature = attachmentSignature('secret', `${SHA}.png`, 'full')
    expect(verifyAttachmentSignature('secret', `${SHA}.png`, 'full', signature)).toBe(true)
    expect(verifyAttachmentSignature('secret', `${SHA}.png`, 'thumb', signature)).toBe(false)
    expect(verifyAttachmentSignature('secret', `${SHA}.jpg`, 'full', signature)).toBe(false)
    expect(verifyAttachmentSignature('secret', `${SHA}.png`, 'full', `${signature}x`)).toBe(false)
    expect(verifyAttachmentSignature('secret', `${SHA}.png`, 'full', '')).toBe(false)
  })
})

describe('media store selection', () => {
  const storage = new ObjectStore({
    endpoint: 'http://localhost:9000',
    bucket: 'test',
    accessKey: 'test',
    secretKey: 'test',
  })

  test('a deployment without Cloudinary credentials falls back to S3', () => {
    const keys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const
    const saved = keys.map((key) => process.env[key])
    for (const key of keys) delete process.env[key]
    try {
      const warnings: string[] = []
      const store = createMediaStore({
        provider: 'cloudinary',
        storage,
        signingSecret: 'secret',
        thumbnailWidth: 480,
        warn: (message) => warnings.push(message),
      })
      expect(store.provider).toBe('s3')
      expect(warnings).toHaveLength(1)
    } finally {
      keys.forEach((key, index) => {
        if (saved[index] !== undefined) process.env[key] = saved[index]
      })
    }
  })
})
