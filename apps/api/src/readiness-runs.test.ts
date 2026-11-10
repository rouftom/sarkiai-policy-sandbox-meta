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

  test('a page is filtered and counted on the server: search, sector, status, paging', async () => {
    const store = new ReadinessRunStore({})
    const make = (country: string, domain: string, runBy: string) =>
      store.save({ userId: 'page-op', runBy, report: { ...report(1), country, domain } as unknown as ReadinessReport })
    await make('cm', 'health', 'alice')
    await make('cm', 'education', 'bob')
    await make('fr', 'health', 'carol')
    const failed = await store.save({ userId: 'page-op', runBy: 'dan', report: report(1), status: 'failed', failure: 'x' })

    const all = await store.page('page-op', { page: 1, limit: 2 })
    expect(all.total).toBe(4)
    expect(all.runs).toHaveLength(2)

    expect((await store.page('page-op', { page: 2, limit: 2 })).runs).toHaveLength(2)
    expect((await store.page('page-op', { page: 1, limit: 10, domains: ['education'] })).total).toBe(1)
    expect((await store.page('page-op', { page: 1, limit: 10, statuses: ['failed'] })).runs.map((run) => run.id)).toEqual([failed.id])
    expect((await store.page('page-op', { page: 1, limit: 10, q: 'CAROL' })).total).toBe(1)
    expect((await store.page('page-op', { page: 1, limit: 10, q: 'nobody' })).total).toBe(0)
    expect((await store.page('page-op', { page: 1, limit: 10, q: 'SANTE' })).total).toBe(3)
    expect((await store.page('page-op', { page: 1, limit: 10, q: 'services publics' })).total).toBe(0)
    expect((await store.page('other', { page: 1, limit: 10 })).total).toBe(0)
  })
})

describe('readiness run summaries', () => {
  const richReport = {
    country: 'us',
    domain: 'health',
    generatedAt: '2026-11-01T00:00:00.000Z',
    dimensions: [
      { dimension: 'strategy', dimensionId: 1, gaps: [], countryChunks: [{ id: 'c1' }], globalChunks: [] },
      { dimension: 'data', dimensionId: 2, gaps: [], countryChunks: [], globalChunks: [{ id: 'g1' }] },
    ],
    scores: [
      { dimension: 'strategy', dimensionId: 1, dimensionName: 'Strategy', score: 4, maturity: 'Advanced', evidence: [], gaps: [], recommendations: [], confidence: 0.9 },
      { dimension: 'data', dimensionId: 2, dimensionName: 'Data', score: 1, maturity: 'Initial', evidence: [], gaps: [], recommendations: [], confidence: 0.5 },
    ],
    scenario: {
      country: 'us',
      domain: 'health',
      generatedAt: '',
      dimensions: [],
      overall: 2.5,
      composite: 2.5,
      weights: { strategy: 3, data: 1 },
    },
    summary: 'test',
  } as unknown as ReadinessReport

  test('stores the grounded count and the weighted mean confidence at save time', async () => {
    const store = new ReadinessRunStore({})
    const saved = await store.save({ userId: 'op', runBy: 'op', report: richReport })
    expect(saved.groundedDimensions).toBe(1)
    expect(saved.meanConfidence).toBe(0.8)
    expect(saved.sharing).toBe('shared')
    expect((await store.list('op'))[0]!.groundedDimensions).toBe(1)
  })

  test('an excluded summary leaves the shared scope but stays with its owner', async () => {
    const store = new ReadinessRunStore({})
    const mine = await store.save({ userId: 'op', runBy: 'op', report: richReport })
    const other = await store.save({ userId: 'other', runBy: 'other', report: richReport })

    expect(await store.setSharing(mine.id, 'other', 'excluded')).toBe(false)
    expect(await store.setSharing(mine.id, 'op', 'excluded')).toBe(true)

    const shared = await store.byCountry('us', 'other')
    expect(shared.map((run) => run.id)).toEqual([other.id])
    expect((await store.byCountry('us', 'op')).map((run) => run.id).sort()).toEqual([mine.id, other.id].sort())
  })

  test('the World scope lists complete summaries only, and honours sharing', async () => {
    const store = new ReadinessRunStore({})
    const mine = await store.save({ userId: 'alice', runBy: 'alice', report: richReport })
    const other = await store.save({ userId: 'bob', runBy: 'bob', report: richReport })
    await store.save({ userId: 'bob', runBy: 'bob', report: richReport, status: 'failed', failure: 'provider 500' })

    expect((await store.completeForScope('alice', 'mine')).map((run) => run.id)).toEqual([mine.id])
    expect(
      (await store.completeForScope('alice', 'shared')).map((run) => run.id).sort(),
    ).toEqual([mine.id, other.id].sort())

    await store.setSharing(other.id, 'bob', 'excluded')
    expect((await store.completeForScope('alice', 'shared')).map((run) => run.id)).toEqual([mine.id])
    // The owner keeps seeing their excluded run, in either scope.
    expect(
      (await store.completeForScope('bob', 'shared')).map((run) => run.id).sort(),
    ).toEqual([mine.id, other.id].sort())
  })
})
