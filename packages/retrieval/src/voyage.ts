/**
 * Voyage AI client · cloud embeddings and reranking.
 *
 * Cloud mode pairs the Meta reasoning/vision models with Voyage (`voyage-4` +
 * `rerank-2`). Local and sovereign modes keep `bge-m3` + Qdrant and never call
 * this module.
 */

export interface VoyageConfig {
  apiKey: string
  /** Base URL including `/v1` (default: https://api.voyageai.com/v1). */
  baseUrl?: string
  embeddingModel?: string
  rerankModel?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** Reported after every call, so the ledger can meter retrieval separately. */
  onUsage?: (usage: VoyageUsage) => void
}

/** One Voyage call: tokens billed, duration, and whether it succeeded. */
export interface VoyageUsage {
  operation: 'embedding' | 'rerank'
  model: string
  tokens: number
  latencyMs: number
  ok: boolean
}

export interface VoyageRerankHit {
  index: number
  score: number
}

const DEFAULT_BASE_URL = 'https://api.voyageai.com/v1'
const DEFAULT_EMBEDDING_MODEL = 'voyage-4'
const DEFAULT_RERANK_MODEL = 'rerank-2'

/** Accepts the host, the `/v1` base, or a full endpoint such as `/v1/embeddings` (the endpoint is then dropped). */
function normalizeBaseUrl(raw: string): string {
  const base = raw.trim().replace(/\/+$/, '').replace(/\/(embeddings|rerank)$/, '')
  if (!base) return DEFAULT_BASE_URL
  return /\/v1$/.test(base) ? base : `${base}/v1`
}

export class VoyageClient {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly embeddingModel: string
  private readonly rerankModel: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number
  private readonly onUsage?: (usage: VoyageUsage) => void

  constructor(config: VoyageConfig) {
    this.apiKey = config.apiKey.trim()
    this.baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL)
    this.embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING_MODEL
    this.rerankModel = config.rerankModel ?? DEFAULT_RERANK_MODEL
    this.fetchImpl = config.fetchImpl ?? fetch
    this.timeoutMs = config.timeoutMs ?? 30_000
    this.onUsage = config.onUsage
  }

  get model(): string {
    return this.embeddingModel
  }

  get reranker(): string {
    return this.rerankModel
  }

  /** Embed one or more texts. `input_type` must match ingestion (`document`) or search (`query`). */
  async embed(texts: string[], inputType: 'document' | 'query' = 'document'): Promise<number[][]> {
    if (texts.length === 0) return []
    const startedAt = Date.now()
    try {
      const payload = (await this.post('/embeddings', {
        input: texts,
        model: this.embeddingModel,
        input_type: inputType,
        truncation: true,
      })) as {
        data?: Array<{ embedding?: number[]; index?: number }>
        usage?: { total_tokens?: number }
      }

      const rows = payload.data ?? []
      if (rows.length !== texts.length) {
        throw new Error(`Voyage embed returned ${rows.length} vectors for ${texts.length} inputs.`)
      }

      const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      const vectors = ordered.map((row, position) => {
        if (!Array.isArray(row.embedding) || row.embedding.length === 0) {
          throw new Error(`Voyage returned no vector for input ${position}.`)
        }
        return row.embedding
      })
      this.report({ operation: 'embedding', model: this.embeddingModel, tokens: payload.usage?.total_tokens ?? 0, latencyMs: Date.now() - startedAt, ok: true })
      return vectors
    } catch (error) {
      this.report({ operation: 'embedding', model: this.embeddingModel, tokens: 0, latencyMs: Date.now() - startedAt, ok: false })
      throw error
    }
  }

  /** Re-score candidate documents against the query. Returns indices into `documents`. */
  async rerank(query: string, documents: string[], topK?: number): Promise<VoyageRerankHit[]> {
    if (documents.length === 0) return []
    const startedAt = Date.now()
    try {
      const payload = (await this.post('/rerank', {
        query,
        documents,
        model: this.rerankModel,
        ...(topK === undefined ? {} : { top_k: topK }),
        truncation: true,
      })) as {
        data?: Array<{ index?: number; relevance_score?: number }>
        usage?: { total_tokens?: number }
      }

      const hits = (payload.data ?? [])
        .filter((row): row is { index: number; relevance_score?: number } => Number.isInteger(row.index))
        .map((row) => ({ index: row.index, score: row.relevance_score ?? 0 }))
      this.report({ operation: 'rerank', model: this.rerankModel, tokens: payload.usage?.total_tokens ?? 0, latencyMs: Date.now() - startedAt, ok: true })
      return hits
    } catch (error) {
      this.report({ operation: 'rerank', model: this.rerankModel, tokens: 0, latencyMs: Date.now() - startedAt, ok: false })
      throw error
    }
  }

  private report(usage: VoyageUsage): void {
    try {
      this.onUsage?.(usage)
    } catch {
      // Metering must never break retrieval.
    }
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    if (!this.apiKey) throw new Error('VOYAGE_API_KEY is not configured; cannot use cloud retrieval.')

    let response: Response
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new Error(`Voyage request failed (${path}): ${(error as Error).message}`)
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      throw new Error(`Voyage ${path} failed (${response.status}): ${detail}`)
    }
    return response.json()
  }
}
