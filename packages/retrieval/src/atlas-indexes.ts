/**
 * Atlas Search index bootstrap.
 *
 * Atlas Vector Search only exists on Atlas (not on the local Mongo used by the
 * sovereign/docker profile), so index creation is gated by the cloud provider
 * mode. The collection must exist before `listSearchIndexes`/`createSearchIndex`
 * (fresh database => NamespaceNotFound), hence `ensureCollection` runs first.
 *
 * Index definitions are data, not code: `deploy/mongo/kb.indexes.json` is the
 * canonical artifact used by both the API startup hook and the standalone
 * `bun run mongo:indexes` script.
 */

import { readFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { mongoPoolOptions } from '@sps/shared'

export type AtlasIndexType = 'vectorSearch' | 'search'

export interface AtlasIndexDefinition {
  name: string
  type: AtlasIndexType
  definition: Record<string, unknown>
}

export interface AtlasIndexFile {
  collection: string
  indexes: AtlasIndexDefinition[]
}

export interface EnsureAtlasIndexesOptions {
  uri: string
  dbName: string
  collection: string
  indexes: AtlasIndexDefinition[]
  log?: (message: string) => void
}

export interface EnsureAtlasIndexesResult {
  /** False when the deployment does not support Atlas Search (local Mongo). */
  supported: boolean
  collectionCreated: boolean
  created: string[]
  updated: string[]
  unchanged: string[]
}

/** Read the JSON artifact. Accepts a path or a `file:` URL. */
export function loadIndexDefinitions(file: string | URL): AtlasIndexFile {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<AtlasIndexFile>
  if (!parsed.collection || !Array.isArray(parsed.indexes) || parsed.indexes.length === 0) {
    throw new Error(`Invalid Atlas index file: expected { collection, indexes[] } in ${String(file)}.`)
  }
  for (const index of parsed.indexes) {
    if (!index.name || (index.type !== 'vectorSearch' && index.type !== 'search') || !index.definition) {
      throw new Error(`Invalid Atlas index entry in ${String(file)}.`)
    }
  }
  return { collection: parsed.collection, indexes: parsed.indexes }
}

/** Order-insensitive JSON so Atlas-normalised definitions do not look different. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function ensureCollection(
  db: ReturnType<MongoClient['db']>,
  name: string,
): Promise<boolean> {
  const exists = await db.listCollections({ name }, { nameOnly: true }).hasNext()
  if (exists) return false
  try {
    await db.createCollection(name)
    return true
  } catch (error) {
    const code = (error as { code?: number }).code
    const codeName = (error as { codeName?: string }).codeName
    if (code === 48 || codeName === 'NamespaceExists') return false
    throw error
  }
}

/**
 * Create or update the Atlas Search indexes idempotently.
 *
 * Never throws when Atlas Search is unsupported: it returns `supported: false`
 * so a local/sovereign startup can log it and continue on Qdrant.
 */
export async function ensureAtlasIndexes(
  options: EnsureAtlasIndexesOptions,
): Promise<EnsureAtlasIndexesResult> {
  const log = options.log ?? (() => {})
  const client = new MongoClient(options.uri, mongoPoolOptions())

  try {
    await client.connect()
    const db = client.db(options.dbName)
    const collectionCreated = await ensureCollection(db, options.collection)
    if (collectionCreated) log(`Collection ${options.collection} created.`)

    const collection = db.collection(options.collection)

    let existing: Array<{ name?: string; latestDefinition?: unknown; definition?: unknown }>
    try {
      existing = (await collection.listSearchIndexes().toArray()) as typeof existing
    } catch (error) {
      const message = (error as Error).message ?? String(error)
      log(`Atlas Search is not available on this deployment: ${message}`)
      return { supported: false, collectionCreated, created: [], updated: [], unchanged: [] }
    }

    const byName = new Map(existing.map((index) => [index.name, index]))
    const created: string[] = []
    const updated: string[] = []
    const unchanged: string[] = []

    for (const requested of options.indexes) {
      const current = byName.get(requested.name)
      if (!current) {
        await collection.createSearchIndex({
          name: requested.name,
          type: requested.type,
          definition: requested.definition,
        } as never)
        created.push(requested.name)
        log(`Search index ${requested.name} is building.`)
        continue
      }

      const currentDefinition = current.latestDefinition ?? current.definition
      if (stableStringify(currentDefinition) === stableStringify(requested.definition)) {
        unchanged.push(requested.name)
        continue
      }

      try {
        await collection.updateSearchIndex(requested.name, requested.definition as never)
        updated.push(requested.name)
        log(`Search index ${requested.name} updated, rebuilding.`)
      } catch {
        await collection.dropSearchIndex(requested.name)
        await collection.createSearchIndex({
          name: requested.name,
          type: requested.type,
          definition: requested.definition,
        } as never)
        updated.push(requested.name)
        log(`Search index ${requested.name} recreated, rebuilding.`)
      }
    }

    return { supported: true, collectionCreated, created, updated, unchanged }
  } finally {
    await client.close()
  }
}

export interface AtlasIndexStatus {
  name: string
  type: AtlasIndexType | 'unknown'
  /** Atlas lifecycle: `READY`, `BUILDING`, `FAILED`, `DOES_NOT_EXIST`… */
  status: string
  queryable: boolean
  definition?: Record<string, unknown>
}

export interface AtlasIndexInspection {
  supported: boolean
  collectionExists: boolean
  indexes: AtlasIndexStatus[]
  error?: string
}

/**
 * Read the live index state without creating anything. Used by
 * `GET /v1/kb/status` so the console can show `BUILDING` vs `READY` and offer a
 * repair action instead of guessing.
 */
export async function inspectAtlasIndexes(options: {
  uri: string
  dbName: string
  collection: string
}): Promise<AtlasIndexInspection> {
  const client = new MongoClient(options.uri, mongoPoolOptions())
  try {
    await client.connect()
    const db = client.db(options.dbName)
    const collectionExists = await db.listCollections({ name: options.collection }, { nameOnly: true }).hasNext()
    if (!collectionExists) return { supported: true, collectionExists: false, indexes: [] }

    const collection = db.collection(options.collection)
    let raw: Array<Record<string, unknown>>
    try {
      raw = (await collection.listSearchIndexes().toArray()) as Array<Record<string, unknown>>
    } catch (error) {
      return {
        supported: false,
        collectionExists: true,
        indexes: [],
        error: (error as Error).message ?? String(error),
      }
    }

    return {
      supported: true,
      collectionExists: true,
      indexes: raw.map((index) => ({
        name: String(index.name ?? ''),
        type: (index.type === 'vectorSearch' || index.type === 'search' ? index.type : 'unknown') as AtlasIndexType | 'unknown',
        status: String(index.status ?? 'UNKNOWN').toUpperCase(),
        queryable: index.queryable === true,
        ...(index.latestDefinition && typeof index.latestDefinition === 'object'
          ? { definition: index.latestDefinition as Record<string, unknown> }
          : {}),
      })),
    }
  } finally {
    await client.close()
  }
}
