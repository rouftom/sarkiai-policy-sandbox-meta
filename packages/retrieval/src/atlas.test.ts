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

  test('declares one BM25 index on kb_chunks and no vector index', () => {
    const artifact = loadIndexDefinitions(file)
    expect(artifact.collection).toBe('kb_chunks')
    expect(artifact.indexes.map((index) => [index.name, index.type])).toEqual([['sps_text_index', 'search']])
  })

  test('stable stringify ignores object key order', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe(stableStringify({ a: { c: 3, d: 2 }, b: 1 }))
  })
})

describe('backend resolution', () => {
  test('cloud defaults to Atlas Search, everything else to a MongoDB text index', () => {
    expect(resolveRetrievalBackend('cloud')).toBe('atlas')
    expect(resolveRetrievalBackend('sovereign')).toBe('text')
    expect(resolveRetrievalBackend('local')).toBe('text')
  })

  test('an explicit override wins, an unknown one is refused', () => {
    expect(resolveRetrievalBackend('cloud', 'text')).toBe('text')
    expect(resolveRetrievalBackend('local', 'atlas')).toBe('atlas')
    expect(() => resolveRetrievalBackend('local', 'vector')).toThrow()
  })
})
