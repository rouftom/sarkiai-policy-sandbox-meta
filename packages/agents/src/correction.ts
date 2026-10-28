/**
 * Correction of dictated text. Speech recognition gets homophones and
 * institution or legal terms wrong; a text model fixes them against a glossary.
 * It never changes numbers, dates or article references, and falls back to the
 * original text whenever its answer looks unsafe.
 */

import { generateText, type LanguageModel } from 'ai'
import { stripThinking } from './structured'

export interface CorrectionResult {
  text: string
  changed: boolean
}

export const CORRECTION_SYSTEM = [
  'You correct automatic speech-recognition transcripts of spoken French or English policy questions.',
  'Fix recognition errors, homophones, missing accents, punctuation and capitals.',
  'When a word sounds like a term in the GLOSSARY, use the glossary spelling.',
  'Never change numbers, dates, article or law references, or the meaning. If unsure, keep the original word.',
  'Reply with the corrected text only: no quotes, no commentary.',
].join(' ')

/** Lengths must stay close to the input: a correction that rewrites the question is rejected. */
export function acceptable(original: string, candidate: string): boolean {
  if (!candidate.trim()) return false
  const ratio = candidate.length / Math.max(1, original.length)
  return ratio > 0.6 && ratio < 1.6
}

export async function correctTranscript(
  text: string,
  options: { model: LanguageModel; glossary: string[] },
): Promise<CorrectionResult> {
  const original = text.trim()
  if (original.length < 4) return { text: original, changed: false }
  try {
    const result = await generateText({
      model: options.model,
      system: CORRECTION_SYSTEM,
      prompt: `GLOSSARY:\n${options.glossary.slice(0, 120).join('\n') || '(none)'}\n\nTRANSCRIPT:\n${original}`,
      maxOutputTokens: 1024,
      providerOptions: { meta: { reasoningEffort: 'low' }, 'openai-compatible': { reasoningEffort: 'low' } },
    })
    const candidate = stripThinking(result.text || '').trim().replace(/^["“”«»]+|["“”«»]+$/g, '')
    if (!acceptable(original, candidate)) return { text: original, changed: false }
    return { text: candidate, changed: candidate !== original }
  } catch {
    return { text: original, changed: false }
  }
}
