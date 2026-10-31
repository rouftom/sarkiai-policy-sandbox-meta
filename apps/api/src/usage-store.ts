/**
 * Durable token ledger: one document per model call, kept without expiry.
 *
 * Mongo when it is reachable; events that cannot be written are kept in memory
 * for the life of the process so a metering failure never breaks a request, and
 * they are retried on the next write.
 *
 * Timestamps are UTC ISO strings. They sort and compare lexicographically, so a
 * range filter is `ts >= from` / `ts < to`, and the day of a row is its first
 * ten characters — no date conversion at query time, and rows written before
 * this module knew about buckets remain usable.
 *
 * A row written before the ledger had a `kind` or a `status` is read as a
 * successful chat call, which is what it was.
 */

import { MongoClient, type Collection, type Document } from 'mongodb'
import {
  MemoryUsageStore,
  type UsageEvent,
  type UsageKind,
  type UsageStatus,
  type UsageStore,
} from '@sps/agents'

export interface MongoUsageStoreConfig {
  mongodbUri: string
  dbName: string
  collection?: string
}

/** One slice of the ledger: a range and the optional dimensions to narrow it. */
export interface UsageFilter {
  /** Inclusive ISO timestamp. */
  from: string
  /** Exclusive ISO timestamp. */
  to: string
  /** Scope: one operator's rows, or every operator when absent (admin). */
  operator?: string
  model?: string
  route?: string
  agentId?: string
  kind?: UsageKind
  status?: UsageStatus
}

export interface UsageTotals {
  requests: number
  errors: number
  inputTokens: number
  outputTokens: number
  /**
   * Sum of the non-token units (images, audio seconds, segmentation calls).
   * Only meaningful inside a single kind: a `byKind` row sums one unit, a
   * cross-capability total mixes them and is left for display per kind.
   */
  units: number
  /** Sum of the known tariffs only; `unpriced` says how many calls were left out. */
  costUsd: number
  /** Calls whose model has no known tariff (their cost is not in `costUsd`). */
  unpriced: number
}

export interface UsageRow extends UsageTotals {
  /** Model, route, agent id, kind, operator or ISO day, depending on the bucket. */
  key: string
}

export interface UsageLatency {
  p50Ms: number | null
  p95Ms: number | null
  samples: number
}

export interface UsageSnapshot {
  from: string
  to: string
  /** `operator` when the caller sees their own rows, `all` for an admin view. */
  scope: 'operator' | 'all'
  operator?: string
  totals: UsageTotals
  latency: UsageLatency
  /** One point per day in the range, zeros included, for the chart. */
  series: Array<{ date: string } & UsageTotals>
  byModel: UsageRow[]
  byRoute: UsageRow[]
  byKind: UsageRow[]
  byAgent: UsageRow[]
  /** Admin only: every operator that spent something in the range. */
  operators: UsageRow[]
}

export interface UsagePage {
  requests: UsageEvent[]
  /** Rows matching the filter, before the page limit. */
  total: number
}

const DAY_PREFIX = 10

export class MongoUsageStore implements UsageStore {
  private client: MongoClient | null = null
  private collection: Collection<Document> | null = null
  private indexed = false
  private readonly pending = new MemoryUsageStore()

  constructor(private readonly config: MongoUsageStoreConfig) {}

  private async col(): Promise<Collection<Document> | null> {
    if (!this.config.mongodbUri) return null
    if (this.collection) return this.collection
    try {
      if (!this.client) {
        this.client = new MongoClient(this.config.mongodbUri, { serverSelectionTimeoutMS: 4000 })
        await this.client.connect()
      }
      this.collection = this.client.db(this.config.dbName).collection(this.config.collection ?? 'usage_events')
      if (!this.indexed) {
        await Promise.all([
          this.collection.createIndex({ ts: -1 }),
          this.collection.createIndex({ operator: 1, ts: -1 }),
          this.collection.createIndex({ model: 1, ts: -1 }),
          this.collection.createIndex({ agentId: 1, ts: -1 }),
          this.collection.createIndex({ runId: 1 }, { sparse: true }),
        ])
        this.indexed = true
      }
      return this.collection
    } catch {
      this.client = null
      this.collection = null
      return null
    }
  }

