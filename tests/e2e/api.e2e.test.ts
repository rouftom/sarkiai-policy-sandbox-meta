import { describe, expect, test } from 'bun:test'

/**
 * End-to-end smoke test against a RUNNING stack.
 *   E2E_BASE_URL=http://localhost:8000 bun test tests/e2e
 * Skipped automatically when E2E_BASE_URL is unset (no infra on this machine).
 */
const baseUrl = process.env.E2E_BASE_URL

async function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe.skipIf(!baseUrl)('API e2e', () => {
  test('GET /health', async () => {
    const response = await fetch(`${baseUrl}/health`)
    expect(response.ok).toBe(true)
  })

  test('POST /v1/scenarios/start returns an agenda', async () => {
    const response = await post('/v1/scenarios/start', { country: 'cm', domain: 'health' })
    expect(response.ok).toBe(true)
    const payload = (await response.json()) as { runId: string; totalTicks: number; agenda: unknown[] }
    expect(payload.totalTicks).toBeGreaterThan(0)
    expect(payload.agenda.length).toBeGreaterThan(0)
  })

  test('facilitator can release one tick', async () => {
    const start = await post('/v1/scenarios/start', { country: 'cm', domain: 'health' })
    const { runId } = (await start.json()) as { runId: string }
    const next = await post(`/v1/scenarios/${runId}/next`, {})
    expect(next.ok).toBe(true)
    const payload = (await next.json()) as { releasedTicks: number; report: unknown }
    expect(payload.releasedTicks).toBe(1)
    expect(payload.report).not.toBeNull()
  })

  test('POST /v1/readiness/report returns 13 scored dimensions', async () => {
    const response = await post('/v1/readiness/report', { country: 'cm', domain: 'health' })
    expect(response.ok).toBe(true)
    const payload = (await response.json()) as { scores: unknown[] }
    expect(payload.scores.length).toBe(13)
  }, 300_000)
})
