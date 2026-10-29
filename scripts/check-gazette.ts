#!/usr/bin/env bun
/**
 * N3 smoke check · runs the synthetic gazette page through the real pipeline:
 * projection-profile layout, SAM 3.1 artefacts, Muse Spark vision transcription.
 *
 *   bun run check:gazette                 # cloud, the demo page
 *   bun run check:gazette path/to/page.png
 *
 * It prints the zones, artefacts, transcription snippets, token usage and cost,
 * never the API key, and exits non-zero when the page yields no readable text.
 * One page costs a few cents at list price.
 */

import { readFileSync } from 'node:fs'
import { createModel, providerApiKey, resolveProvider } from '@sps/agents'
import {
  analyzeGazettePage,
  META_GAZETTE_PRICING,
  SamClient,
  toKbChunks,
} from '@sps/gazette'

const path = process.argv[2] ?? 'apps/web/public/samples/gazette-p1.png'
const provider = resolveProvider(process.env, 'cloud')
const secret = providerApiKey(provider)
const redact = (value: string) => (secret && secret.length >= 12 ? value.split(secret).join('[REDACTED]') : value)

if (!provider.ready) {
  console.error(`cloud mode is not configured: ${provider.reason ?? 'missing key'}`)
  process.exit(1)
}

const bytes = new Uint8Array(readFileSync(path))
const model = createModel({ provider })
const sam = provider.models.segmentation
  ? new SamClient({
      baseUrl: provider.baseURL,
      apiKey: secret,
      model: provider.models.segmentation,
    })
  : undefined

console.log(`page      : ${path}`)
console.log(`provider  : ${provider.mode} · ${provider.servedBy}`)
console.log(`vision    : ${provider.models.vision}`)
console.log(`sam       : ${provider.models.segmentation ?? 'disabled'}`)
console.log('')

const started = Date.now()
try {
  const page = await analyzeGazettePage({
    bytes,
    filename: path.split('/').pop() ?? 'gazette.png',
    page: 1,
    sourceUrl: 'https://example.gov.cm/journal-officiel/2026/special-47.pdf',
    model,
    modelLabel: provider.models.vision,
    provider: {
      mode: provider.mode,
      servedBy: provider.servedBy,
      residency: provider.residency,
      openWeights: provider.openWeights,
      models: provider.models,
    },
    sam,
    maxZones: 24,
    concurrency: 4,
    pricing: META_GAZETTE_PRICING,
  })

  console.log(`size      : ${page.image.width}×${page.image.height} (${page.image.mime})`)
  console.log(`threshold : ${page.layout.threshold} · ink ${(page.layout.inkRatio * 100).toFixed(1)}%`)
  console.log(`columns   : ${page.layout.columns.length}`)
  console.log(`regions   : ${page.regions.length} · artefacts: ${page.artifacts.length}`)
  console.log('')

  for (const region of page.regions) {
    const box = `${region.bbox.x},${region.bbox.y} ${region.bbox.width}×${region.bbox.height}`
    const tags = [
      region.articleNumber ?? '',
      region.kind === 'table' ? 'TABLE' : '',
      region.artifacts.length ? `over:${region.artifacts.join(',')}` : '',
      region.blank ? 'BLANK' : '',
    ]
      .filter(Boolean)
      .join(' · ')
    console.log(
      `${region.id.padEnd(12)} c${region.column} ${String(region.characters).padStart(4)}ch ${region.durationMs}ms  [${box}] ${tags}`,
    )
    console.log(`  ${redact(region.text.replace(/\s+/g, ' ').slice(0, 160))}`)
  }

  if (page.artifacts.length) {
    console.log('')
    for (const artifact of page.artifacts) {
      const box = `${artifact.bbox.x},${artifact.bbox.y} ${artifact.bbox.width}×${artifact.bbox.height}`
      console.log(
        `artefact  : ${artifact.label.padEnd(10)} [${box}]${artifact.confidence !== undefined ? ` c=${artifact.confidence.toFixed(3)}` : ''}`,
      )
    }
  }

  if (page.warnings.length) {
    console.log('')
    for (const warning of page.warnings) console.log(`warning   : ${warning}`)
  }

  const chunks = toKbChunks(page, {
    country: 'cm',
    jurisdiction: 'national',
    docType: 'regulation',
    namespace: 'gazette',
    version: '2026-10-12',
  })

  console.log('')
  console.log(
    `tokens    : in ${page.usage.inputTokens} · out ${page.usage.outputTokens} (${page.usage.transcriptionCalls} calls)`,
  )
  console.log(`sam calls : ${page.usage.segmentationCalls}`)
  console.log(`est. cost : $${page.usage.costUsd.toFixed(5)}`)
  console.log(`chunks    : ${chunks.length} ready for the KB`)
  console.log(`wall      : ${Date.now() - started} ms`)

  const readable = page.regions.filter((region) => !region.blank && region.text.trim().length >= 20)
  if (readable.length === 0) {
    console.error('\nFAIL: no readable text was transcribed.')
    process.exit(1)
  }
  if (!page.artifacts.some((artifact) => artifact.label === 'stamp')) {
    console.error('\nFAIL: SAM did not find the stamp on the page.')
    process.exit(1)
  }
} catch (error) {
  console.error(`\nFAIL: ${redact((error as Error).message)}`)
  process.exit(1)
}
