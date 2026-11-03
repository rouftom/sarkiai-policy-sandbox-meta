#!/usr/bin/env bun
/**
 * Seed the knowledge base from a corpus directory.
 *
 *   SPS_API_URL=https://sps-api.example bun run kb:seed            # national corpus + samples
 *   bun run kb:seed -- --dir data/global/standards                 # any corpus with a manifest
 *   bun run kb:seed -- --dir data/samples --rights open-licence    # ad-hoc directory
 *   bun run kb:seed -- --samples-only                              # data/samples only
 *   bun run kb:seed -- --only snd30,sample                         # a subset
 *   bun run kb:seed -- --dry-run                                   # extract only
 *
 * The ingest route is admin-only. Against a deployed API, export
 * `SPS_ADMIN_TOKEN` with an admin session token (the bearer returned by
 * `/v1/auth/login`); without it every document fails with HTTP 401/403.
 *
 * The API chunks and indexes the text itself, in every mode, so this script
 * only has to extract the text and POST it to `/v1/kb/ingest/text`. Re-running
 * is idempotent: chunks are keyed by a content hash, unchanged ones are skipped.
 *
 * PDFs are extracted with `pdftotext` (poppler). Scanned pages with no text
 * layer are skipped and should go through the Gazette screen instead. The script
 * never prints document content.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { isPublishableRights, normalizeCorpusRights, type CorpusRights } from '@sps/shared'

interface ManifestDocument {
  title: string
  /** Absent for entries that are still `to_confirm` placeholders. */
  file?: string
  docType: string
  jurisdiction: string
  status: string
  /** Reuse rights; missing values are treated as `to-confirm` and refused. */
  rights?: CorpusRights
  sourceUrl?: string
  priority?: string
}

interface Manifest {
  country: string
  namespace?: string
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
const samplesOnly = has('samples-only')
const dir = flag('dir')
const rightsFallback = flag('rights')
const only = flag('only')
  ?.split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)

if (rightsFallback && !['official-text', 'open-licence', 'quotation-only', 'to-confirm'].includes(rightsFallback)) {
  console.error(`Unknown --rights '${rightsFallback}' (official-text | open-licence | quotation-only | to-confirm).`)
  process.exit(1)
}

const corpusDir = dir ? resolve(ROOT, dir) : join(ROOT, 'data/country', country)
if (!samplesOnly && !existsSync(corpusDir)) {
  console.error(`Corpus directory ${corpusDir} not found.`)
  process.exit(1)
}

/**
 * A directory without a manifest can still be seeded, but only with an explicit
 * `--rights` for the whole directory: rights never default to publishable.
 */
function adHocManifest(path: string): Manifest {
  const docType = flag('doc-type') ?? 'policy'
  const jurisdiction = flag('jurisdiction') ?? 'national'
  const documents = readdirSync(path)
    .filter((file) => /\.(pdf|txt)$/i.test(file))
    .sort()
    .map((file) => ({
      title: file,
      file,
      docType,
      jurisdiction,
      status: 'present',
      rights: rightsFallback as CorpusRights,
    }))
  return { country: flag('country') ?? country, documents }
}

const manifestPath = join(corpusDir, 'manifest.json')
let manifest: Manifest
if (samplesOnly) {
  manifest = { country, documents: [] }
} else if (existsSync(manifestPath)) {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
} else if (rightsFallback) {
  manifest = adHocManifest(corpusDir)
} else {
  console.error(`No manifest at ${manifestPath} and no --rights: refusing to ingest without a rights status.`)
  console.error('Pass --rights official-text|open-licence for project-authored or licensed material.')
  process.exit(1)
}

const corpusCountry = manifest.country || country

const JURISDICTIONS = ['national', 'regional', 'international'] as const
type Jurisdiction = (typeof JURISDICTIONS)[number]

/** Manifests carry free-form text; only the three API values are accepted. */
function jurisdictionOf(value: string): Jurisdiction {
  return (JURISDICTIONS as readonly string[]).includes(value) ? (value as Jurisdiction) : 'national'
}

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
  const path = join(corpusDir, file)
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

/**
 * Cut a very long text at line breaks into parts of about `limit` characters.
 * The ingest route accepts 2 M characters per request, so the default keeps a
 * document in one part (and therefore one filename) up to 1.5 M characters;
 * splitting is only a guard for genuinely huge compilations.
 */
