import { describe, expect, test } from 'bun:test'
import { hashPayload, storedForm, type AuditRecord } from './index'

describe('audit hash survives a Mongo round trip', () => {
  test('an unset optional field inside a citation hashes the same once stored', () => {
    const base: Omit<AuditRecord, 'hash'> = {
      id: 'rec-1',
      ts: '2026-10-27T20:01:42.373Z',
      actor: 'ada@sps.dev',
      action: 'citation.rejected',
      lens: 'hybrid',
      citations: [{ docId: 'loi-2024', article: undefined, page: 3 }] as unknown as AuditRecord['citations'],
    }
    const stored = JSON.parse(JSON.stringify(base)) as Omit<AuditRecord, 'hash'> & { citations: unknown }
    // What Mongo returns: the unset field is `null`, not absent.
    const read = { ...stored, citations: [{ docId: 'loi-2024', article: null, page: 3 }] } as unknown as Omit<AuditRecord, 'hash'>
    expect(hashPayload(read, 'prev')).toBe(hashPayload(base, 'prev'))
  })

  test('storedForm turns undefined into null, keeps everything else', () => {
    expect(storedForm([{ a: undefined, b: 1, c: 'x' }])).toEqual([{ a: null, b: 1, c: 'x' }])
  })
})
