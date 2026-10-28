/**
 * Correction of dictated text. Speech recognition makes errors that a reader
 * spots from the sentence itself: homophones, dropped accents, a word cut or
 * merged, wrong capitals and punctuation. A text model repairs them from the
 * meaning of the whole sentence, in the speaker's own language. It never changes
 * numbers, dates or references, and falls back to the original text whenever its
 * answer looks unsafe.
 */

import { generateText, type LanguageModel } from 'ai'
import { stripThinking } from './structured'

export interface CorrectionResult {
  text: string
  changed: boolean
}

export const CORRECTION_SYSTEM = [
  'You correct automatic speech-recognition transcripts of spoken questions.',
  'Work out what the speaker meant from the whole sentence, then repair words that the recogniser got wrong:',
  'homophones, missing or wrong accents, merged or split words, capitals and punctuation.',
  'Keep the language the speaker used. Never change numbers, dates or references, and never add or remove content.',
  'If a word is unclear, keep it as it is.',
  'Reply with the corrected text only: no quotes, no commentary.',
].join(' ')

/** Lengths must stay close to the input: a correction that rewrites the question is rejected. */
export function acceptable(original: string, candidate: string): boolean {
  if (!candidate.trim()) return false
  const ratio = candidate.length / Math.max(1, original.length)
  return ratio > 0.6 && ratio < 1.6
}

export async function correctTranscript(text: string, options: { model: LanguageModel }): Promise<CorrectionResult> {
  const original = text.trim()
  if (original.length < 4) return { text: original, changed: false }
  try {
    const result = await generateText({
      model: options.model,
      system: CORRECTION_SYSTEM,
      prompt: `TRANSCRIPT:\n${original}`,
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
