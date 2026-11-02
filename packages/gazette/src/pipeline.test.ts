import { describe, expect, test } from 'bun:test'
import { PNG } from 'pngjs'
import type { LanguageModel } from 'ai'
import type { InkMask } from './layout.js'
import { analyzeGazettePage, mergeDetections, plausibleArtefacts, toKbChunks } from './pipeline.js'
import { mapSamBoxes, parseSamBoxes, samText } from './sam.js'
import {
  buildTranscriptionPrompt,
  cleanTranscription,
  extractArticleNumber,
  looksLikeHeading,
} from './transcribe.js'

function pagePng(mask: InkMask): Uint8Array {
  const png = new PNG({ width: mask.width, height: mask.height })
  for (let i = 0; i < mask.data.length; i += 1) {
    const value = mask.data[i] ? 24 : 250
    const p = i * 4
    png.data[p] = value
    png.data[p + 1] = value
    png.data[p + 2] = value
    png.data[p + 3] = 255
  }
  return new Uint8Array(PNG.sync.write(png))
}

function gazetteMask(): InkMask {
  const width = 1000
  const height = 1400
  const mask: InkMask = { width, height, data: new Uint8Array(width * height) }
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) mask.data[row * width + col] = 1
    }
  }
  fill(180, 40, 640, 40)
  fill(60, 200, 400, 56)
  fill(60, 300, 400, 76)
  fill(540, 200, 400, 72)
  fill(540, 320, 400, 72)
  return mask
}

describe('SAM 3.1 wire format', () => {
  test('parses boxes and confidence from special-token text', () => {
    const line =
      '<0f>0<|box;x1=50;y1=50;x2=250;y2=250;w=500;h=500;c=0.96|><|mask;x=0;y=0;c=0.96;data=12,12,~abc|>,1<|box;x1=10;y1=10;x2=20;y2=20;w=500;h=500|><|mask;x=0;y=0;data=4,4,~def|>'
    const records = parseSamBoxes(line)
    expect(records).toHaveLength(2)
    expect(records[0]?.confidence).toBe(0.96)
    expect(records[1]?.confidence).toBeUndefined()
  })

  test('scales SAM frame coordinates to the page', () => {
    const detections = mapSamBoxes(
      [{ x1: 50, y1: 50, x2: 250, y2: 250, width: 500, height: 500 }],
      'stamp',
      { width: 1000, height: 1000 },
    )
    expect(detections[0]?.bbox).toEqual({ x: 100, y: 100, width: 400, height: 400 })
  })

  test('drops tiny, page-sized and low-confidence detections', () => {
    const detections = mapSamBoxes(
      [
        { x1: 0, y1: 0, x2: 2, y2: 2, width: 1000, height: 1000 }, // tiny
        { x1: 0, y1: 0, x2: 1000, y2: 1000, width: 1000, height: 1000 }, // whole page
        { x1: 10, y1: 10, x2: 200, y2: 200, width: 1000, height: 1000, confidence: 0.05 },
      ],
      'stamp',
      { width: 1000, height: 1000 },
      { minConfidence: 0.2 },
    )
    expect(detections).toEqual([])
  })

  test('reads done events once, not done plus deltas', () => {
    const stream = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"<0f>0<|box;x1=1;y1=1;x2=9;y2=9;w=10;h=10|>"}',
      'event: response.output_text.done',
      'data: {"type":"response.output_text.done","text":"<0f>0<|box;x1=1;y1=1;x2=9;y2=9;w=10;h=10|>"}',
    ].join('\n')
    expect(samText(stream)).toMatch(/^<0f>0<\|box;/)
    expect(parseSamBoxes(samText(stream))).toHaveLength(1)
  })
})

