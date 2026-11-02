#!/usr/bin/env bun
/**
 * Remove non-publishable documents from the knowledge base.
 *
 *   MONGODB_URI=... bun run kb:purge                 # report only (default)
 *   MONGODB_URI=... bun run kb:purge -- --apply      # delete the listed documents
 *
 * The list comes from the corpus manifests: a document is a target when its
 * `rights` is not `official-text` / `open-licence`. Existing chunks written
 * before the rights gate may carry no `rights` field at all, so matching is by
 * filename (the manifest's `file`, its `.txt` derivative and split suffixes).
 *
 * This is destructive and only touches Atlas. It never prints document content.
 * Re-seed the publishable corpus afterwards so every remaining chunk carries a
 * `rights` value (`bun run kb:seed`).
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AtlasIngestor, type KnowledgeDocument } from '@sps/retrieval'
import { isPublishableRights, normalizeCorpusRights, type CorpusRights } from '@sps/shared'

interface ManifestDocument {
  id?: string
  title: string
  file?: string
  rights?: CorpusRights
  status?: string
}

interface Manifest {
  country: string
  documents: ManifestDocument[]
}

const ROOT = resolve(import.meta.dir, '..')
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const verbose = args.includes('--verbose')

const MANIFESTS = [
  'data/country/cm/manifest.json',
  'data/global/standards/manifest.json',
  'data/global/africa/manifest.json',
]

const mongodbUri = process.env.MONGODB_URI
if (!mongodbUri) {
  console.error('MONGODB_URI is required (the Atlas cluster URI). Do not pass it on the command line.')
  process.exit(1)
}

/** The manifest file, its `.txt` derivative and the split parts `name_1of3.txt`. */
function matches(filename: string, source: string): boolean {
  const base = source.replace(/\.pdf$/i, '')
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped}(_[0-9]+of[0-9]+)?\\.txt$`, 'i').test(filename) || filename === source
}

interface Target {
  filename: string
  rights: CorpusRights
  manifest: string
  title: string
}

const targets: Target[] = []
const unresolved: Array<{ manifest: string; title: string; rights: CorpusRights }> = []

for (const relative of MANIFESTS) {
  const path = join(ROOT, relative)
  if (!existsSync(path)) continue
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest
  for (const document of manifest.documents) {
    if (isPublishableRights(document.rights)) continue
    const rights = normalizeCorpusRights(document.rights)
    if (!document.file) {
      unresolved.push({ manifest: relative, title: document.title, rights })
      continue
    }
    targets.push({ filename: document.file, rights, manifest: relative, title: document.title })
  }
}

const knowledge = new AtlasIngestor({
  mongodbUri,
  dbName: process.env.MONGODB_DB_NAME ?? 'policy_sandbox',
  collectionName: process.env.MONGODB_RAG_COLLECTION ?? 'kb_chunks',
  searchMode: process.env.SANDBOX_MODE === 'cloud' ? 'atlas' : 'text',
})

try {
  const documents = await knowledge.listDocuments({ limit: 200, includeRetired: true })
  const byFilename = new Map(documents.map((document) => [document.filename, document]))

  const hits: Array<{ target: Target; document: KnowledgeDocument }> = []
  for (const target of targets) {
    for (const [filename, document] of byFilename) {
      if (matches(filename, target.filename)) hits.push({ target, document })
    }
  }

  console.log(`Atlas collection: ${process.env.MONGODB_DB_NAME ?? 'policy_sandbox'} / ${process.env.MONGODB_RAG_COLLECTION ?? 'kb_chunks'}`)
  console.log(`Restricted manifest entries: ${targets.length} with a filename, ${unresolved.length} without one.`)

  if (hits.length === 0) {
    console.log('No restricted document found in the knowledge base. Nothing to purge.')
  } else {
    console.log('\nRestricted documents currently in the knowledge base:')
    let chunks = 0
    let characters = 0
    for (const { target, document } of hits) {
      chunks += document.chunks
      characters += document.characters
      console.log(
        `  ${document.filename} · rights=${target.rights} · ${document.chunks} chunks` +
          ` (${document.activeChunks} active) · ${document.characters.toLocaleString('en-US')} chars · ${target.manifest}`,
      )
      if (verbose && document.rights !== target.rights) {
        console.log(`    stored rights=${document.rights} (legacy chunk without the field or a previous ingestion)`)
      }
    }
    console.log(`\nTotal: ${hits.length} document(s), ${chunks} chunks, ${characters.toLocaleString('en-US')} characters.`)
  }

  const unknown = documents.filter(
    (document) =>
      normalizeCorpusRights(document.rights) === 'to-confirm' &&
      !hits.some((hit) => hit.document.filename === document.filename),
  )
  if (unknown.length > 0) {
    console.log('\nDocuments with no established rights (not targeted, review them):')
    for (const document of unknown) {
      console.log(`  ${document.filename} · ${document.chunks} chunks · re-seed the manifest or delete it`)
    }
  }

  if (unresolved.length > 0) {
    console.log('\nRestricted entries with no local filename (cannot be matched automatically):')
    for (const entry of unresolved) console.log(`  rights=${entry.rights} · ${entry.title} · ${entry.manifest}`)
  }

  if (!apply) {
    console.log('\nDry run. Re-run with --apply to delete the restricted documents listed above.')
  } else if (hits.length === 0) {
    console.log('\nNothing to delete.')
  } else {
    const filenames = [...new Set(hits.map((hit) => hit.document.filename))]
    const result = await knowledge.purgeDocuments(filenames)
    console.log(
      `\nPurged ${result.documents} metadata record(s), ${result.chunks} chunk(s) and ${result.images} figure(s).`,
    )
    console.log('Re-seed the publishable corpus so every remaining chunk carries its rights: bun run kb:seed')
  }
} finally {
  await knowledge.close()
}
