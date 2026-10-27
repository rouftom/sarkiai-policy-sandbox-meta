/**
 * Atlas retrieval backend (cloud mode).
 *
 * Meta has no embedding model, so chunks are embedded with Voyage (`voyage-4`,
 * 1024 dimensions) and stored in MongoDB Atlas. Search fuses:
 *   1. `$vectorSearch` (dense, dotProduct)
 *   2. `$search` (BM25 over the same collection)
 *   3. reciprocal rank fusion (RRF)
 *   4. Voyage `rerank-2` on the fused candidates
 *
 * The collection payload is shared with the local Qdrant backend, so a chunk
 * keeps the same jurisdiction taxonomy and structural breadcrumbs in both modes.
 */

import { MongoClient, type Collection, type Document } from 'mongodb'
import type { DocType, Jurisdiction, KbChunk, ReadinessDimension, RetrievalQuery } from '@sps/shared'
import { VoyageClient, type VoyageConfig } from './voyage'
import type { Retriever } from './types'

export interface AtlasRetrieverConfig {
  mongodbUri: string
  dbName: string
  collectionName?: string
  vectorIndex?: string
  textIndex?: string
  voyage: VoyageConfig
  /** Candidates pulled from each branch before fusion. */
  numCandidates?: number
  vectorWeight?: number
  textWeight?: number
}

const DEFAULTS = {
  collectionName: 'kb_chunks',
  vectorIndex: 'sps_vector_index',
  textIndex: 'sps_text_index',
  numCandidates: 100,
  vectorWeight: 0.6,
  textWeight: 0.4,
}

export interface RankedChunk {
  id: string
  chunk: KbChunk
}

/** One candidate as returned by a retrieval stage, ready for the playground UI. */
export interface RetrievalStageItem {
  id: string
  rank: number
  score?: number
  filename: string
  text: string
  chunkIndex: number
  country: string
  jurisdiction: string
  docType: string
  headingPath?: string
  articleNumber?: string
  sourceUrl?: string
}

export interface RetrievalExploration {
  query: string
  filter: Record<string, string | boolean>
  topK: number
  models: { embedding: string; rerank: string }
  timings: { embedMs: number; denseMs: number; sparseMs: number; rerankMs: number; totalMs: number }
  stages: {
    dense: RetrievalStageItem[]
    sparse: RetrievalStageItem[]
    fused: RetrievalStageItem[]
    reranked: RetrievalStageItem[]
    final: RetrievalStageItem[]
  }
  warnings: string[]
}


/** Exact-match filter understood by both `$vectorSearch` and `$search`. */
export function atlasFilter(query: RetrievalQuery): Record<string, string | boolean> {
  const filter: Record<string, string | boolean> = {
    isActive: true,
  }
  if (query.country) filter.country = query.country
  if (query.jurisdiction) filter.jurisdiction = query.jurisdiction
  if (query.docType) filter.docType = query.docType
  if (query.namespace) filter.namespace = query.namespace
  return filter
}

/**
 * Reciprocal rank fusion keyed by document id (not JSON.stringify): Atlas
 * returns the same chunk object from both branches, sometimes with different
 * field order.
 */
export function fuseRanked<T extends { id: string }>(
  lists: Array<{ items: T[]; weight: number }>,
  k = 60,
): Array<T & { score: number }> {
  const scores = new Map<string, { item: T; score: number }>()
  for (const { items, weight } of lists) {
    items.forEach((item, index) => {
      const current = scores.get(item.id) ?? { item, score: 0 }
      current.score += weight / (k + index + 1)
      scores.set(item.id, current)
    })
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ item, score }) => ({ ...item, score }))
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function toChunk(doc: Document, score?: number): KbChunk | null {
  const text = asString(doc.text)
  if (!text) return null

  const metadata = (doc.metadata ?? {}) as Record<string, unknown>
  const jurisdiction = (asString(doc.jurisdiction) ?? 'national') as Jurisdiction
  const docType = (asString(doc.docType) ?? asString(doc.type) ?? 'policy') as DocType

  return {
    id: String(doc._id ?? asString(doc.contentHash) ?? `${String(doc.filename)}:${String(doc.chunkIndex)}`),
    filename: asString(doc.filename) ?? '',
    text,
    chunkIndex: typeof doc.chunkIndex === 'number' ? doc.chunkIndex : 0,
    country: asString(doc.country) ?? '',
    jurisdiction,
    docType,
    pillar: Array.isArray(doc.pillar) ? (doc.pillar as ReadinessDimension[]) : undefined,
    namespace: asString(doc.namespace),
    version: asString(metadata.version) ?? asString(doc.version),
    headingPath: asString(doc.headingPath),
    articleNumber: asString(doc.articleNumber),
    unitType: asString(doc.unitType),
    chunkRole: doc.chunkRole === 'parent' || doc.chunkRole === 'child' ? doc.chunkRole : undefined,
    sourceUrl: asString(doc.sourceUrl),
    score,
    isActive: doc.isActive !== false,
  }
}