describe('transcription helpers', () => {
  test('table zones ask for Markdown and forbid commentary', () => {
    const prompt = buildTranscriptionPrompt({
      kind: 'table',
      page: 3,
      column: 2,
      columns: 2,
      filename: 'jo.pdf',
    })
    expect(prompt).toContain('GitHub-flavoured Markdown')
    expect(prompt).toContain('Page 3, column 2 of 2')
  })

  test('a blank answer is normalised and a fenced table is unwrapped', () => {
    expect(cleanTranscription('[NO TEXT]')).toEqual({ text: '', blank: true })
    expect(cleanTranscription('```markdown\n| a | b |\n|---|---|\n| 1 | 2 |\n```').text).toBe(
      '| a | b |\n|---|---|\n| 1 | 2 |',
    )
  })

  test('article numbers survive the forms a gazette prints', () => {
    expect(extractArticleNumber('ARTICLE 12 · Le traitement…')).toBe('ARTICLE 12')
    expect(extractArticleNumber('Article 1er · Le présent décret…')).toBe('ARTICLE 1er')
    expect(extractArticleNumber('Art. 9')).toBe('ARTICLE 9')
    expect(extractArticleNumber('article 12 bis')).toBe('ARTICLE 12 bis')
    expect(extractArticleNumber('no article here')).toBeUndefined()
  })

  test('recognises a decree heading', () => {
    expect(looksLikeHeading('DÉCRET N° 2026/341 DU 08 OCTOBRE 2026')).toBe(true)
    expect(looksLikeHeading('Le responsable du traitement notifie…')).toBe(false)
  })
})

describe('gazette pipeline · with injected model', () => {
  test('segments, transcribes, tags artefacts and keeps provenance', async () => {
    const mask = gazetteMask()
    const bytes = pagePng(mask)

    const tableBox = { x: 540, y: 200, width: 400, height: 72 }
    const stampBox = { x: 180, y: 40, width: 120, height: 40 }

    const page = await analyzeGazettePage({
      bytes,
      filename: 'jo_2026_special.pdf',
      page: 3,
      sourceUrl: 'https://example.gov.cm/jo/2026-special.pdf',
      model: {} as LanguageModel,
      modelLabel: 'muse-spark-1.3',
      provider: { mode: 'cloud', servedBy: 'Meta', residency: 'cloud', openWeights: false, models: { reasoning: 'muse-spark-1.3', vision: 'muse-spark-1.3' } },
      pricing: { inputPerMTok: 1.25, outputPerMTok: 4.25, perSegmentationCall: 0.0025 },
      deps: {
        segment: async (_phrase, label) => {
          if (label === 'table') return [{ label, bbox: tableBox, confidence: 0.9, frame: 0 }]
          if (label === 'stamp') return [{ label, bbox: stampBox, confidence: 0.8, frame: 0 }]
          return []
        },
        transcribe: async (input) => {
          if (input.kind === 'table') {
            return {
              text: '| Incident | Autorité | Délai |\n|---|---|---|\n| Violation | APD | 72 heures |',
              inputTokens: 120,
              outputTokens: 80,
              durationMs: 5,
              finishReason: 'stop',
              blank: false,
            }
          }
          return {
            text: 'ARTICLE 2 · Le responsable du traitement notifie toute violation dans un délai de soixante-douze heures.',
            inputTokens: 120,
            outputTokens: 80,
            durationMs: 5,
            finishReason: 'stop',
            blank: false,
          }
        },
      },
    })

    expect(page.image.width).toBe(1000)
    expect(page.regions.length).toBeGreaterThanOrEqual(5)
    expect(page.artifacts.map((artifact) => artifact.label).sort()).toEqual(['stamp', 'table'])

    const table = page.regions.find((region) => region.kind === 'table')
    expect(table).toBeTruthy()
    expect(table!.text).toContain('| Incident |')
    expect(table!.artifacts.some((id) => id.includes('table'))).toBe(true)

    const stamped = page.regions.find((region) => region.bbox.y < 120)
    expect(stamped?.artifacts.some((id) => id.includes('stamp'))).toBe(true)

    const article = page.regions.find((region) => region.articleNumber)
    expect(article?.articleNumber).toBe('ARTICLE 2')
    expect(article?.provenance.page).toBe(3)
    expect(article?.provenance.href).toBe('https://example.gov.cm/jo/2026-special.pdf#page=3')
    expect(article?.provenance.bbox).toEqual(article!.bbox)

    // 4 SAM calls + one transcription per zone, priced from real list prices.
    expect(page.usage.segmentationCalls).toBe(4)
    expect(page.usage.transcriptionCalls).toBe(page.regions.length)
    expect(page.usage.costUsd).toBeCloseTo(0.01245, 5)

    const chunks = toKbChunks(page, {
      country: 'cm',
      jurisdiction: 'national',
      docType: 'regulation',
      namespace: 'gazette',
    })
    expect(chunks.length).toBe(page.regions.length)
    expect(chunks[0]?.metadata.provenance.documentId).toBe(page.documentId)
    expect(chunks.every((chunk) => chunk.sourceUrl?.includes('#page=3'))).toBe(true)
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index))
  })

  test('a failed zone is reported, not silently dropped', async () => {
    const page = await analyzeGazettePage({
      bytes: pagePng(gazetteMask()),
      filename: 'jo.pdf',
      model: {} as LanguageModel,
      modelLabel: 'muse-spark-1.3',
      provider: { mode: 'cloud', servedBy: 'Meta', residency: 'cloud', openWeights: false, models: { reasoning: 'muse-spark-1.3', vision: 'muse-spark-1.3' } },
      deps: {
        transcribe: async () => {
          throw new Error('provider timeout')
        },
      },
    })

    expect(page.regions.every((region) => region.blank)).toBe(true)
    expect(page.warnings.some((warning) => warning.includes('provider timeout'))).toBe(true)
    expect(page.warnings.some((warning) => warning.includes('Transcription failed'))).toBe(true)
    expect(toKbChunks(page, { country: 'cm', jurisdiction: 'national', docType: 'regulation' })).toEqual([])
  })
})

