/**
 * Auditability: immutable, hash-chained audit log + persisted chain-of-thought
 * traces. This is a first-class evaluation criterion, so reasoning is stored as
 * a durable artifact — not merely streamed to the UI.
 */

import { createHash } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'
import type { AuditRecord, Citation, CoTTrace, WorkflowLens } from '@sps/shared'

export interface AuditConfig {
  mongodbUri: string
  dbName: string
  auditCollection?: string
  cotCollection?: string
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export class AuditService {
  private client: MongoClient | null = null
  private readonly auditCol: string
  private readonly cotCol: string

  constructor(private readonly config: AuditConfig) {
    this.auditCol = config.auditCollection ?? 'audit_logs'
    this.cotCol = config.cotCollection ?? 'cot_traces'
  }

  private async db(): Promise<{ audit: Collection<Document>; cot: Collection<Document> }> {
    if (!this.client) {
      this.client = new MongoClient(this.config.mongodbUri)
      await this.client.connect()
    }
    const db = this.client.db(this.config.dbName)
    return { audit: db.collection(this.auditCol), cot: db.collection(this.cotCol) }
  }

  /**
   * Append an audit record, chaining it to the previous record's hash so the log
   * is tamper-evident. Returns the persisted record.
   */
  async logAction(input: {
    actor: string
    action: string
    target?: string
    lens: WorkflowLens
    citations?: Citation[]
    runId?: string
  }): Promise<AuditRecord> {
    const { audit } = await this.db()
    const previous = await audit.find({}).sort({ ts: -1 }).limit(1).next()
    const prevHash = previous?.hash as string | undefined

    const base: Omit<AuditRecord, 'hash'> = {
      id: sha256(`${input.actor}:${input.action}:${Date.now()}`).slice(0, 24),
      runId: input.runId,
      ts: new Date().toISOString(),
      actor: input.actor,
      action: input.action,
      target: input.target,
      lens: input.lens,
      citations: input.citations ?? [],
    }
    const record: AuditRecord = { ...base, prevHash, hash: sha256(JSON.stringify(base) + (prevHash ?? '')) }
    await audit.insertOne({ ...record })
    return record
  }

  /** Persist one chain-of-thought step for a given agent run. */
  async traceStep(trace: Omit<CoTTrace, 'id' | 'ts'>): Promise<CoTTrace> {
    const { cot } = await this.db()
    const record: CoTTrace = {
      ...trace,
      id: sha256(`${trace.runId}:${trace.agentId}:${trace.step}:${Date.now()}`).slice(0, 24),
      ts: new Date().toISOString(),
    }
    await cot.insertOne({ ...record })
    return record
  }

  async getTrace(runId: string): Promise<CoTTrace[]> {
    const { cot } = await this.db()
    const docs = await cot.find({ runId }).sort({ step: 1 }).toArray()
    return docs.map((doc) => doc as unknown as CoTTrace)
  }

  /** Most recent record carrying a given action, or `null` if never logged. */
  async lastAction(action: string): Promise<AuditRecord | null> {
    const { audit } = await this.db()
    const doc = await audit.find({ action }).sort({ ts: -1 }).limit(1).next()
    return (doc as unknown as AuditRecord | null) ?? null
  }

  async getAuditForRun(runId: string): Promise<AuditRecord[]> {
    const { audit } = await this.db()
    const docs = await audit.find({ runId }).sort({ ts: 1 }).toArray()
    return docs as unknown as AuditRecord[]
  }

  /** Newest-first slice of the chain, for the console's audit page. */
  async listAudit(limit = 50): Promise<AuditRecord[]> {
    const { audit } = await this.db()
    const size = Math.min(Math.max(limit, 1), 500)
    const docs = await audit.find({}).sort({ ts: -1 }).limit(size).toArray()
    return docs as unknown as AuditRecord[]
  }

  /** Verify the hash chain end-to-end; returns the first broken record, if any. */
  async verifyChain(): Promise<{ valid: boolean; brokenAt?: string }> {
    const { audit } = await this.db()
    const records = (await audit.find({}).sort({ ts: 1 }).toArray()) as unknown as AuditRecord[]
    let prevHash: string | undefined
    for (const record of records) {
      const { hash, ...base } = record
      if (sha256(JSON.stringify(base) + (prevHash ?? '')) !== hash) {
        return { valid: false, brokenAt: record.id }
      }
      prevHash = hash
    }
    return { valid: true }
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
  }
}