export class AtlasRetriever implements Retriever {
  private client: MongoClient | null = null;
  private readonly voyage: VoyageClient
  private readonly collectionName: string
  private readonly indexName: string
  private readonly textIndexName: string
  private readonly numCandidates: number
  private readonly vectorWeight: number
  private readonly textWeight: number

  constructor(private readonly config: AtlasRetrieverConfig) {
    this.voyage = new VoyageClient(config.voyage)
    this.collectionName = config.collectionName ?? DEFAULTS.collectionName
    this.indexName = config.vectorIndex ?? DEFAULTS.vectorIndex
    this.textIndexName = config.textIndex ?? DEFAULTS.textIndex
    this.numCandidates = config.numCandidates ?? DEFAULTS.numCandidates
    this.vectorWeight = config.vectorWeight ?? DEFAULTS.vectorWeight
    this.textWeight = config.textWeight ?? DEFAULTS.textWeight
  }

  async search(query: RetrievalQuery): Promise<KbChunk[]> {
    const topK = query.topK ?? 8
    const [vector] = await this.voyage.embed([query.text], 'query')
    if (!vector) throw new Error('Voyage returned no query vector.')

    const filter = atlasFilter(query)
    const limit = Math.max(topK * 6, 24, this.numCandidates)

    const [dense, sparse] = await Promise.all([
      this.vectorSearch(vector, limit, filter).catch((error) => {
        console.warn(`[atlas] vector branch unavailable: ${(error as Error).message}`)
        return [] as RankedChunk[]
      }),
      this.textSearch(query.text, limit, filter).catch((error) => {
        console.warn(`[atlas] text branch unavailable: ${(error as Error).message}`)
        return [] as RankedChunk[]
      }),
    ])

    if (dense.length === 0 && sparse.length === 0) return []

    const fused = fuseRanked([
      { items: dense, weight: this.vectorWeight },
      { items: sparse, weight: this.textWeight },
    ])
    const candidates = fused.slice(0, Math.max(topK * 3, 16))

    try {
      const hits = await this.voyage.rerank(
        query.text,
        candidates.map((candidate) => candidate.chunk.text),
        candidates.length,
      )
      if (hits.length > 0) {
        const reranked = hits
          .map((hit) => {
            const candidate = candidates[hit.index]
            return candidate ? { ...candidate, score: hit.score } : null
          })
          .filter((candidate): candidate is RankedChunk & { score: number } => candidate !== null)
        if (reranked.length > 0) return reranked.slice(0, topK).map((c) => ({ ...c.chunk, score: c.score }))
      }
    } catch (error) {
      console.warn(`[atlas] rerank unavailable: ${(error as Error).message}`)
    }

    return candidates.slice(0, topK).map((c) => ({ ...c.chunk, score: c.score }))
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
  }

