/**
 * Validation for the audit feed's `stats` window, kept pure so it can be tested
 * without a Fastify server: the route only maps the result to a status code.
 *
 * The dashboard sends the browser's time zone. An unknown one (an old client, a
 * spoofed value, a runtime without full ICU) falls back to UTC instead of
 * failing the whole dashboard: the days are still correct, just bucketed in
 * UTC, and `timeZone` reports which one was used.
 */

const DAY_MS = 86_400_000

/** `Intl` throws a `RangeError` for an unknown zone. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

export interface AuditWindowInput {
  /** Number of days requested by the dashboard (1–31). */
  stats: number
  tz?: string | undefined
  from?: string | undefined
  /** Injectable clock, for tests. */
  now?: number
}

export type AuditWindowResult =
  | { ok: true; from: string; timeZone: string }
  | { ok: false; error: 'stats_requires_tz_and_from' | 'invalid_window' }

/**
 * Both parameters are required together; the window must start in the past and
 * be at most `stats + 1` days wide (one extra day covers a daylight-saving
 * shift and a request sent just after local midnight).
 */
export function resolveAuditWindow(input: AuditWindowInput): AuditWindowResult {
  const { stats, tz, from, now = Date.now() } = input
  if (!tz || !from) return { ok: false, error: 'stats_requires_tz_and_from' }
  const fromMs = Date.parse(from)
  if (Number.isNaN(fromMs) || fromMs > now || now - fromMs > (stats + 1) * DAY_MS) {
    return { ok: false, error: 'invalid_window' }
  }
  return { ok: true, from, timeZone: isKnownTimeZone(tz) ? tz : 'UTC' }
}
