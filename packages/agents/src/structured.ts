/**
 * Structured output without relying on the provider's JSON-schema mode.
 *
 * `generateObject` asks the provider to enforce a schema; the Meta chat models
 * answer in free text, so a valid report often fails validation ("No object
 * generated: response did not match schema") and the whole tick is lost. Here
 * the model writes plain text, a JSON object is extracted and validated with
 * Zod, and a failed attempt is retried once with the validation error as
 * feedback.
 */

import { generateText, type LanguageModel } from 'ai'
import type { z, ZodType } from 'zod'

export class StructuredOutputError extends Error {
  constructor(readonly reason: string) {
    super(`Structured output invalid: ${reason}`)
    this.name = 'StructuredOutputError'
  }
}

export interface StructuredRequest<S extends ZodType> {
  model: LanguageModel
  system: string
  prompt: string
  schema: S
  /** Human-readable shape of the expected JSON object, shown to the model. */
  shape: string
  attempts?: number
  maxOutputTokens?: number
}

/** The first balanced JSON object in a model reply, fences and prose stripped. */
export function extractJsonObject(text: string): unknown | null {
  const unfenced = text.replace(/```(?:json)?/gi, '')
  const start = unfenced.indexOf('{')
  const end = unfenced.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(unfenced.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function generateStructured<S extends ZodType>(request: StructuredRequest<S>): Promise<z.output<S>> {
  const attempts = request.attempts ?? 2
  let feedback = ''
  let reason = 'no attempt was made'

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { text } = await generateText({
      model: request.model,
      system: `${request.system}\n\nReply with ONLY one JSON object, no prose and no code fence. Shape:\n${request.shape}`,
      prompt: `${request.prompt}${feedback}`,
      maxOutputTokens: request.maxOutputTokens ?? 2048,
    })

    const candidate = extractJsonObject(text)
    if (candidate === null) {
      reason = 'the reply contained no JSON object'
    } else {
      const parsed = request.schema.safeParse(candidate)
      if (parsed.success) return parsed.data
      reason = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
    }

    feedback = `\n\nYour previous reply was rejected (${reason}). Reply again with ONLY the JSON object.`
  }

  throw new StructuredOutputError(reason)
}
