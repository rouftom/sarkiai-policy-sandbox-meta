/**
 * Saved after-action reports, versioned per exercise and per operator.
 *
 * Each generation is kept as a new version with the exact definition and log it
 * was written from, so an old report can be read again even after the log has
 * moved on. Mongo when it is reachable, memory otherwise.
 */
import { randomUUID } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'

export interface ExerciseReportSummary {
  id: string
  exerciseId: string
  version: number
  title: string
  createdAt: string
  evaluatedAtMinute: number
  actionCount: number
  lang: 'fr' | 'en'
  model: string
}

export interface ExerciseReportRecord extends ExerciseReportSummary {
  userId: string
  /** The definition and the log the report was computed from. */
  definition: unknown
  actions: unknown[]
  /** The report as the console shows it, figures included. */
  report: unknown
}

function summaryOf(record: ExerciseReportRecord): ExerciseReportSummary {
  const { userId: _owner, definition: _definition, actions: _actions, report: _report, ...rest } = record
  return rest
}

function summaryOfDoc(doc: Document): ExerciseReportSummary {
  return {
    id: String(doc._id),
    exerciseId: String(doc.exerciseId),
    version: Number(doc.version),
    title: String(doc.title ?? ''),
    createdAt: String(doc.createdAt),
    evaluatedAtMinute: Number(doc.evaluatedAtMinute ?? 0),
    actionCount: Number(doc.actionCount ?? 0),
    lang: doc.lang === 'fr' ? 'fr' : 'en',
    model: String(doc.model ?? ''),
  }
}

export class ExerciseReportStore {
  private readonly memory = new Map<string, ExerciseReportRecord>()
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
      this.collection = this.client.db(this.options.dbName ?? 'policy_sandbox').collection('exercise_reports')
      return this.collection
    } catch {
      this.client = null
      return null
    }
  }

  /** Next version number for this operator's exercise: one more than the highest saved. */
  async nextVersion(userId: string, exerciseId: string): Promise<number> {
    const col = await this.col()
    if (col) {
      const last = await col
        .find({ userId, exerciseId }, { projection: { version: 1 } })
        .sort({ version: -1 })
        .limit(1)
        .toArray()
        .catch(() => null)
      if (last) return (last[0] ? Number(last[0].version) : 0) + 1
    }
    const versions = [...this.memory.values()]
      .filter((record) => record.userId === userId && record.exerciseId === exerciseId)
      .map((record) => record.version)
    return (versions.length > 0 ? Math.max(...versions) : 0) + 1
  }

  async create(input: Omit<ExerciseReportRecord, 'id' | 'version' | 'createdAt'>): Promise<ExerciseReportSummary> {
    const version = await this.nextVersion(input.userId, input.exerciseId)
    const record: ExerciseReportRecord = {
      ...input,
      id: randomUUID(),
      version,
      createdAt: new Date().toISOString(),
    }
    this.memory.set(record.id, record)
    const col = await this.col()
    if (col) {
      const { id, ...rest } = record
      // A failed write is not hidden: the operator sees the report only if it was saved.
      await col.insertOne({ _id: id as unknown as Document['_id'], ...rest })
    }
    return summaryOf(record)
  }

  /** Every saved report of the operator, newest first, without the bodies. */
  async listAll(userId: string, limit = 50): Promise<ExerciseReportSummary[]> {
    const col = await this.col()
    if (col) {
      const docs = await col
        .find({ userId }, { projection: { definition: 0, actions: 0, report: 0, userId: 0 } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray()
        .catch(() => null)
      if (docs) return docs.map(summaryOfDoc)
    }
    return [...this.memory.values()]
      .filter((record) => record.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(summaryOf)
  }

  /** Versions of one exercise, newest first, without the report bodies. */
  async list(userId: string, exerciseId: string, limit = 50): Promise<ExerciseReportSummary[]> {
    const col = await this.col()
    if (col) {
      const docs = await col
        .find({ userId, exerciseId }, { projection: { definition: 0, actions: 0, report: 0, userId: 0 } })
        .sort({ version: -1 })
        .limit(limit)
        .toArray()
        .catch(() => null)
      if (docs) return docs.map(summaryOfDoc)
    }
    return [...this.memory.values()]
      .filter((record) => record.userId === userId && record.exerciseId === exerciseId)
      .sort((a, b) => b.version - a.version)
      .slice(0, limit)
      .map(summaryOf)
  }

  async get(id: string, userId: string): Promise<ExerciseReportRecord | null> {
    const col = await this.col()
    if (col) {
      const doc = await col.findOne({ _id: id as unknown as Document['_id'], userId }).catch(() => null)
      if (doc) {
        const { _id, ...rest } = doc
        return { id: String(_id), ...(rest as unknown as Omit<ExerciseReportRecord, 'id'>) }
      }
    }
    const record = this.memory.get(id)
    return record && record.userId === userId ? record : null
  }
}
