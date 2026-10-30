/**
 * Scanned-gazette ingestion pipeline.
 *
 *   page image → grayscale → ink mask → XY-cut layout
 *      ├─ text zones   → Muse Spark vision, one crop per zone
 *      └─ visual zones → SAM 3.1 (stamp, signature, table)
 *   → regions with page/column/bbox provenance → KB chunks
 *
 * Every step is observable: the console draws the same boxes the pipeline used,
 * so a human can reject a bad cut before the text reaches the knowledge base.
 */

import { createHash } from 'node:crypto'
import type { LanguageModel } from 'ai'
import type { DocType, Jurisdiction, KbChunk, ProviderDescriptor, Taxonomy } from '@sps/shared'
import { decodeGray, detectMime, toDataUrl } from './image.js'
import {
  columnOf,
  coverage,
  inkMask,
  otsuThreshold,
  overlapArea,
  pageLayout,
  type BBox,
} from './layout.js'
import type { SamClient, SamDetection } from './sam.js'
import {
  extractArticleNumber,
  looksLikeHeading,
  transcribeRegion,
  type TranscribeInput,
  type TranscribeResult,
  type ZoneKind,
} from './transcribe.js'

export interface GazettePricing {
  inputPerMTok: number
  outputPerMTok: number
  perSegmentationCall: number
}

export interface GazetteProvenance {
  documentId: string
  filename: string
  page: number
  regionId: string
  column: number
  columns: number
  bbox: BBox
  pageWidth: number
  pageHeight: number
  imageSha256: string
  /** Original public source, when the caller has one. */
  sourceUrl?: string
  /** Deep link that opens the page at the right place (PDF fragment or console). */
  href: string
  /** How the geometry was obtained. */
  geometry: 'projection-profile'
  /** Model that produced the text. */
  transcriptionModel: string
}

export interface GazetteRegion {
  id: string
  kind: ZoneKind
  column: number
  bbox: BBox
  text: string
  articleNumber?: string
  heading: boolean
  characters: number
  blank: boolean
  finishReason?: string
  durationMs: number
  /** True when the zone is an artefact (a stamp, a signature), not prose. */
  skipped?: boolean
  /** Visual artefacts overlapping this region (stamp, signature, table). */
  artifacts: string[]
  provenance: GazetteProvenance
  error?: string
}

export interface GazetteArtifact {
  id: string
  label: 'stamp' | 'signature' | 'table'
  bbox: BBox
  confidence?: number
  source: 'sam-3.1'
}

export interface GazetteUsage {
  inputTokens: number
  outputTokens: number
  transcriptionCalls: number
  segmentationCalls: number
  costUsd: number
}

export interface GazettePage {
  documentId: string
  filename: string
  page: number
  image: { width: number; height: number; mime: string; sha256: string }
  layout: { threshold: number; inkRatio: number; columns: BBox[]; regions: BBox[] }
  regions: GazetteRegion[]
  artifacts: GazetteArtifact[]
  usage: GazetteUsage
  warnings: string[]
  model: string
  provider: Pick<ProviderDescriptor, 'mode' | 'servedBy' | 'residency' | 'openWeights' | 'models'>
  startedAt: string
  durationMs: number
}

export interface GazetteDeps {
  /** Inject a fake in tests; defaults to the vision model. */
  transcribe?: (input: TranscribeInput) => Promise<TranscribeResult>
  /** Inject a fake in tests; defaults to `sam.segment`. */
  segment?: (phrase: string, label: string, signal?: AbortSignal) => Promise<SamDetection[]>
}

export interface AnalyzeGazetteInput {
  bytes: Uint8Array
  mime?: string
  filename: string
  page?: number
  documentId?: string
  sourceUrl?: string
  model: LanguageModel
  modelLabel: string
  provider: GazettePage['provider']
  sam?: SamClient
  maxZones?: number
  concurrency?: number
  maxOutputTokens?: number
  reasoningEffort?: TranscribeInput['reasoningEffort']
  pricing?: GazettePricing
  signal?: AbortSignal
  deps?: GazetteDeps
}

