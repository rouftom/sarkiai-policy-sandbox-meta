/** Retrieval contract shared by the Qdrant (local/sovereign) and Atlas (cloud) backends. */

import type { KbChunk, RetrievalQuery } from '@sps/shared'

export type RetrievalBackend = 'qdrant' | 'atlas'

export interface Retriever {
  search(query: RetrievalQuery): Promise<KbChunk[]>
}

/** Resolve the backend from an explicit override, else the provider mode. */
export function resolveRetrievalBackend(mode: string, override?: string): RetrievalBackend {
  const value = (override ?? 'auto').trim().toLowerCase()
  if (value === 'qdrant' || value === 'atlas') return value
  if (value !== '' && value !== 'auto') {
    throw new Error(`Unknown RETRIEVAL_BACKEND "${value}". Expected one of: auto | qdrant | atlas.`)
  }
  return mode === 'cloud' ? 'atlas' : 'qdrant'
}
