/**
 * The sentence a failed API call deserves.
 *
 * The API sends `{ error, message?, fields? }`: `error` is the stable code, and
 * a validation adds the offending fields beside it. The console shows the first
 * field message rather than the raw JSON body. `429` keeps its dedicated
 * wording, and every other failure falls back to the API message then the
 * caller's sentence.
 */

import { ApiError } from './api'
import type { MessageKey } from './i18n'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

interface FailureBody {
  error?: string
  message?: string
  fields?: Record<string, string[]>
  formErrors?: string[]
  retryAfter?: number
}

export function failureMessage(cause: unknown, fallback: string, t?: Translate): string {
  if (!(cause instanceof ApiError)) return cause instanceof Error ? cause.message : fallback
  const body = cause.json<FailureBody>()

  if (cause.status === 429) {
    if (body?.error === 'busy') return t ? t('common.busy') : fallback
    const seconds = body?.retryAfter && body.retryAfter > 0 ? body.retryAfter : 60
    return t ? t('common.rateLimited', { seconds }) : fallback
  }

  if (body?.error === 'validation_failed') {
    const field = Object.entries(body.fields ?? {}).find(([, messages]) => messages.length > 0)
    if (field) return `${field[0]}: ${field[1][0]}`
    if (body.formErrors && body.formErrors.length > 0) return body.formErrors[0]!
    return body.message ?? fallback
  }

  if (body) return body.message ?? fallback
  return cause.message
}
