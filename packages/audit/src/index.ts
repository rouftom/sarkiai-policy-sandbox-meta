/**
 * Auditability: immutable, hash-chained audit log + persisted chain-of-thought
 * traces. This is a first-class evaluation criterion, so reasoning is stored as
 * a durable artifact · not merely streamed to the UI.
 */

import { createHash } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'
import type { AuditRecord, Citation, CoTTrace, WorkflowLens } from '@sps/shared'
import { mongoPoolOptions } from '@sps/shared'

export interface AuditConfig {
  mongodbUri: string
  dbName: string
  auditCollection?: string
  cotCollection?: string
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Canonical hash payload. `runId` and `target` are optional, and Mongo stores
 * an absent value as `null`: both are normalised away so a record written from
 * the API and read back from the collection hash to the same string. The key
 * order is part of the contract · do not reorder.
 */
/**
 * MongoDB stores an absent property as `null`, while `JSON.stringify` drops it.
 * Hashing the stored form keeps a record verifiable after the round trip (an
 * optional field left unset inside a citation broke the chain otherwise).
 */
export function storedForm<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => (item === undefined ? null : item))) as T
}

export function hashPayload(base: Omit<AuditRecord, 'hash'>, prevHash?: string): string {
  const canonical = JSON.stringify({
    id: base.id,
    runId: base.runId ?? undefined,
    userId: base.userId ?? undefined,
    ts: base.ts,
    actor: base.actor,
    action: base.action,
    target: base.target ?? undefined,
    lens: base.lens,
    citations: storedForm(base.citations ?? []),
  })
  return sha256(canonical + (prevHash ?? ''))
}

/**
 * Hash recomputation for records written before the canonical payload landed.
 * The legacy code hashed `JSON.stringify(base)` where `base` still carried
 * `prevHash`, then appended `prevHash` a second time. Records already in the
 * collection stay verifiable: the chain is evidence, it is not rewritten.
 */
function legacyHash(record: Record<string, unknown>, prevHash: string | undefined): string {
  const { _id: _ignoredId, hash: _ignoredHash, ...base } = record
  return sha256(JSON.stringify(base) + (prevHash ?? ''))
}

export interface ChainVerdict {
  valid: boolean
  brokenAt?: string
  /** Why the chain is broken: a record that does not hash, or a predecessor that is missing. */
  reason?: 'hash_mismatch' | 'missing_predecessor'
  /** Short fingerprints only (no content), to diagnose a break from the logs. */
  detail?: Record<string, unknown>
  forks: number
}

export class AuditService {
  private client: MongoClient | null = null
  private readonly auditCol: string
  private readonly cotCol: string
  /**
   * Appends run one after another. A record's `prevHash` is the hash of the
   * newest record in the collection; two concurrent appends (a scenario logs
   * several steps in parallel) would both read the same tail and fork the
   * chain, which the verifier then reports as broken.
   */
  private appendQueue: Promise<unknown> = Promise.resolve()
  /**
   * The compound index that serves the console's reads: per-operator count,
   * newest-first page and seven-day window. Created once per process, at boot
   * when the API runs or on the first read, so a cold start never pays twice.
   */
  private indexesReady: Promise<boolean> | null = null
  /**
   * The chain verdict is O(all records). Records are append-only and every
   * append moves the shared `head` document, so the cached verdict is only
   * reused while that head is unchanged.
   */
  private chainCache: { head: string | null; verdict: ChainVerdict } | null = null

  constructor(private readonly config: AuditConfig) {
    this.auditCol = config.auditCollection ?? 'audit_logs'
    this.cotCol = config.cotCollection ?? 'cot_traces'
  }

