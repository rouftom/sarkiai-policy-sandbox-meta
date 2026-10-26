import { describe, expect, test } from 'bun:test'
import { ObjectStore, sha256Hex } from './index'

const store = new ObjectStore({
  endpoint: 'http://localhost:9000',
  bucket: 'test',
  accessKey: 'a',
  secretKey: 'b',
})

describe('content-addressed storage', () => {
  test('sha256Hex is deterministic and 64 hex chars', () => {
    const hash = sha256Hex(new TextEncoder().encode('hello'))
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
    expect(hash).toHaveLength(64)
  })

  test('keyFor shards by first 2 hex chars and maps mime to extension', () => {
    expect(store.keyFor('abcdef1234', 'image/png')).toBe('blobs/ab/abcdef1234.png')
    expect(store.keyFor('deadbeef00', 'application/pdf')).toBe('blobs/de/deadbeef00.pdf')
    expect(store.keyFor('0011223344', 'application/octet-stream')).toBe('blobs/00/0011223344.bin')
  })
})
