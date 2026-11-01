import { describe, expect, test } from 'bun:test'
import { RateLimiter, rateLimitHeaders } from './rate-limit.js'

const RULE = { max: 3, windowMs: 60_000 }

function clock(start = 1_000_000) {
  let now = start
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms
    },
  }
}

describe('RateLimiter', () => {
  test('allows every request up to the limit', () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < RULE.max; i += 1) {
      expect(limiter.take(RULE, 'api:a@example.com').allowed).toBe(true)
    }
  })

  test('refuses the request over the limit and reports the wait', () => {
    const time = clock()
    const limiter = new RateLimiter({ now: time.now })
    for (let i = 0; i < RULE.max; i += 1) limiter.take(RULE, 'api:a@example.com')

    const verdict = limiter.take(RULE, 'api:a@example.com')
    expect(verdict.allowed).toBe(false)
    expect(verdict.retryAfter).toBe(60)
    expect(verdict.remaining).toBe(0)
  })

  test('reopens the window once it has elapsed', () => {
    const time = clock()
    const limiter = new RateLimiter({ now: time.now })
    for (let i = 0; i < RULE.max; i += 1) limiter.take(RULE, 'api:a@example.com')
    expect(limiter.take(RULE, 'api:a@example.com').allowed).toBe(false)

    time.advance(RULE.windowMs)
    expect(limiter.take(RULE, 'api:a@example.com').allowed).toBe(true)
  })

  test('keeps callers independent', () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < RULE.max; i += 1) limiter.take(RULE, 'api:a@example.com')
    expect(limiter.take(RULE, 'api:a@example.com').allowed).toBe(false)
    expect(limiter.take(RULE, 'api:b@example.com').allowed).toBe(true)
  })

  test('clear forgets a key', () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < RULE.max; i += 1) limiter.take(RULE, 'setup:1.2.3.4')
    expect(limiter.take(RULE, 'setup:1.2.3.4').allowed).toBe(false)

    limiter.clear('setup:1.2.3.4')
    expect(limiter.take(RULE, 'setup:1.2.3.4').allowed).toBe(true)
  })

  test('never grows past the configured number of keys', () => {
    const limiter = new RateLimiter({ maxEntries: 50 })
    for (let i = 0; i < 5_000; i += 1) limiter.take(RULE, `login-ip:10.0.${i >> 8}.${i & 255}`)
    expect(limiter.size).toBeLessThanOrEqual(50)
  })

  test('evicts expired windows before live ones', () => {
    const time = clock()
    const limiter = new RateLimiter({ maxEntries: 2, now: time.now })
    limiter.take(RULE, 'old')
    time.advance(RULE.windowMs + 1)
    limiter.take(RULE, 'fresh')
    limiter.take(RULE, 'newer')

    // "old" expired, so it is the one dropped: both live keys survive.
    expect(limiter.size).toBe(2)
    expect(limiter.take(RULE, 'fresh').allowed).toBe(true)
  })
})

describe('rateLimitHeaders', () => {
  test('publishes the budget on a successful call', () => {
    const headers = rateLimitHeaders({ allowed: true, retryAfter: 0, limit: 10, remaining: 7 })
    expect(headers['RateLimit-Limit']).toBe('10')
    expect(headers['RateLimit-Remaining']).toBe('7')
    expect(headers['Retry-After']).toBeUndefined()
  })

  test('adds Retry-After only when refused', () => {
    const headers = rateLimitHeaders({ allowed: false, retryAfter: 12, limit: 10, remaining: 0 })
    expect(headers['Retry-After']).toBe('12')
  })
})
