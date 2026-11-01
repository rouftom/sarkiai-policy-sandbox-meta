import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { sandboxMode, turnstileConfig, turnstileEnabled, verifyTurnstile } from './turnstile'

const KEYS = [
  'SANDBOX_MODE',
  'MODEL_API_KEY',
  'NEXT_PUBLIC_CLOUDFLARE_TURNSITE_SITE_KEY',
  'CLOUDFLARE_TURNSITE_SITE_SECRET',
  'TURNSTILE_SECRET',
  'TURNSTILE_HOSTNAMES',
] as const

const savedEnv: Record<string, string | undefined> = {}
const savedFetch = globalThis.fetch

function configureCloud() {
  process.env.SANDBOX_MODE = 'cloud'
  process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSITE_SITE_KEY = 'site-key'
  process.env.CLOUDFLARE_TURNSITE_SITE_SECRET = 'secret'
}

function reply(body: unknown, status = 200) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch
}

beforeEach(() => {
  for (const key of KEYS) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
})

afterEach(() => {
  for (const key of KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
  globalThis.fetch = savedFetch
})

describe('sandboxMode', () => {
  test('is local by default', () => {
    expect(sandboxMode()).toBe('local')
  })

  test('reads the explicit mode', () => {
    process.env.SANDBOX_MODE = 'sovereign'
    expect(sandboxMode()).toBe('sovereign')

    process.env.SANDBOX_MODE = 'cloud'
    expect(sandboxMode()).toBe('cloud')
  })

  test('treats a Meta key without a mode as cloud, like the provider config', () => {
    process.env.MODEL_API_KEY = 'meta-key'
    expect(sandboxMode()).toBe('cloud')
  })
})

describe('turnstileEnabled', () => {
  test('is off in local mode even with keys configured', () => {
    configureCloud()
    process.env.SANDBOX_MODE = 'local'
    delete process.env.MODEL_API_KEY
    expect(turnstileEnabled()).toBe(false)
  })

  test('is off when the keys are missing', () => {
    process.env.SANDBOX_MODE = 'cloud'
    expect(turnstileEnabled()).toBe(false)
  })

  test('is on in cloud mode with both keys', () => {
    configureCloud()
    expect(turnstileEnabled()).toBe(true)
  })

  test('is on in sovereign mode with both keys', () => {
    process.env.SANDBOX_MODE = 'sovereign'
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSITE_SITE_KEY = 'site-key'
    process.env.CLOUDFLARE_TURNSITE_SITE_SECRET = 'secret'
    expect(turnstileEnabled()).toBe(true)
  })
})

describe('turnstileConfig', () => {
  test('tells the console to skip the widget when disabled', () => {
    expect(turnstileConfig()).toEqual({ required: false, siteKey: null })
  })

  test('exposes the public key when enabled', () => {
    configureCloud()
    expect(turnstileConfig()).toEqual({ required: true, siteKey: 'site-key' })
  })
})

describe('verifyTurnstile', () => {
  test('lets the form through without calling Cloudflare when disabled', async () => {
    let called = false
    globalThis.fetch = (async () => {
      called = true
      return new Response('{}')
    }) as unknown as typeof fetch

    expect(await verifyTurnstile(undefined, 'password_reset')).toBe(true)
    expect(called).toBe(false)
  })

  test('rejects a missing token when enabled', async () => {
    configureCloud()
    expect(await verifyTurnstile(undefined, 'password_reset')).toBe(false)
  })

  test('accepts Cloudflare success for the password-reset action', async () => {
    configureCloud()
    reply({ success: true, action: 'password_reset', hostname: 'console.example' })
    expect(await verifyTurnstile('token', 'password_reset')).toBe(true)
  })

  test('accepts a sign-up token for the sign-up action', async () => {
    configureCloud()
    reply({ success: true, action: 'signup', hostname: 'console.example' })
    expect(await verifyTurnstile('token', 'signup')).toBe(true)
  })

  test('rejects a token minted for another action', async () => {
    configureCloud()
    reply({ success: true, action: 'signup', hostname: 'console.example' })
    expect(await verifyTurnstile('token', 'password_reset')).toBe(false)
  })

  test('rejects a success answer that carries no action', async () => {
    configureCloud()
    reply({ success: true, hostname: 'console.example' })
    expect(await verifyTurnstile('token', 'signup')).toBe(false)
  })

  test('accepts the canonical TURNSTILE_SECRET name', async () => {
    process.env.SANDBOX_MODE = 'cloud'
    process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSITE_SITE_KEY = 'site-key'
    process.env.TURNSTILE_SECRET = 'canonical-secret'
    reply({ success: true, action: 'signup', hostname: 'console.example' })
    expect(await verifyTurnstile('token', 'signup')).toBe(true)
  })

  test('rejects an explicit Cloudflare failure', async () => {
    configureCloud()
    reply({ success: false })
    expect(await verifyTurnstile('token', 'password_reset')).toBe(false)
  })

  test('rejects a hostname outside the allowlist', async () => {
    configureCloud()
    process.env.TURNSTILE_HOSTNAMES = 'sps.djotta.com'
    reply({ success: true, action: 'password_reset', hostname: 'evil.example' })
    expect(await verifyTurnstile('token', 'password_reset')).toBe(false)
  })

  test('does not block the reset request when Cloudflare errors or is unreachable', async () => {
    configureCloud()
    reply({}, 503)
    expect(await verifyTurnstile('token', 'password_reset')).toBe(true)

    globalThis.fetch = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    expect(await verifyTurnstile('token', 'password_reset')).toBe(true)
  })
})
