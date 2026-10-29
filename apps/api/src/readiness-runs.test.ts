import { describe, expect, test } from 'bun:test'
import type { ReadinessReport } from '@sps/readiness'
import { ReadinessRunStore } from './readiness-runs'

const report = (scores: number): ReadinessReport =>
  ({
    country: 'cm',
    domain: 'health',
    generatedAt: '2026-10-29T00:00:00.000Z',
    dimensions: [],
    scores: Array.from({ length: scores }, (_, index) => ({ dimension: `d${index}`, dimensionId: index + 1 })),
    scenario: { country: 'cm', domain: 'health', generatedAt: '', dimensions: [], overall: 0, composite: 1 },
    summary: 'test',
  }) as unknown as ReadinessReport

describe('readiness runs', () => {
  test('an interrupted run is listed as failed, then completed in place when resumed', async () => {
    const store = new ReadinessRunStore({})
    const input = { country: 'cm', domain: 'health', globalCountry: 'global' }
    const failed = await store.save({ userId: 'op', runBy: 'op', report: report(4), status: 'failed', failure: 'embeddings 500', input })

    expect(failed.status).toBe('failed')
    expect((await store.list('op')).find((entry) => entry.id === failed.id)?.failure).toBe('embeddings 500')
    expect((await store.get(failed.id, 'op'))?.input).toEqual(input)

    const resumed = await store.updateRun(failed.id, 'op', { report: report(13), status: 'complete' })
    expect(resumed?.id).toBe(failed.id)
    expect(resumed?.status).toBe('complete')
    expect(resumed?.failure).toBeUndefined()
    expect((await store.list('op')).filter((entry) => entry.id === failed.id)).toHaveLength(1)
  })

  test('another operator cannot see or resume the run', async () => {
    const store = new ReadinessRunStore({})
    const saved = await store.save({ userId: 'op', runBy: 'op', report: report(2), status: 'failed', failure: 'x' })
    expect(await store.get(saved.id, 'other')).toBeNull()
    expect(await store.updateRun(saved.id, 'other', { report: report(2), status: 'complete' })).toBeNull()
  })

  test('the runs of one series are listed together, oldest first, for their operator only', async () => {
    const store = new ReadinessRunStore({})
    const input = { country: 'cm', domain: 'health', globalCountry: 'global', batchId: 'series-0001' }
    const first = await store.save({ userId: 'op', runBy: 'op', report: report(3), input })
    const second = await store.save({ userId: 'op', runBy: 'op', report: report(4), input: { ...input, domain: 'telecom' } })
    await store.save({ userId: 'op', runBy: 'op', report: report(2) })

    const series = await store.listBatch('op', 'series-0001')
    expect(series.map((run) => run.id)).toEqual([first.id, second.id])
    expect(series[0]!.report.scores).toHaveLength(3)
    expect(await store.listBatch('other', 'series-0001')).toEqual([])
    expect((await store.list('op')).find((entry) => entry.id === first.id)?.batchId).toBe('series-0001')
  })
})
