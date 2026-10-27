#!/usr/bin/env bun
/**
 * Seed the knowledge base from the national corpus manifest.
 *
 *   SPS_API_URL=https://sps-api.example bun run kb:seed            # all documents
 *   bun run kb:seed -- --only snd30,sample                         # a subset
 *   bun run kb:seed -- --dry-run                                   # extract only
 *
 * Cloud mode (`cloud` provider → Atlas + Voyage) chunks and embeds in the API
 * itself, so this script only has to extract the text and POST it to
 * `/v1/kb/ingest/text`. Re-running is idempotent: chunks are keyed by a content
 * hash, unchanged ones are skipped and no Voyage call is made.
 *
 * PDFs are extracted with `pdftotext` (poppler). Scanned pages with no text
 * layer are skipped and should go through the Gazette screen instead. The script
 * never prints document content.
 */

import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

interface ManifestDocument {
  title: string
  /** Absent for entries that are still `to_confirm` placeholders. */
  file?: string
  docType: string
  jurisdiction: string
  status: string
  sourceUrl?: string
  priority?: string
}

interface Manifest {
  country: string
  documents: ManifestDocument[]
}

interface IngestResponse {
  ok?: boolean
  chunks?: number
  inserted?: number
  unchanged?: number
  characters?: number
  durationMs?: number
  error?: string
}

const ROOT = resolve(import.meta.dir, '..')
const args = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const has = (name: string) => args.includes(`--${name}`)

const api = (flag('api') ?? process.env.SPS_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const country = flag('country') ?? 'cm'
const dryRun = has('dry-run')
const only = flag('only')
  ?.split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

const manifestPath = join(ROOT, 'data/country', country, 'manifest.json')
if (!existsSync(manifestPath)) {
  console.error(`No manifest at ${manifestPath}; nothing to seed.`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest

/** `loi_2024_....pdf` → `loi_2024_....txt`, so chunks keep a readable filename. */
function kbFilename(file: string): string {
  return file.replace(/\.pdf$/i, '.txt')
}

function matches(file: string): boolean {
  if (!only || only.length === 0) return true
  const name = kbFilename(file).toLowerCase()
  return only.some((needle) => name.includes(needle.toLowerCase()))
}

async function extractPdf(file: string): Promise<string> {
  const path = join(ROOT, 'data/country', country, file)
  if (!existsSync(path)) return ''
  const proc = Bun.spawn(['pdftotext', '-q', '-layout', path, '-'], {
    stdout: 'pipe',
    stderr: 'ignore',
  })
  const raw = await new Response(proc.stdout).text()
  await proc.exited
  // Form feeds are page breaks: keep them as paragraph breaks for the chunker.
  return raw.replace(/\f/g, '\n').replace(/\u00a0/g, ' ')
}

async function post(body: Record<string, unknown>): Promise<{ status: number; payload: IngestResponse }> {
  const response = await fetch(`${api}/v1/kb/ingest/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, payload: (await response.json()) as IngestResponse }
}

async function ingestDocument(document: ManifestDocument & { file: string }): Promise<void> {
  const text = document.file.toLowerCase().endsWith('.pdf')
    ? await extractPdf(document.file)
    : existsSync(join(ROOT, 'data/country', country, document.file))
      ? readFileSync(join(ROOT, 'data/country', country, document.file), 'utf8')
      : ''
  const characters = text.trim().length
  if (characters < 200) {
    console.log(`  ${document.file}: skipped (${characters} chars — no text layer, use the Gazette screen)`)
    return
  }

  const body = {
    text,
    filename: kbFilename(document.file),
    country,
    jurisdiction: document.jurisdiction === 'regional' ? 'regional' : 'national',
    docType: document.docType,
    namespace: `${country}-corpus`,
    version: '2026',
    ...(document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
    maxChars: 1500,
    overlapChars: 180,
  }

  if (dryRun) {
    console.log(`  ${document.file}: ${characters.toLocaleString('en-US')} chars → ${kbFilename(document.file)} (dry run)`)
    return
  }

  const started = Date.now()
  const { status, payload } = await post(body)
  const detail = payload.ok
    ? `${payload.chunks ?? 0} chunks (${payload.inserted ?? 0} new, ${payload.unchanged ?? 0} unchanged)`
    : (payload.error ?? 'failed')
  console.log(
    `  ${document.file}: HTTP ${status} · ${detail} · ${Date.now() - started} ms`,
  )
}

async function ingestSamples(): Promise<void> {
  const dir = join(ROOT, 'data/samples')
  if (!existsSync(dir)) return
  for (const file of ['sample_health_data_policy_cm.txt', 'global_best_practice_health_ai.txt']) {
    const path = join(dir, file)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    if (dryRun) {
      console.log(`  ${file}: ${text.trim().length} chars (dry run)`)
      continue
    }
    const { status, payload } = await post({
      text,
      filename: basename(file),
      country: file.startsWith('global') ? 'global' : country,
      jurisdiction: 'national',
      docType: file.startsWith('global') ? 'guidance' : 'policy',
      namespace: 'samples',
      version: 'v1',
    })
    console.log(`  ${file}: HTTP ${status} · ${payload.ok ? `${payload.chunks ?? 0} chunks` : (payload.error ?? 'failed')}`)
  }
}

console.log(`Seeding ${country.toUpperCase()} corpus → ${api}${dryRun ? ' (dry run)' : ''}`)

if (!dryRun) {
  const health = await fetch(`${api}/health`).catch(() => null)
  if (!health?.ok) {
    console.error(`API unreachable at ${api}. Pass --api or set SPS_API_URL.`)
    process.exit(1)
  }
}

for (const document of manifest.documents) {
  if (!document.file) {
    console.log(`  (no local file): skipped — ${document.title}`)
    continue
  }
  if (document.status === 'to_confirm' && !has('include-unverified')) {
    console.log(`  ${document.file}: skipped (status=to_confirm — verify the instrument first)`)
    continue
  }
  if (!matches(document.file)) continue
  await ingestDocument({ ...document, file: document.file })
}

if (!only) await ingestSamples()

console.log('Done. Open /knowledge to inspect the corpus, indexes and retrieval stages.')
