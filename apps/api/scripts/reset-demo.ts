#!/usr/bin/env bun
/**
 * Wipe the demo's operational state.
 *
 *   bun run demo:reset -- --dry-run     # show what would be deleted
 *   bun run demo:reset -- --yes         # actually delete
 *
 * What goes:
 *   operators            accounts (sign-in, TOTP secrets, recovery codes)
 *   password_resets      pending reset links
 *   audit_logs           hash-chained audit trail
 *   cot_traces           chain-of-thought traces
 *   joint_reports        joint situation reports
 *   whatsapp_approvals   approval decisions
 *
 * What stays: the legal corpus and its vectors (`kb_chunks`), the Atlas Search
 * indexes, and every configuration value. Re-seed the corpus only when you mean
 * to (`bun run kb:seed`).
 *
 * The connection string is never printed, never echoed in an error and never
 * written to disk.
 */

import { MongoClient } from 'mongodb'

const COLLECTIONS = [
  'operators',
  'password_resets',
  'audit_logs',
  'cot_traces',
  'joint_reports',
  'whatsapp_approvals',
] as const

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const confirmed = args.has('--yes') || args.has('-y')

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const uri = process.env.MONGODB_URI
if (!uri) {
  fail('MONGODB_URI is not set; refusing to guess a cluster.')
}

const dbName = process.env.MONGODB_DB_NAME ?? 'policy_sandbox'

console.log(`Demo reset — database "${dbName}"`)
console.log(`  collections: ${COLLECTIONS.join(', ')}`)
console.log('  kept: kb_chunks (corpus + vectors), Atlas indexes, configuration')
console.log('')

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 })

try {
  await client.connect()
  const db = client.db(dbName)
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map((entry) => entry.name),
  )

  const counts: Array<{ name: string; count: number; present: boolean }> = []
  for (const name of COLLECTIONS) {
    if (!existing.has(name)) {
      counts.push({ name, count: 0, present: false })
      continue
    }
    counts.push({ name, count: await db.collection(name).countDocuments(), present: true })
  }

  for (const entry of counts) {
    const state = entry.present ? `${entry.count} document(s)` : 'collection absent'
    console.log(`  ${entry.name.padEnd(20)} ${state}`)
  }

  if (dryRun) {
    console.log('\nDry run: nothing was deleted. Re-run with --yes to wipe these collections.')
    process.exit(0)
  }

  if (!confirmed) {
    console.log('\nNothing deleted. This command is destructive:')
    console.log('  bun run demo:reset -- --yes')
    console.log('Use --dry-run first if you only want to look.')
    process.exit(2)
  }

  console.log('')
  let deleted = 0
  for (const name of COLLECTIONS) {
    if (!existing.has(name)) continue
    const result = await db.collection(name).deleteMany({})
    deleted += result.deletedCount
    console.log(`  cleared ${name.padEnd(20)} ${result.deletedCount} document(s)`)
  }

  console.log(`\nDone — ${deleted} document(s) deleted. The corpus was left untouched.`)
  console.log('Next: open the console, create the root operator from /setup, then enrol TOTP.')
} catch (error) {
  // Deliberately no connection string, no stack trace with credentials.
  const message = error instanceof Error ? error.message : 'unknown error'
  console.error(`\nReset failed: ${message}`)
  console.error('Check that this machine can reach the cluster and that MONGODB_URI is current.')
  process.exitCode = 1
} finally {
  await client.close().catch(() => {})
}
