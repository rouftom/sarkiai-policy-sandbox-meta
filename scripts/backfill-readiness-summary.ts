#!/usr/bin/env bun
/**
 * One-off backfill for readiness run summaries saved before World mode.
 *
 *   bun run runs:backfill-summary
 *   bun run runs:backfill-summary --dry-run
 *
 * Fills `groundedDimensions` (dimensions backed by at least one country
 * passage) and `meanConfidence` (weighted mean of the dimension confidences)
 * from the stored report, so the country dashboard and the World summaries do
 * not have to load full reports. The operation is idempotent: a run that
 * already carries both fields is skipped.
 */

import { MongoClient } from 'mongodb'
import type { ReadinessReport } from '@sps/readiness'
import { groundedDimensionCount, meanConfidence } from '@sps/readiness/scoring'

const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME ?? 'policy_sandbox'
const dryRun = process.argv.includes('--dry-run')

if (!uri) {
  console.error('MONGODB_URI is not set; refusing to guess a cluster.')
  process.exit(1)
}

interface LegacyRun {
  _id: unknown
  report?: ReadinessReport
  groundedDimensions?: number
  meanConfidence?: number | null
}

const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 })
await client.connect()
const runs = client.db(dbName).collection<LegacyRun>('readiness_runs')

const filter = {
  report: { $exists: true },
  $or: [{ groundedDimensions: { $exists: false } }, { meanConfidence: { $exists: false } }],
}

const pending = await runs.find(filter, { projection: { report: 1 } }).toArray()
console.log(`Readiness summaries · db=${dbName} collection=readiness_runs pending=${pending.length}${dryRun ? ' (dry run)' : ''}`)

let updated = 0
let unusable = 0
for (const run of pending) {
  const report = run.report
  if (!report || !Array.isArray(report.scores) || !Array.isArray(report.dimensions)) {
    unusable += 1
    continue
  }
  const grounded = groundedDimensionCount(report)
  const confidence = meanConfidence(report.scores, report.scenario?.weights)
  if (!dryRun) {
    await runs.updateOne(
      { _id: run._id, ...filter },
      { $set: { groundedDimensions: grounded, meanConfidence: confidence } },
    )
  }
  updated += 1
}

console.log(`  updated=${updated} skipped_without_report=${unusable}`)
await client.close()
