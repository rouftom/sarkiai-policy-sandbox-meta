/**
 * Reference images for the knowledge base.
 *
 * Meta's image model (`muse-image-1.0`, Meta Model API `/v1/images/generations`)
 * draws the reference figure for a readiness dimension. Without a key or when
 * the call fails, a labelled SVG diagram is produced locally instead, so the
 * knowledge base always has a figure to show; its `source` says which one it is.
 */

import { recordCapabilityUsage } from './usage'

export const META_IMAGE_MODEL = 'muse-image-1.0'

export interface GeneratedImage {
  mime: string
  dataBase64: string
  source: 'meta-image' | 'sample'
  model: string
}

export interface ImageGenerationOptions {
  /** Provider base URL ending in `/v1`. */
  baseURL: string
  apiKey: string
  /** Extra headers (the egress relay secret, when configured). */
  headers?: Record<string, string>
  model?: string
  size?: string
  fetchImpl?: typeof fetch
}

/** Meta Image: one PNG from a text prompt. Throws on any upstream failure. */
export async function generateMetaImage(prompt: string, options: ImageGenerationOptions): Promise<GeneratedImage> {
  const fetchImpl = options.fetchImpl ?? fetch
  const model = options.model ?? META_IMAGE_MODEL
  const startedAt = Date.now()
  // Muse Image has no confirmed list price: the row is kept, its cost stays null.
  const usage = { kind: 'image' as const, mode: 'cloud' as const, servedBy: 'Meta', model, units: 1, unit: 'image' as const, costUsd: null }
  try {
    const response = await fetchImpl(`${options.baseURL.replace(/\/+$/, '')}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: options.size ?? '1536x1024',
        response_format: 'b64_json',
        output_format: 'png',
        reasoning_strength: 'low',
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`Meta Image failed (${response.status}).`)
    const payload = (await response.json()) as { data?: Array<{ b64_json?: string }> }
    const dataBase64 = payload.data?.[0]?.b64_json
    if (!dataBase64) throw new Error('Meta Image returned no image.')
    recordCapabilityUsage({ ...usage, latencyMs: Date.now() - startedAt })
    return { mime: 'image/png', dataBase64, source: 'meta-image', model }
  } catch (error) {
    recordCapabilityUsage({ ...usage, latencyMs: Date.now() - startedAt, status: 'error' })
    throw error
  }
}

/** Labelled diagram used when Meta Image is not available. */
export function sampleFigure(title: string, lines: string[]): GeneratedImage {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = lines
    .slice(0, 6)
    .map((line, index) => `<text x="60" y="${190 + index * 44}" font-size="26" fill="#334155">${escape(line)}</text>`)
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><rect width="1200" height="675" fill="#f8fafc"/><rect x="40" y="40" width="1120" height="595" rx="28" fill="#ffffff" stroke="#0f766e" stroke-width="4"/><text x="60" y="120" font-size="40" font-weight="700" fill="#0f766e">${escape(title)}</text>${body}</svg>`
  return {
    mime: 'image/svg+xml',
    dataBase64: Buffer.from(svg, 'utf8').toString('base64'),
    source: 'sample',
    model: 'local-sample',
  }
}

/** Meta Image when configured, otherwise the labelled sample. Never throws. */
export async function referenceImage(
  prompt: string,
  fallback: { title: string; lines: string[] },
  options: ImageGenerationOptions | null,
): Promise<GeneratedImage> {
  if (options?.apiKey) {
    try {
      return await generateMetaImage(prompt, options)
    } catch {
      /* fall through to the sample: the knowledge base must still get a figure */
    }
  }
  return sampleFigure(fallback.title, fallback.lines)
}
