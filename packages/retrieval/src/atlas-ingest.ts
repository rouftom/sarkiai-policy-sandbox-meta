/**
 * Direct Atlas ingestion — the vectorisation path the console can actually run.
 *
 * Cloud mode used to depend on an optional Python ingestion service. That made
 * the RAG opaque (and unavailable on the public demo host). This module owns the
 * whole path in-process:
 *
 *   text → heading-aware chunks → Voyage `voyage-4` embeddings →
 *   idempotent upsert into `kb_chunks` (content hash as `_id`) →
 *   Atlas indexes ensured → corpus/search status.
 *
 * Every step is timed and returned, so the Knowledge base screen can show what
 * happened instead of a spinner with no explanation.
 */

import { createHash } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'
import { chunkDocument, type ChunkOptions } from '@sps/kb'
import type { DocType, Jurisdiction, ReadinessDimension } from '@sps/shared'
import { inspectAtlasIndexes, ensureAtlasIndexes, type AtlasIndexInspection } from './atlas-indexes'
import { KB_INDEX_DEFINITIONS } from './atlas-index-definitions'
import { AtlasRetriever, type RetrievalExploration } from './atlas'
import { VoyageClient, type VoyageConfig } from './voyage'
import type { RetrievalQuery } from '@sps/shared'

export interface AtlasIngestorConfig {
  mongodbUri: string
  dbName: string
  collectionName?: string
  voyage: VoyageConfig
  /** Create missing indexes after a write (default true in cloud mode). */
  autoIndexes?: boolean
  vectorIndex?: string
  textIndex?: string
}

export interface IngestInput extends ChunkOptions {
  text: string
  filename: string
  country: string
  jurisdiction?: Jurisdiction
  docType?: DocType
  namespace?: string
  version?: string
  sourceUrl?: string
  pillar?: ReadinessDimension[]
}

export type IngestStepStatus = 'ok' | 'skipped' | 'warning' | 'error'

export interface IngestStep {
  id: 'validate' | 'chunk' | 'embed' | 'write' | 'indexes' | 'verify'
  status: IngestStepStatus
  label: string
  detail: string
  count?: number
  ms: number
}

export interface IngestResult {
  ok: boolean
  documentId: string
  filename: string
  country: string
  docType: string
  collection: string
  chunks: number
  inserted: number
  unchanged: number
  deactivated: number
  characters: number
  embeddingModel: string
  dimensions: number | null
  durationMs: number
  steps: IngestStep[]
  indexes: AtlasIndexInspection
  error?: string
}

export interface CorpusTotals {
  chunks: number
  activeChunks: number
  documents: number
  characters: number
  lastIngestedAt: string | null
}

export interface KnowledgeDocument {
  filename: string
  documentId: string
  chunks: number
  activeChunks: number
  characters: number
  country: string
  docType: string
  namespace?: string
  version?: string
  sourceUrl?: string
  lastIngestedAt: string | null
}

export interface KnowledgeStatus {
  collection: string
  collectionExists: boolean
  totals: CorpusTotals
  byCountry: Array<{ value: string; chunks: number }>
  byDocType: Array<{ value: string; chunks: number }>
  indexes: AtlasIndexInspection
  expectedIndexes: string[]
  embedding: {
    model: string
    rerankModel: string
    dimensions: number | null
    missingVectors: number
    mismatchedVectors: number
    voyageConfigured: boolean
  }
  recentRuns: IngestResult[]
}

/** Chunks are keyed by a content hash string, not an ObjectId. */
interface KbChunkDocument extends Document {
  _id: string
}

const INGEST_DEFAULTS = {
  collectionName: 'kb_chunks',
  embedBatch: 64,
  maxChunks: 1500,
}

function hashId(...parts: Array<string | number>): string {
  return createHash('sha256').update(parts.join('\u0000')).digest('hex')
}

function iso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value) return value
  return null
}

export class AtlasIngestor {
  private client: MongoClient | null = null
  private readonly voyage: VoyageClient
  private readonly collectionName: string
  private readonly recentRuns: IngestResult[] = []

  constructor(private readonly config: AtlasIngestorConfig) {
    this.voyage = new VoyageClient(config.voyage)
    this.collectionName = config.collectionName ?? INGEST_DEFAULTS.collectionName
  }

