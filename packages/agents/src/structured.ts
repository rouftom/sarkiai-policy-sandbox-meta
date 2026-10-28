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

/** Index of the brace closing the object opened at `start`, string-aware; -1 when truncated. */
function closingBrace(text: string, start: number): number {
  let depth = 0
  let inString = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (char === '\\') index += 1
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** Repairs the slips models make in otherwise valid JSON. */
function repairJson(candidate: string): string {
  return candidate
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
}

/** Close the brackets of a reply cut off by the token budget. */
function closeTruncated(candidate: string): string {
  const stack: string[] = []
  let inString = false
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index]
    if (inString) {
      if (char === '\\') index += 1
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') stack.push('}')
    else if (char === '[') stack.push(']')
    else if (char === '}' || char === ']') stack.pop()
  }
  const open = inString ? '"' : ''
  return candidate.replace(/,\s*$/, '') + open + stack.reverse().join('')
}

/**
 * The first JSON object of a model reply: fences and prose removed, slips
 * repaired, and a reply cut off mid-object is closed. Returns null only when
 * no object can be read at all.
 */
export function extractJsonObject(text: string): unknown | null {
  const unfenced = text.replace(/```(?:json)?/gi, '')
  const start = unfenced.indexOf('{')
  if (start < 0) return null
  const end = closingBrace(unfenced, start)
  const raw = end > start ? unfenced.slice(start, end + 1) : unfenced.slice(start)
  for (const candidate of [raw, repairJson(raw), closeTruncated(repairJson(raw))]) {
    try {
      return JSON.parse(candidate)
    } catch {
      /* try the next repair */
    }
  }
  return null
}

/** Whether the reply holds an object at all (to tell "no JSON" from "broken JSON"). */
export function hasJsonObject(text: string): boolean {
  return text.includes('{')
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
      if (!reply.trim()) reason = 'the reply was empty'
      else if (!hasJsonObject(reply)) reason = 'the reply contained no JSON object'
      else reason = 'the JSON object could not be parsed'
    } else {
      const parsed = request.schema.safeParse(candidate)
      if (parsed.success) return parsed.data
      reason = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('; ')
    }

    feedback = `\n\nYour previous reply was rejected (${reason}). Reply again with ONLY the JSON object.`
  }

  throw new StructuredOutputError(reason)
}
