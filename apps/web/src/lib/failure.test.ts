import { describe, expect, test } from 'bun:test'
import { ApiError } from './api'
import { failureMessage } from './failure'
import type { MessageKey } from './i18n'

const translate = (key: MessageKey, vars?: Record<string, string | number>): string =>
  vars ? `${key}:${JSON.stringify(vars)}` : key

function apiError(status: number, body: unknown): ApiError {
  return new ApiError(status, typeof body === 'string' ? body : JSON.stringify(body))
}

describe('failureMessage', () => {
  test('shows the first field of a validation failure, never the JSON body', () => {
    const cause = apiError(400, {
      error: 'validation_failed',
      message: 'The request does not match the expected schema.',
      fields: { country: ['Too small: expected string to have >=2 characters'] },
    })
    expect(failureMessage(cause, 'fallback')).toBe(
      'country: Too small: expected string to have >=2 characters',
    )
  })

  test('falls back to formErrors when no field is named', () => {
    const cause = apiError(400, {
      error: 'validation_failed',
      formErrors: ['Unrecognised key'],
    })
    expect(failureMessage(cause, 'fallback')).toBe('Unrecognised key')
  })

  test('keeps the dedicated wording for a rate limit', () => {
    const cause = apiError(429, { error: 'rate_limited', retryAfter: 42 })
    expect(failureMessage(cause, 'fallback', translate)).toBe('common.rateLimited:{"seconds":42}')
  })

  test('keeps the dedicated wording while the work gate is busy', () => {
    const cause = apiError(429, { error: 'busy' })
    expect(failureMessage(cause, 'fallback', translate)).toBe('common.busy')
  })

  test('prefers the API message over the raw status line', () => {
    const cause = apiError(502, { error: 'upstream_unavailable', message: 'The model provider did not answer.' })
    expect(failureMessage(cause, 'fallback')).toBe('The model provider did not answer.')
  })

  test('uses the caller fallback when the body only carries a code', () => {
    const cause = apiError(404, { error: 'not_found' })
    expect(failureMessage(cause, 'fallback')).toBe('fallback')
  })

  test('keeps a non-JSON error body, which is plain text', () => {
    const cause = apiError(500, 'Internal Server Error')
    expect(failureMessage(cause, 'fallback')).toBe('500 Internal Server Error')
  })

  test('exposes a readable message, not the raw JSON body', () => {
    const cause = apiError(400, {
      error: 'validation_failed',
      message: 'The request does not match the expected schema.',
    })
    expect(cause.message).toBe('400 The request does not match the expected schema.')
  })
})
