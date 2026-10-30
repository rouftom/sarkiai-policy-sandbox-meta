/**
 * Address book for operator notifications.
 *
 * One row per person the cell can reach, with the channel they consented to.
 * Numbers are stored E.164 only (validated by `@sps/notifications`); e-mails are
 * lower-cased. The list is shared across operators on purpose: a focal point is
 * an institution's contact, not one operator's private record. `createdBy` keeps
 * the provenance.
 *
 * Mongo when it is reachable, memory otherwise, like every other store here.
 */

import { randomUUID } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'

export interface NotificationContact {
  id: string
  name: string
  email?: string
  /** E.164, e.g. `+237612345678`. */
  phone?: string
  country?: string
  channels: { email: boolean; whatsapp: boolean }
  createdAt: string
  createdBy: string
}

export interface NewNotificationContact {
  name: string
  email?: string
  phone?: string
  country?: string
  channels: { email: boolean; whatsapp: boolean }
  createdBy: string
}

function toContact(doc: Document): NotificationContact {
  const channels = (doc.channels ?? {}) as Record<string, unknown>
  return {
    id: String(doc._id),
    name: String(doc.name ?? ''),
    ...(typeof doc.email === 'string' && doc.email ? { email: doc.email } : {}),
    ...(typeof doc.phone === 'string' && doc.phone ? { phone: doc.phone } : {}),
    ...(typeof doc.country === 'string' && doc.country ? { country: doc.country } : {}),
    channels: { email: channels.email === true, whatsapp: channels.whatsapp === true },
    createdAt: String(doc.createdAt ?? ''),
    createdBy: String(doc.createdBy ?? ''),
  }
}

export class NotificationContactStore {
  private readonly memory = new Map<string, NotificationContact>()
  private client: MongoClient | null = null
  private collection: Collection<Document> | null = null

  constructor(private readonly options: { mongodbUri?: string; dbName?: string }) {}

  private async col(): Promise<Collection<Document> | null> {
    if (!this.options.mongodbUri) return null
    if (this.collection) return this.collection
    try {
      if (!this.client) {
        this.client = new MongoClient(this.options.mongodbUri, { serverSelectionTimeoutMS: 4000 })
        await this.client.connect()
      }
      this.collection = this.client.db(this.options.dbName ?? 'policy_sandbox').collection('notification_contacts')
      return this.collection
    } catch {
      this.client = null
      return null
    }
  }

  async list(): Promise<NotificationContact[]> {
    const col = await this.col()
    if (col) {
      const docs = await col.find({}).sort({ createdAt: -1 }).limit(500).toArray().catch(() => null)
      if (docs) return docs.map(toContact)
    }
    return [...this.memory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getMany(ids: string[]): Promise<NotificationContact[]> {
    const wanted = new Set(ids)
    if (wanted.size === 0) return []
    const col = await this.col()
    if (col) {
      const docs = await col
        .find({ _id: { $in: [...wanted] } as unknown as Document['_id'] })
        .toArray()
        .catch(() => null)
      if (docs) return docs.map(toContact)
    }
    return [...this.memory.values()].filter((contact) => wanted.has(contact.id))
  }

  /** The same number or the same address twice is a mistake, not a second contact. */
  async duplicate(
    input: { email?: string; phone?: string },
    ignoreId?: string,
  ): Promise<NotificationContact | null> {
    const all = await this.list()
    return (
      all.find(
        (contact) =>
          contact.id !== ignoreId &&
          ((input.phone && contact.phone === input.phone) ||
            (input.email && contact.email && contact.email === input.email)),
      ) ?? null
    )
  }

  async get(id: string): Promise<NotificationContact | null> {
    const db = await this.col()
    if (db) {
      const doc = await db.findOne({ _id: id as unknown as Document['_id'] }).catch(() => null)
      if (doc) return toContact(doc)
    }
    return this.memory.get(id) ?? null
  }

  async add(input: NewNotificationContact): Promise<NotificationContact> {
    const contact: NotificationContact = {
      id: `nc_${randomUUID()}`,
      name: input.name,
      ...(input.email ? { email: input.email.toLowerCase() } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.country ? { country: input.country } : {}),
      channels: input.channels,
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
    }
    this.memory.set(contact.id, contact)
    const col = await this.col()
    if (col) {
      await col
        .insertOne({ _id: contact.id as unknown as Document['_id'], ...contact })
        .catch(() => undefined)
    }
    return contact
  }

  /** Replaces the mutable fields of one contact; the id, provenance and creation time stay. */
  async update(id: string, input: Omit<NewNotificationContact, 'createdBy'>): Promise<NotificationContact | null> {
    const current = await this.get(id)
    if (!current) return null

    const next: NotificationContact = {
      id: current.id,
      name: input.name,
      ...(input.email ? { email: input.email.toLowerCase() } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.country ? { country: input.country } : {}),
      channels: input.channels,
      createdAt: current.createdAt,
      createdBy: current.createdBy,
    }
    this.memory.set(id, next)

    const col = await this.col()
    if (col) {
      await col
        .updateOne(
          { _id: id as unknown as Document['_id'] },
          {
            $set: {
              name: next.name,
              email: next.email ?? null,
              phone: next.phone ?? null,
              country: next.country ?? null,
              channels: next.channels,
            },
          },
        )
        .catch(() => undefined)
    }
    return next
  }

  async remove(id: string): Promise<boolean> {
    const existed = this.memory.delete(id)
    const col = await this.col()
    if (col) {
      const result = await col.deleteOne({ _id: id as unknown as Document['_id'] }).catch(() => null)
      return Boolean(result?.deletedCount) || existed
    }
    return existed
  }
}
