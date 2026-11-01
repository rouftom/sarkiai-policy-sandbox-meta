/**
 * The operator's saved conversations with the policy assistant.
 *
 * A session is one conversation: its title (the first question) and its turns,
 * kept as the console rendered them so it can be reopened as it was. Sessions
 * live in Mongo when it is reachable and in memory otherwise, and are always
 * scoped to the operator who owns them.
 */
import { MongoClient, type Collection, type Document } from 'mongodb'
import { mongoPoolOptions } from '@sps/shared'

export interface ChatSessionSummary {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  turnCount: number
}

export interface ChatSession extends ChatSessionSummary {
  turns: Array<Record<string, unknown>>
}

export interface ChatSessionStoreOptions {
  mongodbUri?: string
  dbName?: string
}

export class ChatSessionStore {
  private readonly memory = new Map<string, ChatSession & { userId: string }>()
  private client: MongoClient | null = null
  private collection: Collection<Document> | null = null

  constructor(private readonly options: ChatSessionStoreOptions) {}

  private async col(): Promise<Collection<Document> | null> {
    if (!this.options.mongodbUri) return null
    if (this.collection) return this.collection
    try {
      if (!this.client) {
        this.client = new MongoClient(this.options.mongodbUri, mongoPoolOptions())
        await this.client.connect()
      }
      this.collection = this.client.db(this.options.dbName ?? 'policy_sandbox').collection('chat_sessions')
      return this.collection
    } catch {
      this.client = null
      return null
    }
  }

  private summary(session: ChatSession): ChatSessionSummary {
    const { turns: _turns, ...rest } = session
    return rest
  }

  /** The operator's sessions, most recently updated first. */
  async list(userId: string, limit = 100): Promise<ChatSessionSummary[]> {
    const col = await this.col()
    if (col) {
      const docs = await col
        .find({ userId }, { projection: { turns: 0, userId: 0 } })
        .sort({ updatedAt: -1 })
        .limit(limit)
        .toArray()
        .catch(() => null)
      if (docs) {
        return docs.map((doc) => ({
          id: String(doc._id),
          title: String(doc.title ?? ''),
          createdAt: String(doc.createdAt),
          updatedAt: String(doc.updatedAt),
          turnCount: Number(doc.turnCount ?? 0),
        }))
      }
    }
    return [...this.memory.values()]
      .filter((session) => session.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map((session) => this.summary(session))
  }

  async get(id: string, userId: string): Promise<ChatSession | null> {
    const col = await this.col()
    if (col) {
      const doc = await col.findOne({ _id: id as unknown as Document['_id'], userId }).catch(() => null)
      if (doc) {
        const { _id, userId: _owner, ...rest } = doc
        return { id: String(_id), ...(rest as unknown as Omit<ChatSession, 'id'>) }
      }
    }
    const cached = this.memory.get(id)
    if (!cached || cached.userId !== userId) return null
    const { userId: _owner, ...rest } = cached
    return rest
  }

  /** Creates or replaces a session. The owner cannot be changed by a later save. */
  async save(input: { id: string; userId: string; title: string; turns: Array<Record<string, unknown>> }): Promise<ChatSessionSummary> {
    const existing = await this.get(input.id, input.userId)
    const now = new Date().toISOString()
    const session: ChatSession = {
      id: input.id,
      title: input.title.slice(0, 120),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      turnCount: input.turns.length,
      turns: input.turns,
    }
    this.memory.set(input.id, { ...session, userId: input.userId })
    const col = await this.col()
    if (col) {
      await col
        .updateOne(
          { _id: input.id as unknown as Document['_id'] },
          {
            $set: {
              userId: input.userId,
              title: session.title,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt,
              turnCount: session.turnCount,
              turns: session.turns,
            },
          },
          { upsert: true },
        )
        .catch(() => undefined)
    }
    return this.summary(session)
  }

  async remove(id: string, userId: string): Promise<boolean> {
    const owned = await this.get(id, userId)
    if (!owned) return false
    this.memory.delete(id)
    const col = await this.col()
    if (col) await col.deleteOne({ _id: id as unknown as Document['_id'], userId }).catch(() => undefined)
    return true
  }

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
    this.collection = null
  }
}