/**
 * SAM 3.1 answers to what an object looks like, not to what it is called: on the
 * hackathon sample pages "stamp", "seal" and "handwritten signature" found nothing,
 * while "rectangle", "circle", "handwritten scribble" and "printed table with rows
 * and columns" found the objects. Each label is therefore asked by its appearance.
 */
const ARTIFACT_PROMPTS: Array<{ label: GazetteArtifact['label']; phrase: string }> = [
  { label: 'table', phrase: 'printed table with rows and columns' },
  { label: 'stamp', phrase: 'rectangle' },
  { label: 'stamp', phrase: 'circle' },
  { label: 'signature', phrase: 'handwritten scribble' },
]

/**
 * A stamp or a signature covers a few percent of a page. "rectangle" also matches
 * page borders and framed paragraphs; such a box would mark a text zone as an
 * artefact and skip its transcription, so a law article would silently leave the
 * corpus. Stamps and signatures above this share of the page are dropped.
 */
export const ARTEFACT_MAX_PAGE_RATIO = 0.12

export function plausibleArtefacts(
  detections: SamDetection[],
  image: { width: number; height: number },
): { kept: SamDetection[]; dropped: number } {
  const limit = image.width * image.height * ARTEFACT_MAX_PAGE_RATIO
  const kept = detections.filter((detection) => detection.label === 'table' || area(detection.bbox) <= limit)
  return { kept, dropped: detections.length - kept.length }
}

function iou(a: BBox, b: BBox): number {
  const overlap = overlapArea(a, b)
  return overlap > 0 ? overlap / (area(a) + area(b) - overlap) : 0
}

/**
 * Several phrases can find the same object: keep one box per object, highest
 * confidence first. A stamp inside a table is the table's ruled frame, not a stamp.
 */
export function mergeDetections(detections: SamDetection[]): SamDetection[] {
  const sorted = [...detections].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
  const kept: SamDetection[] = []
  for (const detection of sorted) {
    if (!kept.some((other) => other.label === detection.label && iou(other.bbox, detection.bbox) >= 0.5)) kept.push(detection)
  }
  const tables = kept.filter((detection) => detection.label === 'table')
  return kept.filter(
    (detection) => detection.label === 'table' || !tables.some((table) => coverage(detection.bbox, table.bbox) >= 0.6),
  )
}

/**
 * Meta Model API list prices at the time of the hackathon:
 * muse-spark-1.3 $1.25/M in, $4.25/M out; SAM 3.1 $2.50 per 1,000 images.
 */
export const META_GAZETTE_PRICING: GazettePricing = {
  inputPerMTok: 1.25,
  outputPerMTok: 4.25,
  perSegmentationCall: 0.0025,
}

const DEFAULT_PRICING: GazettePricing = { inputPerMTok: 0, outputPerMTok: 0, perSegmentationCall: 0 }

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await fn(items[index]!, index)
    }
  })
  await Promise.all(workers)
  return results
}

function shortHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Crop geometry is page-absolute; a merged leaf keeps the union box. */
export function regionId(page: number, column: number, index: number): string {
  return `p${page}-c${column}-z${index}`
}

function artefactsFor(box: BBox, artifacts: GazetteArtifact[]): string[] {
  return artifacts
    .filter((artifact) => overlapArea(box, artifact.bbox) >= Math.min(area(box), area(artifact.bbox)) * 0.15)
    .map((artifact) => artifact.id)
}

function area(box: BBox): number {
  return box.width * box.height
}

function isTableZone(box: BBox, artifacts: GazetteArtifact[]): boolean {
  return artifacts.some((artifact) => artifact.label === 'table' && coverage(box, artifact.bbox) >= 0.35)
}

/** A stamp or signature is an object to display, not prose to transcribe. */
function isArtefactZone(box: BBox, artifacts: GazetteArtifact[]): boolean {
  return artifacts.some(
    (artifact) =>
      (artifact.label === 'stamp' || artifact.label === 'signature') &&
      coverage(box, artifact.bbox) >= 0.45,
  )
}