  private async db() {
    if (!this.client) {
      this.client = new MongoClient(this.config.mongodbUri)
      await this.client.connect()
    }
    return this.client.db(this.config.dbName)
  }

  private async chunks(): Promise<Collection<KbChunkDocument>> {
    return (await this.db()).collection<KbChunkDocument>(this.collectionName)
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
  }

  async ingest(input: IngestInput): Promise<IngestResult> {
    const started = Date.now()
    const steps: IngestStep[] = []
    type PendingStep = Omit<IngestStep, 'ms'> & { startedAt: number }
    const push = (step: PendingStep) => {
      const { startedAt, ...rest } = step
      steps.push({ ...rest, ms: Date.now() - startedAt })
    }
    const documentId = hashId('document', input.filename, input.version ?? '').slice(0, 24)
    const country = input.country || 'global'
    const docType = input.docType ?? 'policy'
    const jurisdiction = input.jurisdiction ?? 'national'

    const result: IngestResult = {
      ok: false,
      documentId,
      filename: input.filename,
      country,
      docType,
      collection: this.collectionName,
      chunks: 0,
      inserted: 0,
      unchanged: 0,
      deactivated: 0,
      characters: 0,
      embeddingModel: this.voyage.model,
      dimensions: null,
      durationMs: 0,
      steps,
      indexes: { supported: true, collectionExists: false, indexes: [] },
    }

    try {
      // 1 — validate ────────────────────────────────────────────────────────
      let stepStart = Date.now()
      const text = input.text.trim()
      if (text.length < 24) throw new Error('Document is too short (minimum 24 characters).')
      if (text.length > 2_000_000) throw new Error('Document is too large (maximum 2,000,000 characters).')
      push({
        id: 'validate',
        status: 'ok',
        label: 'Document accepted',
        detail: `${text.length.toLocaleString('en-US')} characters · ${country.toUpperCase()} · ${docType}`,
        count: text.length,
        startedAt: stepStart,
      })

      // 2 — chunk ───────────────────────────────────────────────────────────
      stepStart = Date.now()
      const chunks = chunkDocument(text, {
        maxChars: input.maxChars,
        overlapChars: input.overlapChars,
      })
      if (chunks.length === 0) throw new Error('No usable chunks were produced by the chunker.')
      if (chunks.length > INGEST_DEFAULTS.maxChunks) {
        throw new Error(`Document expands to ${chunks.length} chunks (limit ${INGEST_DEFAULTS.maxChunks}).`)
      }
      result.chunks = chunks.length
      result.characters = text.length
      const avg = Math.round(chunks.reduce((sum, chunk) => sum + chunk.text.length, 0) / chunks.length)
      push({
        id: 'chunk',
        status: 'ok',
        label: 'Chunked with provenance',
        detail: `${chunks.length} chunks · ~${avg} chars each · ${Math.max(0, input.overlapChars ?? 180)} chars overlap`,
        count: chunks.length,
        startedAt: stepStart,
      })

      const collection = await this.chunks()
      const records = chunks.map((chunk) => ({
        chunk,
        id: hashId('chunk', input.filename, input.version ?? '', chunk.chunkIndex, chunk.text),
      }))
      const ids = records.map((record) => record.id)
      const existing = await collection.find({ _id: { $in: ids } }, { projection: { _id: 1 } }).toArray()
      const existingIds = new Set(existing.map((doc) => String(doc._id)))
      const fresh = records.filter((record) => !existingIds.has(record.id))
      const unchanged = records.length - fresh.length

      // 3 — embed (only the chunks that are actually new) ──────────────────
      stepStart = Date.now()
      const vectors = new Map<string, number[]>()
      if (fresh.length === 0) {
        push({
          id: 'embed',
          status: 'skipped',
          label: 'Embedding skipped',
          detail: `All ${records.length} chunks already exist — content unchanged, no Voyage call.`,
          count: 0,
          startedAt: stepStart,
        })
      } else {
        for (let index = 0; index < fresh.length; index += INGEST_DEFAULTS.embedBatch) {
          const batch = fresh.slice(index, index + INGEST_DEFAULTS.embedBatch)
          const embeddings = await this.voyage.embed(
            batch.map((record) => record.chunk.text),
            'document',
          )
          batch.forEach((record, position) => {
            const vector = embeddings[position]
            if (!vector) throw new Error(`Voyage returned no vector for chunk ${record.chunk.chunkIndex}.`)
            vectors.set(record.id, vector)
          })
        }
        const first = vectors.values().next().value as number[] | undefined
        result.dimensions = first?.length ?? null
        push({
          id: 'embed',
          status: 'ok',
          label: `Embedded with ${this.voyage.model}`,
          detail: `${fresh.length} new chunks · ${result.dimensions ?? '?'} dimensions · ${Math.ceil(fresh.length / INGEST_DEFAULTS.embedBatch)} batch(es)`,
          count: fresh.length,
          startedAt: stepStart,
        })
      }

      // 4 — write (idempotent upsert + stale-version cleanup) ─────────────
      stepStart = Date.now()
      const now = new Date()
      if (fresh.length > 0) {
        await collection.bulkWrite(
          fresh.map((record) => ({
            replaceOne: {
              filter: { _id: record.id },
              replacement: {
                _id: record.id,
                documentId,
                contentHash: record.id,
                filename: input.filename,
                text: record.chunk.text,
                chunkIndex: record.chunk.chunkIndex,
                country,
                jurisdiction,
                docType,
                ...(input.namespace ? { namespace: input.namespace } : {}),
                ...(input.version ? { version: input.version } : {}),
                ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
                ...(input.pillar && input.pillar.length > 0 ? { pillar: input.pillar } : {}),
                ...(record.chunk.headingPath ? { headingPath: record.chunk.headingPath } : {}),
                ...(record.chunk.articleNumber ? { articleNumber: record.chunk.articleNumber } : {}),
                embedding: vectors.get(record.id),
                isActive: true,
                ingestedAt: now,
                metadata: { version: input.version ?? null, chunkChars: record.chunk.text.length },
              },
              upsert: true,
            },
          })),
          { ordered: false },
        )
      }
      if (ids.length > 0) {
        await collection.updateMany(
          { filename: input.filename, _id: { $in: ids } },
          {
            $set: {
              isActive: true,
              ingestedAt: now,
              documentId,
              country,
              jurisdiction,
              docType,
              ...(input.namespace ? { namespace: input.namespace } : {}),
              ...(input.version ? { version: input.version } : {}),
            },
          },
        )
      }
      // Chunks from a previous chunking of the same file are retired, not left
      // in the index to compete with the current version.
      const stale = await collection.updateMany(
        { filename: input.filename, _id: { $nin: ids }, isActive: true },
        { $set: { isActive: false, retiredAt: now } },
      )
      result.inserted = fresh.length
      result.unchanged = unchanged
      result.deactivated = stale.modifiedCount
      push({
        id: 'write',
        status: 'ok',
        label: 'Written to Atlas',
        detail: `${fresh.length} inserted · ${unchanged} unchanged · ${stale.modifiedCount} retired`,
        count: fresh.length,
        startedAt: stepStart,
      })

      // 5 — indexes ─────────────────────────────────────────────────────────
      stepStart = Date.now()
      result.indexes = await inspectAtlasIndexes({
        uri: this.config.mongodbUri,
        dbName: this.config.dbName,
        collection: this.collectionName,
      })
      const present = new Set(result.indexes.indexes.map((index) => index.name))
      const missing = KB_INDEX_DEFINITIONS.filter((index) => !present.has(index.name))
      if (missing.length > 0 && this.config.autoIndexes !== false) {
        const ensured = await ensureAtlasIndexes({
          uri: this.config.mongodbUri,
          dbName: this.config.dbName,
          collection: this.collectionName,
          indexes: KB_INDEX_DEFINITIONS,
        })
        result.indexes = await inspectAtlasIndexes({
          uri: this.config.mongodbUri,
          dbName: this.config.dbName,
          collection: this.collectionName,
        })
        push({
          id: 'indexes',
          status: ensured.supported ? 'ok' : 'warning',
          label: ensured.supported ? 'Atlas indexes ensured' : 'Atlas Search unavailable',
          detail: ensured.supported
            ? `created: ${ensured.created.join(', ') || 'none'} · updated: ${ensured.updated.join(', ') || 'none'} · unchanged: ${ensured.unchanged.join(', ') || 'none'}`
            : 'The deployment does not expose Atlas Search; only storage was updated.',
          startedAt: stepStart,
        })
      } else {
        const building = result.indexes.indexes.filter((index) => !index.queryable).length
        push({
          id: 'indexes',
          status: missing.length > 0 ? 'warning' : 'ok',
          label: missing.length > 0 ? 'Indexes missing' : 'Indexes present',
          detail:
            missing.length > 0
              ? `${missing.map((index) => index.name).join(', ')} not created — run the index repair.`
              : `${result.indexes.indexes.length} index(es) · ${building} still building`,
          startedAt: stepStart,
        })
      }

      // 6 — verify ──────────────────────────────────────────────────────────
      stepStart = Date.now()
      const total = await collection.countDocuments({ filename: input.filename, isActive: true })
      push({
        id: 'verify',
        status: 'ok',
        label: 'Corpus updated',
        detail: `${total} active chunk(s) for this document`,
        count: total,
        startedAt: stepStart,
      })

      result.ok = true
    } catch (error) {
      const message = (error as Error).message
      result.error = message
      steps.push({
        id: 'verify',
        status: 'error',
        label: 'Ingestion failed',
        detail: message,
        ms: Date.now() - started,
      })
    }

    result.durationMs = Date.now() - started
    if (!result.dimensions) {
      const sample = await (await this.chunks())
        .findOne({ embedding: { $exists: true } }, { projection: { embedding: 1 } })
        .catch(() => null)
      const vector = Array.isArray(sample?.embedding) ? (sample.embedding as number[]) : null
      result.dimensions = vector?.length ?? null
    }

    this.recentRuns.unshift(result)
    if (this.recentRuns.length > 8) this.recentRuns.length = 8
    return result
  }

