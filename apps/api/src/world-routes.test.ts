/**
 * `GET /v1/world/summary`: the read model the World page consumes.
 *
 * The stores are real (memory back end), only the auth guard and the audit
 * service are stubbed: the route must work with what the engine already keeps.
 */

import { describe, expect, test } from 'bun:test'
import Fastify from 'fastify'
import type { AuditService } from '@sps/audit'
import type { ReadinessReport } from '@sps/readiness'
import { CountryStore } from './countries'
import { ReadinessRunStore } from './readiness-runs'
import { ScenarioRunStore } from './scenario-runs'
import { registerWorldRoutes } from './world-routes'

const DIMENSIONS = Array.from({ length: 13 }, (_, index) => ({
  dimension: `d${index + 1}`,
  dimensionId: index + 1,
  countryChunks: [{ id: `c${index + 1}` }],
  globalChunks: [],
}))

const report = {
  country: 'cm',
  domain: 'health',
  generatedAt: '2026-11-01T00:00:00.000Z',
  dimensions: DIMENSIONS,
  scores: DIMENSIONS.map((dimension) => ({
    dimension: dimension.dimension,
    dimensionId: dimension.dimensionId,
    dimensionName: dimension.dimension,
    score: 3,
    maturity: 'Established',
    evidence: [],
    gaps: [],
    recommendations: [],
    confidence: 0.8,
  })),
  scenario: {
    country: 'cm',
    domain: 'health',
    generatedAt: '2026-11-01T00:00:00.000Z',
    dimensions: [],
    overall: 3,
    composite: 3.4,
  },
  summary: 'test',
} as unknown as ReadinessReport

async function buildApp() {
  const app = Fastify({ logger: false })
  const readinessRuns = new ReadinessRunStore({})
  await readinessRuns.save({ userId: 'alice', runBy: 'alice', report })

  app.addHook('preHandler', async (request) => {
    // The real guard runs before these routes; here the operator is fixed.
    ;(request as unknown as { operator: { email: string } }).operator = { email: 'alice' }
  })

  await registerWorldRoutes(app, {
    readinessRuns,
    scenarioRuns: new ScenarioRunStore({}),
    countries: new CountryStore({}),
    audit: { logAction: async () => undefined } as unknown as AuditService,
  })
  await app.ready()
  return app
}

describe('GET /v1/world/summary', () => {
  test('returns the latest complete run with its coverage, confidence and state', async () => {
    const app = await buildApp()
    const response = await app.inject({ method: 'GET', url: '/v1/world/summary?sector=health&scope=mine' })
    expect(response.statusCode).toBe(200)

    const body = response.json()
    expect(body.schemaVersion).toBe(1)
    expect(body.sector).toBe('health')
    expect(body.scope).toBe('mine')
    expect(typeof body.frameworkVersion).toBe('string')

    const cm = body.countries.find((entry: { code: string }) => entry.code === 'cm')
    expect(cm).toMatchObject({
      registryStatus: 'active',
      state: 'ok',
      composite: 3.4,
      band: 'Established',
      coverage: 1,
      confidence: 0.8,
      stale: false,
      runs: 1,
    })
    await app.close()
  })

  test('defaults to every sector and the operator scope', async () => {
    const app = await buildApp()
    const body = (await app.inject({ method: 'GET', url: '/v1/world/summary' })).json()
    expect(body.sector).toBe('all')
    expect(body.scope).toBe('mine')
    await app.close()
  })

  test('rejects a sector outside the registry', async () => {
    const app = await buildApp()
    const response = await app.inject({ method: 'GET', url: '/v1/world/summary?sector=finance' })
    expect(response.statusCode).toBe(400)
    expect(response.json().error).toBe('validation_failed')
    await app.close()
  })
})
