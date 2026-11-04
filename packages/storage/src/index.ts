/**
 * Content-addressed object storage (MinIO / S3-compatible), local & sovereign.
 *
 * Objects are keyed by their SHA-256 so identical uploads dedupe naturally and
 * the audit trail can reference a stable hash.
 */

import { createHash } from 'node:crypto'
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

export interface StorageConfig {
  endpoint: string
  bucket: string
  accessKey: string
  secretKey: string
  region?: string
  forcePathStyle?: boolean
}

export interface StoredObject {
  key: string
  sha256: string
  mime: string
  size: number
  /** True when the object already existed (deduped). */
  existed: boolean
}

/** One readable object: its bytes as a Node stream, plus the HTTP metadata. */
export interface ObjectStream {
  /** Node `Readable` (the S3 response body), piped straight to the HTTP response. */
  body: AsyncIterable<Uint8Array>
  contentType?: string
  contentLength?: number
  etag?: string
}

const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

export class ObjectStore {
  private readonly client: S3Client
  private readonly bucket: string

  constructor(config: StorageConfig) {
    this.bucket = config.bucket
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region ?? 'us-east-1',
      forcePathStyle: config.forcePathStyle ?? true,
      credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    })
  }

  keyFor(hash: string, mime: string): string {
    const ext = EXT[mime] ?? 'bin'
    return `blobs/${hash.slice(0, 2)}/${hash}.${ext}`
  }

  async putContentAddressed(data: Uint8Array, mime: string): Promise<StoredObject> {
    const hash = sha256Hex(data)
    const key = this.keyFor(hash, mime)

    let existed = false
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      existed = true
    } catch {
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mime }),
      )
    }

    return { key, sha256: hash, mime, size: data.byteLength, existed }
  }

  async get(key: string): Promise<{ data: Uint8Array; contentType?: string }> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    const bytes = await result.Body!.transformToByteArray()
    return { data: bytes, contentType: result.ContentType }
  }

  /**
   * Opens one object for streaming. The caller pipes `body` to the response:
   * an attachment is never buffered whole in the API process.
   */
  async getStream(key: string): Promise<ObjectStream | null> {
    try {
      const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      if (!result.Body) return null
      return {
        body: result.Body as unknown as AsyncIterable<Uint8Array>,
        ...(result.ContentType ? { contentType: result.ContentType } : {}),
        ...(typeof result.ContentLength === 'number' ? { contentLength: result.ContentLength } : {}),
        ...(result.ETag ? { etag: result.ETag } : {}),
      }
    } catch {
      return null
    }
  }

  /** Puts one object at an explicit key (thumbnails are not content-addressed by mime). */
  async put(key: string, data: Uint8Array, mime: string): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: data, ContentType: mime }))
  }
}
