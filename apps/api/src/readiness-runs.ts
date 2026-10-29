/**
 * Saved readiness assessments, so the console can list past runs and reopen one
 * with its date, the operator who ran it, and every score and recommendation.
 *
 * A run that stopped on an error is kept too, as `failed`, with the dimensions it
 * had scored and the settings it ran with: it can then be resumed where it stopped.
 *
 * Mongo when it is reachable, memory otherwise; always scoped to the operator.
 */
import { randomUUID } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'
import type { ReadinessReport } from '@sps/readiness'

export type ReadinessRunStatus = 'complete' | 'failed'

/** The settings an assessment ran with, so an interrupted one can be resumed. */
export interface ReadinessRunInput {
  country: string
  domain: string
  globalCountry: string
  dimensions?: string[]
  perDimensionK?: number
  useWeb?: boolean
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high'
  models?: { webSearch?: string; evaluate?: string; synthesis?: string }
  concurrency?: 'parallel' | 'sequential' | 'orchestrated'
  /** Orchestrated mode: the most decisions the lead agent may take. */
  maxDecisions?: number
  /** The language of the lead agent's reasons (the console's). */
  language?: 'fr' | 'en'
  /** The series this assessment belongs to: one assessment per sector, run together. */
  batchId?: string
}

export interface ReadinessRunSummary {
  id: string
  country: string
  domain: string
  createdAt: string
  runBy: string
  composite: number | null
  dimensions: number
  status: ReadinessRunStatus
  /** Why a failed run stopped, in the provider's words. */
  failure?: string
  batchId?: string
}

export interface ReadinessRun extends ReadinessRunSummary {
  report: ReadinessReport
  input?: ReadinessRunInput
}

function summaryOfDoc(doc: Document): ReadinessRunSummary {
  return {
    id: String(doc._id),
    country: String(doc.country),
    domain: String(doc.domain),
    createdAt: String(doc.createdAt),
    runBy: String(doc.runBy ?? ''),
    composite: typeof doc.composite === 'number' ? doc.composite : null,
    dimensions: Number(doc.dimensions ?? 0),
    status: doc.status === 'failed' ? 'failed' : 'complete',
    ...(typeof doc.failure === 'string' ? { failure: doc.failure } : {}),
    ...(typeof doc.batchId === 'string' ? { batchId: doc.batchId } : {}),
  }
}

/**
 * The sector names the search understands, in both consoles' languages. The server
 * has no dictionary of the console, so the labels are listed here (see i18n).
 */
const SECTOR_NAMES: Record<string, string[]> = {
  health: ['health', 'santé'],
  education: ['education', 'éducation'],
  telecom: ['telecom', 'télécoms'],
  public_services: ['public services', 'services publics'],
  agriculture: ['agriculture'],
}

const plain = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** The sectors whose id or name (either language, without accents) contains the search text. */
export function sectorsMatching(needle: string): string[] {
  const wanted = plain(needle)
  return Object.entries(SECTOR_NAMES)
    .filter(([id, names]) => [id, ...names].some((name) => plain(name).includes(wanted)))
    .map(([id]) => id)
}

export class ReadinessRunStore {
  private readonly memory = new Map<string, ReadinessRun & { userId: string }>()
  private client: MongoClient | null = null
  private collection: Collection<Document> | null = null

  constructor(private readonly options: { mongodbUri?: string; dbName?: string }) {}

  private async col(): Promise<Collection<Document> | null> {
    if (!this.options.mongodbUri) return null
    if (this.collection) return this.collection
    try {
      if (!this.client) {
        this.client = new MongoClient(this.options.mongodbUri, { serverSelectionTimeoutMS: 4000 })
        await this.client.connect()
      }
      this.collection = this.client.db(this.options.dbName ?? 'policy_sandbox').collection('readiness_runs')
      return this.collection
    } catch {
      this.client = null
      return null
    }
  }

  private summary(run: ReadinessRun): ReadinessRunSummary {
    const { report: _report, input: _input, ...rest } = run
    return rest
  }

  async save(input: {
    userId: string
    runBy: string
    report: ReadinessReport
    status?: ReadinessRunStatus
    failure?: string
    input?: ReadinessRunInput
  }): Promise<ReadinessRunSummary> {
    const run: ReadinessRun = {
      id: `rr_${randomUUID()}`,
      country: input.report.country,
      domain: input.report.domain,
      createdAt: new Date().toISOString(),
      runBy: input.runBy,
      composite: input.report.scenario?.composite ?? null,
      dimensions: input.report.scores.length,
      status: input.status ?? 'complete',
      ...(input.failure ? { failure: input.failure } : {}),
      report: input.report,
      ...(input.input ? { input: input.input } : {}),
      ...(input.input?.batchId ? { batchId: input.input.batchId } : {}),
    }
    this.memory.set(run.id, { ...run, userId: input.userId })
    const col = await this.col()
    if (col) {
      await col.insertOne({ _id: run.id as unknown as Document['_id'], userId: input.userId, ...run }).catch(() => undefined)
    }
    return this.summary(run)
  }

