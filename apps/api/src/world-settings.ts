/**
 * World display settings.
 *
 * The thresholds that decide whether a composite may be painted as a
 * measurement belong to the deployment, not to one operator: they are read by
 * every view and written by an administrator only. `world-summary.ts` owns the
 * computation; this store only persists an override of its defaults.
 *
 * Mongo when it is reachable, memory otherwise, like every other store here.
 */

import { MongoClient, type Collection, type Document } from 'mongodb'
import { mongoPoolOptions } from '@sps/shared'
import { WORLD_THRESHOLDS, type WorldThresholds } from './world-summary.js'

export interface WorldSettings extends WorldThresholds {
  /** Upper bound of the comparison tab: enough columns to read, few enough to fit. */
  compareMaxCountries: number
}

export const WORLD_SETTINGS_DEFAULTS: WorldSettings = {
  ...WORLD_THRESHOLDS,
  compareMaxCountries: 6,
}

export interface WorldSettingsRecord {
  settings: WorldSettings
  updatedAt: string | null
  updatedBy: string
}

const DEFAULTS_RECORD: WorldSettingsRecord = {
  settings: { ...WORLD_SETTINGS_DEFAULTS },
  updatedAt: null,
  updatedBy: '',
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

function integer(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback
}

/** Merges a stored document with the defaults; a partly written doc stays readable. */
function toSettings(doc: Document | null): WorldSettingsRecord {
  if (!doc) return { ...DEFAULTS_RECORD, settings: { ...DEFAULTS_RECORD.settings } }
  const source = (doc.settings ?? {}) as Record<string, unknown>
  const d = WORLD_SETTINGS_DEFAULTS
  return {
    settings: {
      minCountryChunks: integer(source.minCountryChunks, d.minCountryChunks, 0, 1000),
      minCoverage: bounded(source.minCoverage, d.minCoverage, 0, 1),
      minConfidence: bounded(source.minConfidence, d.minConfidence, 0, 1),
      rankMinCoverage: bounded(source.rankMinCoverage, d.rankMinCoverage, 0, 1),
      rankMinConfidence: bounded(source.rankMinConfidence, d.rankMinConfidence, 0, 1),
      staleAfterDays: integer(source.staleAfterDays, d.staleAfterDays, 1, 3650),
      compareMaxCountries: integer(source.compareMaxCountries, d.compareMaxCountries, 2, 12),
    },
    updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
    updatedBy: typeof doc.updatedBy === 'string' ? doc.updatedBy : '',
  }
}

export class WorldSettingsStore {
  private memory: WorldSettingsRecord = { ...DEFAULTS_RECORD, settings: { ...DEFAULTS_RECORD.settings } }
  private client: MongoClient | null = null
  private collection: Collection<Document> | null = null

  constructor(private readonly options: { mongodbUri?: string; dbName?: string }) {}

  /** Releases the client on shutdown: a deploy stops this process. */
  async close(): Promise<void> {
    const client = this.client
    this.client = null
    this.collection = null
    await client?.close().catch(() => undefined)
  }

  private async col(): Promise<Collection<Document> | null> {
    if (!this.options.mongodbUri) return null
    if (this.collection) return this.collection
    try {
      if (!this.client) {
        this.client = new MongoClient(this.options.mongodbUri, mongoPoolOptions())
        await this.client.connect()
      }
      this.collection = this.client.db(this.options.dbName ?? 'policy_sandbox').collection('world_settings')
      return this.collection
    } catch {
      this.client = null
      return null
    }
  }

  async get(): Promise<WorldSettingsRecord> {
    const col = await this.col()
    if (col) {
      const doc = await col.findOne({ _id: 'world' as unknown as Document['_id'] }).catch(() => null)
      if (doc) {
        // Keep the memory copy warm: a Mongo outage still serves the last value.
        this.memory = toSettings(doc)
        return this.memory
      }
    }
    return {
      settings: { ...this.memory.settings },
      updatedAt: this.memory.updatedAt,
      updatedBy: this.memory.updatedBy,
    }
  }

  /** Only the keys present in `patch` change; the rest keep their current value. */
  async update(patch: Partial<WorldSettings>, updatedBy: string): Promise<WorldSettingsRecord> {
    const current = await this.get()
    const defined = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    ) as Partial<WorldSettings>
    const next: WorldSettingsRecord = {
      settings: { ...current.settings, ...defined },
      updatedAt: new Date().toISOString(),
      updatedBy,
    }
    this.memory = next

    const col = await this.col()
    if (col) {
      await col
        .updateOne(
          { _id: 'world' as unknown as Document['_id'] },
          { $set: { settings: next.settings, updatedAt: next.updatedAt, updatedBy: next.updatedBy } },
          { upsert: true },
        )
        .catch(() => undefined)
    }
    return next
  }
}
