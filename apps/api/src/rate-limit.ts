/**
 * Fixed-window rate limiting for the public and authenticated surfaces.
 *
 * Every counter lives in one bounded map: expired windows are pruned on use and
 * the map never grows past `maxEntries`, so a flood of distinct keys cannot turn
 * the limiter itself into a memory leak. Callers own the key namespace
 * (`api:<operator>`, `login-ip:<ip>`…), which keeps each policy readable at its
 * call site.
 */

export interface RateLimitRule {
  /** Requests allowed per window. */
  max: number
  /** Window length in milliseconds. */
  windowMs: number
}

export interface RateLimitVerdict {
  allowed: boolean
  /** Seconds until the current window resets; 0 when the request is allowed. */
  retryAfter: number
  limit: number
  remaining: number
}

interface Entry {
  count: number
  resetAt: number
}

/** Above this many keys the map is pruned, then the oldest windows are dropped. */
const DEFAULT_MAX_ENTRIES = 10_000

export class RateLimiter {
  private readonly hits = new Map<string, Entry>()
  private readonly maxEntries: number
  private readonly now: () => number

  constructor(options: { maxEntries?: number; now?: () => number } = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.now = options.now ?? Date.now
  }

  /** Counts one hit and says whether the caller may proceed. */
  take(rule: RateLimitRule, key: string): RateLimitVerdict {
    const now = this.now()
    let entry = this.hits.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + rule.windowMs }
      this.hits.set(key, entry)
      this.prune(now)
    }

    entry.count += 1
    if (entry.count > rule.max) {
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
        limit: rule.max,
        remaining: 0,
      }
    }

    return {
      allowed: true,
      retryAfter: 0,
      limit: rule.max,
      remaining: Math.max(0, rule.max - entry.count),
    }
  }

  /** Forgets a key: a successful attempt makes earlier failures irrelevant. */
  clear(key: string): void {
    this.hits.delete(key)
  }

  /** Tracked keys, for tests and diagnostics. */
  get size(): number {
    return this.hits.size
  }

  private prune(now: number): void {
    if (this.hits.size <= this.maxEntries) return

    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) this.hits.delete(key)
    }
    // Still full after dropping expired windows: evict oldest insertions first.
    while (this.hits.size > this.maxEntries) {
      const oldest = this.hits.keys().next()
      if (oldest.done) break
      this.hits.delete(oldest.value)
    }
  }
}

/** Headers every limited response carries, so a client can pace itself. */
export function rateLimitHeaders(verdict: RateLimitVerdict): Record<string, string> {
  return {
    'RateLimit-Limit': String(verdict.limit),
    'RateLimit-Remaining': String(verdict.remaining),
    ...(verdict.allowed ? {} : { 'Retry-After': String(verdict.retryAfter) }),
  }
}