function splitForUpload(text: string, limit = 1_500_000): string[] {
  if (text.length <= limit * 1.25) return [text]
  const parts: string[] = []
  let rest = text
  while (rest.length > limit * 1.25) {
    let cut = rest.lastIndexOf('\n', limit)
    if (cut < limit * 0.5) cut = limit
    parts.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  parts.push(rest)
  return parts
}

/** The ingest routes are admin-only; pass the operator session token in the environment. */
const token = process.env.SPS_ADMIN_TOKEN?.trim()
let authHintShown = false

/** Headers for every ingest call: the bearer token when one is configured. */
function apiHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function post(body: Record<string, unknown>): Promise<{ status: number; payload: IngestResponse }> {
  const response = await fetch(`${api}/v1/kb/ingest/text`, {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
  })
  return { status: response.status, payload: (await response.json()) as IngestResponse }
}

async function ingestDocument(document: ManifestDocument): Promise<void> {
  if (!document.file) return
  const rights = normalizeCorpusRights(document.rights ?? rightsFallback)
  const filePath = join(corpusDir, document.file)
  const text = document.file.toLowerCase().endsWith('.pdf')
    ? await extractPdf(document.file)
    : existsSync(filePath)
      ? readFileSync(filePath, 'utf8')
      : ''
  const characters = text.trim().length
  if (characters < 200) {
    console.log(`  ${document.file}: skipped (${characters} chars · no text layer, use the Gazette screen)`)
    return
  }

  const parts = splitForUpload(text)
  for (const [index, part] of parts.entries()) {
    const filename = parts.length === 1 ? kbFilename(document.file) : kbFilename(document.file).replace(/\.txt$/, `_${index + 1}of${parts.length}.txt`)
    const body = {
      text: part,
      filename,
      country: corpusCountry,
      jurisdiction: jurisdictionOf(document.jurisdiction),
      docType: document.docType,
      rights,
      namespace: manifest.namespace ?? `${corpusCountry}-corpus`,
      version: '2026',
      ...(document.sourceUrl ? { sourceUrl: document.sourceUrl } : {}),
      // Long compilations use larger chunks: the per-document chunk ceiling and the
      // request duration both stay bounded.
      ...(text.length > 800_000 ? { maxChars: 3000, overlapChars: 150 } : { maxChars: 1500, overlapChars: 180 }),
    }

    if (dryRun) {
      console.log(`  ${filename}: ${part.trim().length.toLocaleString('en-US')} chars (dry run)`)
      continue
    }

    const started = Date.now()
    const { status, payload } = await post(body)
    const detail = payload.ok
      ? `${payload.chunks ?? 0} chunks (${payload.inserted ?? 0} new, ${payload.unchanged ?? 0} unchanged)`
      : (payload.error ?? 'failed')
    console.log(`  ${filename}: HTTP ${status} · ${detail} · ${Date.now() - started} ms`)
    if ((status === 401 || status === 403) && !authHintShown) {
      authHintShown = true
      console.log('  hint: ingestion is admin-only; export SPS_ADMIN_TOKEN with an admin session before re-running.')
    }
  }
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
      rights: 'open-licence',
      namespace: 'samples',
      version: 'v1',
    })
    console.log(`  ${file}: HTTP ${status} · ${payload.ok ? `${payload.chunks ?? 0} chunks` : (payload.error ?? 'failed')}`)
  }
}

console.log(`Seeding ${corpusCountry.toUpperCase()} corpus → ${api}${dryRun ? ' (dry run)' : ''}`)

if (!dryRun) {
  const health = await fetch(`${api}/health`).catch(() => null)
  if (!health?.ok) {
    console.error(`API unreachable at ${api}. Pass --api or set SPS_API_URL.`)
    process.exit(1)
  }
}

if (!samplesOnly) {
  for (const document of manifest.documents) {
    if (!document.file) {
      console.log(`  (no local file): skipped · ${document.title}`)
      continue
    }
    if (document.status === 'to_confirm' && !has('include-unverified')) {
      console.log(`  ${document.file}: skipped (status=to_confirm · verify the instrument first)`)
      continue
    }
    const rights = normalizeCorpusRights(document.rights ?? rightsFallback)
    if (!isPublishableRights(rights)) {
      console.log(`  ${document.file}: skipped (rights=${rights} · full text may not be ingested)`)
      continue
    }
    if (!matches(document.file)) continue
    await ingestDocument(document)
  }
}

if (samplesOnly || (!only && !dir)) await ingestSamples()

console.log('Done. Open /knowledge to inspect the corpus, indexes and retrieval stages.')
