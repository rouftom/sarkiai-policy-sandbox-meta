/**
 * Agents & AI registry store: roles, institutions and agents.
 *
 * Built-in entries come from the engine catalogue and are always present; an
 * administrator's edit stores a new version of the entry, which then overrides
 * the built-in. Every write creates a version snapshot (`registry_versions`)
 * and is audited by the caller. Without MongoDB the store keeps everything in
 * memory, like the other operational stores.
 */

import { MongoClient, type Collection, type Document } from 'mongodb'
import {
  BUILTIN_ROLES,
  activationProblems,
  builtinAgents,
  builtinInstitutions,
  mongoPoolOptions,
  toInstitutionSpec,
  type AgentRecord,
  type Domain,
  type InstitutionRecord,
  type InstitutionSpec,
  type RegistryStatus,
  type RegistryVersion,
  type RoleRecord,
} from '@sps/shared'

export type RegistryEntity = 'role' | 'institution' | 'agent'
type RecordOf<E extends RegistryEntity> = E extends 'role' ? RoleRecord : E extends 'institution' ? InstitutionRecord : AgentRecord

const COLLECTIONS: Record<RegistryEntity, string> = { role: 'registry_roles', institution: 'registry_institutions', agent: 'registry_agents' }

export class RegistryError extends Error {
  constructor(readonly code: 'not_found' | 'conflict' | 'invalid' | 'activation_blocked', message: string, readonly details?: string[]) {
    super(message)
  }
}

export class RegistryStore {
  private readonly memory: Record<RegistryEntity, Map<string, Document>> = { role: new Map(), institution: new Map(), agent: new Map() }
  private readonly memoryVersions: Document[] = []
  private client: MongoClient | null = null

  constructor(private readonly options: { mongodbUri?: string; dbName?: string; country?: string }) {}

  async close(): Promise<void> {
    await this.client?.close()
    this.client = null
  }

  private async db() {
    if (!this.options.mongodbUri) return null
    try {
      if (!this.client) {
        this.client = new MongoClient(this.options.mongodbUri, mongoPoolOptions())
        await this.client.connect()
      }
      return this.client.db(this.options.dbName)
    } catch {
      this.client = null
      return null
    }
  }

  private async collection(entity: RegistryEntity): Promise<Collection<Document> | null> {
    return (await this.db())?.collection(COLLECTIONS[entity]) ?? null
  }

  private builtins<E extends RegistryEntity>(entity: E): RecordOf<E>[] {
    if (entity === 'role') return BUILTIN_ROLES as RecordOf<E>[]
    if (entity === 'institution') return builtinInstitutions(this.options.country ?? 'CM') as RecordOf<E>[]
    return builtinAgents() as RecordOf<E>[]
  }

  private async stored<E extends RegistryEntity>(entity: E): Promise<RecordOf<E>[]> {
    const collection = await this.collection(entity)
    const docs = collection ? await collection.find({}).toArray() : [...this.memory[entity].values()]
    return docs.map((doc) => {
      const { _id, ...rest } = doc
      return { ...rest, id: String(_id) } as unknown as RecordOf<E>
    })
  }

  /** Built-ins overridden by stored versions, then stored-only entries, sorted by name. */
  async list<E extends RegistryEntity>(entity: E): Promise<RecordOf<E>[]> {
    const stored = new Map((await this.stored(entity)).map((record) => [record.id, record]))
    const merged = this.builtins(entity).map((record) => stored.get(record.id) ?? record)
    for (const [id, record] of stored) if (!merged.some((m) => m.id === id)) merged.push(record)
    return merged.sort((a, b) => a.name.localeCompare(b.name))
  }

  async get<E extends RegistryEntity>(entity: E, id: string): Promise<RecordOf<E> | null> {
    return (await this.list(entity)).find((record) => record.id === id) ?? null
  }

  private async save<E extends RegistryEntity>(entity: E, record: RecordOf<E>, by: string): Promise<RecordOf<E>> {
    const { id, ...rest } = record as RecordOf<E> & { id: string }
    const collection = await this.collection(entity)
    if (collection) await collection.replaceOne({ _id: id as unknown as Document['_id'] }, rest, { upsert: true })
    else this.memory[entity].set(id, { _id: id, ...rest })
    const version: RegistryVersion<RecordOf<E>> = { entity, id, version: record.version, snapshot: record, savedAt: record.updatedAt, savedBy: by }
    const versions = (await this.db())?.collection('registry_versions')
    if (versions) await versions.insertOne({ ...version })
    else this.memoryVersions.push({ ...version })
    await this.refresh()
    return record
  }

  async create<E extends RegistryEntity>(entity: E, input: Omit<RecordOf<E>, 'builtIn' | 'version' | 'createdAt' | 'updatedAt' | 'updatedBy' | 'status'>, by: string): Promise<RecordOf<E>> {
    if (await this.get(entity, input.id)) throw new RegistryError('conflict', `${entity} "${input.id}" already exists.`)
    const now = new Date().toISOString()
    const record = { ...input, builtIn: false, status: 'draft' as RegistryStatus, version: 1, createdAt: now, updatedAt: now, updatedBy: by } as unknown as RecordOf<E>
    await this.validate(entity, record)
    return this.save(entity, record, by)
  }

