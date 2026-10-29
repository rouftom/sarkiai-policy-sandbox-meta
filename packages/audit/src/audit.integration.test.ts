import { describe, expect, test } from 'bun:test'
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
})
