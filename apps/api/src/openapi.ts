/**
 * OpenAPI 3.1 document generated from the routes Fastify actually registered
 * and from the zod schemas those routes validate with (`openapi/schemas.ts`).
 *
 * The catalog is fed by an `onRoute` hook, so a new endpoint appears in the
 * document without a second list to maintain. Hand-written metadata adds the
 * summary, the request schemas, the honest status list and a request example.
 */

import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { ZodType } from 'zod'
import scalarApiReference from '@scalar/fastify-api-reference'
import { isPublicRoute } from './public-routes.js'
import {
  OPERATIONS,
  TAG_DESCRIPTIONS,
  operationFor,
  tagFor,
  type DiscoveredRoute,
  type OperationDoc,
} from './openapi/operations.js'

type JsonSchema = Record<string, unknown>
type PathItem = Record<string, unknown>

const INFO = {
  title: 'SarkiAI Policy Sandbox API',
  version: '0.3.0',
  summary: 'Institutional policy sandbox for Cameroon: grounded agents, audited decisions.',
  description: [
    '# Overview',
    '',
    'SarkiAI answers policy questions from the Cameroonian legal corpus. Every agent claim',
    'cites a document in the corpus, and every side effect waits for an operator decision',
    'recorded in an append-only audit chain. The API is what the console calls; it is also',
    'the contract behind the readiness assessments, crisis scenarios and table-top exercises.',
    '',
    '## Base URL',
    '',
    'The production deployment answers on `https://sps-api.djotta.com`. The document below',
    'uses a relative server, so it works unchanged against a local install on',
    '`http://localhost:8000` and against the hosted deployment. `GET /health` is the',
    'cheapest way to confirm which one is answering.',
    '',
    '## Authentication',
    '',
    '1. `POST /v1/auth/login` with an e-mail and a password.',
    '2. The response is either `{ token, operator }` or a `challenge` when a second',
    '   step is still required (e-mail verification, password change, TOTP enrolment).',
    '   Post the challenge and the next factor back to the same endpoint.',
    '3. Send the token on every protected call: `Authorization: Bearer <session>`.',
    '',
    'Sessions are stateless and last seven days. `POST /v1/auth/logout` records the',
    'sign-out in the audit chain; the client drops the token. A handful of routes are',
    'public by design: health, the sign-in handshake, the Meta webhook, the signed',
    'approval links, the figures embedded in reports, and this reference.',
    '',
    '## Authorisation',
    '',
    'Two levels exist. An authenticated operator reads and writes their own runs.',
    'An administrator also manages the corpus, the country registry, the notification',
    'address book and the provider selection. A route that needs an administrator',
    'answers `403` with `{ "error": "admin_only" }`; the console hides the control, and',
    'the API enforces it.',
    '',
    '## Errors',
    '',
    'Every failure, validation included, uses the same envelope. `error` is a stable',
    'machine-readable code; a validation adds the offending fields beside it.',
    '',
    '```json',
    '{ "error": "validation_failed", "message": "The request does not match the expected schema.", "fields": { "country": ["Too small: expected string to have >=2 characters"] } }',
    '{ "error": "not_found" }',
    '{ "error": "rate_limited", "message": "Too many requests", "retryAfter": 42 }',
    '```',
    '',
    '`error` is stable for a given cause, so branch on it rather than on the text.',
    '`message`, when present, is for humans and may change. `fields` and `formErrors`',
    'appear only on a `validation_failed` answer. A `Retry-After` header accompanies',
    '`429`. Upstream failures answer `502` with the provider message, and an',
    'unconfigured feature answers `503` naming the missing setting rather than',
    'silently succeeding.',
    '',
    '## Status codes used by this API',
    '',
    '| Status | Meaning |',
    '| --- | --- |',
    '| `200` | Success. |',
    '| `201` | Record created. |',
    '| `400` | The body, query or path does not match its schema. |',
    '| `401` | The session is missing, expired or revoked. |',
    '| `403` | Administrator required, or the corpus rights forbid full-text storage. |',
    '| `404` | The record does not exist, or does not belong to the caller. |',
    '| `409` | The request conflicts with the current state (already complete, already decided, already present). |',
    '| `413` | The payload is larger than the route accepts. |',
    '| `422` | Well-formed but refused content: empty extraction, unreadable figure, invalid passage edit. |',
    '| `429` | Rate limit or the concurrent-work gate; see `Retry-After`. |',
    '| `500` | The operation failed after validation; the reason is logged server-side. |',
    '| `502` | An upstream dependency — model provider, storage or renderer — failed. |',
    '| `503` | A feature is not configured on this deployment. |',
    '',
    '## Conventions',
    '',
    '- Timestamps are ISO-8601 with an offset; the ledger accepts `from`/`to` as',
    '  `YYYY-MM-DDTHH:mm:ssZ`.',
    '- Lists are paginated with `page` and `limit` where the volume warrants it; the',
    '  response carries the total. The audit feed uses `limit`/`offset`.',
    '- Country codes are ISO 3166-1 alpha-2, lowercase. Language is `fr` or `en`.',
    '- Streams (`text/event-stream`) carry `token`, `tick`, `report` and `done` frames;',
    '  a client must stop reading at `done`.',
    '- `HEAD` and `OPTIONS` are transport-level and not published as operations.',
    '',
    '## Audit and traceability',
    '',
    'Every model call, decision and side effect is appended to a hash chain verified by',
    '`GET /v1/audit/chain`. `GET /v1/audit/trace/{runId}` returns the reasoning traces of',
    'a run, and `GET /v1/audit/dossier/{runId}` assembles the audit entries, traces,',
    'reports, citations and chain integrity into one document. Nothing in the journal is',
    'mutable: deleting a run removes the run, not its history.',
    '',
    '## Rate limits',
    '',
    'Requests are limited per operator. Expensive operations — generation, ingestion,',
    'transcription, exports — carry a tighter rule, and a concurrent-work gate answers',
    '`429` with `{ "error": "busy" }` when too many model runs are in flight. Read the',
    '`RateLimit-*` headers rather than hard-coding a limit that may change.',
    '',
    '## Reference',
    '',
    'This document is generated from the routes Fastify registered and the Zod schemas',
    'the handlers validate with, so it cannot drift from the implementation. The',
    'interactive version is served at `/docs` with a language selector, schema tables and',
    'a try-it panel.',
  ].join('\n'),
  contact: {
    name: 'SarkiAI Policy Sandbox',
    url: 'https://sps-api.djotta.com/docs',
  },
  license: {
    name: 'Apache-2.0',
    identifier: 'Apache-2.0',
  },
}

