/**
 * Single-use store for WhatsApp approval decisions.
 *
 * The signed token proves who the link is for; this collection proves the
 * decision was taken once. `_id` is the token's `jti`, so a replay after the
 * first POST gets the recorded decision instead of overwriting it.
 */

import { MongoClient, type Collection, type Document } from 'mongodb'

export type ApprovalDecision = 'approved' | 'rejected'

/** Stored document: `_id` is the token's `jti` (a string), not an ObjectId. */
interface ApprovalDocument extends Document {
  _id: string
  jti: string
  runId: string
  decision: string
  note?: string
  decidedAt: string
  channel: string
  userId?: string
}

export interface ApprovalRecord {
  jti: string
  runId: string
  /** Operator (e-mail) who owns the run this approval unlocks. */
  userId?: string
  decision: ApprovalDecision
  note?: string
  decidedAt: string
  channel: 'whatsapp'
}

export interface ApprovalStoreConfig {
  mongodbUri: string
  dbName: string
  collection?: string
}

export class ApprovalStore {
  private client: MongoClient | null = null
  private readonly collectionName: string

  constructor(private readonly config: ApprovalStoreConfig) {
    this.collectionName = config.collection ?? 'whatsapp_approvals'
  }

  private async collection(): Promise<Collection<ApprovalDocument>> {
    if (!this.client) {
      this.client = new MongoClient(this.config.mongodbUri)
      await this.client.connect()
    }
    return this.client.db(this.config.dbName).collection<ApprovalDocument>(this.collectionName)
  }

  async get(jti: string): Promise<ApprovalRecord | null> {
    const collection = await this.collection()
    const doc = await collection.findOne({ _id: jti })
    return doc ? toRecord(doc) : null
  }

  /** Record the first decision. A second call returns the existing record. */
  async decide(record: ApprovalRecord): Promise<{ ok: true } | { ok: false; existing: ApprovalRecord }> {
    const collection = await this.collection()
    try {
      await collection.insertOne({ _id: record.jti, ...record })
      return { ok: true }
    } catch (error) {
      if ((error as { code?: number }).code !== 11_000) throw error
      const existing = await this.get(record.jti)
      if (!existing) throw error
      return { ok: false, existing }
    }
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
  }
}

function toRecord(doc: ApprovalDocument): ApprovalRecord {
  return {
    jti: String(doc._id),
    runId: String(doc.runId),
    decision: doc.decision === 'rejected' ? 'rejected' : 'approved',
    ...(typeof doc.note === 'string' ? { note: doc.note } : {}),
    decidedAt: String(doc.decidedAt),
    channel: 'whatsapp',
    ...(typeof doc.userId === 'string' && doc.userId ? { userId: doc.userId } : {}),
  }
}
