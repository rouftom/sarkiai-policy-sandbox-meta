import { describe, expect, test } from 'bun:test'
import { atlasFilter, fuseRanked } from './atlas'
import { loadIndexDefinitions, stableStringify } from './atlas-indexes'
import { resolveRetrievalBackend } from './types'

describe('Atlas filter', () => {
  test('always scopes to the active corpus and the country', () => {
    expect(atlasFilter({ text: 'data protection', country: 'cm' })).toEqual({
      isActive: true,
      country: 'cm',
    })
  })

  test('carries the optional jurisdiction, docType and namespace', () => {
    expect(
      atlasFilter({
        text: 'x',
        country: 'cm',
        jurisdiction: 'regional',
        docType: 'law',
        namespace: 'gazette',
      }),
    ).toEqual({
      isActive: true,
      country: 'cm',
      jurisdiction: 'regional',
      docType: 'law',
      namespace: 'gazette',
    })
  })
})

describe('reciprocal rank fusion', () => {
  test('dedupes by id and rewards documents present in both branches', () => {
    const fused = fuseRanked(
      [
        { items: [{ id: 'a' }, { id: 'b' }], weight: 0.5 },
        { items: [{ id: 'b' }, { id: 'c' }], weight: 0.5 },
      ],
      60,
    )
    expect(fused[0]!.id).toBe('b')
    expect(fused.map((item) => item.id)).toEqual(['b', 'a', 'c'])
    expect(fused[0]!.score).toBeGreaterThan(fused[1]!.score)
  })
})

describe('search index artifact', () => {
  const file = new URL('../../../deploy/mongo/kb.indexes.json', import.meta.url)

  test('declares one vector index and one BM25 index on kb_chunks', () => {
    const artifact = loadIndexDefinitions(file)
    expect(artifact.collection).toBe('kb_chunks')
    expect(artifact.indexes.map((index) => [index.name, index.type])).toEqual([
      ['sps_vector_index', 'vectorSearch'],
      ['sps_text_index', 'search'],
    ])
    const vector = artifact.indexes[0]!.definition as {
      fields: Array<{ type: string; path?: string }>
    }
    expect(vector.fields[0]).toMatchObject({ type: 'vector', path: 'embedding' })
    expect(vector.fields.some((field) => field.path === 'country')).toBe(true)
  })

  test('stable stringify ignores object key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(
      stableStringify({ a: { c: 3, d: 2 }, b: 1 }),
    )
  })
})

describe('backend resolution', () => {
  test('cloud defaults to Atlas, everything else to Qdrant', () => {
    expect(resolveRetrievalBackend('cloud', 'auto')).toBe('atlas')
    expect(resolveRetrievalBackend('sovereign', 'auto')).toBe('qdrant')
    expect(resolveRetrievalBackend('local', undefined)).toBe('qdrant')
  })

  test('an explicit override wins', () => {
    expect(resolveRetrievalBackend('cloud', 'qdrant')).toBe('qdrant')
    expect(resolveRetrievalBackend('local', 'atlas')).toBe('atlas')
    expect(() => resolveRetrievalBackend('cloud', 'pinecone')).toThrow('Unknown RETRIEVAL_BACKEND')
  })
})
