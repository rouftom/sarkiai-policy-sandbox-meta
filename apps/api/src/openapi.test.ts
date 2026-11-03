import { describe, expect, test } from 'bun:test'
import { buildOpenApiDocument, toJsonSchema, toOpenApiPath } from './openapi.js'
import { OPERATIONS } from './openapi/operations.js'
import { askBody } from './openapi/schemas.js'
import { isPublicRoute } from './public-routes.js'

const ROUTES = [
  { method: 'GET', path: '/health' },
  { method: 'GET', path: '/docs' },
  { method: 'POST', path: '/v1/agents/ask' },
  { method: 'GET', path: '/v1/countries/:code' },
  { method: 'POST', path: '/v1/whatsapp/approvals/:token' },
  { method: 'GET', path: '/v1/auth/setup' },
  { method: 'GET', path: '/v1/auth/me' },
]

describe('OpenAPI document', () => {
  test('is an OpenAPI 3.1 document with the registered paths', () => {
    const document = buildOpenApiDocument(ROUTES)
    expect(document.openapi).toBe('3.1.0')
    expect(document.info).toMatchObject({ title: 'SarkiAI Policy Sandbox API' })
    const paths = document.paths as Record<string, Record<string, unknown>>
    expect(Object.keys(paths)).toContain('/v1/countries/{code}')
    expect(Object.keys(paths)).toContain('/v1/agents/ask')
    expect(paths['/v1/agents/ask']?.post).toBeDefined()
  })

  test('marks public routes as unauthenticated and the rest as bearer', () => {
    const document = buildOpenApiDocument(ROUTES)
    const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>
    expect(paths['/health']?.get?.security).toEqual([])
    expect(paths['/docs']?.get?.security).toEqual([])
    expect(paths['/v1/auth/setup']?.get?.security).toEqual([])
    expect(paths['/v1/whatsapp/approvals/{token}']?.post?.security).toEqual([])
    expect(paths['/v1/auth/me']?.get?.security).toEqual([{ bearerAuth: [] }])
    expect(paths['/v1/agents/ask']?.post?.security).toEqual([{ bearerAuth: [] }])
  })

  test('generates request bodies from the validation schemas', () => {
    const document = buildOpenApiDocument(ROUTES)
    const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>
    const operation = paths['/v1/agents/ask']?.post as {
      requestBody: { required: boolean; content: Record<string, { schema: Record<string, unknown> }> }
    }
    const schema = operation.requestBody.content['application/json']!.schema
    const properties = schema.properties as Record<string, Record<string, unknown>>
    expect(schema.type).toBe('object')
    expect(operation.requestBody.required).toBe(true)
    expect(properties.question?.minLength).toBe(1)
    expect(schema.required).toContain('question')
    expect(schema.required).toContain('institutionId')
    expect(Object.keys(properties)).toContain('attachments')
  })

  test('describes path parameters with their validation constraints', () => {
    const document = buildOpenApiDocument(ROUTES)
    const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>
    const operation = paths['/v1/countries/{code}']?.get as {
      parameters: Array<{ name: string; in: string; required: boolean; schema: Record<string, unknown> }>
    }
    expect(operation.parameters).toHaveLength(1)
    expect(operation.parameters[0]).toMatchObject({
      name: 'code',
      in: 'path',
      required: true,
      schema: { type: 'string' },
    })
  })

  test('keeps the documented summary and tags', () => {
    const document = buildOpenApiDocument(ROUTES)
    const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>
    expect(paths['/v1/agents/ask']?.post?.summary).toBe('Ask the mandated agents a question')
    expect(paths['/v1/agents/ask']?.post?.tags).toEqual(['agents'])
  })

  test('drops the JSON Schema dialect marker from generated schemas', () => {
    const schema = toJsonSchema(askBody)
    expect(schema).toBeDefined()
    expect(schema?.$schema).toBeUndefined()
    expect(schema?.type).toBe('object')
  })

  test('converts Fastify parameters to OpenAPI braces', () => {
    expect(toOpenApiPath('/v1/scenarios/:runId/next')).toBe('/v1/scenarios/{runId}/next')
    expect(toOpenApiPath('/v1/countries/:code/sectors')).toBe('/v1/countries/{code}/sectors')
  })

  test('serializes every documented operation without throwing', () => {
    for (const [key, operation] of Object.entries(OPERATIONS)) {
      const [method, path] = key.split(' ') as [string, string]
      expect(() => buildOpenApiDocument([{ method, path }])).not.toThrow()
      expect(operation.summary.length).toBeGreaterThan(0)
    }
  })
})

describe('public route policy', () => {
  test('keeps the reference reachable without a session', () => {
    expect(isPublicRoute('GET', '/docs')).toBe(true)
    expect(isPublicRoute('GET', '/openapi.json')).toBe(true)
    expect(isPublicRoute('GET', '/health')).toBe(true)
    expect(isPublicRoute('POST', '/v1/whatsapp/webhook')).toBe(true)
    expect(isPublicRoute('GET', '/v1/whatsapp/approvals/token')).toBe(true)
  })

  test('protects the operator surface', () => {
    expect(isPublicRoute('GET', '/v1/auth/me')).toBe(false)
    expect(isPublicRoute('POST', '/v1/agents/ask')).toBe(false)
    expect(isPublicRoute('GET', '/v1/audit/events')).toBe(false)
  })
})
