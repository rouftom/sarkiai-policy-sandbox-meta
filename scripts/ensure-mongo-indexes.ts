#!/usr/bin/env bun
/**
 * Atlas Search index bootstrap (cloud mode).
 *
 *   bun run kb:indexes
 *   bun run kb:indexes deploy/mongo/kb.indexes.json
 *
 * Creates the collection before the indexes (a fresh database otherwise returns
 * NamespaceNotFound) and is idempotent: unchanged definitions are skipped,
 * changed ones are recreated. On the local MongoDB used by the compose profile
 * there is no Atlas Search, so it reports `supported: false` and exits 0 —
 * local/sovereign modes use Qdrant and never need these indexes.
 */

import { resolve } from 'node:path'
import { ensureAtlasIndexes, loadIndexDefinitions } from '@sps/retrieval'

const file = resolve(process.argv[2] ?? 'deploy/mongo/kb.indexes.json')
const artifact = loadIndexDefinitions(file)
const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME ?? 'policy_sandbox'
const collection = process.env.MONGODB_RAG_COLLECTION ?? artifact.collection

if (!uri) {
  console.error('MONGODB_URI is not set; refusing to guess a cluster.')
  process.exit(1)
}

console.log(`Atlas indexes — ${file}`)
console.log(`  db=${dbName} collection=${collection} indexes=${artifact.indexes.length}`)

const result = await ensureAtlasIndexes({
  uri,
  dbName,
  collection,
  indexes: artifact.indexes,
  log: (message) => console.log(`  ${message}`),
})

if (!result.supported) {
  console.log('Atlas Search unsupported on this deployment; nothing to do (Qdrant is used locally).')
  process.exit(0)
}

console.log(
  `Done — created: ${result.created.length}, updated: ${result.updated.length}, unchanged: ${result.unchanged.length}.`,
)