  async append(event: UsageEvent): Promise<void> {
    await this.flush()
    const col = await this.col()
    if (!col) {
      await this.pending.append(event)
      return
    }
    try {
      await col.insertOne({ ...event })
    } catch {
      await this.pending.append(event)
    }
  }

  /** The operator's most recent events, newest first. */
  async recent(operator: string, limit: number): Promise<UsageEvent[]> {
    const page = await this.list({ from: new Date(0).toISOString(), to: new Date(Date.now() + 60_000).toISOString(), operator }, limit)
    return page.requests
  }

  /** Totals, daily series and every breakdown the console shows, in one pass. */
  async summary(filter: UsageFilter, options: { includeOperators?: boolean } = {}): Promise<UsageSnapshot> {
    const match = mongoMatch(filter)
    const col = await this.col()
    if (!col) return this.summaryInMemory(filter, options)

    const [totals, latency, series, byModel, byRoute, byKind, byAgent, operators] = await Promise.all([
      this.totals(col, match),
      this.latency(col, match),
      this.group(col, match, 'day'),
      this.group(col, match, 'model'),
      this.group(col, match, 'route'),
      this.group(col, match, 'kind'),
      this.group(col, match, 'agentId'),
      options.includeOperators ? this.group(col, match, 'operator') : Promise.resolve([]),
    ] as const)

    return {
      from: filter.from,
      to: filter.to,
      scope: filter.operator ? 'operator' : 'all',
      ...(filter.operator ? { operator: filter.operator } : {}),
      totals,
      latency,
      series: fillDays(filter.from, filter.to, series),
      byModel,
      byRoute,
      byKind,
      byAgent,
      operators,
    }
  }

