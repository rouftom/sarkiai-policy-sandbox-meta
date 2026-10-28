#!/usr/bin/env bun
/**
 * Audit chain maintenance from a shell (see also the boot hook in src/index.ts).
 *
 *   bun scripts/audit-chain.ts check
 *   bun scripts/audit-chain.ts purge
 *
 * The connection string is read from the environment and never printed.
 */
import { maintainAuditChain } from '../src/audit-maintenance.js'

const mode = process.argv[2] ?? 'check'
if (mode !== 'check' && mode !== 'purge') throw new Error(`Unknown mode "${mode}" (use check or purge).`)
const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not set')

console.log(JSON.stringify(await maintainAuditChain({ uri, dbName: process.env.MONGODB_DB_NAME ?? 'policy_sandbox', mode })))
