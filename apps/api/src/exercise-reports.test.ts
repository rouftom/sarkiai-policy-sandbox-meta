import { describe, expect, test } from 'bun:test'
import { ExerciseReportStore } from './exercise-reports.js'

const input = (userId: string, exerciseId = 'drill') => ({
  userId,
  exerciseId,
  title: 'Breach drill',
  evaluatedAtMinute: 60,
  actionCount: 2,
  lang: 'en' as const,
  model: 'muse-spark-1.3',
  definition: { id: exerciseId },
  actions: [],
  report: { title: 'Breach drill' },
})

describe('exercise report store', () => {
  test('each generation is a new version, numbered per operator and exercise', async () => {
    const store = new ExerciseReportStore({})
    const first = await store.create(input('a@x.test'))
    const second = await store.create(input('a@x.test'))
    const other = await store.create(input('b@x.test'))
    expect([first.version, second.version, other.version]).toEqual([1, 2, 1])
    expect((await store.list('a@x.test', 'drill')).map((item) => item.version)).toEqual([2, 1])
  })

  test('versions of one exercise do not mix with another', async () => {
    const store = new ExerciseReportStore({})
    await store.create(input('a@x.test', 'drill'))
    await store.create(input('a@x.test', 'other'))
    expect(await store.list('a@x.test', 'drill')).toHaveLength(1)
    expect(await store.nextVersion('a@x.test', 'other')).toBe(2)
  })

  test('a saved report is readable by its owner only, with the snapshot it was written from', async () => {
    const store = new ExerciseReportStore({})
    const saved = await store.create(input('a@x.test'))
    const record = await store.get(saved.id, 'a@x.test')
    expect(record?.report).toEqual({ title: 'Breach drill' })
    expect(record?.definition).toEqual({ id: 'drill' })
    expect(await store.get(saved.id, 'b@x.test')).toBeNull()
  })

  test('the list carries summaries, not the report bodies', async () => {
    const store = new ExerciseReportStore({})
    await store.create(input('a@x.test'))
    const [summary] = await store.list('a@x.test', 'drill')
    expect(summary).not.toHaveProperty('report')
    expect(summary).not.toHaveProperty('definition')
    expect(summary?.actionCount).toBe(2)
  })
})
