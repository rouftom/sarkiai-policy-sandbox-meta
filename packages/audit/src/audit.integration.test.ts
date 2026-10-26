import { describe, expect, test } from 'bun:test'
import { AuditService } from './index'

/**
 * Integration test — requires a MongoDB instance.
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
})