  async update<E extends RegistryEntity>(entity: E, id: string, patch: Partial<RecordOf<E>>, by: string): Promise<RecordOf<E>> {
    const current = await this.get(entity, id)
    if (!current) throw new RegistryError('not_found', `${entity} "${id}" not found.`)
    const { id: _ignored, builtIn: _b, version: _v, createdAt: _c, status: _s, ...changes } = patch as Record<string, unknown>
    if (entity === 'role' && current.builtIn && 'capabilities' in changes) {
      throw new RegistryError('invalid', 'The capabilities of a built-in role cannot change.')
    }
    const next = { ...current, ...changes, version: current.version + 1, updatedAt: new Date().toISOString(), updatedBy: by } as RecordOf<E>
    await this.validate(entity, next)
    // An active agent must stay activable after an edit.
    if (entity === 'agent' && next.status === 'active') await this.assertActivable(next as AgentRecord)
    return this.save(entity, next, by)
  }

  async setStatus<E extends RegistryEntity>(entity: E, id: string, status: RegistryStatus, by: string): Promise<RecordOf<E>> {
    const current = await this.get(entity, id)
    if (!current) throw new RegistryError('not_found', `${entity} "${id}" not found.`)
    const next = { ...current, status, version: current.version + 1, updatedAt: new Date().toISOString(), updatedBy: by } as RecordOf<E>
    if (entity === 'agent' && status === 'active') await this.assertActivable(next as AgentRecord)
    return this.save(entity, next, by)
  }

  async versions(entity: RegistryEntity, id: string): Promise<RegistryVersion<unknown>[]> {
    const collection = (await this.db())?.collection('registry_versions')
    const docs = collection
      ? await collection.find({ entity, id }).sort({ version: -1 }).limit(50).toArray()
      : this.memoryVersions.filter((v) => v.entity === entity && v.id === id).sort((a, b) => b.version - a.version)
    return docs.map(({ _id, ...rest }) => rest as RegistryVersion<unknown>)
  }

  private async validate(entity: RegistryEntity, record: RoleRecord | InstitutionRecord | AgentRecord): Promise<void> {
    if (entity !== 'agent') return
    const agent = record as AgentRecord
    if (!(await this.get('role', agent.roleId))) throw new RegistryError('invalid', `Unknown role "${agent.roleId}".`)
    if (agent.institutionId && !(await this.get('institution', agent.institutionId))) {
      throw new RegistryError('invalid', `Unknown institution "${agent.institutionId}".`)
    }
  }

  private async assertActivable(agent: AgentRecord): Promise<void> {
    const roleRecord = await this.get('role', agent.roleId)
    const institution = agent.institutionId ? await this.get('institution', agent.institutionId) : undefined
    const problems = activationProblems(agent, roleRecord ?? undefined, institution ?? undefined)
    if (problems.length > 0) throw new RegistryError('activation_blocked', 'This agent cannot be activated yet.', problems)
  }

  private snapshot: { agents: AgentRecord[]; roles: RoleRecord[]; institutions: InstitutionRecord[] } | null = null

  /** Reloads the merged lists the engine reads synchronously (startup, after every write). */
  async refresh(): Promise<void> {
    try {
      const [agents, roles, institutions] = await Promise.all([this.list('agent'), this.list('role'), this.list('institution')])
      this.snapshot = { agents, roles, institutions }
    } catch {
      // Keep the previous snapshot; the built-in catalogue remains the fallback.
    }
  }

  private specsFrom(
    data: { agents: AgentRecord[]; roles: RoleRecord[]; institutions: InstitutionRecord[] },
    options: { domains?: Domain[]; ids?: string[] },
  ): InstitutionSpec[] {
    const roleById = new Map(data.roles.map((r) => [r.id, r]))
    const institutionById = new Map(data.institutions.map((i) => [i.id, i]))
    const specs: InstitutionSpec[] = []
    for (const agent of data.agents) {
      if (agent.status !== 'active') continue
      if (options.ids && options.ids.length > 0 && !options.ids.includes(agent.id)) continue
      const roleRecord = roleById.get(agent.roleId)
      if (!roleRecord || roleRecord.status !== 'active') continue
      const institution = agent.institutionId ? institutionById.get(agent.institutionId) : undefined
      if (agent.institutionId && (!institution || institution.status !== 'active')) continue
      const spec = toInstitutionSpec(agent, roleRecord, institution)
      if (options.domains && options.domains.length > 0 && !spec.domains.some((d) => options.domains!.includes(d))) continue
      specs.push(spec)
    }
    return specs
  }

  /**
   * The engine's view: active agents as `InstitutionSpec`, optionally limited to
   * domains and to a chosen set of ids. Falls back to the built-in catalogue if
   * the registry cannot be read, so a scenario never runs without agents.
   */
  async agentSpecs(options: { domains?: Domain[]; ids?: string[] } = {}): Promise<InstitutionSpec[]> {
    await this.refresh()
    return this.agentSpecsSync(options)
  }

  /** Same view from the last snapshot, for code paths that cannot await. */
  agentSpecsSync(options: { domains?: Domain[]; ids?: string[] } = {}): InstitutionSpec[] {
    const data = this.snapshot ?? { agents: builtinAgents(), roles: BUILTIN_ROLES, institutions: builtinInstitutions(this.options.country ?? 'CM') }
    const specs = this.specsFrom(data, options)
    // A chosen set that resolves to nothing falls back to the sector's agents.
    if (specs.length === 0 && options.ids && options.ids.length > 0) return this.specsFrom(data, { domains: options.domains })
    return specs
  }
}