  async ensureIndexes(): Promise<{ inspection: AtlasIndexInspection; ensured: Awaited<ReturnType<typeof ensureAtlasIndexes>> }> {
    const ensured = await ensureAtlasIndexes({
      uri: this.config.mongodbUri,
      dbName: this.config.dbName,
      collection: this.collectionName,
      indexes: KB_INDEX_DEFINITIONS,
    })
    const inspection = await inspectAtlasIndexes({
      uri: this.config.mongodbUri,
      dbName: this.config.dbName,
      collection: this.collectionName,
    })
    return { inspection, ensured }
  }

  async status(): Promise<KnowledgeStatus> {
    const db = await this.db()
    const exists = await db.listCollections({ name: this.collectionName }, { nameOnly: true }).hasNext()
    const inspection = await inspectAtlasIndexes({
      uri: this.config.mongodbUri,
      dbName: this.config.dbName,
      collection: this.collectionName,
    })

    const totals: CorpusTotals = {
      chunks: 0,
      activeChunks: 0,
      documents: 0,
      characters: 0,
      lastIngestedAt: null,
    }
    let byCountry: Array<{ value: string; chunks: number }> = []
    let byDocType: Array<{ value: string; chunks: number }> = []
    let dimensions: number | null = null
    let missingVectors = 0
    let mismatchedVectors = 0

    if (exists) {
      const collection = db.collection(this.collectionName)
      const [facet] = await collection
        .aggregate([
          {
            $facet: {
              totals: [
                {
                  $group: {
                    _id: null,
                    chunks: { $sum: 1 },
                    activeChunks: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
                    docs: { $addToSet: '$filename' },
                    characters: { $sum: { $strLenCP: { $ifNull: ['$text', ''] } } },
                    lastIngestedAt: { $max: '$ingestedAt' },
                  },
                },
              ],
              byCountry: [
                { $group: { _id: '$country', chunks: { $sum: 1 } } },
                { $sort: { chunks: -1 } },
                { $limit: 12 },
              ],
              byDocType: [
                { $group: { _id: '$docType', chunks: { $sum: 1 } } },
                { $sort: { chunks: -1 } },
                { $limit: 12 },
              ],
            },
          },
        ])
        .toArray()

      const scalar = (facet?.totals as Array<Record<string, unknown>> | undefined)?.[0]
      totals.chunks = Number(scalar?.chunks ?? 0)
      totals.activeChunks = Number(scalar?.activeChunks ?? 0)
      totals.documents = Array.isArray(scalar?.docs) ? scalar.docs.length : 0
      totals.characters = Number(scalar?.characters ?? 0)
      totals.lastIngestedAt = iso(scalar?.lastIngestedAt)
      byCountry = ((facet?.byCountry as Array<{ _id?: string; chunks?: number }>) ?? []).map((row) => ({
        value: row._id ?? 'unknown',
        chunks: row.chunks ?? 0,
      }))
      byDocType = ((facet?.byDocType as Array<{ _id?: string; chunks?: number }>) ?? []).map((row) => ({
        value: row._id ?? 'unknown',
        chunks: row.chunks ?? 0,
      }))

      const sample = await collection.findOne({ embedding: { $exists: true, $ne: null } }, { projection: { embedding: 1 } })
      dimensions = Array.isArray(sample?.embedding) ? (sample.embedding as number[]).length : null
      missingVectors = await collection.countDocuments({ isActive: true, embedding: { $exists: false } })
      if (dimensions) {
        mismatchedVectors = await collection.countDocuments({
          isActive: true,
          embedding: { $exists: true },
          $expr: { $ne: [{ $size: '$embedding' }, dimensions] },
        })
      }
    }

    return {
      collection: this.collectionName,
      collectionExists: exists,
      totals,
      byCountry,
      byDocType,
      indexes: inspection,
      expectedIndexes: KB_INDEX_DEFINITIONS.map((index) => index.name),
      embedding: {
        model: this.voyage.model,
        rerankModel: this.voyage.reranker,
        dimensions,
        missingVectors,
        mismatchedVectors,
        voyageConfigured: Boolean(this.config.voyage.apiKey),
      },
      recentRuns: this.recentRuns,
    }
  }

