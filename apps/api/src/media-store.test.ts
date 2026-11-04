import { describe, expect, test } from 'bun:test'
import sharp from 'sharp'
import { ObjectStore, sha256Hex } from '@sps/storage'
import { ATTACHMENT_FOLDER } from './cloudinary.js'
import {
  attachmentFileId,
  attachmentPath,
  attachmentSignature,
  createMediaStore,
  isAttachmentPublicId,
  parseAttachmentFileId,
  thumbnailKeyFor,
  verifyAttachmentSignature,
} from './media-store.js'

const SHA = 'a'.repeat(64)

/** In-memory stand-in for the S3/MinIO object store, so resolve runs offline. */
class MemoryStorage {
  readonly files = new Map<string, { data: Buffer; mime: string }>()

  keyFor(hash: string, mime: string): string {
    return `blobs/${hash.slice(0, 2)}/${hash}.${mime.slice('image/'.length)}`
  }

  async put(key: string, data: Uint8Array, mime: string): Promise<void> {
    this.files.set(key, { data: Buffer.from(data), mime })
  }

  async getStream(key: string) {
    const entry = this.files.get(key)
    if (!entry) return null
    const data = entry.data
    return {
      body: (async function* () {
        yield data
      })(),
      contentType: entry.mime,
      contentLength: entry.data.byteLength,
    }
  }

  async get(key: string) {
    const entry = this.files.get(key)
    return entry ? { data: entry.data, contentType: entry.mime } : null
  }
}

async function samplePng(): Promise<Buffer> {
  return sharp({ create: { width: 3, height: 2, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .png()
    .toBuffer()
}

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

describe('reading a stored image back by reference', () => {
  function s3Store() {
    const storage = new MemoryStorage()
    const store = createMediaStore({
      provider: 's3',
      storage: storage as unknown as ObjectStore,
      signingSecret: 'secret',
      thumbnailWidth: 480,
    })
    return { storage, store }
  }

  test('an S3 reference resolves to the bytes and a rebuilt signed reference', async () => {
    const { storage, store } = s3Store()
    const png = await samplePng()
    const sha256 = sha256Hex(png)
    await storage.put(storage.keyFor(sha256, 'image/png'), png, 'image/png')

    const resolved = await store.resolve({ id: sha256, mime: 'image/png', name: 'shot.png' })
    expect(resolved).not.toBeNull()
    expect(resolved!.data.equals(png)).toBe(true)
    expect(resolved!.ref).toMatchObject({
      id: sha256,
      provider: 's3',
      mime: 'image/png',
      name: 'shot.png',
      size: png.byteLength,
      width: 3,
      height: 2,
      sha256,
      url: attachmentPath('secret', `${sha256}.png`, 'full'),
      thumbnailUrl: attachmentPath('secret', `${sha256}.png`, 'thumb'),
    })
    // The internal object key never leaves the server.
    expect(resolved!.ref.key).toBeUndefined()
  })

  test('an id that is not a stored image is refused', async () => {
    const { store } = s3Store()
    const sha256 = sha256Hex(await samplePng())
    expect(await store.resolve({ id: sha256.toUpperCase(), mime: 'image/png', name: 'x' })).toBeNull()
    expect(await store.resolve({ id: '../../etc/passwd', mime: 'image/png', name: 'x' })).toBeNull()
    expect(await store.resolve({ id: sha256, mime: 'image/svg+xml', name: 'x' })).toBeNull()
  })

  test('an id whose object is gone resolves to null, not an error', async () => {
    const { store } = s3Store()
    const sha256 = sha256Hex(await samplePng())
    expect(await store.resolve({ id: sha256, mime: 'image/png', name: 'x' })).toBeNull()
  })

  test('bytes are stored and read under their real format, not the declared one', async () => {
    const { storage, store } = s3Store()
    const png = await samplePng()
    await expect(store.put({ data: png, mime: 'image/jpeg', name: 'lie.jpg' })).rejects.toThrow()
    const sha256 = sha256Hex(png)
    await storage.put(storage.keyFor(sha256, 'image/png'), png, 'image/png')
    expect(await store.resolve({ id: sha256, mime: 'image/jpeg', name: 'x' })).toBeNull()
  })
})

describe('Cloudinary attachment ids', () => {
  test('only our own folder and a content hash are accepted', () => {
    expect(isAttachmentPublicId(`${ATTACHMENT_FOLDER}/${SHA}`)).toBe(true)
    expect(isAttachmentPublicId(`${ATTACHMENT_FOLDER}/nested/${SHA}`)).toBe(true)
    expect(isAttachmentPublicId(`${ATTACHMENT_FOLDER}/${SHA.toUpperCase()}`)).toBe(false)
    expect(isAttachmentPublicId(`${ATTACHMENT_FOLDER}/not-a-hash`)).toBe(false)
    expect(isAttachmentPublicId(`other/${SHA}`)).toBe(false)
    expect(isAttachmentPublicId(`${ATTACHMENT_FOLDER}/../${SHA}`)).toBe(false)
    expect(isAttachmentPublicId(SHA)).toBe(false)
  })
})