const BEARER_SCHEME = {
  type: 'http',
  scheme: 'bearer',
  description: 'Signed session returned by `/v1/auth/login` or the MFA step.',
}

/**
 * Sidebar grouping. Scalar reads `x-tagGroups`; the tags themselves stay the
 * ones the operations declare, so the document remains valid for any renderer.
 */
const TAG_GROUPS = [
  { name: 'Platform', tags: ['system', 'auth', 'models', 'observability'] },
  { name: 'Policy analysis', tags: ['agents', 'countries', 'knowledge'] },
  { name: 'Simulation', tags: ['scenarios', 'readiness', 'exercise', 'impact'] },
  { name: 'Operations', tags: ['gazette', 'actions', 'chat', 'notifications', 'whatsapp', 'voice'] },
  { name: 'Audit', tags: ['audit'] },
]

/** One failure envelope, published once so every error response can point at it. */
const ERROR_COMPONENTS: Record<string, JsonSchema> = {
  ApiError: {
    type: 'object',
    description:
      'Failure envelope for every route. `message`, `retryAfter`, `rights` and the validation fields appear only where the route sends them.',
    required: ['error'],
    properties: {
      error: {
        type: 'string',
        description:
          'Stable machine-readable code: `validation_failed`, `unauthorized`, `admin_only`, `not_found`, `run_not_found`, `run_complete`, `rate_limited`, `busy`, `rights_blocked`, `upstream_unavailable`, `mail_not_configured`, `storage_unavailable`, `auth_failed`, `action_failed`, …',
      },
      message: { type: 'string', description: 'Human-readable detail; may change between releases.' },
      fields: {
        type: 'object',
        description: 'Field name to the messages it failed, present on `validation_failed` only.',
        additionalProperties: { type: 'array', items: { type: 'string' } },
      },
      formErrors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Errors that belong to no single field, present on `validation_failed` only.',
      },
      retryAfter: { type: 'integer', description: 'Seconds to wait, also sent as the `Retry-After` header.' },
      rights: { type: 'string', description: 'Rights bucket of a refused document.' },
    },
  },
}

