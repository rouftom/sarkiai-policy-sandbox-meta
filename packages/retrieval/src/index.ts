/**
 * Retrieval backends.
 *
 * Local / sovereign  → Qdrant (bge-m3 dense + BM25 sparse, RRF, optional TEI).
 * Cloud              → MongoDB Atlas + Voyage (`voyage-4` + `rerank-2`).
 *
 * Both share the same `KbChunk` payload and jurisdiction taxonomy. In `local`
 * and `sovereign` no cloud call is made: embeddings and rerank stay on-premise.
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import type { KbChunk, RetrievalQuery, Taxonomy } from '@sps/shared'
import type { Retriever } from './types'

export * from './types'
export * from './voyage'
export * from './atlas'
export * from './atlas-indexes'
export * from './atlas-index-definitions'
export * from './atlas-ingest'

export interface RetrievalConfig {
  qdrantUrl: string
  qdrantApiKey?: string
  collectionName?: string
  denseVectorName?: string
  sparseVectorName?: string
  sparseModel?: string
  /** Ollama base URL for query embeddings. */
  embeddingsBaseUrl: string
  embeddingModel?: string
  /** Optional TEI reranker base URL. Empty => RRF only. */
  rerankUrl?: string
  rerankModel?: string
}

interface QdrantPoint {
  id: string | number
  score?: number
  payload?: Record<string, unknown>
}

const DEFAULTS = {
  collectionName: 'policy_chunks',
  denseVectorName: 'dense',
  sparseVectorName: 'text',
  sparseModel: 'Qdrant/bm25',
  embeddingModel: 'bge-m3',
  rerankModel: 'BAAI/bge-reranker-v2-m3',
}

function buildFilter(query: RetrievalQuery) {
  const must: Array<Record<string, unknown>> = [
    { key: 'isActive', match: { value: true } },
    { key: 'country', match: { value: query.country } },
  ]
  if (query.jurisdiction) must.push({ key: 'jurisdiction', match: { value: query.jurisdiction } })
  if (query.docType) must.push({ key: 'docType', match: { value: query.docType } })
  if (query.namespace) must.push({ key: 'namespace', match: { value: query.namespace } })
  return { must }
}

/** Embed the query with the local Ollama server (`/api/embed`). */
async function embedQuery(config: RetrievalConfig, text: string): Promise<number[]> {
  const base = config.embeddingsBaseUrl.replace(/\/$/, '')
  const response = await fetch(`${base}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.embeddingModel ?? DEFAULTS.embeddingModel, input: [text] }),
  })
  if (!response.ok) throw new Error(`Local embed failed (${response.status}): ${await response.text()}`)
  const payload = (await response.json()) as { embeddings?: number[][] }
  const embedding = payload.embeddings?.[0]
  if (!embedding) throw new Error('Local embed returned no vector')
  return embedding
}

/** Reciprocal Rank Fusion — kept for callers that fuse lists locally. */
export function rrf<T>(lists: Array<{ items: T[]; weight: number }>, k = 60): Array<T & { score: number }> {
  const scores = new Map<string, { item: T; score: number }>()
  for (const { items, weight } of lists) {
    items.forEach((item, index) => {
      const key = JSON.stringify(item)
      const current = scores.get(key) ?? { item, score: 0 }
      current.score += weight / (k + index + 1)
      scores.set(key, current)
    })
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map(({ item, score }) => ({ ...item, score }))
}

function toChunk(point: QdrantPoint): KbChunk {
  const payload = (point.payload ?? {}) as Record<string, any>
  return {
    id: String(point.id),
    filename: payload.filename ?? '',
    text: payload.text ?? '',
    chunkIndex: payload.chunkIndex ?? 0,
    country: payload.country ?? '',
    jurisdiction: payload.jurisdiction ?? 'national',
    docType: payload.docType ?? payload.type ?? 'policy',
    pillar: payload.pillar,
    namespace: payload.namespace,
    version: payload.metadata?.version ?? payload.version,
    headingPath: payload.headingPath,
    articleNumber: payload.articleNumber,
    unitType: payload.unitType,
    chunkRole: payload.chunkRole,
    sourceUrl: payload.sourceUrl,
    score: point.score,
    isActive: payload.isActive !== false,
  }
}

export class PolicyRetriever implements Retriever {
  private client: QdrantClient
  private readonly cfg: Required<Pick<RetrievalConfig, 'collectionName' | 'denseVectorName' | 'sparseVectorName' | 'sparseModel' | 'embeddingModel' | 'rerankModel'>> &
    RetrievalConfig

  constructor(config: RetrievalConfig) {
    this.cfg = { ...DEFAULTS, ...config } as typeof this.cfg
    this.client = new QdrantClient({ url: this.cfg.qdrantUrl, apiKey: this.cfg.qdrantApiKey })
  }

  async search(query: RetrievalQuery): Promise<KbChunk[]> {
    const topK = query.topK ?? 8
    const dense = await embedQuery(this.cfg, query.text)
    const filter = buildFilter(query)

    const sparseQuery = { text: query.text, model: this.cfg.sparseModel } as Record<string, unknown>

    let points: QdrantPoint[] = []
    try {
      // Hybrid: dense + BM25 sparse, fused server-side with RRF.
      const res = await this.client.query(this.cfg.collectionName, {
        prefetch: [
          { query: dense, using: this.cfg.denseVectorName, limit: topK * 3, filter },
          { query: sparseQuery, using: this.cfg.sparseVectorName, limit: topK * 3, filter },
        ],
        query: { fusion: 'rrf' },
        limit: topK * 2,
        with_payload: true,
      })
      points = (res.points ?? []) as unknown as QdrantPoint[]
    } catch {
      // Dense-only fallback (universal query endpoint).
      const res = await this.client.query(this.cfg.collectionName, {
        query: dense,
        using: this.cfg.denseVectorName,
        filter,
        limit: topK * 2,
        with_payload: true,
      })
      points = (res.points ?? []) as unknown as QdrantPoint[]
    }

    const chunks = points.map(toChunk)
    const reranked = await this.rerank(query.text, chunks)
    return reranked.slice(0, topK)
  }

  async upsert(points: Array<{ id: string; vector: Record<string, unknown>; payload: Taxonomy & Record<string, unknown> }>): Promise<void> {
    await this.client.upsert(this.cfg.collectionName, { points: points as never, wait: true })
  }

  /** Optional local rerank through a TEI `/rerank` endpoint. */
  private async rerank(query: string, chunks: KbChunk[]): Promise<KbChunk[]> {
    if (chunks.length <= 1 || !this.cfg.rerankUrl) return chunks
    try {
      const base = this.cfg.rerankUrl.replace(/\/$/, '')
      const response = await fetch(`${base}/rerank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, texts: chunks.map((c) => c.text), truncate: true }),
      })
      if (!response.ok) return chunks
      const payload = (await response.json()) as unknown
      const rows: Array<{ index: number; score: number }> = Array.isArray(payload)
        ? (payload as Array<{ index: number; score: number }>)
        : ((payload as { results?: Array<{ index: number; score: number }> }).results ?? [])
      if (rows.length === 0) return chunks
      return rows
        .map((row) => {
          const chunk = chunks[row.index]
          return chunk ? ({ ...chunk, score: row.score } as KbChunk) : null
        })
        .filter((chunk): chunk is KbChunk => chunk !== null)
    } catch {
      return chunks
    }
  }
}