  /** Newest first, narrowed by the same dimensions as the summary. */
  async list(filter: UsageFilter, limit: number): Promise<UsagePage> {
    await this.flush()
    const col = await this.col()
    if (!col) {
      const rows = this.memoryRows(filter).sort((a, b) => b.ts.localeCompare(a.ts))
      return { requests: rows.slice(0, limit), total: rows.length }
    }
    const match = mongoMatch(filter)
    const [docs, total] = await Promise.all([
      col.find(match, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(limit).toArray(),
      col.countDocuments(match),
    ] as const)
    return { requests: docs.map(normalize), total }
  }

  /** Every event this process could not write to Mongo. */
  private memoryRows(filter: UsageFilter): UsageEvent[] {
    return this.pending.events.filter((event) => matches(event, filter))
  }

  private summaryInMemory(filter: UsageFilter, options: { includeOperators?: boolean }): UsageSnapshot {
    const rows = this.memoryRows(filter)
    const totals = totalsOf(rows)
    const series = fillDays(filter.from, filter.to, bucket(rows, 'day'))
    return {
      from: filter.from,
      to: filter.to,
      scope: filter.operator ? 'operator' : 'all',
      ...(filter.operator ? { operator: filter.operator } : {}),
      totals,
      latency: latencyOf(rows),
      series,
      byModel: bucket(rows, 'model'),
      byRoute: bucket(rows, 'route'),
      byKind: bucket(rows, 'kind'),
      byAgent: bucket(rows, 'agentId'),
      operators: options.includeOperators ? bucket(rows, 'operator') : [],
    }
  }

  /** The whole-range totals, without the bucket key `group` adds. */
  private async totals(col: Collection<Document>, match: Document): Promise<UsageTotals> {
    const rows = await this.group(col, match, null)
    const { key: _key, ...totals } = rows[0] ?? { key: 'total', ...emptyTotals() }
    return totals
  }

  /** One aggregation, grouped by `dimension` when given (`day` uses the ISO prefix). */
  private async group(col: Collection<Document>, match: Document, dimension: Dimension | null): Promise<UsageRow[]> {    const pipeline: Document[] = [{ $match: match }]
    pipeline.push({
      $group: {
        _id:
          dimension === null
            ? null
            : dimension === 'day'
              ? { $substrBytes: ['$ts', 0, DAY_PREFIX] }
              : dimension === 'kind'
                // Rows written before `kind` existed were chat calls.
                ? { $ifNull: ['$kind', 'chat'] }
                : `$${dimension}`,
        ...GROUP_ACCUMULATORS,
      },
    })
    if (dimension !== null) pipeline.push({ $sort: { requests: -1, _id: 1 } })
    const docs = await col.aggregate(pipeline).toArray()
    return docs.map((doc) => ({
      key: dimension === null ? 'total' : String(doc._id ?? 'unknown'),
      ...totalsFromAccumulators(doc),
    }))
  }

  /**
   * Percentiles come from `$percentile` (Mongo 7+). If a deployment cannot run
   * it, the latency card degrades to "no data" instead of failing the summary.
   */
  private async latency(col: Collection<Document>, match: Document): Promise<UsageLatency> {
    try {
      const docs = await col
        .aggregate([
          { $match: match },
          { $match: { latencyMs: { $type: 'number' } } },
          {
            $group: {
              _id: null,
              samples: { $sum: 1 },
              p: { $percentile: { input: '$latencyMs', p: [0.5, 0.95], method: 'approximate' } },
            },
          },
        ])
        .toArray()
      const row = docs[0]
      if (!row) return { p50Ms: null, p95Ms: null, samples: 0 }
      const p = Array.isArray(row.p) ? row.p : []
      return {
        p50Ms: typeof p[0] === 'number' ? Math.round(p[0]) : null,
        p95Ms: typeof p[1] === 'number' ? Math.round(p[1]) : null,
        samples: Number(row.samples ?? 0),
      }
    } catch {
      return { p50Ms: null, p95Ms: null, samples: 0 }
    }
  }

  private async flush(): Promise<void> {
    if (this.pending.events.length === 0) return
    const col = await this.col()
    if (!col) return
    const batch = this.pending.events.splice(0, this.pending.events.length)
    try {
      await col.insertMany(batch.map((event) => ({ ...event })))
    } catch {
      this.pending.events.unshift(...batch)
    }
  }
}

type Dimension = 'day' | 'model' | 'route' | 'kind' | 'agentId' | 'operator'

/** Mongo accumulators shared by every bucket, so totals and rows agree. */
const GROUP_ACCUMULATORS = {
  requests: { $sum: 1 },
  errors: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$status', 'ok'] }, 'error'] }, 1, 0] } },
  inputTokens: { $sum: { $ifNull: ['$inputTokens', 0] } },
  outputTokens: { $sum: { $ifNull: ['$outputTokens', 0] } },
  units: { $sum: { $ifNull: ['$units', 0] } },
  costUsd: {
    $sum: {
      $cond: [{ $ne: [{ $ifNull: ['$costUsd', null] }, null] }, { $ifNull: ['$costUsd', 0] }, 0],
    },
  },
  unpriced: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$costUsd', null] }, null] }, 1, 0] } },
}

function totalsFromAccumulators(doc: Document): UsageTotals {
  return {
    requests: Number(doc.requests ?? 0),
    errors: Number(doc.errors ?? 0),
    inputTokens: Number(doc.inputTokens ?? 0),
    outputTokens: Number(doc.outputTokens ?? 0),
    units: Number(doc.units ?? 0),
    costUsd: Number(doc.costUsd ?? 0),
    unpriced: Number(doc.unpriced ?? 0),
  }
}

function emptyTotals(): UsageTotals {
  return { requests: 0, errors: 0, inputTokens: 0, outputTokens: 0, units: 0, costUsd: 0, unpriced: 0 }
}

function mongoMatch(filter: UsageFilter): Document {
  const match: Document = { ts: { $gte: filter.from, $lt: filter.to } }
  if (filter.operator) match.operator = filter.operator
  if (filter.model) match.model = filter.model
  if (filter.route) match.route = filter.route
  if (filter.agentId) match.agentId = filter.agentId
  if (filter.status === 'ok') {
    // Rows written before `status` existed were successful calls.
    match.$and = [{ $or: [{ status: 'ok' }, { status: { $exists: false } }] }]
  } else if (filter.status) {
    match.status = filter.status
  }
  if (filter.kind === 'chat') {
    // Rows written before `kind` existed were chat calls.
    match.$and = [...((match.$and as Document[] | undefined) ?? []), { $or: [{ kind: 'chat' }, { kind: { $exists: false } }] }]
  } else if (filter.kind) {
    match.kind = filter.kind
  }
  return match
}

function normalize(doc: Document): UsageEvent {
  return {
    ...(doc as unknown as UsageEvent),
    kind: (doc.kind as UsageKind | undefined) ?? 'chat',
    status: (doc.status as UsageStatus | undefined) ?? 'ok',
  }
}

function matches(event: UsageEvent, filter: UsageFilter): boolean {
  if (event.ts < filter.from || event.ts >= filter.to) return false
  if (filter.operator && event.operator !== filter.operator) return false
  if (filter.model && event.model !== filter.model) return false
  if (filter.route && event.route !== filter.route) return false
  if (filter.agentId && event.agentId !== filter.agentId) return false
  if (filter.status && (event.status ?? 'ok') !== filter.status) return false
  if (filter.kind && (event.kind ?? 'chat') !== filter.kind) return false
  return true
}

function totalsOf(rows: UsageEvent[]): UsageTotals {
  const totals = emptyTotals()
  for (const row of rows) {
    totals.requests += 1
    totals.errors += row.status === 'error' ? 1 : 0
    totals.inputTokens += row.inputTokens ?? 0
    totals.outputTokens += row.outputTokens ?? 0
    totals.units += row.units ?? 0
    if (row.costUsd === null || row.costUsd === undefined) totals.unpriced += 1
    else totals.costUsd += row.costUsd
  }
  return totals
}

function bucket(rows: UsageEvent[], dimension: Dimension): UsageRow[] {
  const groups = new Map<string, UsageEvent[]>()
  for (const row of rows) {
    const key =
      dimension === 'day'
        ? row.ts.slice(0, DAY_PREFIX)
        : dimension === 'agentId'
          ? (row.agentId ?? 'unknown')
          : dimension === 'operator'
            ? (row.operator ?? 'unknown')
            : dimension === 'kind'
              ? (row.kind ?? 'chat')
              : String(row[dimension] ?? 'unknown')
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, ...totalsOf(group) }))
    .sort((a, b) => b.requests - a.requests || a.key.localeCompare(b.key))
}

