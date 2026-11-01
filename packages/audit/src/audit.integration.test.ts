import { describe, expect, test } from 'bun:test'
import { MongoClient } from 'mongodb'
import { AuditService } from './index'

/**
 * Integration test · requires a MongoDB instance.
 * Run with:  MONGO_URL=mongodb://localhost:27017 bun test
 * Skipped automatically when MONGO_URL is unset (no infra on this machine).
 */
const mongoUri = process.env.MONGO_URL

describe.skipIf(!mongoUri)('AuditService (integration: MongoDB)', () => {
  test('appends records and the hash chain verifies', async () => {
    const audit = new AuditService({ mongodbUri: mongoUri!, dbName: `sps_test_${Date.now()}` })
    try {
      await audit.logAction({ actor: 'agent-a', action: 'assessment', lens: 'hybrid', runId: 'it-run' })
      await audit.logAction({ actor: 'agent-b', action: 'assessment', lens: 'hybrid', runId: 'it-run' })
      const { valid } = await audit.verifyChain()
      expect(valid).toBe(true)
      const records = await audit.getAuditForRun('it-run')
      expect(records.length).toBeGreaterThanOrEqual(2)
    } finally {
      await audit.close()
    }
  })

  test('concurrent appends stay on one chain (no fork on the tail)', async () => {
    const audit = new AuditService({ mongodbUri: mongoUri!, dbName: `sps_test_race_${Date.now()}` })
    try {
      // A scenario logs its steps in parallel: every append reads the same tail
      // unless appends are serialised. Before the queue, this forked the chain.
      await Promise.all(
        Array.from({ length: 12 }, (_, index) =>
          audit.logAction({ actor: `agent-${index}`, action: 'assessment', lens: 'hybrid', runId: 'race-run' }),
        ),
      )
      expect((await audit.verifyChain()).valid).toBe(true)
      expect(await audit.getAuditForRun('race-run')).toHaveLength(12)
    } finally {
      await audit.close()
    }
  })

  test('scopes reads to one operator without breaking the chain', async () => {
    const audit = new AuditService({ mongodbUri: mongoUri!, dbName: `sps_test_scope_${Date.now()}` })
    try {
      await audit.logAction({
        actor: 'agent-a',
        userId: 'ada@sarkiai.dev',
        action: 'assessment',
        lens: 'hybrid',
        runId: 'scope-run',
      })
      await audit.logAction({
        actor: 'agent-b',
        userId: 'bob@sarkiai.dev',
        action: 'assessment',
        lens: 'hybrid',
        runId: 'scope-run',
      })

      const ada = await audit.listAudit(50, 'ada@sarkiai.dev')
      expect(ada.every((record) => record.userId === 'ada@sarkiai.dev')).toBe(true)
      expect(ada).toHaveLength(1)

      const runForBob = await audit.getAuditForRun('scope-run', 'bob@sarkiai.dev')
      expect(runForBob).toHaveLength(1)
      expect(runForBob[0]!.actor).toBe('agent-b')

      // The chain still covers every operator's records end to end.
      expect((await audit.verifyChain()).valid).toBe(true)
    } finally {
      await audit.close()
    }
  })

  test('counts, pages and windows the feed exactly', async () => {
    const audit = new AuditService({ mongodbUri: mongoUri!, dbName: `sps_test_read_${Date.now()}` })
    try {
      for (let index = 0; index < 7; index += 1) {
        await audit.logAction({
          actor: 'agent-a',
          userId: 'ada@sarkiai.dev',
          action: index % 2 === 0 ? 'readiness.run' : 'scenario.run',
          lens: 'hybrid',
          runId: 'read-run',
        })
      }
      for (let index = 0; index < 3; index += 1) {
        await audit.logAction({
          actor: 'agent-b',
          userId: 'bob@sarkiai.dev',
          action: 'readiness.run',
          lens: 'hybrid',
          runId: 'read-run',
        })
      }

      // Exact totals, never capped by the page size.
      expect(await audit.countAudit('ada@sarkiai.dev')).toBe(7)
      expect(await audit.countAudit('bob@sarkiai.dev')).toBe(3)
      expect(await audit.countAudit()).toBe(10)

      // Server-side paging: contiguous pages without overlap.
      const first = await audit.listAudit(3, 'ada@sarkiai.dev', 0)
      const second = await audit.listAudit(3, 'ada@sarkiai.dev', 3)
      expect(first).toHaveLength(3)
      expect(second).toHaveLength(3)
      expect(second.filter((record) => first.some((row) => row.id === record.id))).toHaveLength(0)

      // Search is on the stored fields and drives both the page and its total.
      expect(await audit.countAudit('ada@sarkiai.dev', 'scenario')).toBe(3)
      const matches = await audit.listAudit(50, 'ada@sarkiai.dev', 0, 'scenario')
      expect(matches).toHaveLength(3)
      expect(matches.every((record) => record.action === 'scenario.run')).toBe(true)

      // The seven-day window is an exact per-action breakdown for one operator.
      const rows = await audit.auditWindow('ada@sarkiai.dev', '1970-01-01T00:00:00.000Z', 'UTC')
      expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(7)

      // The cached verdict is the same answer as the full check.
      expect((await audit.verifyChainCached()).valid).toBe(true)
      expect((await audit.verifyChain()).valid).toBe(true)
    } finally {
      await audit.close()
    }
  })

  test('ensureReadIndexes creates the console index and is idempotent', async () => {
    const dbName = `sps_test_index_${Date.now()}`
    const audit = new AuditService({ mongodbUri: mongoUri!, dbName })
    const client = new MongoClient(mongoUri!)
    try {
      await client.connect()
      expect(await audit.ensureReadIndexes()).toBe(true)
      expect(await audit.ensureReadIndexes()).toBe(true)
      const indexes = await client.db(dbName).collection('audit_logs').indexes()
      expect(indexes.some((index) => index.name === 'audit_user_ts')).toBe(true)
    } finally {
      await client.db(dbName).dropDatabase().catch(() => undefined)
      await client.close()
      await audit.close()
    }
  })

  test('pages past 500 records without capping the total', async () => {
    const dbName = `sps_test_501_${Date.now()}`
    const audit = new AuditService({ mongodbUri: mongoUri!, dbName })
    const client = new MongoClient(mongoUri!)
    try {
      // The route allows a page of 500; the 501st record must stay reachable on
      // the next page. Direct inserts avoid 501 serialised chain appends.
      await client.connect()
      const base = Date.now()
      await client
        .db(dbName)
        .collection('audit_logs')
        .insertMany(
          Array.from({ length: 501 }, (_, index) => ({
            id: `page-${index}`,
            userId: 'ada@sarkiai.dev',
            ts: new Date(base - index * 1_000).toISOString(),
            actor: 'agent-a',
            action: 'readiness.run',
            lens: 'hybrid',
            citations: [],
          })),
        )

      expect(await audit.countAudit('ada@sarkiai.dev')).toBe(501)
      const first = await audit.listAudit(500, 'ada@sarkiai.dev', 0)
      const second = await audit.listAudit(500, 'ada@sarkiai.dev', 500)
      expect(first).toHaveLength(500)
      expect(second).toHaveLength(1)
      expect(first.some((record) => record.id === second[0]!.id)).toBe(false)
      expect(new Set([...first, ...second].map((record) => record.id)).size).toBe(501)
    } finally {
      await client.db(dbName).dropDatabase().catch(() => undefined)
      await client.close()
      await audit.close()
    }
  })
})