export async function analyzeGazettePage(input: AnalyzeGazetteInput): Promise<GazettePage> {
  const started = Date.now()
  const page = input.page ?? 1
  const mime = detectMime(input.bytes, input.mime)
  const image = decodeGray(input.bytes, mime)
  const threshold = otsuThreshold(image.data)
  const mask = inkMask(image, threshold)
  const layout = pageLayout(mask, { threshold, maxZones: input.maxZones ?? 24 })

  const sha256 = shortHash(input.bytes)
  const documentId = input.documentId ?? sha256.slice(0, 16)
  const warnings: string[] = []
  let segmentationCalls = 0

  if (layout.regions.length === 0) {
    warnings.push('No ink was found on the page. Check the scan or the threshold.')
  }
  if (layout.regions.length >= (input.maxZones ?? 24)) {
    warnings.push(
      `Zone budget reached (${input.maxZones ?? 24}); close neighbours were merged. Raise maxZones for dense pages.`,
    )
  }

  // ── 1. Visual artefacts (SAM 3.1, cloud only) ─────────────────────────────
  let artifacts: GazetteArtifact[] = []
  const segment =
    input.deps?.segment ??
    (input.sam
      ? (phrase: string, label: string, signal?: AbortSignal) =>
          input.sam!.segment(toDataUrl(input.bytes, mime), image, { phrase, label, signal })
      : undefined)

  if (segment) {
    const detections = await mapLimit(ARTIFACT_PROMPTS, 3, async (prompt) => {
      try {
        segmentationCalls += 1
        return await segment(prompt.phrase, prompt.label, input.signal)
      } catch (error) {
        warnings.push(`SAM (${prompt.label}) failed: ${(error as Error).message}`)
        return [] as SamDetection[]
      }
    })
    const plausible = plausibleArtefacts(detections.flat(), image)
    if (plausible.dropped > 0) {
      warnings.push(
        `${plausible.dropped} stamp or signature box(es) larger than ${Math.round(ARTEFACT_MAX_PAGE_RATIO * 100)}% of the page ignored (page border or framed text).`,
      )
    }
    artifacts = mergeDetections(plausible.kept).map((detection, index) => ({
      id: `a${index + 1}-${detection.label}`,
      label: detection.label as GazetteArtifact['label'],
      bbox: detection.bbox,
      ...(detection.confidence !== undefined ? { confidence: detection.confidence } : {}),
      source: 'sam-3.1' as const,
    }))
  }

  // ── 2. Per-zone transcription ─────────────────────────────────────────────
  const transcribe = input.deps?.transcribe ?? transcribeRegion
  const zones = layout.regions.map((box, index) => {
    const column = columnOf(box, layout.columns)
    const zoneArtifacts = artefactsFor(box, artifacts)
    return {
      box,
      index,
      column,
      artifacts: zoneArtifacts,
      kind: (isTableZone(box, artifacts) ? 'table' : 'text') as ZoneKind,
      skipped: isArtefactZone(box, artifacts),
    }
  })

  const results = await mapLimit(zones, input.concurrency ?? 4, async (zone) => {
    const id = regionId(page, zone.column, zone.index + 1)
    if (zone.skipped) {
      return {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
        finishReason: 'skipped',
        blank: false,
        skipped: true,
      }
    }
    try {
      return await transcribe({
        model: input.model,
        image,
        bbox: zone.box,
        kind: zone.kind,
        page,
        column: zone.column,
        columns: Math.max(1, layout.columns.length),
        filename: input.filename,
        maxOutputTokens: input.maxOutputTokens ?? 4096,
        ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
        providerName: input.provider.mode === 'cloud' ? 'meta' : undefined,
        signal: input.signal,
      })
    } catch (error) {
      return {
        text: '',
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
        finishReason: 'error',
        blank: true,
        error: `${id}: ${(error as Error).message}`,
      } satisfies TranscribeResult & { error: string }
    }
  })

  const regions: GazetteRegion[] = zones.map((zone, index) => {
    const result = results[index]!
    const id = regionId(page, zone.column, zone.index + 1)
    const error = 'error' in result ? (result as TranscribeResult & { error: string }).error : undefined
    const skipped = 'skipped' in result && result.skipped === true
    if (error) warnings.push(`Transcription failed for ${id}: ${error.slice(0, 180)}`)
    else if (!skipped && result.finishReason === 'length') warnings.push(`Output ceiling reached for ${id}; text may be truncated.`)
    else if (!skipped && result.blank) warnings.push(`No readable text in ${id}.`)

    const sourceUrl = input.sourceUrl
    const articleNumber = extractArticleNumber(result.text)
    return {
      id,
      kind: zone.kind,
      column: zone.column,
      bbox: zone.box,
      text: result.text,
      ...(articleNumber ? { articleNumber } : {}),
      heading: looksLikeHeading(result.text),
      characters: result.text.length,
      blank: result.blank,
      finishReason: result.finishReason,
      durationMs: result.durationMs,
      ...(skipped ? { skipped: true } : {}),
      artifacts: zone.artifacts,
      provenance: {
        documentId,
        filename: input.filename,
        page,
        regionId: id,
        column: zone.column,
        columns: Math.max(1, layout.columns.length),
        bbox: zone.box,
        pageWidth: image.width,
        pageHeight: image.height,
        imageSha256: sha256,
        ...(sourceUrl ? { sourceUrl } : {}),
        href: sourceUrl
          ? `${sourceUrl.split('#')[0]}#page=${page}`
          : `gazette://${documentId}/page/${page}/${id}`,
        geometry: 'projection-profile',
        transcriptionModel: input.modelLabel,
      },
      ...(error ? { error } : {}),
    }
  })

  const inputTokens = results.reduce((sum, result) => sum + result.inputTokens, 0)
  const outputTokens = results.reduce((sum, result) => sum + result.outputTokens, 0)
  const pricing = input.pricing ?? DEFAULT_PRICING
  const costUsd =
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok +
    segmentationCalls * pricing.perSegmentationCall

  return {
    documentId,
    filename: input.filename,
    page,
    image: { width: image.width, height: image.height, mime, sha256 },
    layout: {
      threshold,
      inkRatio: layout.inkRatio,
      columns: layout.columns,
      regions: layout.regions,
    },
    regions,
    artifacts,
    usage: {
      inputTokens,
      outputTokens,
      transcriptionCalls: results.filter((result) => !('skipped' in result && result.skipped === true)).length,
      segmentationCalls,
      costUsd,
    },
    warnings,
    model: input.modelLabel,
    provider: input.provider,
    startedAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
  }
}

