/**
 * SAM 3.1 client for scanned-page artefacts.
 *
 * Text blocks are found by projection profiles, but stamps, signatures and
 * tables are visual objects: a stamp has no rectangular whitespace around it and
 * a table's rules look like body text to a histogram. SAM 3.1 answers "where is
 * the stamp?" in pixels, and the page overlay shows the answer.
 *
 * SAM runs on the Responses API and streams special-token text:
 *   <0f>0<|box;x1=130;y1=80;x2=270;y2=220;w=400;h=300;c=0.96|><|mask;...|>
 * We keep the boxes (and confidence) and discard the mask payload: the console
 * highlights artefacts, it does not composite them.
 */

import type { BBox } from './layout.js'

export interface SamOptions {
  /** Model API root, e.g. https://api.meta.ai/v1 */
  baseUrl: string
  apiKey: string
  /** Extra headers, e.g. the egress relay secret. */
  headers?: Record<string, string>
  model?: string
  fetchImpl?: typeof fetch
}

export interface SamDetection {
  label: string
  bbox: BBox
  confidence?: number
  /** Frame the record belongs to (0 for stills). */
  frame: number
}

export interface SamRequestOptions {
  /** Noun phrase naming one concrete object ("official stamp"). */
  phrase: string
  /** Label recorded in the page result. */
  label: string
  maxBoxes?: number
  signal?: AbortSignal
}

interface SamRecord {
  x1: number
  y1: number
  x2: number
  y2: number
  width: number
  height: number
  confidence?: number
}

const BOX =
  /<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)(?:;c=([0-9.]+))?\|>/g

/**
 * Parse every box token in a SAM output line. Exposed for tests: the wire format
 * is the contract, and a regex change must fail a test rather than the demo.
 */
export function parseSamBoxes(output: string): SamRecord[] {
  const records: SamRecord[] = []
  for (const match of output.matchAll(BOX)) {
    const [, x1, y1, x2, y2, width, height, confidence] = match
    if (!x1 || !y1 || !x2 || !y2 || !width || !height) continue
    records.push({
      x1: Number(x1),
      y1: Number(y1),
      x2: Number(x2),
      y2: Number(y2),
      width: Number(width),
      height: Number(height),
      ...(confidence ? { confidence: Number(confidence) } : {}),
    })
  }
  return records
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Turn wire records into page-space boxes. SAM reports coordinates against its
 * own `w`/`h` frame, which is usually the source image but is not contractual.
 */
export function mapSamBoxes(
  records: SamRecord[],
  label: string,
  image: { width: number; height: number },
  options: { minArea?: number; maxAreaRatio?: number; minConfidence?: number } = {},
): SamDetection[] {
  const minArea = options.minArea ?? 400
  const maxAreaRatio = options.maxAreaRatio ?? 0.9
  const pageArea = image.width * image.height
  const seen = new Set<string>()
  const detections: SamDetection[] = []

  for (const record of records) {
    if (record.width <= 0 || record.height <= 0) continue
    if (options.minConfidence !== undefined && (record.confidence ?? 1) < options.minConfidence) continue
    const sx = image.width / record.width
    const sy = image.height / record.height
    const x1 = clamp(Math.round(Math.min(record.x1, record.x2) * sx), 0, image.width)
    const x2 = clamp(Math.round(Math.max(record.x1, record.x2) * sx), 0, image.width)
    const y1 = clamp(Math.round(Math.min(record.y1, record.y2) * sy), 0, image.height)
    const y2 = clamp(Math.round(Math.max(record.y1, record.y2) * sy), 0, image.height)
    const width = x2 - x1
    const height = y2 - y1
    if (width <= 0 || height <= 0) continue
    if (width * height < minArea) continue
    if (width * height > pageArea * maxAreaRatio) continue

    const key = `${x1}:${y1}:${width}:${height}`
    if (seen.has(key)) continue
    seen.add(key)
    detections.push({
      label,
      bbox: { x: x1, y: y1, width, height },
      ...(record.confidence !== undefined ? { confidence: record.confidence } : {}),
      frame: 0,
    })
  }
  return detections
}

/** Extract the visible text from a Responses API SSE stream. */
export function samText(stream: string): string {
  const done: string[] = []
  const deltas: string[] = []
  for (const line of stream.split('\n')) {
    if (!line.startsWith('data:')) continue
    const payload = line.slice(5).trim()
    if (!payload || payload === '[DONE]') continue
    try {
      const event = JSON.parse(payload) as { type?: string; text?: string; delta?: string }
      if (event.type === 'response.output_text.done' && typeof event.text === 'string') done.push(event.text)
      if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') deltas.push(event.delta)
    } catch {
      // A partial SSE frame: ignore, the accumulated deltas still arrive.
    }
  }
  return done.length ? done.join('') : deltas.join('')
}

export class SamClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly headers: Record<string, string>
  private readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(options: SamOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.apiKey = options.apiKey
    this.headers = options.headers ?? {}
    this.model = options.model ?? 'sam-3.1'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  /** One noun phrase, one request. SAM segments one concept per call. */
  async segment(
    imageDataUrl: string,
    image: { width: number; height: number },
    request: SamRequestOptions,
  ): Promise<SamDetection[]> {
    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...this.headers,
      },
      signal: request.signal,
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: request.phrase },
              { type: 'input_image', image_url: imageDataUrl },
            ],
          },
        ],
        stream: true,
        metadata: { mask_encoding: 'one_bit', include_confidence: 'true' },
      }),
    })

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300)
      throw new Error(`SAM request failed (${response.status}): ${detail}`)
    }

    const stream = await response.text()
    const records = parseSamBoxes(samText(stream))
    return mapSamBoxes(records, request.label, image, { minConfidence: 0.2 }).slice(
      0,
      request.maxBoxes ?? 8,
    )
  }
}
