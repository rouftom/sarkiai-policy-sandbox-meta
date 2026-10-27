import { describe, expect, test } from 'bun:test'
import { AuthError, AuthService, DEFAULT_PREFERENCES, totpCode, verifyTotp } from './index'

const SECRET = 'test-session-secret'

function service(overrides: Partial<ConstructorParameters<typeof AuthService>[0]> = {}) {
  return new AuthService({
    sessionSecret: SECRET,
    operatorEmail: 'operator@sarkiai.dev',
    operatorPassword: 'correct-horse-battery',
    operatorName: 'Operator',
    ...overrides,
  })
}

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

describe('operator sign-in', () => {
  test('first sign-in requires enrolment, then a session is issued', async () => {
    const auth = service()
    await auth.bootstrap()

    const login = await auth.login('Operator@Sarkiai.dev', 'correct-horse-battery')
    expect(login.status).toBe('enrollment_required')

    const enrollment = await auth.startEnrollment(login.challenge)
    expect(enrollment.otpauthUrl).toContain('otpauth://totp/')
    expect(enrollment.secret.length).toBeGreaterThan(15)

    const session = await auth.confirmEnrollment(login.challenge, totpCode(enrollment.secret))
    expect(session.operator.email).toBe('operator@sarkiai.dev')
    expect(session.operator.mfaEnrolled).toBe(true)
    expect(session.backupCodes).toHaveLength(10)
    expect(auth.verifySession(session.token)?.email).toBe('operator@sarkiai.dev')
  })

  test('later sign-ins need the TOTP code, and backup codes are single use', async () => {
    const auth = service()
    await auth.bootstrap()
    const first = await auth.login('operator@sarkiai.dev', 'correct-horse-battery')
    const enrollment = await auth.startEnrollment(first.challenge)
    const session = await auth.confirmEnrollment(first.challenge, totpCode(enrollment.secret))
    const backup = session.backupCodes![0]!

    const second = await auth.login('operator@sarkiai.dev', 'correct-horse-battery')
    expect(second.status).toBe('mfa_required')

    const verified = await auth.verify(second.challenge, totpCode(enrollment.secret))
    expect(auth.verifySession(verified.token)?.email).toBe('operator@sarkiai.dev')

    const third = await auth.login('operator@sarkiai.dev', 'correct-horse-battery')
    const withBackup = await auth.verify(third.challenge, backup)
    expect(withBackup.operator.email).toBe('operator@sarkiai.dev')

    const fourth = await auth.login('operator@sarkiai.dev', 'correct-horse-battery')
    await expect(auth.verify(fourth.challenge, backup)).rejects.toThrow(AuthError)
  })

  test('rejects a wrong password and throttles repeated failures', async () => {
    const auth = service()
    await auth.bootstrap()
    await expect(auth.login('operator@sarkiai.dev', 'nope')).rejects.toThrow(/Invalid credentials/)
    for (let i = 0; i < 5; i += 1) await auth.login('operator@sarkiai.dev', 'nope').catch(() => {})
    await expect(auth.login('operator@sarkiai.dev', 'nope')).rejects.toThrow(/Too many attempts/)
  })

  test('an expired challenge is refused', async () => {
    const auth = service({ challengeTtlSeconds: -1 })
    await auth.bootstrap()
    const login = await auth.login('operator@sarkiai.dev', 'correct-horse-battery')
    await expect(auth.startEnrollment(login.challenge)).rejects.toThrow(/expired/)
  })

  test('preferences merge instead of replacing', async () => {
    const auth = service()
    await auth.bootstrap()
    const before = await auth.preferences('operator@sarkiai.dev')
    expect(before.theme).toBe(DEFAULT_PREFERENCES.theme)
    const after = await auth.updatePreferences('operator@sarkiai.dev', {
      locale: 'fr',
      notifications: { ...before.notifications, email: true },
    })
    expect(after.locale).toBe('fr')
    expect(after.notifications.email).toBe(true)
    expect(after.theme).toBe(before.theme)
  })
})