/** Shared response bodies, referenced by the generic failures. */
const ERROR_RESPONSES: Record<string, JsonSchema> = {
  BadRequest: {
    description: 'The body, query or path does not match its schema. `fields` names the offending entries.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: {
          error: 'validation_failed',
          message: 'The request does not match the expected schema.',
          fields: { country: ['Too small: expected string to have >=2 characters'] },
        },
      },
    },
  },
  Unauthorized: {
    description: 'The session is missing, expired or revoked.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        examples: {
          missing: { value: { error: 'unauthenticated' } },
          invalid: { value: { error: 'unauthorized' } },
        },
      },
    },
  },
  Forbidden: {
    description: 'Administrator required, or the corpus rights forbid full-text storage.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        examples: {
          admin: { value: { error: 'admin_only', message: 'Requires an administrator.' } },
          rights: { value: { error: 'rights_blocked', message: 'Rights of this document forbid full-text storage.', rights: 'quotation-only' } },
        },
      },
    },
  },
  NotFound: {
    description: 'The record does not exist, or does not belong to the caller.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { error: 'not_found' },
      },
    },
  },
  Conflict: {
    description: 'The request conflicts with the current state of the record.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { error: 'run_complete', message: 'This run is already complete.' },
      },
    },
  },
  PayloadTooLarge: {
    description: 'The payload is larger than the route accepts.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { error: 'page_too_large', message: 'The page image exceeds 25 MB.' },
      },
    },
  },
  UnprocessableEntity: {
    description: 'Well-formed but refused content: empty extraction, unreadable figure, invalid passage edit.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { error: 'empty_extraction', message: 'No text could be extracted from the document.' },
      },
    },
  },
  TooManyRequests: {
    description: 'Rate limit, or too many model runs in flight. `Retry-After` says when to retry.',
    headers: {
      'Retry-After': { description: 'Seconds to wait before retrying.', schema: { type: 'integer' } },
    },
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        examples: {
          limited: { value: { error: 'rate_limited', message: 'Too many requests.', retryAfter: 42 } },
          busy: { value: { error: 'busy' } },
        },
      },
    },
  },
  InternalServerError: {
    description: 'The operation failed after validation. The reason is logged server-side.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { error: 'action_failed', message: 'The side effect could not be executed.' },
      },
    },
  },
  BadGateway: {
    description: 'An upstream dependency — model provider, storage or renderer — failed.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        example: { error: 'upstream_unavailable', message: 'The model provider did not answer.' },
      },
    },
  },
  ServiceUnavailable: {
    description: 'The feature is not configured on this deployment.',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiError' },
        examples: {
          mail: { value: { error: 'mail_not_configured' } },
          storage: { value: { error: 'storage_unavailable' } },
        },
      },
    },
  },
}

/** Status to shared response component. */
const RESPONSE_COMPONENT: Record<number, string> = {
  400: 'BadRequest',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'NotFound',
  409: 'Conflict',
  413: 'PayloadTooLarge',
  422: 'UnprocessableEntity',
  429: 'TooManyRequests',
  500: 'InternalServerError',
  502: 'BadGateway',
  503: 'ServiceUnavailable',
}

/** Fastify uses `:param`; OpenAPI uses `{param}`. */
export function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