  private async db(): Promise<{ audit: Collection<Document>; cot: Collection<Document>; head: Collection<Document> }> {
    if (!this.client) {
      this.client = new MongoClient(this.config.mongodbUri, mongoPoolOptions())
      await this.client.connect()
    }
    const db = this.client.db(this.config.dbName)
    return {
      audit: db.collection(this.auditCol),
      cot: db.collection(this.cotCol),
      head: db.collection(`${this.auditCol}_head`),
    }
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
    /** Operator (e-mail) the record belongs to; absent on system-wide events. */
    userId?: string
  }): Promise<AuditRecord> {
    const append = this.appendQueue.then(() => this.appendAction(input))
    this.appendQueue = append.catch(() => undefined)
    return append
  }

  /**
   * The chain head is a single document in Mongo. An append claims the head
   * with a compare-and-swap (`hash` must still be the one it read); if another
   * instance moved it first, the append rereads the head and tries again. This
   * holds across processes, where the in-process queue above cannot.
   */
  private async appendAction(input: {
    actor: string
    action: string
    target?: string
    lens: WorkflowLens
    citations?: Citation[]
    runId?: string
    userId?: string
  }): Promise<AuditRecord> {
    const { audit, head } = await this.db()
    for (let attempt = 0; attempt < 50; attempt += 1) {
      let current = await head.findOne({ _id: 'head' as never })
      if (!current) {
        const latest = await audit.find({}).sort({ ts: -1, _id: -1 }).limit(1).next()
        await head.insertOne({ _id: 'head' as never, hash: (latest?.hash as string | undefined) ?? null }).catch(() => undefined)
        current = await head.findOne({ _id: 'head' as never })
      }
      const prevHash = (current?.hash as string | null | undefined) ?? undefined

      const base: Omit<AuditRecord, 'hash'> = {
        id: sha256(`${input.actor}:${input.action}:${Date.now()}:${attempt}`).slice(0, 24),
        runId: input.runId,
        userId: input.userId,
        ts: new Date().toISOString(),
        actor: input.actor,
        action: input.action,
        target: input.target,
        lens: input.lens,
        citations: input.citations ?? [],
      }
      const record: AuditRecord = { ...base, prevHash, hash: hashPayload(base, prevHash) }
      const claimed = await head.updateOne(
        { _id: 'head' as never, hash: prevHash ?? null },
        { $set: { hash: record.hash } },
      )
      if (claimed.matchedCount === 1) {
        await audit.insertOne({ ...record })
        return record
      }
    }
    throw new Error('Audit chain is contended: could not claim the head after 50 attempts.')
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

  async getTrace(runId: string, userId?: string): Promise<CoTTrace[]> {
    const { cot } = await this.db()
    const filter = userId ? { runId, userId } : { runId }
    const docs = await cot.find(filter).sort({ step: 1 }).toArray()
    return docs.map((doc) => doc as unknown as CoTTrace)
  }

  /** Most recent record carrying a given action, or `null` if never logged. */
  async lastAction(action: string): Promise<AuditRecord | null> {
    const { audit } = await this.db()
    const doc = await audit.find({ action }).sort({ ts: -1 }).limit(1).next()
    return (doc as unknown as AuditRecord | null) ?? null
  }

  async getAuditForRun(runId: string, userId?: string): Promise<AuditRecord[]> {
    const { audit } = await this.db()
    const filter = userId ? { runId, userId } : { runId }
    const docs = await audit.find(filter).sort({ ts: 1 }).toArray()
    return docs as unknown as AuditRecord[]
  }

  /**
   * The index that makes the console's reads index scans instead of collection
   * scans. Public so the API can create it at boot, after the optional demo
   * reset (which drops the collection); reads still call it lazily as a safety
   * net. A failure is logged once, reported to the caller and never blocks the
   * audit feed.
   */
  async ensureReadIndexes(): Promise<boolean> {
    if (!this.indexesReady) {
      this.indexesReady = (async () => {
        try {
          const { audit } = await this.db()
          await audit.createIndex({ userId: 1, ts: -1 }, { name: 'audit_user_ts' })
          return true
        } catch (error) {
          console.warn('[audit] audit_user_ts index unavailable; reads will be slower', error)
          return false
        }
      })()
    }
    return this.indexesReady
  }

  /** Lazy call site: the index is best-effort, so the result is ignored. */
  private async ensureIndexes(): Promise<void> {
    await this.ensureReadIndexes()
  }

  /** Per-operator scope plus the console's raw-field filter (`q`). */
  private filterFor(userId?: string, q?: string): Document {
    const filter: Document = userId ? { userId } : {}
    const needle = q?.trim()
    if (needle) {
      const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [{ actor: pattern }, { action: pattern }, { target: pattern }, { userId: pattern }]
    }
    return filter
  }

  /**
   * Newest-first slice of the chain, for the console's audit page and the
   * dashboard's recent list. Scoped to one operator: the collection holds every
   * operator's records, and a shared audit screen must never show another
   * operator's work. The chain itself is still verified end-to-end (hashes link
   * records across operators).
   */
  async listAudit(limit = 50, userId?: string, offset = 0, q?: string): Promise<AuditRecord[]> {
    await this.ensureIndexes()
    const { audit } = await this.db()
    const size = Math.min(Math.max(limit, 1), 500)
    const skip = Math.max(offset, 0)
    const docs = await audit.find(this.filterFor(userId, q)).sort({ ts: -1 }).skip(skip).limit(size).toArray()
    return docs as unknown as AuditRecord[]
  }

  /** Exact number of records the same filter selects, for pagination and KPIs. */
  async countAudit(userId?: string, q?: string): Promise<number> {
    await this.ensureIndexes()
    const { audit } = await this.db()
    return audit.countDocuments(this.filterFor(userId, q))
  }

  /**
   * Exact seven-day breakdown for one operator: one row per (local day, action).
   * The route folds these rows into the chart and the category bars; grouping
   * server-side keeps the 500-event page out of the dashboard.
   */
  async auditWindow(
    userId: string | undefined,
    from: string,
    timezone: string,
  ): Promise<Array<{ day: string; action: string; count: number }>> {
    await this.ensureIndexes()
    const { audit } = await this.db()
    const match: Document = { ts: { $gte: from } }
    if (userId) match.userId = userId
    const rows = await audit
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$ts' }, timezone } },
              action: '$action',
            },
            count: { $sum: 1 },
          },
        },
        { $project: { _id: 0, day: '$_id.day', action: '$_id.action', count: 1 } },
      ])
      .toArray()
    return rows.map((row) => ({ day: String(row.day), action: String(row.action), count: Number(row.count) }))
  }

  /**
   * Cached chain verdict. Records are append-only and every append moves the
   * shared `head` document, so an unchanged head means the cached verdict is
   * still the answer. A direct edit that does not move the head is detected on
   * the next append, not before.
   */
  async verifyChainCached(): Promise<ChainVerdict> {
    const { head } = await this.db()
    const current = await head.findOne({ _id: 'head' as never })
    const hash = (current?.hash as string | null | undefined) ?? null
    if (this.chainCache?.head === hash) return this.chainCache.verdict
    const verdict = await this.verifyChain()
    this.chainCache = { head: hash, verdict }
    return verdict
  }

  /**
   * Verify the chain end-to-end. Each record must hash correctly from its own
   * fields and point at a record that exists. Records are linked by hash, not by
   * time, so the order of arrival does not matter. `forks` counts predecessors
   * that more than one record claims: the history written before the head
   * claim could fork, and those records are evidence, so they are reported and
   * not rewritten.
   */
  async verifyChain(): Promise<ChainVerdict> {
    const { audit } = await this.db()
    const records = (await audit.find({}).toArray()) as unknown as Array<AuditRecord & { _id: unknown }>
    const hashes = new Set(records.map((record) => record.hash))
    const children = new Map<string, number>()
    for (const record of records) {
      // `_id` is added by MongoDB after the hash was computed: strip it before
      // recomputing, otherwise every record looks tampered with.
      const { _id: _ignored, hash, ...base } = record
      const prevHash = (record.prevHash ?? undefined) as string | undefined
      const recomputed = hashPayload(base as Omit<AuditRecord, 'hash'>, prevHash)
      const legacy = legacyHash(record as unknown as Record<string, unknown>, prevHash)
      if (recomputed !== hash && legacy !== hash) {
        return {
          valid: false,
          brokenAt: record.id,
          forks: 0,
          reason: 'hash_mismatch',
          detail: { ts: record.ts, action: record.action, stored: hash.slice(0, 12), recomputed: recomputed.slice(0, 12), legacy: legacy.slice(0, 12), hasPrevHash: Boolean(prevHash) },
        }
      }
      if (prevHash && !hashes.has(prevHash)) {
        return {
          valid: false,
          brokenAt: record.id,
          forks: 0,
          reason: 'missing_predecessor',
          detail: { ts: record.ts, action: record.action, prevHash: prevHash.slice(0, 12) },
        }
      }
      if (prevHash) children.set(prevHash, (children.get(prevHash) ?? 0) + 1)
    }
    const forks = [...children.values()].filter((count) => count > 1).length
    return { valid: true, forks }
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
  }
}
