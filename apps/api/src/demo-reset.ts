/**
 * Wipe the demo's operational state.
 *
 * Shared by `bun run demo:reset` (a laptop that can reach the cluster) and the
 * boot hook (`apps/api/scripts/reset-on-boot.flag`), which is the only route to
 * the database from a host without a shell · Render free instances refuse SSH,
 * one-off jobs, pre-deploy commands and start-command overrides.
 *
 * What goes: accounts, pending reset links, the hash-chained audit trail, CoT
 * traces, joint reports and WhatsApp approvals. What stays: the legal corpus
 * (`kb_chunks`) and its vectors, the Atlas indexes and every configuration
 * value.
 *
 * The connection string is never returned, logged or written to disk.
 */

import { MongoClient } from 'mongodb'
import { mongoPoolOptions } from '@sps/shared'

export const DEMO_RESET_COLLECTIONS = [
  'operators',
  'password_resets',
  'audit_logs',
  'cot_traces',
  'joint_reports',
  'whatsapp_approvals',
] as const

export type DemoResetCollection = (typeof DEMO_RESET_COLLECTIONS)[number]

export interface DemoResetCount {
  name: DemoResetCollection
  count: number
  present: boolean
}

export interface DemoResetResult {
  database: string
  counts: DemoResetCount[]
  deleted: number
  dryRun: boolean
}

export interface DemoResetOptions {
  uri: string
  dbName?: string
  /** Count only: never delete. */
  dryRun?: boolean
  /** Give up instead of hanging a boot when the cluster does not answer. */
  serverSelectionTimeoutMs?: number
}

export async function resetDemoState(options: DemoResetOptions): Promise<DemoResetResult> {
  const database = options.dbName ?? 'policy_sandbox'
  const dryRun = options.dryRun ?? false
  const client = new MongoClient(options.uri, {
    ...mongoPoolOptions(),
    serverSelectionTimeoutMS: options.serverSelectionTimeoutMs ?? 10_000,
  })

  try {
    await client.connect()
    const db = client.db(database)
    const existing = new Set(
      (await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name),
    )

    const counts: DemoResetCount[] = []
    for (const name of DEMO_RESET_COLLECTIONS) {
      const present = existing.has(name)
      counts.push({ name, present, count: present ? await db.collection(name).countDocuments() : 0 })
    }

    if (dryRun) return { database, counts, deleted: 0, dryRun }

    let deleted = 0
    for (const entry of counts) {
      if (!entry.present) continue
      const result = await db.collection(entry.name).deleteMany({})
      deleted += result.deletedCount
    }

    return { database, counts, deleted, dryRun }
  } finally {
    await client.close().catch(() => {})
  }
}
