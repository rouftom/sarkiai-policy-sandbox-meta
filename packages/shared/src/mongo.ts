/**
 * Options every MongoDB client in the process should carry.
 *
 * Several services open their own client (auth, audit, reports, retrieval, and
 * the per-feature stores), so an unconfigured `new MongoClient(uri)` gives each
 * one an unbounded pool and an unbounded wait when the pool is saturated. Under
 * load that is how a single slow query turns into a pile of held requests.
 * Bounding both keeps the free instance predictable; the env values let a
 * larger deployment raise them without a code change.
 */

export interface MongoPoolOptions {
  /** Stop waiting for a server this quickly instead of hanging a request. */
  serverSelectionTimeoutMS: number
  /** Connections one client may open. */
  maxPoolSize: number
  /** How long a request waits for a free pooled connection. */
  waitQueueTimeoutMS: number
}

function positive(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function mongoPoolOptions(): MongoPoolOptions {
  return {
    serverSelectionTimeoutMS: 4000,
    maxPoolSize: positive('MONGODB_MAX_POOL_SIZE', 10),
    waitQueueTimeoutMS: positive('MONGODB_WAIT_QUEUE_TIMEOUT_MS', 5000),
  }
}
