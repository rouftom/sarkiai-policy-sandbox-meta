/**
 * Saved scenario runs: what was released so far, the joint reports, the status,
 * and the reason a run stopped. A run can be reopened and resumed after an
 * error, from the last tick that was released.
 *
 * Mongo when it is reachable, memory otherwise; always scoped to the operator.
 */
import { MongoClient, type Collection, type Document } from 'mongodb'
import type { JointSituationReport } from '@sps/shared'
import type { ScenarioLang } from './scenarios.js'

export type ScenarioRunStatus = 'running' | 'complete' | 'failed'

export interface ScenarioRunRecord {
  id: string
  userId: string
  country: string
  domain: string
  lang: ScenarioLang
  title: string
  createdAt: string
  updatedAt: string
  status: ScenarioRunStatus
  /** Why a run stopped, in the provider's words. */
  failure?: string
  released: number
  total: number
  reports: JointSituationReport[]
}

export interface ScenarioRunSummary {
  id: string
  country: string
  domain: string
  lang: ScenarioLang
  title: string
  createdAt: string
  updatedAt: string
  status: ScenarioRunStatus
  failure?: string
  released: number
  total: number
}

function summaryOf(record: ScenarioRunRecord): ScenarioRunSummary {
  const { userId: _owner, reports: _reports, ...rest } = record
  return rest
}

function summaryOfDoc(doc: Document): ScenarioRunSummary {
  return {
    id: String(doc._id),
    country: String(doc.country),
    domain: String(doc.domain),
    lang: doc.lang === 'fr' ? 'fr' : 'en',
    title: String(doc.title),
    createdAt: String(doc.createdAt),
    updatedAt: String(doc.updatedAt ?? doc.createdAt),
    status: doc.status === 'failed' || doc.status === 'complete' ? doc.status : 'running',
    ...(typeof doc.failure === 'string' ? { failure: doc.failure } : {}),
    released: Number(doc.released ?? 0),
    total: Number(doc.total ?? 0),
  }
}

export class ScenarioRunStore {
  private readonly memory = new Map<string, ScenarioRunRecord>()
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
      this.collection = this.client.db(this.options.dbName ?? 'policy_sandbox').collection('scenario_runs')
      return this.collection
    } catch {
      this.client = null
      return null
    }
  }

  async create(record: Omit<ScenarioRunRecord, 'createdAt' | 'updatedAt'>): Promise<ScenarioRunSummary> {
    const now = new Date().toISOString()
    const full: ScenarioRunRecord = { ...record, createdAt: now, updatedAt: now }
    this.memory.set(full.id, full)
    const col = await this.col()
    if (col) {
      await col.insertOne({ _id: full.id as unknown as Document['_id'], ...full }).catch(() => undefined)
    }
    return summaryOf(full)
  }

  /**
   * Updates the progress of one run of this operator. The failure is kept only while
   * the run is failed: resuming it clears the reason. Null when the run does not exist for them.
   */
  async update(
    id: string,
    userId: string,
    patch: Partial<Pick<ScenarioRunRecord, 'released' | 'reports' | 'status' | 'failure'>>,
  ): Promise<ScenarioRunRecord | null> {
    const current = await this.get(id, userId)
    if (!current) return null
    const { failure: _previous, ...rest } = current
    const { failure: patchFailure, ...progress } = patch
    const failure = progress.status === 'failed' ? patchFailure : progress.status === undefined ? current.failure : undefined
    const updated: ScenarioRunRecord = {
      ...rest,
      ...progress,
      updatedAt: new Date().toISOString(),
      ...(failure ? { failure } : {}),
    }
    this.memory.set(id, updated)
    const col = await this.col()
    if (col) {
      await col
        .updateOne(
          { _id: id as unknown as Document['_id'], userId },
          {
            $set: {
              released: updated.released,
              reports: updated.reports,
              status: updated.status,
              updatedAt: updated.updatedAt,
              ...(failure ? { failure } : {}),
            },
            ...(failure ? {} : { $unset: { failure: '' } }),
          },
        )
        .catch(() => undefined)
    }
    return updated
  }

  async list(userId: string, limit = 50): Promise<ScenarioRunSummary[]> {
    const col = await this.col()
    if (col) {
      const docs = await col
        .find({ userId }, { projection: { reports: 0, userId: 0 } })
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
      .map(summaryOf)
  }

  /** Every scenario run for a country, across operators: the country dashboard. */
  async byCountry(country: string, limit = 200): Promise<ScenarioRunSummary[]> {
    const col = await this.col()
    if (col) {
      const docs = await col
        .find({ country }, { projection: { reports: 0 } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray()
        .catch(() => null)
      if (docs) return docs.map(summaryOfDoc)
    }
    return [...this.memory.values()]
      .filter((run) => run.country === country)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(summaryOf)
  }

  /** How many scenario runs reference a country, across operators (deletion guard). */
  async countForCountry(country: string): Promise<number> {
    const col = await this.col()
    if (col) {
      const count = await col.countDocuments({ country }).catch(() => null)
      if (count !== null) return count
    }
    return [...this.memory.values()].filter((run) => run.country === country).length
  }

  /**
   * Deletes one run of this operator. The audit trail and the chain-of-thought
   * traces stay in the journal: they are the record of what was played, and the
   * journal is append-only. False when the run does not exist for them.
   */
  async delete(id: string, userId: string): Promise<boolean> {
    const known = await this.get(id, userId)
    if (!known) return false
    this.memory.delete(id)
    const col = await this.col()
    if (col) {
      // A failed delete is reported to the operator, never silently kept.
      const result = await col.deleteOne({ _id: id as unknown as Document['_id'], userId })
      if (result.deletedCount !== 1) throw new Error('The scenario run could not be deleted.')
    }
    return true
  }

  async get(id: string, userId: string): Promise<ScenarioRunRecord | null> {
    const col = await this.col()
    if (col) {
      const doc = await col.findOne({ _id: id as unknown as Document['_id'], userId }).catch(() => null)
      if (doc) {
        const { _id, ...rest } = doc
        return { id: String(_id), ...(rest as unknown as Omit<ScenarioRunRecord, 'id'>) }
      }
    }
    const cached = this.memory.get(id)
    if (!cached || cached.userId !== userId) return null
    return cached
  }
}
