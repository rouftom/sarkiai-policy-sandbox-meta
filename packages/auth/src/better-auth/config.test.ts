import { describe, expect, test } from 'bun:test'
import type { Db, MongoClient } from 'mongodb'
import { createBetterAuth } from './config'

/**
 * The MongoDB adapter only stores the `Db` handle when the instance is built;
 * it connects on the first query. A bare object is therefore enough to test
 * construction, and it keeps the test offline.
 */
const db = {} as Db
const client = {} as MongoClient

const SECRET = 'sps-test-secret-at-least-32-characters-long'

function instance(overrides: Partial<Parameters<typeof createBetterAuth>[0]> = {}) {
  return createBetterAuth({
    db,
    client,
    secret: SECRET,
    baseURL: 'https://api.example.test',
    ...overrides,
  })
}

describe('createBetterAuth', () => {
  test('builds the instance without touching the network', () => {
    const auth = instance()
    expect(auth.options.appName).toBe('SarkiAI Policy Sandbox')
    expect(auth.options.baseURL).toBe('https://api.example.test')
    expect(auth.options.secret).toBe(SECRET)
  })

  test('keeps the seven-day session and reads it from the database', () => {
    const auth = instance()
    expect(auth.options.session?.expiresIn).toBe(7 * 24 * 60 * 60)
    expect(auth.options.session?.storeSessionInDatabase).toBe(true)
    expect(auth.options.session?.cookieCache?.enabled).toBe(false)
  })

  test('uses the legacy scrypt hash so no operator resets a password', async () => {
    const auth = instance()
    const hash = auth.options.emailAndPassword?.password?.hash
    const verify = auth.options.emailAndPassword?.password?.verify
    expect(hash).toBeDefined()
    expect(verify).toBeDefined()

    const stored = await hash!('policy-sandbox-2026')
    expect(stored.startsWith('scrypt$16384$8$1$')).toBe(true)
    expect(await verify!({ hash: stored, password: 'policy-sandbox-2026' })).toBe(true)
    expect(await verify!({ hash: stored, password: 'wrong-password' })).toBe(false)
  })

  test('registers bearer, admin and two-factor', () => {
    const auth = instance()
    const ids = (auth.options.plugins ?? []).map((plugin: { id: string }) => plugin.id)
    expect(ids).toContain('bearer')
    expect(ids).toContain('admin')
    expect(ids).toContain('two-factor')
  })

  test('keeps the public sign-up behind e-mail verification', () => {
    const auth = instance()
    expect(auth.options.emailAndPassword?.requireEmailVerification).toBe(true)
    expect(auth.options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true)
  })

  test('stores the reset and verification lifetime the console announces', () => {
    const auth = instance()
    const reset = auth.options.emailAndPassword?.resetPasswordTokenExpiresIn
    // better-auth's default is one hour; the console announces 30 minutes.
    expect(reset).toBe(30 * 60)
    expect(auth.options.emailVerification?.expiresIn).toBe(24 * 60 * 60)
  })

  test('applies secure cross-origin cookies only on HTTPS', () => {
    const https = instance({ baseURL: 'https://api.example.test' })
    expect(https.options.advanced?.defaultCookieAttributes?.sameSite).toBe('none')
    expect(https.options.advanced?.defaultCookieAttributes?.secure).toBe(true)

    const local = instance({ baseURL: 'http://localhost:3000' })
    expect(local.options.advanced?.defaultCookieAttributes?.sameSite).toBe('lax')
    expect(local.options.advanced?.defaultCookieAttributes?.secure).toBe(false)
  })

  test('fails loudly when a mail is needed but no mailer is configured', async () => {
    const auth = instance()
    const send = auth.options.emailAndPassword?.sendResetPassword
    await expect(
      send?.({
        user: { id: 'u1', email: 'operator@sarkiai.dev', name: 'Ada', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
        url: 'https://console.example.test/reset?token=t',
        token: 't',
      } as never),
    ).rejects.toThrow(/needs a mailer/)
  })
})
