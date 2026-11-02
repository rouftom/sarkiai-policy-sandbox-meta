import { describe, expect, test } from 'bun:test'
import { KB_INDEX_DEFINITIONS, KB_INDEX_FILE, KB_COLLECTION } from './atlas-index-definitions'
import { loadIndexDefinitions, stableStringify } from './atlas-indexes'

/**
 * The API bootstraps indexes from `@sps/retrieval` (code), while operators can
 * still run `bun run kb:indexes` with the JSON artifact. They must not drift, or
 * the container and the CLI would create different indexes.
 */
describe('Atlas index definitions', () => {
  test('match the deploy/mongo JSON artifact', () => {
    const artifact = loadIndexDefinitions(new URL('../../../deploy/mongo/kb.indexes.json', import.meta.url))
    expect(artifact.collection).toBe(KB_COLLECTION)
    expect(stableStringify(artifact.indexes)).toBe(stableStringify(KB_INDEX_DEFINITIONS))
  })

  test('declare the lexical index only', () => {
    expect(KB_INDEX_FILE.indexes.map((index) => index.type)).toEqual(['search'])
    expect(KB_INDEX_DEFINITIONS.some((index) => index.type === 'vectorSearch')).toBe(false)
  })
})
