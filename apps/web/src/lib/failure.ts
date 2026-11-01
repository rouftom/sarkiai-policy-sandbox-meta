/**
 * The sentence a failed API call deserves.
 *
 * The API answers 429 with a machine body (`rate_limited` or `busy`) and a
 * `retryAfter`: showing that raw body in the console would be noise, so the
 * two cases get their own wording. Every other failure keeps the API message,
 * then the caller's fallback.
 */

import { ApiError } from './api'
import type { MessageKey } from './i18n'

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export function failureMessage(cause: unknown, fallback: string, t?: Translate): string {
  if (cause instanceof ApiError && cause.status === 429) {
    const body = cause.json<{ error?: string; retryAfter?: number }>()
    if (body?.error === 'busy') return t ? t('common.busy') : fallback
    const seconds = body?.retryAfter && body.retryAfter > 0 ? body.retryAfter : 60
    return t ? t('common.rateLimited', { seconds }) : fallback
  }
  return cause instanceof Error ? cause.message : fallback
}
