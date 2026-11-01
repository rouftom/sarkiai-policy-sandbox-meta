/**
 * Audit chain maintenance, shared by the boot hook and `scripts/audit-chain.ts`.
 *
 * `purge` never drops evidence: `audit_logs` is renamed to
 * `audit_logs_archive_<timestamp>`, the chain head is reset, and the new chain
 * starts with one `audit.chain_reset` record that names the archive.
 */
import { MongoClient } from 'mongodb'
import { AuditService } from '@sps/audit'
import { mongoPoolOptions } from '@sps/shared'

export interface AuditMaintenanceOptions {
  uri: string
  dbName: string
  mode: 'check' | 'purge'
}

export async function maintainAuditChain(options: AuditMaintenanceOptions) {
  const audit = new AuditService({ mongodbUri: options.uri, dbName: options.dbName })
  try {
    const before = await audit.verifyChain()
    if (options.mode === 'check') return { before, after: before, archive: null as string | null }

    const client = new MongoClient(options.uri, mongoPoolOptions())
    await client.connect()
    let archive: string
    let archived: number
    try {
      const db = client.db(options.dbName)
      archived = await db.collection('audit_logs').countDocuments()
      archive = `audit_logs_archive_${new Date().toISOString().replace(/[:.]/g, '-')}`
      await db.collection('audit_logs').rename(archive)
      await db.collection('audit_logs_head').deleteMany({})
    } finally {
      await client.close()
    }
    await audit.logAction({
      actor: 'system',
      action: 'audit.chain_reset',
      target: `archived ${archived} records to ${archive}; previous chain: ${before.valid ? 'intact' : `break at ${before.brokenAt}`}`,
      lens: 'hybrid',
    })
    return { before, after: await audit.verifyChain(), archive }
  } finally {
    await audit.close()
  }
}
