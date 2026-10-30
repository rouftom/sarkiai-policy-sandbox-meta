/**
 * Country & sector registry.
 *
 * One row per jurisdiction the sandbox can work on, with the sectors enabled for
 * it. The registry is shared across operators: it describes the institutions'
 * field of play, not one operator's private selection. `createdBy` keeps the
 * provenance. Only Cameroon is seeded; adding another country is a data change,
 * not a code change.
 *
 * Mongo when it is reachable, memory otherwise, like every other store here.
 */

import { MongoClient, type Collection, type Document } from 'mongodb'
import type { Domain } from '@sps/shared'

/** The sectors the engine knows. Kept in sync with the shared `Domain` union. */
export const COUNTRY_SECTORS: readonly Domain[] = [
  'health',
  'education',
  'telecom',
  'public_services',
  'agriculture',
]

export type CountryJurisdiction = 'national' | 'regional' | 'international'
export type CountryStatus = 'active' | 'planned'

export interface CountryRecord {
  /** ISO 3166-1 alpha-2, lower-cased. */
  code: string
  /** English name, the console's default. */
  name: string
  /** French name, shown when the console is in French. */
  nameFr: string
  jurisdiction: CountryJurisdiction
  /** Geographic grouping, e.g. `Central Africa`. */
  region: string
  /** The regulator the sandbox is aligned with. */
  authority: string
  /** ISO 4217 code. */
  currency: string
  /** Locales the country operates in. */
  languages: string[]
  /** IANA time zone. */
  timezone: string
  /** Enabled sectors, at least one. */
  sectors: Domain[]
  status: CountryStatus
  notes?: string
  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface CountryInput {
  code: string
  name: string
  nameFr?: string
  jurisdiction?: CountryJurisdiction
  region?: string
  authority?: string
  currency?: string
  languages?: string[]
  timezone?: string
  sectors?: Domain[]
  status?: CountryStatus
  notes?: string
  createdBy: string
}

export interface CountryPatch {
  name?: string
  nameFr?: string
  jurisdiction?: CountryJurisdiction
  region?: string
  authority?: string
  currency?: string
  languages?: string[]
  timezone?: string
  sectors?: Domain[]
  status?: CountryStatus
  notes?: string
}

const SEED_AT = '2026-01-01T00:00:00.000Z'
/** Note shipped with the first seed; ignored so the console shows no seed copy. */
const LEGACY_SEED_NOTE = 'Reference corpus and demo jurisdiction.'

/** The only seeded country: the corpus and the demo are Cameroonian. */
export const SEED_COUNTRIES: readonly CountryRecord[] = [
  {
    code: 'cm',
    name: 'Cameroon',
    nameFr: 'Cameroun',
    jurisdiction: 'national',
    region: 'Central Africa',
    authority: 'MINPOSTEL',
    currency: 'XAF',
    languages: ['fr', 'en'],
    timezone: 'Africa/Douala',
    sectors: [...COUNTRY_SECTORS],
    status: 'active',
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
    createdBy: 'seed',
  },
]

function sectorsFrom(value: unknown): Domain[] {
  const list = Array.isArray(value) ? value : []
  const valid = COUNTRY_SECTORS.filter((sector) => list.includes(sector))
  return valid.length > 0 ? valid : [...COUNTRY_SECTORS]
}

function toCountry(doc: Document): CountryRecord {
  return {
    code: String(doc.code ?? doc._id ?? ''),
    name: String(doc.name ?? ''),
    nameFr: String(doc.nameFr ?? doc.name ?? ''),
    jurisdiction:
      doc.jurisdiction === 'regional' || doc.jurisdiction === 'international' ? doc.jurisdiction : 'national',
    region: String(doc.region ?? ''),
    authority: String(doc.authority ?? ''),
    currency: String(doc.currency ?? ''),
    languages: Array.isArray(doc.languages) ? doc.languages.map(String) : [],
    timezone: String(doc.timezone ?? ''),
    sectors: sectorsFrom(doc.sectors),
    status: doc.status === 'planned' ? 'planned' : 'active',
    ...(typeof doc.notes === 'string' && doc.notes && doc.notes !== LEGACY_SEED_NOTE ? { notes: doc.notes } : {}),
    createdAt: String(doc.createdAt ?? SEED_AT),
    updatedAt: String(doc.updatedAt ?? doc.createdAt ?? SEED_AT),
    createdBy: String(doc.createdBy ?? ''),
  }
}

export class CountryStore {
  private readonly memory = new Map<string, CountryRecord>()
  private client: MongoClient | null = null
  private collection: Collection<Document> | null = null

  constructor(private readonly options: { mongodbUri?: string; dbName?: string; seed?: readonly CountryRecord[] }) {}