function latencyOf(rows: UsageEvent[]): UsageLatency {
  const values = rows
    .map((row) => row.latencyMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .sort((a, b) => a - b)
  if (values.length === 0) return { p50Ms: null, p95Ms: null, samples: 0 }
  return {
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    samples: values.length,
  }
}

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return Math.round(sorted[index]!)
}

/** Every UTC day between `from` (inclusive) and `to` (exclusive), zeros included. */
function fillDays(from: string, to: string, rows: UsageRow[]): Array<{ date: string } & UsageTotals> {
  const byDay = new Map(rows.map((row) => [row.key, row]))
  const days: Array<{ date: string } & UsageTotals> = []
  const cursor = new Date(`${from.slice(0, DAY_PREFIX)}T00:00:00.000Z`)
  // The last instant in the range decides the last row: `to` itself is excluded.
  const end = new Date(new Date(to).getTime() - 1)
  const last = Number.isNaN(end.getTime()) ? cursor : new Date(`${end.toISOString().slice(0, DAY_PREFIX)}T00:00:00.000Z`)
  while (cursor <= last && days.length <= 400) {
    const date = cursor.toISOString().slice(0, DAY_PREFIX)
    const row = byDay.get(date)
    const { key: _key, ...totals } = row ?? { key: date, ...emptyTotals() }
    days.push({ date, ...totals })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}
