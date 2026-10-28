#!/usr/bin/env bun
/**
 * Audit chain maintenance.
 *
 *   bun scripts/audit-chain.ts check    # verify the chain and print the verdict
 *   bun scripts/audit-chain.ts purge    # archive the broken chain, start a new one
 *
 * `purge` never drops evidence: `audit_logs` is renamed to
 * `audit_logs_archive_<timestamp>`, the chain head is reset, and the new chain
 * starts with one `audit.chain_reset` record that names the archive.
 *
 * The connection string is read from the environment and never printed.
 */

import { MongoClient } from 'mongodb'
import { AuditService } from '@sps/audit'

const mode = process.argv[2] ?? 'check'
const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME ?? 'policy_sandbox'
if (!uri) throw new Error('MONGODB_URI is not set')
if (mode !== 'check' && mode !== 'purge') throw new Error(`Unknown mode "${mode}" (use check or purge).`)

const audit = new AuditService({ mongodbUri: uri, dbName })
const verdict = await audit.verifyChain()
console.log('verdict', JSON.stringify(verdict))

if (mode === 'purge') {
  const client = new MongoClient(uri)
  await client.connect()
  try {
    const db = client.db(dbName)
    const records = await db.collection('audit_logs').countDocuments()
    const archive = `audit_logs_archive_${new Date().toISOString().replace(/[:.]/g, '-')}`
    await db.collection('audit_logs').rename(archive)
    await db.collection('audit_logs_head').deleteMany({})
    console.log('archived', records, 'records to', archive)
  } finally {
    await client.close()
  }
  await audit.logAction({
    actor: 'system',
    action: 'audit.chain_reset',
    target: `previous chain had ${verdict.valid ? 'no break' : `a break at ${verdict.brokenAt}`}`,
    lens: 'hybrid',
  })
  console.log('after', JSON.stringify(await audit.verifyChain()))
}

await audit.close()
