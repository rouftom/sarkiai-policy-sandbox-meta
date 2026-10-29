/**
 * Saved readiness assessments, so the console can list past runs and reopen one
 * with its date, the operator who ran it, and every score and recommendation.
 *
 * Mongo when it is reachable, memory otherwise; always scoped to the operator.
 */
import { randomUUID } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'
import type { ReadinessReport } from '@sps/readiness'

export interface ReadinessRunSummary {
  id: string
  country: string
  domain: string
  createdAt: string
  runBy: string
  composite: number | null
  dimensions: number
}

export interface ReadinessRun extends ReadinessRunSummary {
  report: ReadinessReport
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
    const { report: _report, ...rest } = run
    return rest
  }

  async save(input: { userId: string; runBy: string; report: ReadinessReport }): Promise<ReadinessRunSummary> {
    const run: ReadinessRun = {
      id: `rr_${randomUUID()}`,
      country: input.report.country,
      domain: input.report.domain,
      createdAt: new Date().toISOString(),
      runBy: input.runBy,
      composite: input.report.scenario?.composite ?? null,
      dimensions: input.report.scores.length,
      report: input.report,
    }
    this.memory.set(run.id, { ...run, userId: input.userId })
    const col = await this.col()
    if (col) {
      await col.insertOne({ _id: run.id as unknown as Document['_id'], userId: input.userId, ...run }).catch(() => undefined)
    }
    return this.summary(run)
  }

  async list(userId: string, limit = 50): Promise<ReadinessRunSummary[]> {
    const col = await this.col()
    if (col) {
      const docs = await col
        .find({ userId }, { projection: { report: 0, userId: 0 } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray()
        .catch(() => null)
      if (docs) {
        return docs.map((doc) => ({
          id: String(doc._id),
          country: String(doc.country),
          domain: String(doc.domain),
          createdAt: String(doc.createdAt),
          runBy: String(doc.runBy ?? ''),
          composite: typeof doc.composite === 'number' ? doc.composite : null,
          dimensions: Number(doc.dimensions ?? 0),
        }))
      }
    }
    return [...this.memory.values()]
      .filter((run) => run.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((run) => this.summary(run))
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

  /** Replaces the report of a saved run (e.g. once a language has been added to it). */
  async updateReport(id: string, userId: string, report: ReadinessReport): Promise<ReadinessRun | null> {
    const current = await this.get(id, userId)
    if (!current) return null
    const updated: ReadinessRun = { ...current, report }
    const cached = this.memory.get(id)
    if (cached && cached.userId === userId) this.memory.set(id, { ...updated, userId })
    const col = await this.col()
    if (col) {
      await col.updateOne({ _id: id as unknown as Document['_id'], userId }, { $set: { report } }).catch(() => undefined)
    }
    return updated
  }

  async get(id: string, userId: string): Promise<ReadinessRun | null> {
    const col = await this.col()
    if (col) {
      const doc = await col.findOne({ _id: id as unknown as Document['_id'], userId }).catch(() => null)
      if (doc) {
        const { _id, userId: _owner, ...rest } = doc
        return { id: String(_id), ...(rest as unknown as Omit<ReadinessRun, 'id'>) }
      }
    }
    const cached = this.memory.get(id)
    if (!cached || cached.userId !== userId) return null
    const { userId: _owner, ...rest } = cached
    return rest
  }
}