  /**
   * Same pipeline as `search`, but every stage is returned with scores so the
   * console's retrieval playground can *show* the RAG instead of asserting it:
   * query embedding → dense + BM25 → RRF → Voyage rerank.
   */
  async explore(query: RetrievalQuery): Promise<RetrievalExploration> {
    const started = Date.now()
    const topK = query.topK ?? 6
    const filter = atlasFilter(query)
    const limit = Math.max(topK * 6, 24, this.numCandidates)
    const warnings: string[] = []

    const embedStart = Date.now()
    const [vector] = await this.voyage.embed([query.text], 'query')
    const embedMs = Date.now() - embedStart
    if (!vector) throw new Error('Voyage returned no query vector.')

    const denseStart = Date.now()
    const dense = await this.vectorSearch(vector, limit, filter).catch((error) => {
      warnings.push(`Dense branch: ${(error as Error).message}`)
      return [] as RankedChunk[]
    })
    const denseMs = Date.now() - denseStart

    const sparseStart = Date.now()
    const sparse = await this.textSearch(query.text, limit, filter).catch((error) => {
      warnings.push(`BM25 branch: ${(error as Error).message}`)
      return [] as RankedChunk[]
    })
    const sparseMs = Date.now() - sparseStart

    const fused = fuseRanked([
      { items: dense, weight: this.vectorWeight },
      { items: sparse, weight: this.textWeight },
    ])
    const candidates = fused.slice(0, Math.max(topK * 3, 16))

    const rerankStart = Date.now()
    let reranked: Array<RankedChunk & { score: number }> = []
    try {
      const hits = await this.voyage.rerank(
        query.text,
        candidates.map((candidate) => candidate.chunk.text),
        candidates.length,
      )
      reranked = hits
        .map((hit) => {
          const candidate = candidates[hit.index]
          return candidate ? { ...candidate, score: hit.score } : null
        })
        .filter((candidate): candidate is RankedChunk & { score: number } => candidate !== null)
    } catch (error) {
      warnings.push(`Rerank: ${(error as Error).message}`)
    }
    const rerankMs = Date.now() - rerankStart

    const toItem = (entry: { id: string; chunk: KbChunk; score?: number }, rank: number): RetrievalStageItem => ({
      id: entry.id,
      rank,
      ...(entry.score === undefined ? {} : { score: entry.score }),
      filename: entry.chunk.filename,
      text: entry.chunk.text.slice(0, 420),
      chunkIndex: entry.chunk.chunkIndex,
      country: entry.chunk.country,
      jurisdiction: entry.chunk.jurisdiction,
      docType: entry.chunk.docType,
      ...(entry.chunk.headingPath ? { headingPath: entry.chunk.headingPath } : {}),
      ...(entry.chunk.articleNumber ? { articleNumber: entry.chunk.articleNumber } : {}),
      ...(entry.chunk.sourceUrl ? { sourceUrl: entry.chunk.sourceUrl } : {}),
    })

    const final = reranked.length > 0 ? reranked : candidates
    return {
      query: query.text,
      filter,
      topK,
      models: { embedding: this.voyage.model, rerank: this.voyage.reranker },
      timings: {
        embedMs,
        denseMs,
        sparseMs,
        rerankMs,
        totalMs: Date.now() - started,
      },
      stages: {
        dense: dense.map(toItem),
        sparse: sparse.map(toItem),
        fused: fused.map(toItem),
        reranked: reranked.map(toItem),
        final: final.slice(0, topK).map(toItem),
      },
      warnings,
    }
  }

  private async collection(): Promise<Collection<Document>> {
    if (!this.client) {
      this.client = new MongoClient(this.config.mongodbUri)
      await this.client.connect()
    }
    return this.client.db(this.config.dbName).collection(this.collectionName)
  }

  private async vectorSearch(
    queryVector: number[],
    limit: number,
    filter: Record<string, string | boolean>,
  ): Promise<RankedChunk[]> {
    const collection = await this.collection()
    const docs = await collection
      .aggregate([
        {
          $vectorSearch: {
            index: this.indexName,
            path: 'embedding',
            queryVector,
            numCandidates: Math.max(limit * 10, this.numCandidates),
            limit,
            filter,
          },
        },
      ])
      .toArray()
    return docs.flatMap((doc) => {
      const chunk = toChunk(doc)
      return chunk ? [{ id: chunk.id, chunk }] : []
    })
  }

  private async textSearch(
    text: string,
    limit: number,
    filter: Record<string, string | boolean>,
  ): Promise<RankedChunk[]> {
    const collection = await this.collection()
    const filters = Object.entries(filter).map(([path, value]) => ({ equals: { path, value } }))
    const docs = await collection
      .aggregate([
        {
          $search: {
            index: this.textIndexName,
            compound: {
              must: [{ text: { query: text, path: 'text' } }],
              ...(filters.length > 0 ? { filter: filters } : {}),
            },
          },
        },
        { $limit: limit },
        { $addFields: { score: { $meta: 'searchScore' } } },
      ])
      .toArray()
    return docs.flatMap((doc) => {
      const score = typeof doc.score === 'number' ? doc.score : undefined
      const chunk = toChunk(doc, score)
      return chunk ? [{ id: chunk.id, chunk }] : []
    })
  }
}
