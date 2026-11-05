/**
 * Agents & AI registry routes: roles, institutions, agents.
 *
 * Reads are open to every signed-in operator (the work screens pick agents);
 * writes are administrator-only, versioned and audited. The guarantees listed
 * by `GET /v1/registry/guarantees` are enforced in code, not configured here.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { CAPABILITIES, REGISTRY_GUARANTEES, type Domain } from '@sps/shared'
import type { AuditService } from '@sps/audit'
import { RegistryError, type RegistryEntity, type RegistryStore } from './registry.js'

const DOMAINS = ['health', 'education', 'telecom', 'public_services', 'agriculture'] as const
const slug = z.string().trim().min(2).max(64).regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase letters, digits, - and _')

export const roleCreateSchema = z.object({
  id: slug,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(2).max(600),
  capabilities: z.array(z.enum(CAPABILITIES)).min(1).max(CAPABILITIES.length),
  requiresInstitution: z.boolean().default(false),
})
export const rolePatchSchema = roleCreateSchema.omit({ id: true }).partial()

const legalBasis = z.object({
  filename: z.string().trim().min(1).max(200),
  article: z.string().trim().max(40).optional(),
  note: z.string().trim().max(300).optional(),
})
export const institutionCreateSchema = z.object({
  id: slug,
  name: z.string().trim().min(2).max(120),
  country: z.string().trim().regex(/^[A-Za-z]{2}$/).transform((v) => v.toUpperCase()),
  mandate: z.string().trim().min(10).max(2000),
  legalBasis: z.array(legalBasis).max(30).default([]),
  domains: z.array(z.enum(DOMAINS)).min(1),
  mustNot: z.array(z.string().trim().min(2).max(200)).max(20).default([]),
})
export const institutionPatchSchema = institutionCreateSchema.omit({ id: true }).partial()

export const agentCreateSchema = z.object({
  id: slug,
  name: z.string().trim().min(2).max(120),
  roleId: slug,
  institutionId: slug.optional(),
  model: z.string().trim().max(120).optional(),
  instructions: z.string().max(4000).default(''),
  informationScope: z.enum(['all_events', 'domain_events', 'addressed_events']).default('domain_events'),
  color: z.string().trim().regex(/^text-[a-z]+-[0-9]{3}$/).default('text-slate-500'),
})
export const agentPatchSchema = agentCreateSchema.omit({ id: true }).partial()
export const statusSchema = z.object({ status: z.enum(['draft', 'active', 'retired']) })
export const registryIdParams = z.object({ id: slug })
export const agentSpecsQuery = z.object({
  domains: z.string().optional(),
  ids: z.string().optional(),
})

const ENTITIES: Array<{ path: string; entity: RegistryEntity; create: z.ZodTypeAny; patch: z.ZodTypeAny }> = [
  { path: 'roles', entity: 'role', create: roleCreateSchema, patch: rolePatchSchema },
  { path: 'institutions', entity: 'institution', create: institutionCreateSchema, patch: institutionPatchSchema },
  { path: 'agents', entity: 'agent', create: agentCreateSchema, patch: agentPatchSchema },
]

function isAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.operator?.role === 'admin') return true
  void reply.status(403).send({ error: 'admin_only', message: 'This action is reserved for administrators on this shared deployment.' })
  return false
}

function sendRegistryError(reply: FastifyReply, error: unknown) {
  if (error instanceof RegistryError) {
    const status = error.code === 'not_found' ? 404 : error.code === 'conflict' ? 409 : error.code === 'activation_blocked' ? 422 : 400
    return reply.status(status).send({ error: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) })
  }
  throw error
}

function invalid(reply: FastifyReply, issues: z.ZodError) {
  return reply.status(400).send({ error: 'validation_failed', message: 'The request does not match its schema.', fields: issues.flatten().fieldErrors })
}

export async function registerRegistryRoutes(app: FastifyInstance, deps: { registry: RegistryStore; audit: AuditService }): Promise<void> {
  const { registry, audit } = deps

  app.get('/v1/registry/guarantees', async () => ({ guarantees: REGISTRY_GUARANTEES, capabilities: CAPABILITIES }))

  app.get('/v1/registry/agent-specs', async (request, reply) => {
    const query = agentSpecsQuery.safeParse(request.query)
    if (!query.success) return invalid(reply, query.error)
    const domains = (query.data.domains ?? '').split(',').map((d) => d.trim()).filter((d): d is Domain => (DOMAINS as readonly string[]).includes(d))
    const ids = (query.data.ids ?? '').split(',').map((d) => d.trim()).filter(Boolean)
    return { agents: await registry.agentSpecs({ domains, ids }) }
  })

  for (const { path, entity, create, patch } of ENTITIES) {
    const base = `/v1/registry/${path}`

    app.get(base, async () => ({ items: await registry.list(entity) }))

    app.get(`${base}/:id`, async (request, reply) => {
      const params = registryIdParams.safeParse(request.params)
      if (!params.success) return invalid(reply, params.error)
      const record = await registry.get(entity, params.data.id)
      if (!record) return reply.status(404).send({ error: 'not_found', message: `${entity} "${params.data.id}" not found.` })
      return record
    })

    app.get(`${base}/:id/versions`, async (request, reply) => {
      const params = registryIdParams.safeParse(request.params)
      if (!params.success) return invalid(reply, params.error)
      return { versions: await registry.versions(entity, params.data.id) }
    })

    app.post(base, async (request, reply) => {
      if (!isAdmin(request, reply)) return reply
      const body = create.safeParse(request.body)
      if (!body.success) return invalid(reply, body.error)
      try {
        const by = request.operator!.email
        const record = await registry.create(entity, body.data as never, by)
        await audit.logAction({ actor: 'operator', action: `registry.${entity}.created`, target: `${entity}:${record.id}@v${record.version}`, lens: 'hybrid', userId: by })
        return reply.status(201).send(record)
      } catch (error) {
        return sendRegistryError(reply, error)
      }
    })

    app.patch(`${base}/:id`, async (request, reply) => {
      if (!isAdmin(request, reply)) return reply
      const params = registryIdParams.safeParse(request.params)
      if (!params.success) return invalid(reply, params.error)
      const body = patch.safeParse(request.body)
      if (!body.success) return invalid(reply, body.error)
      try {
        const by = request.operator!.email
        const record = await registry.update(entity, params.data.id, body.data as never, by)
        await audit.logAction({ actor: 'operator', action: `registry.${entity}.updated`, target: `${entity}:${record.id}@v${record.version}`, lens: 'hybrid', userId: by })
        return record
      } catch (error) {
        return sendRegistryError(reply, error)
      }
    })

    app.post(`${base}/:id/status`, async (request, reply) => {
      if (!isAdmin(request, reply)) return reply
      const params = registryIdParams.safeParse(request.params)
      if (!params.success) return invalid(reply, params.error)
      const body = statusSchema.safeParse(request.body)
      if (!body.success) return invalid(reply, body.error)
      try {
        const by = request.operator!.email
        const record = await registry.setStatus(entity, params.data.id, body.data.status, by)
        await audit.logAction({ actor: 'operator', action: `registry.${entity}.${body.data.status}`, target: `${entity}:${record.id}@v${record.version}`, lens: 'hybrid', userId: by })
        return record
      } catch (error) {
        return sendRegistryError(reply, error)
      }
    })
  }
}