  /** One page of the operator's assessments, newest first, filtered on the server. */
  async page(
    userId: string,
    query: { page: number; limit: number; q?: string; domains?: string[]; statuses?: ReadinessRunStatus[] },
  ): Promise<{ runs: ReadinessRunSummary[]; total: number }> {
    const { page, limit } = query
    const needle = query.q?.trim().toLowerCase() ?? ''
    const domains = query.domains ?? []
    const statuses = query.statuses ?? []
    const sectors = needle ? sectorsMatching(needle) : []
    const col = await this.col()
    if (col) {
      const filter: Record<string, unknown> = { userId }
      if (domains.length) filter.domain = { $in: domains }
      if (statuses.length) filter.status = { $in: statuses }
      if (needle) {
        const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        filter.$or = [{ country: pattern }, { runBy: pattern }, ...(sectors.length ? [{ domain: { $in: sectors } }] : [])]
      }
      const [docs, total] = await Promise.all([
        col
          .find(filter, { projection: { report: 0, input: 0, userId: 0 } })
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray()
          .catch(() => null),
        col.countDocuments(filter).catch(() => null),
      ])
      if (docs && total !== null) return { runs: docs.map(summaryOfDoc), total }
    }
    const matching = [...this.memory.values()]
      .filter(
        (run) =>
          run.userId === userId &&
          (!domains.length || domains.includes(run.domain)) &&
          (!statuses.length || statuses.includes(run.status)) &&
          (!needle || sectors.includes(run.domain) || [run.country, run.runBy].some((value) => value.toLowerCase().includes(needle))),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { runs: matching.slice((page - 1) * limit, page * limit).map((run) => this.summary(run)), total: matching.length }
  }

  async list(userId: string, limit = 50): Promise<ReadinessRunSummary[]> {
    const col = await this.col()
    if (col) {
      const docs = await col
        .find({ userId }, { projection: { report: 0, input: 0, userId: 0 } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray()
        .catch(() => null)
      if (docs) return docs.map(summaryOfDoc)
    }
    return [...this.memory.values()]
      .filter((run) => run.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((run) => this.summary(run))
  }

  /** The runs of one series of this operator, oldest first, with their reports. */
  async listBatch(userId: string, batchId: string): Promise<ReadinessRun[]> {
    const col = await this.col()
    if (col) {
      const docs = await col.find({ userId, batchId }).sort({ createdAt: 1 }).toArray().catch(() => null)
      if (docs) {
        return docs.map((doc) => {
          const { _id, userId: _owner, ...rest } = doc
          return { id: String(_id), ...(rest as unknown as Omit<ReadinessRun, 'id'>), status: rest.status === 'failed' ? 'failed' : 'complete' }
        })
      }
    }
    return [...this.memory.values()]
      .filter((run) => run.userId === userId && run.batchId === batchId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(({ userId: _owner, ...rest }) => rest)
  }

  /** Removes a saved run of this operator. False when it does not exist for them. */
  async delete(id: string, userId: string): Promise<boolean> {
    const current = await this.get(id, userId)
    if (!current) return false
    this.memory.delete(id)
    const col = await this.col()
    if (col) {
      // A failed delete is reported to the console, never silently kept.
      const result = await col.deleteOne({ _id: id as unknown as Document['_id'], userId })
      if (result.deletedCount !== 1) throw new Error('The assessment could not be deleted.')
    }
    return true
  }

  /**
   * Replaces the report of a saved run, and its status: a language added to a
   * complete run, or a failed run that has been resumed and finished.
   */
  async updateRun(
    id: string,
    userId: string,
    patch: { report: ReadinessReport; status: ReadinessRunStatus; failure?: string },
  ): Promise<ReadinessRun | null> {
    const current = await this.get(id, userId)
    if (!current) return null
    const { failure: _previous, ...rest } = current
    const updated: ReadinessRun = {
      ...rest,
      report: patch.report,
      status: patch.status,
      composite: patch.report.scenario?.composite ?? null,
      dimensions: patch.report.scores.length,
      ...(patch.failure ? { failure: patch.failure } : {}),
    }
    const cached = this.memory.get(id)
    if (cached && cached.userId === userId) this.memory.set(id, { ...updated, userId })
    const col = await this.col()
    if (col) {
      await col
        .updateOne(
          { _id: id as unknown as Document['_id'], userId },
          {
            $set: {
              report: updated.report,
              status: updated.status,
              composite: updated.composite,
              dimensions: updated.dimensions,
              ...(patch.failure ? { failure: patch.failure } : {}),
            },
            ...(patch.failure ? {} : { $unset: { failure: '' } }),
          },
        )
        .catch(() => undefined)
    }
    return updated
  }

  async get(id: string, userId: string): Promise<ReadinessRun | null> {
    const col = await this.col()
    if (col) {
      const doc = await col.findOne({ _id: id as unknown as Document['_id'], userId }).catch(() => null)
      if (doc) {
        const { _id, userId: _owner, ...rest } = doc
        return { id: String(_id), ...(rest as unknown as Omit<ReadinessRun, 'id'>), status: rest.status === 'failed' ? 'failed' : 'complete' }
      }
    }
    const cached = this.memory.get(id)
    if (!cached || cached.userId !== userId) return null
    const { userId: _owner, ...rest } = cached
    return rest
  }
}
