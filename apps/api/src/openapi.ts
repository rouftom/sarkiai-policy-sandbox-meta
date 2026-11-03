/**
 * OpenAPI 3.1 document generated from the routes Fastify actually registered
 * and from the zod schemas those routes validate with (`openapi/schemas.ts`).
 *
 * The catalog is fed by an `onRoute` hook, so a new endpoint appears in the
 * document without a second list to maintain. Hand-written metadata adds the
 * summary, the request schemas and the response schema where they are useful.
 */

import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { ZodType } from 'zod'
import { isPublicRoute } from './public-routes.js'
import {
  OPERATIONS,
  TAG_DESCRIPTIONS,
  operationFor,
  tagFor,
  type DiscoveredRoute,
  type OperationDoc,
} from './openapi/operations.js'
import { DOCS_HTML } from './openapi/docs.js'

type JsonSchema = Record<string, unknown>
type PathItem = Record<string, unknown>

const INFO = {
  title: 'SarkiAI Policy Sandbox API',
  version: '0.1.0',
  description: [
    'Institutional policy sandbox for Cameroon. Every agent claim cites the legal corpus,',
    'and every side effect waits for an operator decision recorded in the audit chain.',
    '',
    'Protected operations require `Authorization: Bearer <session>`; sessions come from',
    '`POST /v1/auth/login` and last seven days.',
  ].join('\n'),
}

const BEARER_SCHEME = {
  type: 'http',
  scheme: 'bearer',
  description: 'Signed session returned by `/v1/auth/login` or the MFA step.',
}

/** Fastify uses `:param`; OpenAPI uses `{param}`. */
export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

/** Zod schema to JSON Schema, without the per-schema `$schema` dialect marker. */
export function toJsonSchema(schema: ZodType | undefined): JsonSchema | undefined {
  if (!schema) return undefined
  const generated = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
  }) as JsonSchema
  const copy = { ...generated }
  delete copy.$schema
  return copy
}

function pathParameters(path: string, doc: OperationDoc | undefined): unknown[] {
  const declared = toJsonSchema(doc?.params)
  const properties = (declared?.properties ?? {}) as Record<string, JsonSchema>
  const names = [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1]!)

  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: properties[name] ?? { type: 'string' },
  }))
}

function queryParameters(doc: OperationDoc | undefined): unknown[] {
  const schema = toJsonSchema(doc?.query)
  if (!schema) return []
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
  const required = new Set((schema.required as string[] | undefined) ?? [])
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: property,
  }))
}

function requestBody(doc: OperationDoc | undefined): unknown {
  const schema = toJsonSchema(doc?.body)
  if (!schema) return undefined
  return {
    required: true,
    content: { 'application/json': { schema } },
  }
}

function responses(doc: OperationDoc | undefined, protectedRoute: boolean): Record<string, unknown> {
  const schema = toJsonSchema(doc?.response)
  const contentType = doc?.responseType ?? 'application/json'
  const success: Record<string, unknown> = {
    description: doc?.responseType === 'text/event-stream' ? 'Event stream' : 'Success',
  }
  if (doc?.responseType === 'text/event-stream') {
    success.content = { 'text/event-stream': { schema: { type: 'string' } } }
  } else if (schema) {
    success.content = { [contentType]: { schema } }
  }
  return {
    '200': success,
    ...(protectedRoute
      ? { '401': { description: 'Missing or invalid session' } }
      : {}),
  }
}

function fallbackSummary(method: string, path: string): string {
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1] ?? 'root'
  if (last.startsWith(':')) {
    const parent = segments[segments.length - 2] ?? 'record'
    return `${parent.replace(/[-_]/g, ' ')} by ${last.slice(1)}`
  }
  const cleaned = last.replace(/[-_]/g, ' ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

function operationId(method: string, path: string): string {
  const slug = path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${method.toLowerCase()}-${slug}`
}

function operationForRoute(route: DiscoveredRoute): Record<string, unknown> {
  const method = route.method.toUpperCase()
  const doc = operationFor(method, route.path)
  const openapiPath = toOpenApiPath(route.path)
  const publicRoute = isPublicRoute(method, route.path)
  const parameters = [
    ...pathParameters(route.path, doc),
    ...queryParameters(doc),
  ]
  const body = requestBody(doc)
  const tag = doc?.tags?.[0] ?? tagFor(route.path)

  return {
    summary: doc?.summary ?? fallbackSummary(method, route.path),
    ...(doc?.description ? { description: doc.description } : {}),
    operationId: operationId(method, openapiPath),
    tags: doc?.tags ?? [tag],
    security: publicRoute ? [] : [{ bearerAuth: [] }],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(body ? { requestBody: body } : {}),
    responses: responses(doc, !publicRoute),
  }
}

/** Stable, readable ordering: paths alphabetically, methods in HTTP order. */
const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete']

export function buildOpenApiDocument(routes: DiscoveredRoute[]): JsonSchema {
  const paths: Record<string, PathItem> = {}
  const seen = new Set<string>()
  const tags: string[] = []

  for (const route of routes) {
    const method = route.method.toLowerCase()
    if (method === 'head' || method === 'options') continue
    const key = `${method} ${route.path}`
    if (seen.has(key)) continue
    seen.add(key)

    const openapiPath = toOpenApiPath(route.path)
    const item = (paths[openapiPath] ??= {})
    item[method] = operationForRoute({ method, path: route.path })

    const tag = (operationFor(method, route.path)?.tags?.[0] ?? tagFor(route.path))
    if (!tags.includes(tag)) tags.push(tag)
  }

  const orderedPaths: Record<string, PathItem> = {}
  for (const path of Object.keys(paths).sort()) {
    const item = paths[path]!
    const ordered: PathItem = {}
    for (const method of METHOD_ORDER) {
      if (item[method]) ordered[method] = item[method]
    }
    // Anything Fastify exposes outside the usual verbs stays published.
    for (const [method, operation] of Object.entries(item)) {
      if (!ordered[method]) ordered[method] = operation
    }
    orderedPaths[path] = ordered
  }

  return {
    openapi: '3.1.0',
    info: INFO,
    servers: [{ url: '/', description: 'This deployment' }],
    tags: tags.map((name) => ({
      name,
      ...(TAG_DESCRIPTIONS[name] ? { description: TAG_DESCRIPTIONS[name] } : {}),
    })),
    security: [{ bearerAuth: [] }],
    paths: orderedPaths,
    components: { securitySchemes: { bearerAuth: BEARER_SCHEME } },
  }
}

/**
 * Routes seen by Fastify. Kept per server instance so tests can build more than
 * one without sharing state.
 */
export class OpenApiCatalog {
  private readonly routes: DiscoveredRoute[] = []

  record(method: string | string[], path: string): void {
    for (const entry of Array.isArray(method) ? method : [method]) {
      this.routes.push({ method: entry, path })
    }
  }

  document(): JsonSchema {
    return buildOpenApiDocument(this.routes)
  }

  get size(): number {
    return this.routes.length
  }
}

/** `GET /openapi.json` and the self-contained reference at `GET /docs`. */
export function registerOpenApiRoutes(app: FastifyInstance, catalog: OpenApiCatalog): void {
  app.get('/openapi.json', async (_request, reply) => {
    reply.header('cache-control', 'no-store')
    return catalog.document()
  })

  app.get('/docs', async (_request, reply) => {
    reply.type('text/html; charset=utf-8')
    return DOCS_HTML
  })
}

export { OPERATIONS }
export type { OperationDoc }
