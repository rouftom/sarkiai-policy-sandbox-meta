/**
 * Pure helpers shared by the better-auth service and the migration: the TOTP
 * vector, the mailed-password shape and the preference merge. The service
 * flows themselves are covered by `better-auth/service.integration.test.ts`
 * against a real MongoDB.
 */

import { describe, expect, test } from 'bun:test'
import {
  DEFAULT_PREFERENCES,
  generatePassword,
  normalizePreferences,
  totpCode,
  verifyTotp,
} from './index'

describe('TOTP', () => {
  test('RFC 6238 reference vector (SHA1, 8 digits)', () => {
    // ASCII "12345678901234567890" → base32
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    const code = totpCode(secret, 59_000, 30, 8)
    expect(code).toBe('94287082')
  })

  test('accepts one step of drift and rejects a wrong code', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
    const now = 1_700_000_000_000
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true)
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true)
    expect(verifyTotp(secret, '000000', now)).toBe(false)
    expect(verifyTotp(secret, '12345', now)).toBe(false)
  })
})

describe('mailed password', () => {
  test('is random and never reused', () => {
    const first = generatePassword()
    const second = generatePassword()
    expect(first).not.toBe(second)
    expect(first).toMatch(/[a-z]/)
    expect(first).toMatch(/[A-Z]/)
    expect(first).toMatch(/\d/)
  })
})

describe('preferences', () => {
  test('corner style defaults to square and coerces legacy documents', () => {
    expect(DEFAULT_PREFERENCES.radius).toBe('square')
    expect(normalizePreferences(undefined).radius).toBe('square')
    expect(normalizePreferences({ radius: 'rounded' }).radius).toBe('rounded')
    const legacy = normalizePreferences({ theme: 'light', radius: undefined } as never)
    expect(legacy.radius).toBe('square')
    expect(legacy.theme).toBe('light')
    expect(legacy.notifications.digest).toBe(true)
  })

  test('merges the notification flags instead of replacing them', () => {
    const next = normalizePreferences({
      locale: 'fr',
      notifications: { ...DEFAULT_PREFERENCES.notifications, email: true },
    })
    expect(next.locale).toBe('fr')
    expect(next.notifications.email).toBe(true)
    expect(next.notifications.whatsapp).toBe(DEFAULT_PREFERENCES.notifications.whatsapp)
  })
})
