/**
 * Per-zone transcription with a vision model.
 *
 * The unit is one crop, not one page: a column cut, a paragraph, a table. That
 * keeps the prompt small, the output verifiable against a visible box, and a
 * single bad crop from poisoning the whole page.
 *
 * Muse Spark is a reasoning model. Its reasoning tokens are billed as output but
 * are not returned, so the output ceiling is generous (the ceiling itself is not
 * billed) and a transcription must never be trusted when `finishReason` is
 * `length`.
 */

import { generateText, type LanguageModel } from 'ai'
import { cropToPng, type GrayImage } from './image.js'
import type { BBox } from './layout.js'

export type ZoneKind = 'text' | 'table'

export interface TranscribeInput {
  model: LanguageModel
  image: GrayImage
  bbox: BBox
  kind: ZoneKind
  page: number
  column: number
  columns: number
  filename: string
  maxOutputTokens?: number
  /** Cloud only; local engines reject an unknown field. */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  providerName?: string
  signal?: AbortSignal
}

export interface TranscribeResult {
  text: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  finishReason: string
  /** True when the region holds no readable text. */
  blank: boolean
}

const NO_TEXT = /^\[?\s*no\s+text\s*\]?$/i

export function buildTranscriptionPrompt(input: Pick<TranscribeInput, 'kind' | 'page' | 'column' | 'columns' | 'filename'>): string {
  const context = [
    'You are transcribing one cropped region of a scanned official gazette page for a legal knowledge base.',
    `Document: ${input.filename}. Page ${input.page}, column ${input.column} of ${input.columns}.`,
    '',
  ]

  if (input.kind === 'table') {
    return [
      ...context,
      'Transcribe the table as GitHub-flavoured Markdown: one header row, one separator row, then every data row.',
      'Preserve every cell verbatim, including numbers, currency, units and dates. Keep empty cells empty.',
      'Do not add a caption, a comment or a summary.',
      '',
      'Rules:',
      '- Transcribe the visible characters exactly as printed, in the original language, spelling and accents.',
      '- Do not translate, correct, modernise or complete anything.',
      '- Join a word split across two lines and keep the paragraph structure.',
      '- Ignore stamps, signatures, handwriting and page numbers that fall inside the crop.',
      '- If the crop holds no readable table, output exactly: [NO TEXT]',
    ].join('\n')
  }

  return [
    ...context,
    'Transcribe every visible character in the crop, verbatim.',
    '',
    'Rules:',
    '- Preserve the original language, spelling, accents, punctuation and capitalisation.',
    '- Join a word split across two lines; keep real paragraph breaks.',
    '- Do not translate, summarise, correct or add anything.',
    '- Ignore stamps, signatures, handwriting and page numbers that fall inside the crop.',
    '- Output only the transcription, with no preamble and no quotation marks around it.',
    '- If the crop holds no readable text, output exactly: [NO TEXT]',
  ].join('\n')
}

/** Strip a fence the model may wrap around a table, and normalise the blank marker. */
export function cleanTranscription(raw: string): { text: string; blank: boolean } {
  const trimmed = raw.trim()
  if (NO_TEXT.test(trimmed)) return { text: '', blank: true }

  const fenced = trimmed.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n```$/)
  const text = (fenced?.[1] ?? trimmed).trim()
  return { text, blank: text.length === 0 }
}

/**
 * Article number from a transcribed zone, normalised for citations.
 * Handles the forms a bilingual gazette actually prints: ARTICLE 12,
 * ARTICLE 1er, ARTICLE 12 bis, Art. 9.
 */
export function extractArticleNumber(text: string): string | undefined {
  const match = text.match(/\b(?:ARTICLE|Art\.?)\s+(premier|1er|[0-9]{1,4}(?:\s*(?:bis|ter|quater))?)\b/i)
  if (!match?.[1]) return undefined
  return `ARTICLE ${match[1].replace(/\s+/g, ' ').trim()}`
}

/** True when the zone looks like a heading rather than an article body. */
export function looksLikeHeading(text: string): boolean {
  const first = text.split('\n')[0]?.trim() ?? ''
  if (!first || first.length > 140) return false
  return /^(D[EÉ]CRET|ARR[EÊ]T[EÉ]|LOI|ORDONNANCE|CIRCULAIRE|D[EÉ]CISION|R[EÈ]GLEMENT|JOURNAL OFFICIEL)\b/i.test(
    first,
  )
}

export async function transcribeRegion(input: TranscribeInput): Promise<TranscribeResult> {
  const started = Date.now()
  const png = cropToPng(input.image, input.bbox)
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`

  const result = await generateText({
    model: input.model,
    maxOutputTokens: input.maxOutputTokens ?? 4096,
    ...(input.reasoningEffort && input.providerName
      ? { providerOptions: { [input.providerName]: { reasoning_effort: input.reasoningEffort } } }
      : {}),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildTranscriptionPrompt(input) },
          { type: 'image', image: dataUrl, mediaType: 'image/png' },
        ],
      },
    ],
  })

  const { text, blank } = cleanTranscription(result.text)
  return {
    text,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    durationMs: Date.now() - started,
    finishReason: result.finishReason,
    blank,
  }
}
