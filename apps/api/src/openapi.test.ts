import { describe, expect, test } from 'bun:test'
import Fastify from 'fastify'
import { OpenApiCatalog, buildOpenApiDocument, registerOpenApiRoutes, toJsonSchema, toOpenApiPath } from './openapi.js'
import { OPERATIONS, TAG_DESCRIPTIONS } from './openapi/operations.js'
import { askBody, gazetteIngestInput, usageQuery } from './openapi/schemas.js'
import { isPublicRoute } from './public-routes.js'

const ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'POST', path: '/v1/agents/ask' },
  { method: 'GET', path: '/v1/countries/:code' },
  { method: 'POST', path: '/v1/whatsapp/approvals/:token' },
  { method: 'GET', path: '/v1/auth/setup' },
  { method: 'GET', path: '/v1/auth/me' },
  { method: 'GET', path: '/v1/audit/dossier/:runId' },
  { method: 'GET', path: '/v1/kb/images/:id' },
]

type Operation = Record<string, any>
type Paths = Record<string, Record<string, Operation>>

const document = buildOpenApiDocument(ROUTES)
const paths = document.paths as Paths

const ALL_ROUTES = Object.keys(OPERATIONS).map((key) => {
  const [method, path] = key.split(' ') as [string, string]
  return { method, path }
})
const fullDocument = buildOpenApiDocument(ALL_ROUTES)
const fullPaths = fullDocument.paths as Paths