/**
 * Zod schema to JSON Schema, without the per-schema `$schema` dialect marker.
 * A schema built with `z.custom()` cannot be represented; it degrades to a
 * permissive object instead of crashing the whole document.
 */
export function toJsonSchema(schema: ZodType | undefined): JsonSchema | undefined {
  if (!schema) return undefined
  try {
    const generated = z.toJSONSchema(schema, {
      target: 'draft-2020-12',
      io: 'input',
    }) as JsonSchema
    const copy = { ...generated }
    delete copy.$schema
    return copy
  } catch {
    return { type: 'object', additionalProperties: true }
  }
}

function pathParameters(path: string, doc: OperationDoc | undefined): unknown[] {
  const declared = toJsonSchema(doc?.params)
  const properties = (declared?.properties ?? {}) as Record<string, JsonSchema>
  const names = [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => match[1]!)

  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    ...(properties[name]?.description ? { description: properties[name].description } : {}),
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
    ...(property.description ? { description: property.description } : {}),
    schema: property,
  }))
}

function requestBody(doc: OperationDoc | undefined): unknown {
  const schema = toJsonSchema(doc?.body)
  if (!schema) return undefined
  return {
    required: true,
    content: {
      'application/json': {
        schema,
        ...(doc?.example ? { example: doc.example } : {}),
      },
    },
  }
}

function successResponse(doc: OperationDoc | undefined): JsonSchema {
  const schema = toJsonSchema(doc?.response)
  const contentType = doc?.responseType ?? 'application/json'
  const response: JsonSchema = {
    description: doc?.responseType === 'text/event-stream' ? 'Server-sent event stream' : 'Success',
  }
  if (doc?.responseType === 'text/event-stream') {
    response.content = { 'text/event-stream': { schema: { type: 'string' } } }
  } else if (doc?.responseType && doc.responseType !== 'application/json') {
    response.content = { [doc.responseType]: { schema: { type: 'string', format: 'binary' } } }
  } else if (schema) {
    response.content = { [contentType]: { schema } }
  }
  return response
}

type ErrorMeta = { status: number; description: string }

function errorResponse(operationError: ErrorMeta): JsonSchema {
  const component = RESPONSE_COMPONENT[operationError.status] ?? 'ApiError'
  const shared = ERROR_RESPONSES[component]
  const body = shared?.content as Record<string, JsonSchema> | undefined
  const json = body?.['application/json']
  return {
    description: operationError.description,
    content: {
      'application/json': {
        schema: json?.schema ?? { $ref: '#/components/schemas/ApiError' },
      },
    },
    ...(component === 'TooManyRequests'
      ? { headers: { 'Retry-After': { description: 'Seconds to wait before retrying.', schema: { type: 'integer' } } } }
      : {}),
  }
}

function responses(doc: OperationDoc | undefined, protectedRoute: boolean): Record<string, unknown> {
  const successStatus = String(doc?.status ?? 200)
  const declared: Record<string, unknown> = {
    [successStatus]: successResponse(doc),
  }

  // The router's global rate limiter applies to every operation.
  const declaredErrors = new Map<number, ErrorMeta>()
  for (const failure of doc?.errors ?? []) declaredErrors.set(failure.status, failure)
  if (protectedRoute && !declaredErrors.has(401)) {
    declaredErrors.set(401, { status: 401, description: 'The session is missing, expired or revoked.' })
  }
  if (!declaredErrors.has(429)) {
    declaredErrors.set(429, { status: 429, description: 'Too many requests; retry after the delay.' })
  }

  const ordered = [...declaredErrors.values()].sort((a, b) => a.status - b.status)
  for (const failure of ordered) {
    declared[String(failure.status)] = errorResponse(failure)
  }

  return declared
}

/** Origin the copy-paste samples target. */
const SAMPLE_ORIGIN = 'https://sps-api.djotta.com'

