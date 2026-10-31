import { describe, expect, test } from 'bun:test'
import type { UsageEvent } from '@sps/agents'
import { MongoUsageStore } from './usage-store'

/** A store with no Mongo URI keeps everything in memory: the degraded mode. */
function memoryStore(): MongoUsageStore {
  return new MongoUsageStore({ mongodbUri: '', dbName: 'test' })
}

function event(overrides: Partial<UsageEvent> & Pick<UsageEvent, 'ts'>): UsageEvent {
  return {
    operator: 'ada@sps.dev',
    route: '/v1/agents/ask',
    agentId: 'legal_advisor',
    kind: 'chat',
    status: 'ok',
    mode: 'cloud',
    servedBy: 'Meta',
    model: 'muse-spark-1.3',
    inputTokens: 1000,
    outputTokens: 200,
    costUsd: 0.002,
    latencyMs: 100,
    ...overrides,
  }
}

const FROM = '2026-10-28T00:00:00.000Z'
const TO = '2026-11-01T00:00:00.000Z'

async function seeded(): Promise<MongoUsageStore> {
  const store = memoryStore()
  await store.append(event({ ts: '2026-10-29T10:00:00.000Z', runId: 'run-1' }))
  await store.append(
    event({
      ts: '2026-10-29T11:00:00.000Z',
      status: 'error',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 300,
    }),
  )
  await store.append(
    event({
      ts: '2026-10-30T09:00:00.000Z',
      operator: 'bob@sps.dev',
      route: '/v1/readiness',
      agentId: 'auditor',
      kind: 'retrieval',
      inputTokens: 500,
      outputTokens: 0,
      costUsd: null,
      latencyMs: 200,
    }),
  )
  return store
}

