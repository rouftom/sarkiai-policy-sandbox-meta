/**
 * Durable token ledger: one document per model call, kept without expiry.
 *
 * Mongo when it is reachable; events that cannot be written are kept in memory
 * for the life of the process so a metering failure never breaks a request, and
 * they are retried on the next write.
 */
import { MongoClient, type Collection, type Document } from 'mongodb'
import { MemoryUsageStore, type UsageEvent, type UsageStore } from '@sps/agents'

export interface MongoUsageStoreConfig {
  mongodbUri: string
  dbName: string
  collection?: string
}

export class MongoUsageStore implements UsageStore {
  private client: MongoClient | null = null
  private collection: Collection<Document> | null = null
  private indexed = false
  private readonly pending = new MemoryUsageStore()

  constructor(private readonly config: MongoUsageStoreConfig) {}

  private async col(): Promise<Collection<Document> | null> {
    if (this.collection) return this.collection
    try {
      if (!this.client) {
        this.client = new MongoClient(this.config.mongodbUri, { serverSelectionTimeoutMS: 4000 })
        await this.client.connect()
      }
      this.collection = this.client.db(this.config.dbName).collection(this.config.collection ?? 'usage_events')
      if (!this.indexed) {
        await this.collection.createIndex({ operator: 1, ts: -1 })
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
    await this.flush()
    const col = await this.col()
    if (!col) return this.pending.events.filter((event) => event.operator === operator).slice(-limit).reverse()
    const docs = await col.find({ operator }, { projection: { _id: 0 } }).sort({ ts: -1 }).limit(limit).toArray()
    return docs as unknown as UsageEvent[]
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