/** Readable placeholders for path parameters whose schema gives no example. */
const PATH_SAMPLES: Record<string, string> = {
  code: 'cm',
  id: '6f1c2f7e4b3a2d1e0f9a8b7c',
  runId: 'run_01',
  token: 'signed-approval-token',
  filename: 'loi-2024-028.pdf',
  email: 'operator@example.cm',
}

/**
 * Best-effort example for a JSON Schema. It uses the schema's own `default`,
 * `example` or `enum` first so the sample stays valid when constraints exist,
 * and falls back to a small object of required fields.
 */
function sampleValue(schema: JsonSchema | undefined, fallback: string): unknown {
  if (!schema) return fallback
  if (schema.const !== undefined) return schema.const
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0]
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default

  const alternatives = (schema.oneOf ?? schema.anyOf) as JsonSchema[] | undefined
  if (Array.isArray(alternatives) && alternatives.length > 0) return sampleValue(alternatives[0], fallback)
  if (Array.isArray(schema.allOf)) {
    return sampleValue(Object.assign({}, ...(schema.allOf as JsonSchema[])), fallback)
  }

  switch (schema.type) {
    case 'string': {
      switch (schema.format) {
        case 'date':
          return '2025-01-01'
        case 'date-time':
          return '2025-01-01T09:00:00Z'
        case 'email':
          return 'operator@example.cm'
        case 'uri':
        case 'url':
          return 'https://example.cm/document'
        case 'uuid':
          return '00000000-0000-4000-8000-000000000000'
        default:
          return fallback
      }
    }
    case 'integer':
    case 'number':
      return typeof schema.minimum === 'number' ? schema.minimum : 1
    case 'boolean':
      return true
    case 'array':
      return [sampleValue(schema.items as JsonSchema | undefined, fallback)]
    case 'object':
    default: {
      const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
      const required = (schema.required as string[] | undefined) ?? []
      const names = required.length > 0 ? required : Object.keys(properties).slice(0, 6)
      const value: Record<string, unknown> = {}
      for (const name of names) value[name] = sampleValue(properties[name], name)
      return value
    }
  }
}

/** Path with `:param` replaced by a runnable value. */
function pathWithSamples(path: string, doc: OperationDoc | undefined): string {
  const schema = toJsonSchema(doc?.params)
  const properties = (schema?.properties ?? {}) as Record<string, JsonSchema>
  return path.replace(/:([A-Za-z0-9_]+)/g, (_match, name: string) => {
    const value = sampleValue(properties[name], PATH_SAMPLES[name] ?? name)
    return encodeURIComponent(String(value))
  })
}

