/**
 * Direct corpus ingestion, in-process, for every deployment mode:
 *
 *   text → heading-aware chunks → idempotent upsert into `kb_chunks` (content
 *   hash as `_id`) → lexical index ensured (Atlas Search in the cloud, a MongoDB
 *   text index elsewhere) → corpus/search status.
 *
 * No vector is computed: the Meta model of the mode plans, judges and ranks
 * at search time (see `AgenticRetriever`).
 *
 * Every step is timed and returned, so the Knowledge base screen can show what
 * happened instead of a spinner with no explanation.
 */

import { createHash, randomUUID } from 'node:crypto'
import { Binary, MongoClient, type Collection, type Document } from 'mongodb'
import { chunkDocument, type ChunkOptions } from '@sps/kb'
import { assertPublishableRights, normalizeCorpusRights } from '@sps/shared'
import type { CorpusRights, DocType, DocumentImage, Jurisdiction, ReadinessDimension } from '@sps/shared'

import { inspectAtlasIndexes, ensureAtlasIndexes, type AtlasIndexInspection } from './atlas-indexes'
import { KB_INDEX_DEFINITIONS } from './atlas-index-definitions'
import type { CorpusSearchMode } from './atlas'
import { mongoPoolOptions } from '@sps/shared'

export interface AtlasIngestorConfig {
  mongodbUri: string
  dbName: string
  collectionName?: string
  /** Atlas Search (cloud) or a MongoDB text index (local, sovereign). */
  searchMode: CorpusSearchMode
  /** Create missing indexes after a write (default true). */
  autoIndexes?: boolean
  textIndex?: string
}

/**
 * A figure to attach to a document. Bytes arrive as base64 (`dataBase64`) and are
 * stored once in `kb_images`; the citation only ever carries the metadata and a
 * URL, so retrieval stays light. A already-hosted `url` is accepted unchanged.
 */
export interface ImageInput {
  id?: string
  caption: string
  alt?: string
  tags?: string[]
  dimension?: ReadinessDimension
  articleNumber?: string
  headingPath?: string
  source?: DocumentImage['source']
  mime?: string
  dataBase64?: string
  url?: string
}

export interface IngestInput extends ChunkOptions {
  text: string
  filename: string
  country: string
  jurisdiction?: Jurisdiction
  docType?: DocType
  /** Reuse rights from the corpus manifest. Required: absent rights are refused. */
  rights: CorpusRights
  namespace?: string
  version?: string
  sourceUrl?: string
  pillar?: ReadinessDimension[]
  /** Figures attached to this document (stored separately, copied to citations). */
  images?: ImageInput[]
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
  rights: CorpusRights
  collection: string
  chunks: number
  inserted: number
  unchanged: number
  deactivated: number
  characters: number
  durationMs: number
  steps: IngestStep[]
  indexes: AtlasIndexInspection
  error?: string
}

export interface CorpusTotals {
  chunks: number
  activeChunks: number
  documents: number
  /** Figures attached to active documents; figures of retired documents are excluded. */
  figures: number
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
  rights: CorpusRights
  namespace?: string
  version?: string
  sourceUrl?: string
  lastIngestedAt: string | null
  title?: string
  summary?: string
  images: DocumentImage[]
}

/** One document opened in the console's preview modal. */
export interface DocumentPreview {
  document: KnowledgeDocument | null
  chunks: Array<{
    id: string
    chunkIndex: number
    text: string
    headingPath?: string
    articleNumber?: string
    images: DocumentImage[]
  }>
  images: DocumentImage[]
  /** Index of the requested chunk inside `chunks`, when it exists. */
  selected: number
}

export interface KnowledgeStatus {
  collection: string
  collectionExists: boolean
  totals: CorpusTotals
  byCountry: Array<{ value: string; chunks: number }>
  byDocType: Array<{ value: string; chunks: number }>
  indexes: AtlasIndexInspection
  expectedIndexes: string[]
  search: {
    /** `atlas` (Atlas Search) or `text` (MongoDB text index). */
    mode: CorpusSearchMode
  }
  recentRuns: IngestResult[]
}