describe('OpenAPI document', () => {
  test('is an OpenAPI 3.1 document with the registered paths', () => {
    expect(document.openapi).toBe('3.1.0')
    expect(document.info).toMatchObject({ title: 'SarkiAI Policy Sandbox API' })
    expect(Object.keys(paths)).toContain('/v1/countries/{code}')
    expect(Object.keys(paths)).toContain('/v1/agents/ask')
    expect(paths['/v1/agents/ask']?.post).toBeDefined()
  })

  test('introduces the API, its auth, its errors and its conventions', () => {
    const description = String((document.info as Operation).description)
    for (const heading of ['# Overview', '## Base URL', '## Authentication', '## Authorisation', '## Errors', '## Status codes used by this API', '## Conventions', '## Audit and traceability', '## Rate limits']) {
      expect(description).toContain(heading)
    }
    expect(description).toContain('{ "error": "not_found" }')
    expect(description).toContain('validation_failed')
    expect(description).toContain('"fields"')
  })

  test('publishes the contact, the licence and both servers', () => {
    expect(document.info).toMatchObject({
      contact: { name: 'SarkiAI Policy Sandbox' },
      license: { identifier: 'Apache-2.0' },
    })
    expect(document.servers).toEqual([
      { url: '/', description: 'This deployment' },
      { url: 'https://sps-api.djotta.com', description: 'Production' },
    ])
    expect(document.security).toEqual([{ bearerAuth: [] }])
  })

  test('publishes one error envelope, shared by every route', () => {
    const components = document.components as Operation
    expect(components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' })
    expect(components.schemas.ApiError.required).toEqual(['error'])
    expect(components.schemas.ApiError.properties.fields).toBeDefined()
    expect(components.schemas.ApiError.properties.formErrors).toBeDefined()
    expect(components.schemas.ValidationError).toBeUndefined()
    expect(components.responses.BadRequest.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ApiError',
    })
    expect(components.responses.BadRequestApi).toBeUndefined()
    expect(components.responses.Unauthorized.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ApiError',
    })
    expect(components.responses.TooManyRequests.headers['Retry-After']).toBeDefined()
    expect(components.responses.Conflict.content['application/json'].example).toMatchObject({
      error: 'run_complete',
    })
    expect(
      components.responses.Forbidden.content['application/json'].examples.rights.value,
    ).toMatchObject({ error: 'rights_blocked' })
  })

  test('marks public routes as unauthenticated and the rest as bearer', () => {
    expect(paths['/health']?.get?.security).toEqual([])
    expect(paths['/v1/auth/setup']?.get?.security).toEqual([])
    expect(paths['/v1/whatsapp/approvals/{token}']?.post?.security).toEqual([])
    expect(paths['/v1/kb/images/{id}']?.get?.security).toEqual([])
    expect(paths['/v1/auth/me']?.get?.security).toEqual([{ bearerAuth: [] }])
    expect(paths['/v1/agents/ask']?.post?.security).toEqual([{ bearerAuth: [] }])
  })

  test('generates request bodies from the zod schemas', () => {
    const operation = paths['/v1/agents/ask']?.post as Operation
    expect(operation.requestBody).toMatchObject({ required: true })
    const schema = operation.requestBody.content['application/json'].schema
    expect(schema.type).toBe('object')
    expect(schema.properties.question.minLength).toBe(1)
    expect(schema.required).toContain('question')
    expect(schema.required).toContain('institutionId')
    expect(Object.keys(schema.properties)).toContain('attachments')
    expect(schema.properties.question.description).toContain('operator question')
  })

  test('documents path and query parameters with their constraints', () => {
    const countries = paths['/v1/countries/{code}']?.get as Operation
    expect(countries.parameters).toHaveLength(1)
    expect(countries.parameters[0]).toMatchObject({ name: 'code', in: 'path', required: true, schema: { type: 'string' } })

    const dossier = paths['/v1/audit/dossier/{runId}']?.get as Operation
    expect(dossier.parameters.map((parameter: Operation) => parameter.name)).toEqual(['runId', 'format'])
    expect(dossier.parameters[1]).toMatchObject({ name: 'format', in: 'query', required: false })
    expect(dossier.parameters[1].schema.enum).toEqual(['json', 'markdown'])
  })

  test('keeps the documented summary, description and tags', () => {
    expect(paths['/v1/agents/ask']?.post?.summary).toBe('Ask the mandated agents a question')
    expect(paths['/v1/agents/ask']?.post?.tags).toEqual(['agents'])
    expect(String(paths['/v1/agents/ask']?.post?.description)).toContain('Every claim is grounded in the corpus')
  })

  test('uses the same 400 envelope on validation and auth routes', () => {
    const auth = fullPaths['/v1/auth/login']?.post as Operation
    expect(auth.responses['400'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ApiError',
    })
    const other = fullPaths['/v1/countries']?.post as Operation
    expect(other.responses['400'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/ApiError',
    })
  })

  test('gives every operation a success response, a 401 when protected and a 429', () => {
    for (const [key, entry] of Object.entries(OPERATIONS)) {
      const [method, path] = key.split(' ') as [string, string]
      const openapiPath = toOpenApiPath(path)
      const operation = fullPaths[openapiPath]?.[method.toLowerCase()]
      expect(operation, key).toBeDefined()
      const responses = operation!.responses as Operation
      expect(responses[String(entry.status ?? 200)], key).toBeDefined()
      expect(responses['429'], key).toBeDefined()
      if (!isPublicRoute(method, path)) expect(responses['401'], key).toBeDefined()
      expect(operation!.summary.length, key).toBeGreaterThan(0)
      expect(operation!.description?.length ?? 0, key).toBeGreaterThan(0)
      expect(operation!.tags?.length ?? 0, key).toBeGreaterThan(0)
    }
  })

  test('publishes a request example for every operation that accepts a body', () => {
    for (const [key, entry] of Object.entries(OPERATIONS)) {
      if (!entry.body) continue
      expect(entry.example, key).toBeDefined()
      const parsed = entry.body.safeParse(entry.example)
      if (!parsed.success) throw new Error(`${key}: ${parsed.error.message}`)
      const [method, path] = key.split(' ') as [string, string]
      const operation = fullPaths[toOpenApiPath(path)]?.[method.toLowerCase()] as Operation
      expect(operation.requestBody.content['application/json'].example, key).toEqual(entry.example)
    }
  })

  test('publishes curl, JavaScript and Python samples on every operation', () => {
    for (const [key, entry] of Object.entries(OPERATIONS)) {
      const [method, path] = key.split(' ') as [string, string]
      const operation = fullPaths[toOpenApiPath(path)]?.[method.toLowerCase()] as Operation
      const samples = operation['x-codeSamples'] as Array<{ lang: string; label: string; source: string }>
      expect(samples.map((sample) => sample.lang), key).toEqual(['curl', 'javascript', 'python'])
      expect(samples.map((sample) => sample.label), key).toEqual(['cURL', 'JavaScript', 'Python'])
      for (const sample of samples) {
        expect(sample.source, key).toContain('https://sps-api.djotta.com')
        expect(sample.source, key).not.toContain('undefined')
        expect(sample.source, key).not.toMatch(/Bearer [A-Za-z0-9._-]{20,}/)
        if (isPublicRoute(method, path)) {
          expect(sample.source, key).not.toContain('SPS_TOKEN')
        } else {
          expect(sample.source, key).toContain('SPS_TOKEN')
        }
        if (entry.body) {
          expect(samples[0]!.source, key).toContain(JSON.stringify(entry.example))
          expect(samples[1]!.source, key).toContain('body: JSON.stringify')
          expect(samples[2]!.source, key).toContain('json=')
        }
      }
    }
  })

  test('groups the sidebar with x-tagGroups without dropping a tag', () => {
    const groups = fullDocument['x-tagGroups'] as Array<{ name: string; tags: string[] }>
    const grouped = groups.flatMap((group) => group.tags)
    expect(new Set(grouped).size).toBe(grouped.length)
    for (const tag of Object.keys(TAG_DESCRIPTIONS)) expect(grouped, tag).toContain(tag)
    for (const tag of grouped) expect(TAG_DESCRIPTIONS[tag], tag).toBeDefined()

    const declared = (fullDocument.tags as Array<{ name: string; description?: string }>).map((tag) => tag.name)
    for (const tag of grouped) expect(declared, tag).toContain(tag)
  })

  test('drops the JSON Schema dialect marker from generated schemas', () => {
    const schema = toJsonSchema(askBody)
    expect(schema?.$schema).toBeUndefined()
    expect(schema?.type).toBe('object')
  })

  test('degrades a schema JSON Schema cannot represent instead of throwing', () => {
    const schema = toJsonSchema(gazetteIngestInput)
    expect(schema).toEqual({ type: 'object', additionalProperties: true })
  })

  test('converts Fastify parameters to OpenAPI braces', () => {
    expect(toOpenApiPath('/v1/scenarios/:runId/next')).toBe('/v1/scenarios/{runId}/next')
    expect(toOpenApiPath('/v1/countries/:code/sectors')).toBe('/v1/countries/{code}/sectors')
  })

  test('does not publish the Scalar-owned routes as operations', () => {
    expect(Object.keys(OPERATIONS)).not.toContain('GET /docs')
    expect(Object.keys(paths)).not.toContain('/docs')
  })
})

