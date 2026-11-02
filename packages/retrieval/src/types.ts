/** Retrieval contract: a lexical corpus index driven by the Meta model of the mode. */

import type { KbChunk, RetrievalQuery } from '@sps/shared'

export interface Retriever {
  search(query: RetrievalQuery): Promise<KbChunk[]>
  close?(): Promise<void>
}

/** Where the lexical index lives: Atlas Search (`atlas`) or a MongoDB text index (`text`). */
export type RetrievalBackend = 'atlas' | 'text'

/**
 * `auto` follows the deployment: Atlas Search in the cloud, a MongoDB text index
 * in local and sovereign installs (any MongoDB has one).
 */
export function resolveRetrievalBackend(mode: string, override?: string): RetrievalBackend {
  const value = (override ?? 'auto').trim().toLowerCase()
  if (value === 'atlas' || value === 'text') return value
  if (value !== '' && value !== 'auto') {
    throw new Error(`Unknown RETRIEVAL_BACKEND "${value}". Expected one of: auto | atlas | text.`)
  }
  return mode === 'cloud' ? 'atlas' : 'text'
}