describe('usage ledger summary (memory)', () => {
  test('an operator sees their own totals, series and breakdowns', async () => {
    const store = await seeded()
    const summary = await store.summary({ from: FROM, to: TO, operator: 'ada@sps.dev' })

    expect(summary.scope).toBe('operator')
    expect(summary.operator).toBe('ada@sps.dev')
    expect(summary.totals).toEqual({
      requests: 2,
      errors: 1,
      inputTokens: 1000,
      outputTokens: 200,
      units: 0,
      costUsd: 0.002,
      unpriced: 0,
    })
    expect(summary.byModel).toEqual([expect.objectContaining({ key: 'muse-spark-1.3', requests: 2, unpriced: 0 })])
    expect(summary.byRoute).toEqual([{ key: '/v1/agents/ask', ...summary.totals }])
    expect(summary.byKind).toEqual([{ key: 'chat', ...summary.totals }])
    expect(summary.byAgent).toEqual([{ key: 'legal_advisor', ...summary.totals }])
    // An operator never gets the cross-operator comparison.
    expect(summary.operators).toEqual([])
  })

  test('the daily series fills empty days and keeps the range boundaries', async () => {
    const store = await seeded()
    const summary = await store.summary({ from: FROM, to: TO, operator: 'ada@sps.dev' })

    expect(summary.series.map((point) => point.date)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'])
    expect(summary.series[0]).toMatchObject({ requests: 0, inputTokens: 0, costUsd: 0 })
    expect(summary.series[1]).toMatchObject({ requests: 2, errors: 1, costUsd: 0.002 })
    expect(summary.series[2]).toMatchObject({ requests: 0 })
  })

  test('an admin scope adds every operator, and unpriced calls are counted apart', async () => {
    const store = await seeded()
    const summary = await store.summary({ from: FROM, to: TO }, { includeOperators: true })

    expect(summary.scope).toBe('all')
    expect(summary.operator).toBeUndefined()
    expect(summary.totals).toMatchObject({ requests: 3, errors: 1, costUsd: 0.002, unpriced: 1 })
    expect(summary.operators).toEqual([
      expect.objectContaining({ key: 'ada@sps.dev', requests: 2 }),
      expect.objectContaining({ key: 'bob@sps.dev', requests: 1, unpriced: 1 }),
    ])
    expect(summary.byKind).toEqual([
      expect.objectContaining({ key: 'chat', requests: 2 }),
      expect.objectContaining({ key: 'retrieval', requests: 1 }),
    ])
  })

  test('latency percentiles ignore rows with no measurement', async () => {
    const store = await seeded()
    await store.append(event({ ts: '2026-10-30T12:00:00.000Z', latencyMs: undefined }))
    const summary = await store.summary({ from: FROM, to: TO })

    expect(summary.latency).toEqual({ p50Ms: 200, p95Ms: 300, samples: 3 })
  })

  test('images, voice seconds and SAM calls are summed per capability', async () => {
    const store = memoryStore()
    await store.append(
      event({ ts: '2026-10-29T10:00:00.000Z', kind: 'image', inputTokens: 0, outputTokens: 0, units: 1, unit: 'image', costUsd: null }),
    )
    await store.append(
      event({ ts: '2026-10-29T11:00:00.000Z', kind: 'image', inputTokens: 0, outputTokens: 0, units: 1, unit: 'image', costUsd: null }),
    )
    await store.append(
      event({ ts: '2026-10-29T12:00:00.000Z', kind: 'voice', inputTokens: 0, outputTokens: 0, units: 8, unit: 'second', costUsd: 0 }),
    )
    const summary = await store.summary({ from: FROM, to: TO })

    expect(summary.byKind).toEqual([
      expect.objectContaining({ key: 'image', requests: 2, units: 2, unpriced: 2 }),
      expect.objectContaining({ key: 'voice', requests: 1, units: 8, costUsd: 0, unpriced: 0 }),
    ])
    const image = await store.list({ from: FROM, to: TO, kind: 'image' }, 10)
    expect(image.requests.map((row) => row.unit)).toEqual(['image', 'image'])
  })

  test('a row written before kind and status existed reads as a successful chat call', async () => {
    const store = memoryStore()
    const legacy = event({ ts: '2026-10-29T10:00:00.000Z' }) as Partial<UsageEvent>
    delete legacy.kind
    delete legacy.status
    await store.append(legacy as UsageEvent)
    const summary = await store.summary({ from: FROM, to: TO, operator: 'ada@sps.dev' })

    expect(summary.byKind).toEqual([expect.objectContaining({ key: 'chat', errors: 0 })])
    expect(summary.totals).toMatchObject({ requests: 1, errors: 0 })
  })
})

describe('usage ledger forecast (memory)', () => {
  const DAY = 86_400_000
  const START = '2026-10-20T00:00:00.000Z'

  async function daily(days: number): Promise<MongoUsageStore> {
    const store = memoryStore()
    for (let index = 0; index < days; index += 1) {
      const stamp = new Date(Date.parse(START) + index * DAY + 10 * 3_600_000).toISOString()
      await store.append(event({ ts: stamp, inputTokens: 0, outputTokens: 0, costUsd: 0.002 }))
      await store.append(event({ ts: stamp, inputTokens: 0, outputTokens: 0, costUsd: 0.002 }))
    }
    return store
  }

  test('projects calls and known cost from the complete days', async () => {
    const store = await daily(6)
    const forecast = await store.forecast({ from: START, to: '2026-10-27T00:00:00.000Z' }, 7)

    // The trend is fitted on the six days that actually saw calls, not on the
    // empty day between the last call and the end of the range.
    expect(forecast.days).toBe(6)
    expect(forecast.activeDays).toBe(6)
    expect(forecast.enoughData).toBe(true)
    expect(forecast.projectedCalls).toBe(14)
    expect(forecast.projectedCostUsd).toBeCloseTo(0.028, 6)
    expect(forecast.unpriced).toBe(0)
  })

  test('leaves out a partial day at either end of the range', async () => {
    const store = await daily(6)
    const forecast = await store.forecast({ from: '2026-10-21T00:00:00.000Z', to: '2026-10-27T12:00:00.000Z' }, 7)

    // 21..25 are the whole days with calls inside the range.
    expect(forecast.days).toBe(5)
    expect(forecast.series.map((point) => point.date)).toEqual([
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ])
  })

  test('under five complete days it says so instead of inventing a trend', async () => {
    const store = await daily(3)
    const forecast = await store.forecast({ from: START, to: '2026-10-24T00:00:00.000Z' }, 7)

    expect(forecast.days).toBe(3)
    expect(forecast.activeDays).toBe(3)
    expect(forecast.enoughData).toBe(false)
    expect(forecast.projectedCalls).toBeNull()
    expect(forecast.projectedCostUsd).toBeNull()
  })

  test('an unpriced history projects calls but not dollars', async () => {
    const store = memoryStore()
    for (let index = 0; index < 5; index += 1) {
      const stamp = new Date(Date.parse(START) + index * DAY + 10 * 3_600_000).toISOString()
      await store.append(event({ ts: stamp, costUsd: null }))
    }
    const forecast = await store.forecast({ from: START, to: '2026-10-27T00:00:00.000Z' }, 7)

    expect(forecast.enoughData).toBe(true)
    expect(forecast.projectedCalls).toBeGreaterThan(0)
    expect(forecast.projectedCostUsd).toBeNull()
    expect(forecast.unpriced).toBe(5)
  })
})

describe('usage ledger requests (memory)', () => {
  test('newest first, filtered and counted before the page limit', async () => {
    const store = await seeded()
    const page = await store.list({ from: FROM, to: TO }, 2)

    expect(page.total).toBe(3)
    expect(page.requests.map((row) => row.ts)).toEqual(['2026-10-30T09:00:00.000Z', '2026-10-29T11:00:00.000Z'])
  })

  test('narrows by status, kind, model and operator', async () => {
    const store = await seeded()

    const errors = await store.list({ from: FROM, to: TO, status: 'error' }, 50)
    expect(errors.total).toBe(1)
    expect(errors.requests[0]?.operator).toBe('ada@sps.dev')

    const retrieval = await store.list({ from: FROM, to: TO, kind: 'retrieval' }, 50)
    expect(retrieval.requests.map((row) => row.agentId)).toEqual(['auditor'])

    const bob = await store.list({ from: FROM, to: TO, operator: 'bob@sps.dev' }, 50)
    expect(bob.total).toBe(1)

    const other = await store.list({ from: FROM, to: TO, model: 'other-model' }, 50)
    expect(other).toEqual({ requests: [], total: 0 })
  })

  test('recent() keeps the operator scope', async () => {
    const store = await seeded()
    const rows = await store.recent('ada@sps.dev', 10)
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.operator === 'ada@sps.dev')).toBe(true)
  })
})