export interface GazetteChunk extends KbChunk {
  metadata: {
    provenance: GazetteProvenance
    kind: ZoneKind
    artifacts: string[]
  }
}

export interface GazetteTaxonomy extends Taxonomy {
  namespace?: string
}

/** Ready-to-ingest chunks: one per transcribed zone, provenance intact. */
export function toKbChunks(page: GazettePage, taxonomy: GazetteTaxonomy): GazetteChunk[] {
  return page.regions
    .filter((region) => !region.blank && region.text.trim().length > 0)
    .map((region, index) => ({
      id: `${page.documentId}:${region.id}`,
      chunkIndex: index,
      filename: page.filename,
      text: region.text.trim(),
      headingPath: region.heading
        ? `PAGE ${page.page} > COLUMN ${region.column}`
        : `PAGE ${page.page} > COLUMN ${region.column} > ${region.articleNumber ?? region.id}`,
      ...(region.articleNumber ? { articleNumber: region.articleNumber } : {}),
      unitType: 'gazette_zone',
      sourceUrl: region.provenance.href,
      country: taxonomy.country,
      jurisdiction: taxonomy.jurisdiction as Jurisdiction,
      docType: taxonomy.docType as DocType,
      ...(taxonomy.pillar ? { pillar: taxonomy.pillar } : {}),
      ...(taxonomy.namespace ? { namespace: taxonomy.namespace } : {}),
      ...(taxonomy.version ? { version: taxonomy.version } : {}),
      isActive: true,
      metadata: {
        provenance: region.provenance,
        kind: region.kind,
        artifacts: region.artifacts,
      },
    }))
}
