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
/** Reasoning models wrap their thinking in tags: it is never part of the answer. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '')
}

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
  const attempts = request.attempts ?? 3
  let feedback = ''
  let reason = 'no attempt was made'

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await generateText({
      model: request.model,
      system: `${request.system}\n\nReply with ONLY one JSON object, no prose and no code fence. Shape:\n${request.shape}`,
      prompt: `${request.prompt}${feedback}`,
      maxOutputTokens: request.maxOutputTokens ?? 4096,
    })

    // Some models answer in the reasoning channel only: read it when the answer is empty.
    const reply = stripThinking(result.text || result.reasoningText || '')
    const candidate = extractJsonObject(reply)
    if (candidate === null) {
      reason = reply.trim() ? 'the reply contained no JSON object' : 'the reply was empty'
    } else {
      const parsed = request.schema.safeParse(candidate)
      if (parsed.success) return parsed.data
      reason = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
    }

    feedback = `\n\nYour previous reply was rejected (${reason}). Reply again with ONLY the JSON object.`
  }

  throw new StructuredOutputError(reason)
}