/** Required query parameters, plus `limit` when the route pages its results. */
function querySuffix(doc: OperationDoc | undefined): string {
  const schema = toJsonSchema(doc?.query)
  if (!schema) return ''
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>
  const required = new Set((schema.required as string[] | undefined) ?? [])
  const names = Object.keys(properties).filter((name) => required.has(name) || name === 'limit')
  if (names.length === 0) return ''
  const query = names
    .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(String(sampleValue(properties[name], name)))}`)
    .join('&')
  return `?${query}`
}

/** Body shown in the samples: the hand-written one when present. */
function bodyExample(doc: OperationDoc | undefined): unknown {
  if (!doc?.body) return undefined
  if (doc.example) return doc.example
  return sampleValue(toJsonSchema(doc.body), 'value')
}

/** POSIX shell quoting for a literal, including the `'\''` apostrophe escape. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** Python literal, so the sample uses a dict rather than a JSON string. */
function pythonLiteral(value: unknown, indent = 0): string {
  const pad = ' '.repeat(indent)
  const inner = ' '.repeat(indent + 4)
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((entry) => `${inner}${pythonLiteral(entry, indent + 4)},`)
    return `[\n${items.join('\n')}\n${pad}]`
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return '{}'
    const lines = entries.map(([key, entry]) => `${inner}${JSON.stringify(key)}: ${pythonLiteral(entry, indent + 4)},`)
    return `{\n${lines.join('\n')}\n${pad}}`
  }
  return 'None'
}

function indentText(value: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return value.split('\n').join(`\n${pad}`)
}

function indentJson(value: unknown, spaces: number): string {
  return indentText(JSON.stringify(value, null, 2), spaces)
}

type CodeSample = { lang: string; label: string; source: string }

function acceptHeader(doc: OperationDoc | undefined): string {
  return doc?.responseType ?? 'application/json'
}

function curlSample(method: string, url: string, doc: OperationDoc | undefined, body: unknown, publicRoute: boolean): string {
  const lines = [
    `curl -sS${method === 'GET' ? '' : ` -X ${method}`} ${shellQuote(url)}`,
    `  -H 'Accept: ${acceptHeader(doc)}'`,
  ]
  if (!publicRoute) lines.push(`  -H 'Authorization: Bearer $SPS_TOKEN'`)
  if (body !== undefined) {
    lines.push(`  -H 'Content-Type: application/json'`)
    lines.push(`  -d ${shellQuote(JSON.stringify(body))}`)
  }
  return lines.join(' \\\n')
}

function javascriptSample(
  method: string,
  url: string,
  doc: OperationDoc | undefined,
  body: unknown,
  publicRoute: boolean,
): string {
  const headers = [`    Accept: '${acceptHeader(doc)}',`]
  if (!publicRoute) headers.unshift(`    Authorization: \`Bearer \${process.env.SPS_TOKEN}\`,`)
  if (body !== undefined) headers.push(`    'Content-Type': 'application/json',`)

  const init = [
    `  method: '${method}',`,
    '  headers: {',
    ...headers,
    '  },',
  ]
  if (body !== undefined) init.push(`  body: JSON.stringify(${indentJson(body, 2)}),`)

  const responseType = acceptHeader(doc)
  let read: string
  if (responseType === 'text/event-stream') {
    read = [
      `if (!response.body) throw new Error('No response body')`,
      'const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()',
      'for (;;) {',
      '  const { value, done } = await reader.read()',
      '  if (done) break',
      '  process.stdout.write(value)',
      '}',
    ].join('\n')
  } else if (responseType === 'application/json') {
    read = 'const data = await response.json()\nconsole.log(data)'
  } else if (responseType.startsWith('text/')) {
    read = 'const text = await response.text()\nconsole.log(text)'
  } else {
    read = 'const bytes = await response.arrayBuffer()\nconsole.log(bytes.byteLength)'
  }

  return [
    `const response = await fetch('${url}', {`,
    ...init,
    '})',
    "if (!response.ok) throw new Error(`HTTP ${response.status}`)",
    read,
  ].join('\n')
}

function pythonSample(
  method: string,
  url: string,
  doc: OperationDoc | undefined,
  body: unknown,
  publicRoute: boolean,
): string {
  const call = method.toLowerCase()
  const imports = publicRoute ? ['import requests'] : ['import os', 'import requests']
  const headers = [`        "Accept": "${acceptHeader(doc)}",`]
  if (!publicRoute) headers.unshift(`        "Authorization": f"Bearer {os.environ['SPS_TOKEN']}",`)
  if (body !== undefined) headers.push(`        "Content-Type": "application/json",`)

  const arguments_ = [
    `    "${url}",`,
    '    headers={',
    ...headers,
    '    },',
  ]
  if (body !== undefined) arguments_.push(`    json=${indentText(pythonLiteral(body), 4)},`)

  const responseType = acceptHeader(doc)
  let read: string
  if (responseType === 'text/event-stream') {
    arguments_.push('    stream=True,')
    arguments_.push('    timeout=60,')
    read = [
      '    response.raise_for_status()',
      '    for line in response.iter_lines():',
      '        if line:',
      '            print(line.decode())',
    ].join('\n')
    return [
      ...imports,
      '',
      `with requests.${call}(`,
      ...arguments_,
      ') as response:',
      read,
    ].join('\n')
  }

  arguments_.push('    timeout=60,')
  read =
    responseType === 'application/json'
      ? 'print(response.json())'
      : responseType.startsWith('text/')
        ? 'print(response.text)'
        : 'print(len(response.content))'

  return [
    ...imports,
    '',
    `response = requests.${call}(`,
    ...arguments_,
    ')',
    'response.raise_for_status()',
    read,
  ].join('\n')
}