  async listDocuments(options: { limit?: number; query?: string; includeRetired?: boolean } = {}): Promise<KnowledgeDocument[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
    const filter: Document = options.includeRetired ? {} : { isActive: true }
    if (options.query) filter.filename = { $regex: options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }

    const rows = await (await this.chunks())
      .aggregate([
        { $match: filter },
        { $sort: { chunkIndex: 1 } },
        {
          $group: {
            _id: '$filename',
            documentId: { $first: '$documentId' },
            chunks: { $sum: 1 },
            activeChunks: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
            characters: { $sum: { $strLenCP: { $ifNull: ['$text', ''] } } },
            country: { $first: '$country' },
            docType: { $first: '$docType' },
            namespace: { $first: '$namespace' },
            version: { $first: '$version' },
            sourceUrl: { $first: '$sourceUrl' },
            lastIngestedAt: { $max: '$ingestedAt' },
          },
        },
        { $sort: { lastIngestedAt: -1 } },
        { $limit: limit },
      ])
      .toArray()

    return rows.map((row) => ({
      filename: String(row._id ?? ''),
      documentId: String(row.documentId ?? ''),
      chunks: Number(row.chunks ?? 0),
      activeChunks: Number(row.activeChunks ?? 0),
      characters: Number(row.characters ?? 0),
      country: String(row.country ?? ''),
      docType: String(row.docType ?? ''),
      ...(row.namespace ? { namespace: String(row.namespace) } : {}),
      ...(row.version ? { version: String(row.version) } : {}),
      ...(row.sourceUrl ? { sourceUrl: String(row.sourceUrl) } : {}),
      lastIngestedAt: iso(row.lastIngestedAt),
    }))
  }

  /** Soft-delete or restore every chunk of one document. */
  async setDocumentActive(filename: string, active: boolean): Promise<number> {
    const result = await (await this.chunks()).updateMany(
      { filename },
      { $set: { isActive: active, ...(active ? {} : { retiredAt: new Date() }) } },
    )
    return result.modifiedCount
  }

  async explore(query: RetrievalQuery): Promise<RetrievalExploration> {
    const retriever = new AtlasRetriever({
      mongodbUri: this.config.mongodbUri,
      dbName: this.config.dbName,
      collectionName: this.collectionName,
      ...(this.config.vectorIndex ? { vectorIndex: this.config.vectorIndex } : {}),
      ...(this.config.textIndex ? { textIndex: this.config.textIndex } : {}),
      voyage: this.config.voyage,
    })
    try {
      return await retriever.explore(query)
    } finally {
      await retriever.close()
    }
  }
}