  private async col(): Promise<Collection<Document> | null> {
    if (!this.options.mongodbUri) return null
    if (this.collection) return this.collection
    try {
      if (!this.client) {
        this.client = new MongoClient(this.options.mongodbUri, { serverSelectionTimeoutMS: 4000 })
        await this.client.connect()
      }
      this.collection = this.client.db(this.options.dbName ?? 'policy_sandbox').collection('countries')
      return this.collection
    } catch {
      this.client = null
      return null
    }
  }

  private get seed(): readonly CountryRecord[] {
    return this.options.seed ?? SEED_COUNTRIES
  }

  /** Active countries first, then alphabetical by code. */
  private sort(countries: CountryRecord[]): CountryRecord[] {
    return [...countries].sort((a, b) => {
      if (a.status !== b.status) return a.status === 'active' ? -1 : 1
      return a.code.localeCompare(b.code)
    })
  }

  async list(): Promise<CountryRecord[]> {
    const col = await this.col()
    if (col) {
      const docs = await col.find({}).toArray().catch(() => null)
      if (docs) {
        if (docs.length === 0) {
          // First boot with an empty collection: seed the reference jurisdiction.
          await Promise.all(
            this.seed.map((country) =>
              col.insertOne({ _id: country.code as unknown as Document['_id'], ...country }).catch(() => undefined),
            ),
          )
          return this.sort([...this.seed])
        }
        return this.sort(docs.map(toCountry))
      }
    }
    if (this.memory.size === 0) {
      for (const country of this.seed) this.memory.set(country.code, country)
    }
    return this.sort([...this.memory.values()])
  }

  async get(code: string): Promise<CountryRecord | null> {
    const wanted = code.toLowerCase()
    const col = await this.col()
    if (col) {
      const doc = await col.findOne({ _id: wanted as unknown as Document['_id'] }).catch(() => null)
      if (doc) return toCountry(doc)
    }
    const cached = this.memory.get(wanted)
    if (cached) return cached
    if (this.seed.some((country) => country.code === wanted)) {
      // An empty collection may still need the seed on a direct lookup.
      const found = (await this.list()).find((country) => country.code === wanted)
      if (found) return found
    }
    return null
  }

  async add(input: CountryInput): Promise<CountryRecord | null> {
    const code = input.code.toLowerCase()
    if (await this.get(code)) return null
    const now = new Date().toISOString()
    const country: CountryRecord = {
      code,
      name: input.name,
      nameFr: input.nameFr ?? input.name,
      jurisdiction: input.jurisdiction ?? 'national',
      region: input.region ?? '',
      authority: input.authority ?? '',
      currency: input.currency ?? '',
      languages: input.languages ?? [],
      timezone: input.timezone ?? '',
      sectors: sectorsFrom(input.sectors),
      status: input.status ?? 'active',
      ...(input.notes ? { notes: input.notes } : {}),
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
    }
    this.memory.set(code, country)
    const col = await this.col()
    if (col) {
      await col.insertOne({ _id: code as unknown as Document['_id'], ...country }).catch(() => undefined)
    }
    return country
  }

  /** Replaces the mutable fields of one country; the code, provenance and creation time stay. */
  async update(code: string, patch: CountryPatch): Promise<CountryRecord | null> {
    const current = await this.get(code)
    if (!current) return null
    const next: CountryRecord = {
      ...current,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.nameFr !== undefined ? { nameFr: patch.nameFr } : {}),
      ...(patch.jurisdiction !== undefined ? { jurisdiction: patch.jurisdiction } : {}),
      ...(patch.region !== undefined ? { region: patch.region } : {}),
      ...(patch.authority !== undefined ? { authority: patch.authority } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency } : {}),
      ...(patch.languages !== undefined ? { languages: patch.languages } : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
      ...(patch.sectors !== undefined ? { sectors: sectorsFrom(patch.sectors) } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.notes !== undefined ? (patch.notes ? { notes: patch.notes } : {}) : {}),
      updatedAt: new Date().toISOString(),
    }
    if (patch.notes === '') delete next.notes
    this.memory.set(next.code, next)
    const col = await this.col()
    if (col) {
      await col
        .updateOne(
          { _id: next.code as unknown as Document['_id'] },
          {
            $set: {
              name: next.name,
              nameFr: next.nameFr,
              jurisdiction: next.jurisdiction,
              region: next.region,
              authority: next.authority,
              currency: next.currency,
              languages: next.languages,
              timezone: next.timezone,
              sectors: next.sectors,
              status: next.status,
              notes: next.notes ?? null,
              updatedAt: next.updatedAt,
            },
          },
        )
        .catch(() => undefined)
    }
    return next
  }

  async setSectors(code: string, sectors: Domain[]): Promise<CountryRecord | null> {
    return this.update(code, { sectors })
  }

  async remove(code: string): Promise<boolean> {
    const existed = this.memory.delete(code)
    const col = await this.col()
    if (col) {
      const result = await col.deleteOne({ _id: code as unknown as Document['_id'] }).catch(() => null)
      return Boolean(result?.deletedCount) || existed
    }
    return existed
  }
}