describe('artefact detections', () => {
  const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height })

  test('the same object found by two phrases is counted once', () => {
    const merged = mergeDetections([
      { label: 'stamp', bbox: box(700, 1100, 320, 160), confidence: 0.7, frame: 0 },
      { label: 'stamp', bbox: box(702, 1098, 318, 162), confidence: 0.9, frame: 0 },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.confidence).toBe(0.9)
  })

  test('a rectangle that is the frame of a table is not a stamp', () => {
    const merged = mergeDetections([
      { label: 'table', bbox: box(100, 300, 1000, 400), confidence: 0.87, frame: 0 },
      { label: 'stamp', bbox: box(99, 300, 1002, 401), confidence: 0.71, frame: 0 },
    ])
    expect(merged.map((detection) => detection.label)).toEqual(['table'])
  })

  test('a page-sized rectangle is not a stamp, a real stamp and a table are kept', () => {
    const page = { width: 1240, height: 1754 }
    const { kept, dropped } = plausibleArtefacts(
      [
        { label: 'stamp', bbox: box(20, 20, 1200, 1700), confidence: 0.8, frame: 0 },
        { label: 'stamp', bbox: box(60, 400, 1100, 520), confidence: 0.6, frame: 0 },
        { label: 'stamp', bbox: box(780, 1500, 320, 160), confidence: 0.7, frame: 0 },
        { label: 'table', bbox: box(100, 300, 1000, 600), confidence: 0.87, frame: 0 },
      ],
      page,
    )
    expect(dropped).toBe(2)
    expect(kept.map((detection) => detection.label).sort()).toEqual(['stamp', 'table'])
  })

  test('an isolated stamp is kept', () => {
    const merged = mergeDetections([
      { label: 'table', bbox: box(100, 300, 1000, 400), confidence: 0.87, frame: 0 },
      { label: 'stamp', bbox: box(780, 1100, 320, 160), confidence: 0.68, frame: 0 },
    ])
    expect(merged.map((detection) => detection.label).sort()).toEqual(['stamp', 'table'])
  })
})

