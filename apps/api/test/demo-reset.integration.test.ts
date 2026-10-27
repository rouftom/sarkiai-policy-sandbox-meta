import { afterAll, describe, expect, test } from 'bun:test'
import { MongoClient } from 'mongodb'
import { resetDemoState } from '../src/demo-reset'

/**
 * Integration test — requires MongoDB. Run with:
 *   MONGO_URL=mongodb://localhost:27017 bun test
 * Skipped automatically when MONGO_URL is unset.
 */
const mongoUri = process.env.MONGO_URL
const DB = `sps_demo_reset_${Date.now()}`

describe.skipIf(!mongoUri)('demo reset (integration: MongoDB)', () => {
  afterAll(async () => {
    if (!mongoUri) return
    const client = new MongoClient(mongoUri)
    await client.connect()
    await client.db(DB).dropDatabase()
    await client.close()
  })

  test('wipes the operational collections and keeps the corpus', async () => {
    const client = new MongoClient(mongoUri!)
    await client.connect()
    const db = client.db(DB)
    await db.collection('operators').insertOne({ email: 'root@sarkiai.dev' })
    await db.collection('audit_logs').insertMany([{ seq: 1 }, { seq: 2 }])
    await db.collection('whatsapp_approvals').insertOne({ decision: 'approved' })
    await db.collection('kb_chunks').insertOne({ text: 'Article 1er' })

    const preview = await resetDemoState({ uri: mongoUri!, dbName: DB, dryRun: true })
    expect(preview.dryRun).toBe(true)
    expect(preview.deleted).toBe(0)
    expect(preview.counts.find((entry) => entry.name === 'operators')?.count).toBe(1)
    expect(await db.collection('operators').countDocuments()).toBe(1)

    const result = await resetDemoState({ uri: mongoUri!, dbName: DB })
    expect(result.deleted).toBe(4)
    expect(await db.collection('operators').countDocuments()).toBe(0)
    expect(await db.collection('audit_logs').countDocuments()).toBe(0)
    expect(await db.collection('whatsapp_approvals').countDocuments()).toBe(0)
    // The corpus is never part of the wipe.
    expect(await db.collection('kb_chunks').countDocuments()).toBe(1)

    await client.close()
  })
})