/** Scalar renders these tabs instead of a hand-written language selector. */
function codeSamples(
  method: string,
  path: string,
  doc: OperationDoc | undefined,
  publicRoute: boolean,
): CodeSample[] {
  const url = `${SAMPLE_ORIGIN}${pathWithSamples(path, doc)}${querySuffix(doc)}`
  const body = bodyExample(doc)
  return [
    { lang: 'curl', label: 'cURL', source: curlSample(method, url, doc, body, publicRoute) },
    { lang: 'javascript', label: 'JavaScript', source: javascriptSample(method, url, doc, body, publicRoute) },
    { lang: 'python', label: 'Python', source: pythonSample(method, url, doc, body, publicRoute) },
  ]
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
    'x-codeSamples': codeSamples(method, route.path, doc, publicRoute),
  }
}

/** Stable, readable ordering: paths alphabetically, methods in HTTP order. */
const METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete']

export function buildOpenApiDocument(routes: DiscoveredRoute[]): JsonSchema {
  const paths: Record<string, PathItem> = {}
  const seen = new Set<string>()
  const usedTags = new Set<string>()

  for (const route of routes) {
    const method = route.method.toLowerCase()
    if (method === 'head' || method === 'options') continue
    const key = `${method} ${route.path}`
    if (seen.has(key)) continue
    seen.add(key)

    const openapiPath = toOpenApiPath(route.path)
    const item = (paths[openapiPath] ??= {})
    item[method] = operationForRoute({ method, path: route.path })

    for (const tag of (operationFor(method, route.path)?.tags ?? [tagFor(route.path)])) usedTags.add(tag)
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

  const documentedTags = Object.keys(TAG_DESCRIPTIONS)
  const extraTags = [...usedTags].filter((tag) => !documentedTags.includes(tag)).sort()

  return {
    openapi: '3.1.0',
    info: INFO,
    servers: [
      { url: '/', description: 'This deployment' },
      { url: 'https://sps-api.djotta.com', description: 'Production' },
    ],
    tags: [...documentedTags, ...extraTags].map((name) => ({
      name,
      ...(TAG_DESCRIPTIONS[name] ? { description: TAG_DESCRIPTIONS[name] } : {}),
    })),
    externalDocs: { description: 'Interactive reference', url: '/docs' },
    security: [{ bearerAuth: [] }],
    'x-tagGroups': TAG_GROUPS,
    paths: orderedPaths,
    components: {
      securitySchemes: { bearerAuth: BEARER_SCHEME },
      schemas: ERROR_COMPONENTS,
      responses: ERROR_RESPONSES,
    },
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

/**
 * `GET /openapi.json` is the canonical document; `GET /docs` renders it with
 * Scalar. The plugin serves its own JavaScript from this deployment, so the
 * reference keeps working without a CDN.
 */
export async function registerOpenApiRoutes(app: FastifyInstance, catalog: OpenApiCatalog): Promise<void> {
  app.get('/openapi.json', async (_request, reply) => {
    reply.header('cache-control', 'no-store')
    return catalog.document()
  })

  await app.register(scalarApiReference, {
    routePrefix: '/docs',
    logLevel: 'warn',
    configuration: {
      url: '/openapi.json',
      pageTitle: 'SarkiAI Policy Sandbox API',
      layout: 'modern',
      // Self-hosted asset only: no web font and no CDN is fetched.
      withDefaultFonts: false,
      hideClientButton: true,
      hideModels: true,
      defaultOpenFirstTag: true,
      expandAllResponses: true,
      documentDownloadType: 'json',
      metaData: {
        title: 'SarkiAI Policy Sandbox API',
        description: 'Institutional policy sandbox for Cameroon: grounded agents, audited decisions.',
      },
    },
  })
}

export { OPERATIONS }
export type { OperationDoc }
