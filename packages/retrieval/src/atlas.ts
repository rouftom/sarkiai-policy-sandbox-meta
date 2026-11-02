/**
 * Lexical access to the corpus (MongoDB), shared by every deployment mode.
 *
 * Cloud: Atlas Search (`$search`, BM25 over `text`, `headingPath`, `filename`).
 * Local and sovereign: a MongoDB text index (`$text`), available in any MongoDB.
 * Both are scoring formulas, not models: the reasoning (planning, judging,
 * ranking) is done by the Meta model of the mode in `AgenticRetriever`.
 */

import { MongoClient, type Collection, type Document } from 'mongodb'
import type { DocType, Jurisdiction, KbChunk, ReadinessDimension, RetrievalQuery } from '@sps/shared'
import { mongoPoolOptions, normalizeCorpusRights } from '@sps/shared'
import { corpusFilter, fuseRanked, type LexicalSource } from './agentic'
import type { Retriever } from './types'

export { fuseRanked }

/** Where the lexical index lives: Atlas Search, or a plain MongoDB text index. */
export type CorpusSearchMode = 'atlas' | 'text'

export interface CorpusSourceConfig {
  mongodbUri: string
  dbName: string
  collectionName?: string
  /** Atlas Search index name (`atlas` mode). */
  textIndex?: string
  searchMode: CorpusSearchMode
}

const DEFAULTS = {
  collectionName: 'kb_chunks',
  textIndex: 'sps_text_index',
}

/** Exact-match filter on the corpus taxonomy (kept under its historical name). */
export const atlasFilter = (query: RetrievalQuery) => corpusFilter(query)

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
    ...(asString(doc.documentId) ? { documentId: asString(doc.documentId) } : {}),
    filename: asString(doc.filename) ?? '',
    text,
    chunkIndex: typeof doc.chunkIndex === 'number' ? doc.chunkIndex : 0,
    country: asString(doc.country) ?? '',
    jurisdiction,
    docType,
    rights: normalizeCorpusRights(doc.rights),
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

export class CorpusSource implements LexicalSource, Retriever {
  private client: MongoClient | null = null
  private readonly collectionName: string
  private readonly textIndexName: string

  constructor(private readonly config: CorpusSourceConfig) {
    this.collectionName = config.collectionName ?? DEFAULTS.collectionName
    this.textIndexName = config.textIndex ?? DEFAULTS.textIndex
  }

  /** Plain lexical search: the `lexical` depth, and the fallback of every other one. */
  async search(query: RetrievalQuery): Promise<KbChunk[]> {
    const chunks = await this.lexical(query.text, query.topK ?? 6, corpusFilter(query))
    return this.withImages(chunks)
  }

  async lexical(text: string, limit: number, filter: Record<string, string | boolean>): Promise<KbChunk[]> {
    const cleaned = text.replace(/\s+/g, ' ').trim()
    if (!cleaned) return []
    const collection = await this.collection()
    const docs = this.config.searchMode === 'atlas'
      ? await collection
          .aggregate([
            {
              $search: {
                index: this.textIndexName,
                compound: {
                  must: [{ text: { query: cleaned, path: 'text' } }],
                  filter: Object.entries(filter).map(([path, value]) => ({ equals: { path, value } })),
                },
              },
            },
            { $limit: limit },
            { $addFields: { score: { $meta: 'searchScore' } } },
          ])
          .toArray()
      : await collection
          .find({ $text: { $search: cleaned }, ...filter }, { projection: { score: { $meta: 'textScore' } } })
          .sort({ score: { $meta: 'textScore' } })
          .limit(limit)
          .toArray()
    return docs.flatMap((doc) => {
      const chunk = toChunk(doc, typeof doc.score === 'number' ? doc.score : undefined)
      return chunk ? [chunk] : []
    })
  }

  async article(filename: string, articleNumber: string, limit: number): Promise<KbChunk[]> {
    const collection = await this.collection()
    const docs = await collection
      .find({ filename, articleNumber, isActive: true })
      .sort({ chunkIndex: 1 })
      .limit(limit)
      .toArray()
    return docs.flatMap((doc) => {
      const chunk = toChunk(doc)
      return chunk ? [chunk] : []
    })
  }

  async withImages(chunks: KbChunk[]): Promise<KbChunk[]> {
    if (chunks.length === 0) return chunks
    try {
      const collection = await this.imageCollection()
      const filenames = [...new Set(chunks.map((chunk) => chunk.filename).filter(Boolean))]
      const rows = await collection
        .aggregate([
          { $match: { filename: { $in: filenames } } },
          { $sort: { createdAt: 1 } },
          { $project: { _id: 1, filename: 1, caption: 1, alt: 1, tags: 1, dimension: 1, articleNumber: 1, headingPath: 1, source: 1, externalUrl: 1 } },
        ])
        .toArray()
        .catch(() => [] as Document[])
      if (rows.length === 0) return chunks
      const byFile = new Map<string, NonNullable<KbChunk['images']>>()
      for (const row of rows) {
        const filename = String(row.filename ?? '')
        if (!filename) continue
        const id = String(row._id)
        const list = byFile.get(filename) ?? []
        list.push({
          id,
          url: typeof row.externalUrl === 'string' ? row.externalUrl : `/v1/kb/images/${encodeURIComponent(id)}`,
          caption: String(row.caption ?? ''),
          ...(typeof row.alt === 'string' ? { alt: row.alt } : {}),
          ...(Array.isArray(row.tags) ? { tags: row.tags.map(String) } : {}),
          ...(typeof row.dimension === 'string' ? { dimension: row.dimension as ReadinessDimension } : {}),
          ...(typeof row.articleNumber === 'string' ? { articleNumber: row.articleNumber } : {}),
          ...(typeof row.headingPath === 'string' ? { headingPath: row.headingPath } : {}),
          ...(typeof row.source === 'string' ? { source: row.source as NonNullable<KbChunk['images']>[number]['source'] } : {}),
        })
        byFile.set(filename, list)
      }
      return chunks.map((chunk) => {
        const images = byFile.get(chunk.filename)
        return images && images.length > 0 ? { ...chunk, images } : chunk
      })
    } catch (error) {
      console.warn(`[corpus] image metadata unavailable: ${(error as Error).message}`)
      return chunks
    }
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
  }

  private async db() {
    if (!this.client) {
      this.client = new MongoClient(this.config.mongodbUri, mongoPoolOptions())
      await this.client.connect()
    }
    return this.client.db(this.config.dbName)
  }

  private async collection(): Promise<Collection<Document>> {
    return (await this.db()).collection(this.collectionName)
  }

  private async imageCollection(): Promise<Collection<Document>> {
    return (await this.db()).collection('kb_images')
  }
}
