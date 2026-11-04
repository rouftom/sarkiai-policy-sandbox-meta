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

/** The only fields a turn may keep for an image; the bytes never reach Mongo. */
const ATTACHMENT_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ATTACHMENT_PROVIDERS = new Set(['s3', 'cloudinary'])
const S3_ATTACHMENT_URL = /^\/v1\/attachments\/[a-f0-9]{64}\.(png|jpg|webp|gif)\/(full|thumb)\?sig=[A-Za-z0-9_-]+$/
const CLOUDINARY_ATTACHMENT_URL = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/.+$/

/**
 * Keeps conversation turns small and safe: an image is stored as a reference
 * (`MediaRef`) and never as base64 or a `data:` URL. A client that sends
 * anything else — an old tab, a crafted request — has those entries dropped
 * before the write, so no session can grow a base64 payload again.
 */
export function sanitizeTurns(turns: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return turns.map((turn) => {
    if (!Array.isArray(turn.attachments)) return turn
    const attachments = turn.attachments.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const value = entry as Record<string, unknown>
      const url = typeof value.url === 'string' ? value.url : ''
      const thumbnailUrl = typeof value.thumbnailUrl === 'string' ? value.thumbnailUrl : ''
      const mime = typeof value.mime === 'string' ? value.mime : ''
      const provider = typeof value.provider === 'string' ? value.provider : ''
      if (!ATTACHMENT_MIMES.has(mime) || !ATTACHMENT_PROVIDERS.has(provider)) return []
      if (!isAttachmentUrl(url) || !isAttachmentUrl(thumbnailUrl)) return []
      const ref: Record<string, unknown> = {
        id: typeof value.id === 'string' ? value.id.slice(0, 200) : '',
        provider,
        mime,
        name: typeof value.name === 'string' ? value.name.slice(0, 200) : '',
        size: typeof value.size === 'number' && Number.isFinite(value.size) ? value.size : 0,
        url,
        thumbnailUrl,
      }
      if (typeof value.width === 'number' && Number.isFinite(value.width)) ref.width = value.width
      if (typeof value.height === 'number' && Number.isFinite(value.height)) ref.height = value.height
      if (typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)) ref.sha256 = value.sha256
      return [ref]
    })
    const { attachments: _attachments, ...rest } = turn
    return attachments.length > 0 ? { ...rest, attachments } : rest
  })
}

function isAttachmentUrl(url: string): boolean {
  return S3_ATTACHMENT_URL.test(url) || CLOUDINARY_ATTACHMENT_URL.test(url)
}

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
