/**
 * Proposed side effects of the policy agent, waiting for the operator.
 *
 * The agent never executes a side effect itself: it proposes an action, the
 * console shows an approval card, and only an explicit approval runs the
 * handler. Actions are kept in Mongo when it is reachable (they survive a
 * restart), and in memory otherwise. Every decision is written to the audit log
 * by the caller.
 */
import { randomBytes } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'
import type { ActionSink } from '@sps/agents'

export type ActionKind = 'whatsapp_approval' | 'publish_communication' | 'record_gap' | 'request_tool' | 'delete_record'
export type ActionRisk = 'low' | 'medium' | 'high'
export type ActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed'

export interface ActionRecord {
  id: string
  kind: ActionKind
  title: string
  summary: string
  risk: ActionRisk
  status: ActionStatus
  createdAt: string
  decidedAt?: string
  result?: string
  payload?: Record<string, unknown>
  runId: string
  userId?: string
}

export type ActionDecision = 'approve' | 'reject'

export class ActionError extends Error {
  constructor(
    readonly code: 'not_found' | 'already_decided' | 'storage_unavailable',
    message: string,
  ) {
    super(message)
    this.name = 'ActionError'
  }
}

export interface ActionStoreOptions {
  mongodbUri?: string
  dbName?: string
  /** Runs the side effect of an approved action; returns a human-readable outcome. */
  execute: (record: ActionRecord) => Promise<string>
}

export class ActionStore implements ActionSink {
  private readonly memory = new Map<string, ActionRecord>()
  private client: MongoClient | null = null
  private collection: Collection<Document> | null = null

  constructor(private readonly options: ActionStoreOptions) {}

  private async col(): Promise<Collection<Document> | null> {
    if (!this.options.mongodbUri) return null
    if (this.collection) return this.collection
    try {
      if (!this.client) {
        this.client = new MongoClient(this.options.mongodbUri, { serverSelectionTimeoutMS: 4000 })
        await this.client.connect()
      }
      this.collection = this.client.db(this.options.dbName ?? 'policy_sandbox').collection('agent_actions')
      return this.collection
    } catch {
      this.client = null
      return null
    }
  }

  async propose(input: {
    kind: ActionKind
    title: string
    summary: string
    risk: ActionRisk
    payload?: Record<string, unknown>
    runId: string
    userId?: string
  }): Promise<{ id: string }> {
    const record: ActionRecord = {
      id: `act_${randomBytes(9).toString('base64url')}`,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      risk: input.risk,
      status: 'pending',
      createdAt: new Date().toISOString(),
      runId: input.runId,
      ...(input.payload ? { payload: input.payload } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
    }
    this.memory.set(record.id, record)
    const col = await this.col()
    if (col) await col.insertOne({ _id: record.id, ...record } as unknown as Document).catch(() => undefined)
    return { id: record.id }
  }

  /** The operator's actions only, newest first. */
  async list(userId: string, limit = 100): Promise<ActionRecord[]> {
    const col = await this.col()
    if (col) {
      const docs = await col.find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray().catch(() => null)
      if (docs) return docs.map(({ _id: _ignored, ...rest }) => rest as unknown as ActionRecord)
    }
    return [...this.memory.values()]
      .filter((record) => record.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  private async get(id: string, userId: string): Promise<ActionRecord | null> {
    const col = await this.col()
    if (col) {
      const doc = await col.findOne({ _id: id as unknown as Document['_id'] }).catch(() => null)
      if (doc) {
        const { _id: _ignored, ...rest } = doc as unknown as ActionRecord & { _id: string }
        return rest.userId === userId ? rest : null
      }
    }
    const cached = this.memory.get(id)
    return cached && cached.userId === userId ? cached : null
  }

  private async save(record: ActionRecord): Promise<void> {
    this.memory.set(record.id, record)
    const col = await this.col()
    if (col) {
      await col
        .updateOne({ _id: record.id as unknown as Document['_id'] }, { $set: { ...record } }, { upsert: true })
        .catch(() => undefined)
    }
  }

  /** Decide a pending action. Approval runs the handler; the outcome is stored. */
  async decide(id: string, userId: string, decision: ActionDecision): Promise<ActionRecord> {
    const record = await this.get(id, userId)
    if (!record) throw new ActionError('not_found', 'Unknown action.')
    if (record.status !== 'pending') throw new ActionError('already_decided', `This action is already ${record.status}.`)

    const decidedAt = new Date().toISOString()
    if (decision === 'reject') {
      const next = { ...record, status: 'rejected' as const, decidedAt, result: 'Refused by the operator.' }
      await this.save(next)
      return next
    }

    try {
      const outcome = await this.options.execute(record)
      const next = { ...record, status: 'executed' as const, decidedAt, result: outcome }
      await this.save(next)
      return next
    } catch (error) {
      const next = {
        ...record,
        status: 'failed' as const,
        decidedAt,
        result: error instanceof Error ? error.message.slice(0, 300) : 'Execution failed.',
      }
      await this.save(next)
      return next
    }
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
    this.collection = null
  }
}