/** Chunks are keyed by a content hash string, not an ObjectId. */
interface KbChunkDocument extends Document {
  _id: string
}

/** Bytes of one figure, keyed by image id. Metadata lives on `kb_images` too. */
interface KbImageDocument extends Document {
  _id: string
  filename: string
  documentId?: string
  caption: string
  alt?: string
  tags?: string[]
  dimension?: ReadinessDimension
  articleNumber?: string
  headingPath?: string
  source?: DocumentImage['source']
  mime: string
  data?: Binary
  externalUrl?: string
  createdAt: Date
}

const IMAGE_COLLECTION = 'kb_images'
/** One metadata record per document (title, summary), keyed by filename. */
const DOCUMENT_COLLECTION = 'kb_documents'

const INGEST_DEFAULTS = {
  collectionName: 'kb_chunks',
  embedBatch: 64,
  maxChunks: 3000,
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
  private readonly collectionName: string
  private readonly recentRuns: IngestResult[] = []

  constructor(private readonly config: AtlasIngestorConfig) {
    this.collectionName = config.collectionName ?? INGEST_DEFAULTS.collectionName
  }

  private async db() {
    if (!this.client) {
      this.client = new MongoClient(this.config.mongodbUri, mongoPoolOptions())
      await this.client.connect()
    }
    return this.client.db(this.config.dbName)
  }

  private async chunks(): Promise<Collection<KbChunkDocument>> {
    return (await this.db()).collection<KbChunkDocument>(this.collectionName)
  }

  private async imageCollection(): Promise<Collection<KbImageDocument>> {
    return (await this.db()).collection<KbImageDocument>(IMAGE_COLLECTION)
  }

  /** Public metadata of one image; the bytes stay on the server. */
  private imageMetadata(doc: KbImageDocument): DocumentImage {
    return {
      id: String(doc._id),
      url: doc.externalUrl ?? `/v1/kb/images/${encodeURIComponent(String(doc._id))}`,
      caption: doc.caption,
      ...(doc.alt ? { alt: doc.alt } : {}),
      ...(doc.tags && doc.tags.length > 0 ? { tags: doc.tags } : {}),
      ...(doc.dimension ? { dimension: doc.dimension } : {}),
      ...(doc.articleNumber ? { articleNumber: doc.articleNumber } : {}),
      ...(doc.headingPath ? { headingPath: doc.headingPath } : {}),
      ...(doc.source ? { source: doc.source } : {}),
    }
  }

  /** Every figure attached to a document, newest last. */
  async listImages(filename: string): Promise<DocumentImage[]> {
    const rows = await (await this.imageCollection()).find({ filename }).sort({ createdAt: 1 }).toArray()
    return rows.map((row) => this.imageMetadata(row))
  }

  /** Read one image's bytes for `GET /v1/kb/images/:id`. */
  async getImage(id: string): Promise<{ mime: string; data: Buffer; externalUrl?: string } | null> {
    const row = await (await this.imageCollection()).findOne({ _id: id })
    if (!row) return null
    if (row.externalUrl) return { mime: row.mime, data: Buffer.alloc(0), externalUrl: row.externalUrl }
    const data = row.data
    if (!data) return null
    return { mime: row.mime, data: Buffer.from(data.buffer) }
  }

  /**
   * Attach figures to an existing document. An entry that already has an `id`
   * updates only its metadata; a new `dataBase64` creates a new image.
   */
  async attachImages(filename: string, images: ImageInput[]): Promise<DocumentImage[]> {
    if (images.length === 0) return this.listImages(filename)
    const documentId = (await (await this.chunks()).findOne({ filename }, { projection: { documentId: 1 } }))?.documentId
    const collection = await this.imageCollection()
    for (const image of images.slice(0, 40)) {
      const id = image.id ?? `img_${randomUUID()}`
      if (image.dataBase64) {
        const mime = image.mime ?? 'image/png'
        const bytes = Buffer.from(image.dataBase64, 'base64')
        await collection.replaceOne(
          { _id: id },
          {
            _id: id,
            filename,
            ...(documentId ? { documentId: String(documentId) } : {}),
            caption: image.caption,
            ...(image.alt ? { alt: image.alt } : {}),
            ...(image.tags && image.tags.length > 0 ? { tags: image.tags } : {}),
            ...(image.dimension ? { dimension: image.dimension } : {}),
            ...(image.articleNumber ? { articleNumber: image.articleNumber } : {}),
            ...(image.headingPath ? { headingPath: image.headingPath } : {}),
            source: image.source ?? 'upload',
            mime,
            data: new Binary(bytes),
            createdAt: new Date(),
          },
          { upsert: true },
        )
      } else {
        const patch = {
          caption: image.caption,
          ...(image.alt ? { alt: image.alt } : {}),
          ...(image.tags && image.tags.length > 0 ? { tags: image.tags } : {}),
          ...(image.dimension ? { dimension: image.dimension } : {}),
          ...(image.articleNumber ? { articleNumber: image.articleNumber } : {}),
          ...(image.headingPath ? { headingPath: image.headingPath } : {}),
          ...(image.source ? { source: image.source } : {}),
          ...(image.url ? { externalUrl: image.url, mime: image.mime ?? 'image/svg+xml' } : {}),
        }
        await collection.updateOne(
          { _id: id },
          {
            $set: patch,
            $setOnInsert: {
              filename,
              ...(documentId ? { documentId: String(documentId) } : {}),
              createdAt: new Date(),
            },
          },
          { upsert: true },
        )
      }
    }
    return this.listImages(filename)
  }

  /** Re-read the image metadata for a set of files in one query. */
  async imagesByFilename(filenames: string[]): Promise<Map<string, DocumentImage[]>> {
    const unique = [...new Set(filenames.filter(Boolean))]
    const out = new Map<string, DocumentImage[]>()
    if (unique.length === 0) return out
    const rows = await (await this.imageCollection()).find({ filename: { $in: unique } }).sort({ createdAt: 1 }).toArray()
    for (const row of rows) {
      const list = out.get(row.filename) ?? []
      list.push(this.imageMetadata(row))
      out.set(row.filename, list)
    }
    return out
  }

  /** One document with its passages, for the citation preview modal. */
  async preview(filename: string, chunkIndex?: number): Promise<DocumentPreview> {
    const [documents, images, rows] = await Promise.all([
      this.listDocuments({ query: filename, limit: 200, includeRetired: true }),
      this.listImages(filename),
      // Every passage of the document: a long policy has more than a few hundred.
      (await this.chunks()).find({ filename }).sort({ chunkIndex: 1 }).limit(10_000).toArray(),
    ])
    const document = documents.find((entry) => entry.filename === filename) ?? null
    const chunks = rows.map((row) => ({
      id: String(row._id),
      chunkIndex: Number(row.chunkIndex ?? 0),
      text: String(row.text ?? ''),
      ...(row.headingPath ? { headingPath: String(row.headingPath) } : {}),
      ...(row.articleNumber ? { articleNumber: String(row.articleNumber) } : {}),
      images,
    }))
    // -1 when the requested passage is not in the document: never a silent jump to the first one.
    const selected = chunkIndex === undefined ? 0 : chunks.findIndex((chunk) => chunk.chunkIndex === chunkIndex)
    return { document, chunks, images, selected }
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
    // Fail closed before touching Atlas: the manifest's rights decide whether the
    // full text may be stored at all (see docs/LICENSING.md).
    const rights = assertPublishableRights(input.rights, input.filename)

    const result: IngestResult = {
      ok: false,
      documentId,
      filename: input.filename,
      country,
      docType,
      rights,
      collection: this.collectionName,
      chunks: 0,
      inserted: 0,
      unchanged: 0,
      deactivated: 0,
      characters: 0,
      durationMs: 0,
      steps,
      indexes: { supported: true, collectionExists: false, indexes: [] },
    }

    try {
      // 1 · validate ────────────────────────────────────────────────────────
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

      // 2 · chunk ───────────────────────────────────────────────────────────
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

      // 3 · write (idempotent upsert + stale-version cleanup) ─────────────
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
                rights,
                ...(input.namespace ? { namespace: input.namespace } : {}),
                ...(input.version ? { version: input.version } : {}),
                ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
                ...(input.pillar && input.pillar.length > 0 ? { pillar: input.pillar } : {}),
                ...(record.chunk.headingPath ? { headingPath: record.chunk.headingPath } : {}),
                ...(record.chunk.articleNumber ? { articleNumber: record.chunk.articleNumber } : {}),
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
              rights,
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

      // 4 · indexes ─────────────────────────────────────────────────────────
      stepStart = Date.now()
      if (this.config.searchMode === 'text') {
        await this.ensureTextIndex(collection)
        push({
          id: 'indexes',
          status: 'ok',
          label: 'Text index ensured',
          detail: 'MongoDB text index on the passages (lexical search).',
          startedAt: stepStart,
        })
      } else {
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
              ? `${missing.map((index) => index.name).join(', ')} not created · run the index repair.`
              : `${result.indexes.indexes.length} index(es) · ${building} still building`,
          startedAt: stepStart,
        })
      }
      }

      // 5 · verify ──────────────────────────────────────────────────────────
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

      if (input.images && input.images.length > 0) {
        await this.attachImages(input.filename, input.images)
      }
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

    this.recentRuns.unshift(result)
    if (this.recentRuns.length > 8) this.recentRuns.length = 8
    return result
  }

  async ensureIndexes(): Promise<{ inspection: AtlasIndexInspection; ensured: Awaited<ReturnType<typeof ensureAtlasIndexes>> }> {
    if (this.config.searchMode === 'text') await this.ensureTextIndex(await this.chunks())
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
      figures: 0,
      characters: 0,
      lastIngestedAt: null,
    }
    let byCountry: Array<{ value: string; chunks: number }> = []
    let byDocType: Array<{ value: string; chunks: number }> = []

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
                    docs: { $addToSet: { $cond: [{ $ne: ['$isActive', false] }, '$filename', null] } },
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
      const activeFilenames = Array.isArray(scalar?.docs)
        ? (scalar.docs as Array<string | null>).filter((name): name is string => Boolean(name))
        : []
      totals.documents = activeFilenames.length
      // Figures live in their own collection; retired documents keep theirs, so
      // count only the ones still attached to an active document.
      if (activeFilenames.length > 0) {
        totals.figures = await db.collection(IMAGE_COLLECTION).countDocuments({ filename: { $in: activeFilenames } })
      }
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
    }

    return {
      collection: this.collectionName,
      collectionExists: exists,
      totals,
      byCountry,
      byDocType,
      indexes: inspection,
      expectedIndexes: KB_INDEX_DEFINITIONS.map((index) => index.name),
      search: { mode: this.config.searchMode },
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
        // Drop the bulky fields before sorting: retired chunkings of the same
        // file stay next to the current one, and the old passages may predate
        // the rights field. Sorting them last makes the reported rights, country
        // and docType come from the active chunking.
        {
          $project: {
            filename: 1,
            documentId: 1,
            isActive: 1,
            country: 1,
            docType: 1,
            rights: 1,
            namespace: 1,
            version: 1,
            sourceUrl: 1,
            ingestedAt: 1,
            textLength: { $strLenCP: { $ifNull: ['$text', ''] } },
          },
        },
        { $sort: { isActive: -1, _id: 1 } },
        {
          $group: {
            _id: '$filename',
            documentId: { $first: '$documentId' },
            chunks: { $sum: 1 },
            activeChunks: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } },
            characters: { $sum: '$textLength' },
            country: { $first: '$country' },
            docType: { $first: '$docType' },
            rights: { $first: '$rights' },
            namespace: { $first: '$namespace' },
            version: { $first: '$version' },
            sourceUrl: { $first: '$sourceUrl' },
            lastIngestedAt: { $max: '$ingestedAt' },
          },
        },
        { $sort: { lastIngestedAt: -1 } },
        { $limit: limit },
      ], { allowDiskUse: true })
      .toArray()

    const images = await this.imagesByFilename(rows.map((row) => String(row._id ?? '')))
    const details = await this.documentDetails()
    return rows.map((row) => {
      const filename = String(row._id ?? '')
      const figures = images.get(filename) ?? []
      return {
        ...details.get(filename),
        filename,
        documentId: String(row.documentId ?? ''),
        chunks: Number(row.chunks ?? 0),
        activeChunks: Number(row.activeChunks ?? 0),
        characters: Number(row.characters ?? 0),
        country: String(row.country ?? ''),
        docType: String(row.docType ?? ''),
        rights: normalizeCorpusRights(row.rights),
        ...(row.namespace ? { namespace: String(row.namespace) } : {}),
        ...(row.version ? { version: String(row.version) } : {}),
        ...(row.sourceUrl ? { sourceUrl: String(row.sourceUrl) } : {}),
        lastIngestedAt: iso(row.lastIngestedAt),
        images: figures,
      }
    })
  }

  /** Soft-delete or restore every chunk of one document. */
  async setDocumentActive(filename: string, active: boolean): Promise<number> {
    const result = await (await this.chunks()).updateMany(
      { filename },
      { $set: { isActive: active, ...(active ? {} : { retiredAt: new Date() }) } },
    )
    return result.modifiedCount
  }

  /** Remove one document for good: its passages, its figures and its metadata. */
  async deleteDocument(filename: string): Promise<{ chunks: number; images: number }> {
    const chunks = await (await this.chunks()).deleteMany({ filename })
    const images = await (await this.imageCollection()).deleteMany({ filename })
    await (await this.db()).collection(DOCUMENT_COLLECTION).deleteOne({ _id: filename as never })
    return { chunks: chunks.deletedCount, images: images.deletedCount }
  }

  /**
   * Remove several documents in one pass. Used by the rights purge utility
   * (`scripts/purge-kb.ts`) after an operator has reviewed a dry run: the
   * caller is responsible for confirming the list and for passing `--apply`.
   */
  async purgeDocuments(filenames: string[]): Promise<{ documents: number; chunks: number; images: number }> {
    if (filenames.length === 0) return { documents: 0, chunks: 0, images: 0 }
    const chunks = await (await this.chunks()).deleteMany({ filename: { $in: filenames } })
    const images = await (await this.imageCollection()).deleteMany({ filename: { $in: filenames } })
    const documents = await (await this.db())
      .collection(DOCUMENT_COLLECTION)
      .deleteMany({ _id: { $in: filenames as never[] } })
    return { documents: documents.deletedCount, chunks: chunks.deletedCount, images: images.deletedCount }
  }

  /** Document-level metadata the console edits (title, summary) and the chunk fields it propagates. */
  async updateDocument(
    filename: string,
    patch: {
      title?: string
      summary?: string
      country?: string
      docType?: DocType
      namespace?: string
      version?: string
      sourceUrl?: string
    },
  ): Promise<number> {
    const db = await this.db()
    const { title, summary, ...chunkFields } = patch
    await db
      .collection(DOCUMENT_COLLECTION)
      .updateOne({ _id: filename as never }, { $set: { filename, title: title ?? '', summary: summary ?? '', updatedAt: new Date() } }, { upsert: true })
    const set: Document = Object.fromEntries(Object.entries(chunkFields).filter(([, value]) => value !== undefined && value !== ''))
    if (Object.keys(set).length === 0) return 0
    const result = await (await this.chunks()).updateMany({ filename }, { $set: set })
    return result.modifiedCount
  }

  /** Title and summary of every document, keyed by filename. */
  async documentDetails(): Promise<Map<string, { title?: string; summary?: string }>> {
    const rows = await (await this.db()).collection(DOCUMENT_COLLECTION).find({}).toArray()
    return new Map(
      rows.map((row) => [
        String(row.filename ?? row._id),
        { ...(row.title ? { title: String(row.title) } : {}), ...(row.summary ? { summary: String(row.summary) } : {}) },
      ]),
    )
  }

  /** Edit one passage. The lexical index follows the new text on its own. */
  async updateChunk(id: string, patch: { text?: string; active?: boolean }): Promise<boolean> {
    const collection = await this.chunks()
    const update: Document = {}
    if (typeof patch.active === 'boolean') {
      update.isActive = patch.active
      update.retiredAt = patch.active ? null : new Date()
    }
    if (typeof patch.text === 'string') {
      const text = patch.text.trim()
      if (text.length < 24) throw new Error('A passage must keep at least 24 characters.')
      update.text = text
      update.metadata = { chunkChars: text.length, editedAt: new Date() }
    }
    if (Object.keys(update).length === 0) return false
    const result = await collection.updateOne({ _id: id }, { $set: update })
    return result.matchedCount > 0
  }

  /** Edit a figure's metadata (caption, alt, tags, dimension). The bytes are untouched. */
  async updateImage(
    id: string,
    patch: { caption?: string; alt?: string; tags?: string[]; dimension?: ReadinessDimension | null },
  ): Promise<boolean> {
    const set: Document = {}
    if (patch.caption !== undefined) set.caption = patch.caption
    if (patch.alt !== undefined) set.alt = patch.alt
    if (patch.tags !== undefined) set.tags = patch.tags
    if (patch.dimension !== undefined) set.dimension = patch.dimension ?? null
    if (Object.keys(set).length === 0) return false
    const result = await (await this.imageCollection()).updateOne({ _id: id }, { $set: set })
    return result.matchedCount > 0
  }

  async deleteImage(id: string): Promise<boolean> {
    const result = await (await this.imageCollection()).deleteOne({ _id: id })
    return result.deletedCount > 0
  }

  /** Read one document's chunks (all, retired included) for the editor. */
  async chunksOf(filename: string): Promise<Array<{ id: string; chunkIndex: number; text: string; isActive: boolean; headingPath?: string; articleNumber?: string }>> {
    const rows = await (await this.chunks()).find({ filename }).sort({ chunkIndex: 1 }).limit(400).toArray()
    return rows.map((row) => ({
      id: String(row._id),
      chunkIndex: Number(row.chunkIndex ?? 0),
      text: String(row.text ?? ''),
      isActive: row.isActive !== false,
      ...(row.headingPath ? { headingPath: String(row.headingPath) } : {}),
      ...(row.articleNumber ? { articleNumber: String(row.articleNumber) } : {}),
    }))
  }

  /**
   * MongoDB text index for the local and sovereign modes. No language: the
   * corpus mixes French and English, so no stemming; matching is case- and
   * diacritic-insensitive.
   */
  private async ensureTextIndex(collection: Collection<KbChunkDocument>): Promise<void> {
    await collection.createIndex(
      { text: 'text' },
      { name: this.config.textIndex ?? 'sps_text_index', default_language: 'none', language_override: 'textLanguage' },
    )
    await collection.createIndex({ filename: 1, articleNumber: 1, chunkIndex: 1 }, { name: 'sps_article_lookup' })
  }
}
