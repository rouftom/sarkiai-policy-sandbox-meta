/**
 * Canonical Atlas index definitions — code, not a file read at boot.
 *
 * The API image only ships `packages/` and `apps/api/`, so reading
 * `deploy/mongo/kb.indexes.json` at startup silently failed in the container and
 * the indexes were never created. Keeping the definitions in the package makes
 * the bootstrap independent of the image layout; `deploy/mongo/kb.indexes.json`
 * stays as the canonical artifact for the standalone CLI script.
 */

import type { AtlasIndexDefinition, AtlasIndexFile } from './atlas-indexes'

export const KB_COLLECTION = 'kb_chunks'

export const KB_INDEX_DEFINITIONS: AtlasIndexDefinition[] = [
  {
    name: 'sps_vector_index',
    type: 'vectorSearch',
    definition: {
      fields: [
        {
          type: 'vector',
          numDimensions: 1024,
          path: 'embedding',
          similarity: 'dotProduct',
        },
        { type: 'filter', path: 'isActive' },
        { type: 'filter', path: 'country' },
        { type: 'filter', path: 'jurisdiction' },
        { type: 'filter', path: 'docType' },
        { type: 'filter', path: 'namespace' },
      ],
    },
  },
  {
    name: 'sps_text_index',
    type: 'search',
    definition: {
      analyzers: [
        {
          name: 'sps_fr_folded',
          tokenizer: { type: 'standard' },
          tokenFilters: [{ type: 'lowercase' }, { type: 'asciiFolding' }],
        },
      ],
      mappings: {
        dynamic: false,
        fields: {
          text: { type: 'string', analyzer: 'sps_fr_folded' },
          country: { type: 'string' },
          jurisdiction: { type: 'string' },
          docType: { type: 'string' },
          namespace: { type: 'string' },
          isActive: { type: 'boolean' },
        },
      },
    },
  },
]

export const KB_INDEX_FILE: AtlasIndexFile = {
  collection: KB_COLLECTION,
  indexes: KB_INDEX_DEFINITIONS,
}