describe('Scalar reference', () => {
  async function buildReference() {
    const app = Fastify({ logger: false })
    const catalog = new OpenApiCatalog()
    catalog.record('GET', '/health')
    await registerOpenApiRoutes(app, catalog)
    await app.ready()
    return app
  }

  test('serves the document and redirects /docs to /docs/', async () => {
    const app = await buildReference()
    const spec = await app.inject({ method: 'GET', url: '/openapi.json' })
    expect(spec.statusCode).toBe(200)
    expect(spec.json().paths['/health']).toBeDefined()

    const redirect = await app.inject({ method: 'GET', url: '/docs' })
    expect(redirect.statusCode).toBe(301)
    expect(redirect.headers.location).toBe('/docs/')
    await app.close()
  })

  test('renders a self-hosted page without a CDN or a web font', async () => {
    const app = await buildReference()
    const page = await app.inject({ method: 'GET', url: '/docs/' })
    expect(page.statusCode).toBe(200)
    expect(page.headers['content-type']).toContain('text/html')
    expect(page.body).toContain('js/scalar.js')
    expect(page.body).toContain('/openapi.json')
    expect(page.body).not.toContain('cdn.jsdelivr.net')
    expect(page.body).not.toContain('fonts.googleapis')
    await app.close()
  })

  test('serves the Scalar bundle locally', async () => {
    const app = await buildReference()
    const asset = await app.inject({ method: 'GET', url: '/docs/js/scalar.js' })
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['content-type']).toContain('application/javascript')
    expect(asset.body.length).toBeGreaterThan(1_000_000)
    await app.close()
  })
})

describe('observability query schema', () => {
  test('accepts a ledger bucket key as an operator scope', () => {
    // The ledger labels rows with no operator `unknown`. That key is not an
    // address, and rejecting it made every observability read answer 400.
    expect(usageQuery.safeParse({ operator: 'unknown' }).success).toBe(true)
    expect(usageQuery.safeParse({ operator: 'operator@sarkiai.dev' }).success).toBe(true)
    expect(usageQuery.safeParse({ operator: '   ' }).success).toBe(false)
  })
})

describe('public route policy', () => {
  test('keeps the reference and its assets reachable without a session', () => {
    expect(isPublicRoute('GET', '/docs')).toBe(true)
    expect(isPublicRoute('GET', '/docs/')).toBe(true)
    expect(isPublicRoute('GET', '/docs/js/scalar.js')).toBe(true)
    expect(isPublicRoute('GET', '/openapi.json')).toBe(true)
    expect(isPublicRoute('GET', '/health')).toBe(true)
    expect(isPublicRoute('POST', '/v1/whatsapp/webhook')).toBe(true)
    expect(isPublicRoute('GET', '/v1/whatsapp/approvals/token')).toBe(true)
    expect(isPublicRoute('GET', '/docsomething')).toBe(false)
  })

  test('protects the operator surface', () => {
    expect(isPublicRoute('GET', '/v1/auth/me')).toBe(false)
    expect(isPublicRoute('POST', '/v1/agents/ask')).toBe(false)
    expect(isPublicRoute('GET', '/v1/audit/events')).toBe(false)
  })
})
