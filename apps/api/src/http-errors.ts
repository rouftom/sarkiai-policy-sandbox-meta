/**
 * One failure envelope for the whole API.
 *
 * `error` is a stable machine code (never a translated sentence), so a client
 * can branch on it. A validation adds the offending fields beside it instead of
 * nesting them under `error`, which keeps `error` a string on every route — the
 * auth surface already answered that way.
 */

import type { FastifyReply } from 'fastify'
import { ZodError } from 'zod'

/** Field name to the messages that field failed. */
export type FieldErrors = Record<string, string[]>

export interface ValidationFailure {
  error: 'validation_failed'
  message: string
  fields?: FieldErrors
  formErrors?: string[]
}

/**
 * Answers `400` with the shared envelope, dropping the empty buckets Zod emits
 * so a body without field detail stays short.
 */
export function validationFailure(reply: FastifyReply, error: ZodError): FastifyReply {
  const flat = error.flatten()
  const fields: FieldErrors = {}
  for (const [field, messages] of Object.entries(flat.fieldErrors)) {
    if (Array.isArray(messages) && messages.length > 0) fields[field] = messages
  }
  const formErrors = flat.formErrors.filter((message) => message.length > 0)
  return reply.status(400).send({
    error: 'validation_failed',
    message: 'The request does not match the expected schema.',
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    ...(formErrors.length > 0 ? { formErrors } : {}),
  } satisfies ValidationFailure)
}
