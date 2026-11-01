import { describe, expect, test } from 'bun:test'
import { isKnownTimeZone, resolveAuditWindow } from './audit-window'

const NOW = Date.parse('2026-11-01T12:00:00.000Z')
const DAY = 86_400_000
const FROM = new Date(NOW - 2 * DAY).toISOString()

describe('audit stats window', () => {
  test('requires tz and from together', () => {
    expect(resolveAuditWindow({ stats: 7, from: FROM, now: NOW })).toEqual({
      ok: false,
      error: 'stats_requires_tz_and_from',
    })
    expect(resolveAuditWindow({ stats: 7, tz: 'UTC', now: NOW })).toEqual({
      ok: false,
      error: 'stats_requires_tz_and_from',
    })
  })

  test('keeps a known time zone', () => {
    expect(resolveAuditWindow({ stats: 7, tz: 'Europe/Paris', from: FROM, now: NOW })).toEqual({
      ok: true,
      from: FROM,
      timeZone: 'Europe/Paris',
    })
  })

  test('falls back to UTC instead of rejecting an unknown time zone', () => {
    // The dashboard must still render when a client sends a stale or made-up zone.
    expect(resolveAuditWindow({ stats: 7, tz: 'Mars/Olympus_Mons', from: FROM, now: NOW })).toEqual({
      ok: true,
      from: FROM,
      timeZone: 'UTC',
    })
    expect(isKnownTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isKnownTimeZone('UTC')).toBe(true)
  })

  test('refuses an unparsable, future or too wide window', () => {
    const invalid = { ok: false, error: 'invalid_window' } as const
    expect(resolveAuditWindow({ stats: 7, tz: 'UTC', from: 'not-a-date', now: NOW })).toEqual(invalid)
    expect(resolveAuditWindow({ stats: 7, tz: 'UTC', from: new Date(NOW + DAY).toISOString(), now: NOW })).toEqual(invalid)
    expect(resolveAuditWindow({ stats: 7, tz: 'UTC', from: new Date(NOW - 10 * DAY).toISOString(), now: NOW })).toEqual(invalid)
  })

  test('accepts the documented window boundaries', () => {
    // `(stats + 1)` days is the same cap the route has always enforced.
    expect(resolveAuditWindow({ stats: 7, tz: 'UTC', from: new Date(NOW - 8 * DAY).toISOString(), now: NOW }).ok).toBe(
      true,
    )
    expect(resolveAuditWindow({ stats: 7, tz: 'UTC', from: new Date(NOW - 8 * DAY - 1).toISOString(), now: NOW })).toEqual(
      { ok: false, error: 'invalid_window' },
    )
  })

  test('an unknown zone never hides an invalid window', () => {
    expect(resolveAuditWindow({ stats: 7, tz: 'Nowhere/Here', from: 'not-a-date', now: NOW })).toEqual({
      ok: false,
      error: 'invalid_window',
    })
  })
})
