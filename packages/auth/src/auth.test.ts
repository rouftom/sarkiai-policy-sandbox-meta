import { describe, expect, test } from 'bun:test'
import {
  AuthError,
  AuthService,
  DEFAULT_PREFERENCES,
  generatePassword,
  MIN_PASSWORD_LENGTH,
  totpCode,
  verifyTotp,
} from './index'

const SECRET = 'test-session-secret'
const EMAIL = 'operator@sarkiai.dev'
const CHOSEN = 'policy-sandbox-2026'

function service(overrides: Partial<ConstructorParameters<typeof AuthService>[0]> = {}) {
  return new AuthService({ sessionSecret: SECRET, ...overrides })
}

/** Root setup returns the mailed one-time password; keep it for the sign-in. */
async function invite(auth: AuthService, email = EMAIL): Promise<string> {
  const { password } = await auth.createRoot({ firstName: 'Ada', lastName: 'Operator', email })
  return password
}

/** Full first run: invited password → forced change → TOTP enrolment. */
async function onboard(auth: AuthService) {
  const invited = await invite(auth)
  const login = await auth.login(EMAIL, invited)
  const changed = await auth.changePassword(login.challenge, CHOSEN)
  const enrollment = await auth.startEnrollment(changed.challenge)
  const session = await auth.confirmEnrollment(changed.challenge, totpCode(enrollment.secret))
  return { session, secret: enrollment.secret, invited }
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

describe('root setup', () => {
  test('the store is empty until the root operator is created', async () => {
    const auth = service()
    expect(await auth.isEmpty()).toBe(true)
    const password = await invite(auth)
    expect(password.length).toBeGreaterThanOrEqual(20)
    expect(await auth.isEmpty()).toBe(false)
  })

  test('the mailed password is random and never reused', async () => {
    const first = generatePassword()
    const second = generatePassword()
    expect(first).not.toBe(second)
    expect(first).toMatch(/[a-z]/)
    expect(first).toMatch(/[A-Z]/)
    expect(first).toMatch(/\d/)
  })

  test('a second root setup is refused', async () => {
    const auth = service()
    await invite(auth)
    await expect(invite(auth, 'someone@else.dev')).rejects.toThrow(/already has an operator/)
  })

  test('the operator name is built from first and last name', async () => {
    const auth = service()
    const { operator } = await auth.createRoot({ firstName: 'Ada', lastName: 'Njoya', email: 'ada@njoya.dev' })
    expect(operator.name).toBe('Ada Njoya')
    expect(operator.role).toBe('admin')
    expect(operator.mustChangePassword).toBe(true)
    expect(operator.mfaEnrolled).toBe(false)
  })

  test('a rollback removes the account so setup can be retried', async () => {
    const auth = service()
    await invite(auth)
    await auth.remove(EMAIL)
    expect(await auth.isEmpty()).toBe(true)
  })
})

describe('operator sign-in', () => {
  test('the invited password must be replaced, then 2FA is enrolled', async () => {
    const auth = service()
    const { invited } = await onboard(auth)

    // Replay the first run step by step to inspect every stage.
    const replay = service()
    const password = await invite(replay)
    const login = await replay.login(EMAIL, password)
    expect(login.status).toBe('password_change_required')
    expect(login.operator.mustChangePassword).toBe(true)

    const changed = await replay.changePassword(login.challenge, CHOSEN)
    expect(changed.status).toBe('enrollment_required')

    const enrollment = await replay.startEnrollment(changed.challenge)
    expect(enrollment.otpauthUrl).toContain('otpauth://totp/')
    expect(enrollment.secret.length).toBeGreaterThan(15)

    const session = await replay.confirmEnrollment(changed.challenge, totpCode(enrollment.secret))
    expect(session.operator.email).toBe(EMAIL)
    expect(session.operator.mfaEnrolled).toBe(true)
    expect(session.operator.mustChangePassword).toBe(false)
    expect(session.backupCodes).toHaveLength(10)
    expect(replay.verifySession(session.token)?.email).toBe(EMAIL)

    // Once replaced, the invited password no longer works.
    await expect(replay.login(EMAIL, invited)).rejects.toThrow(/Invalid credentials/)
  })

  test('a weak replacement password is refused', async () => {
    const auth = service()
    const login = await auth.login(EMAIL, await invite(auth))
    await expect(auth.changePassword(login.challenge, 'short1')).rejects.toThrow(/at least/)
    await expect(auth.changePassword(login.challenge, 'x'.repeat(MIN_PASSWORD_LENGTH))).rejects.toThrow(/letters and digits/)
  })

  test('later sign-ins need the TOTP code, and backup codes are single use', async () => {
    const auth = service()
    const { secret, session } = await onboard(auth)
    const backup = session.backupCodes![0]!

    const second = await auth.login(EMAIL, CHOSEN)
    expect(second.status).toBe('mfa_required')

    const verified = await auth.verify(second.challenge, totpCode(secret))
    expect(auth.verifySession(verified.token)?.email).toBe(EMAIL)

    const third = await auth.login(EMAIL, CHOSEN)
    const withBackup = await auth.verify(third.challenge, backup)
    expect(withBackup.operator.email).toBe(EMAIL)

    const fourth = await auth.login(EMAIL, CHOSEN)
    await expect(auth.verify(fourth.challenge, backup)).rejects.toThrow(AuthError)
  })

  test('rejects a wrong password and throttles repeated failures', async () => {
    const auth = service()
    await invite(auth)
    await expect(auth.login(EMAIL, 'nope')).rejects.toThrow(/Invalid credentials/)
    for (let i = 0; i < 5; i += 1) await auth.login(EMAIL, 'nope').catch(() => {})
    await expect(auth.login(EMAIL, 'nope')).rejects.toThrow(/Too many attempts/)
  })

  test('an expired challenge is refused', async () => {
    const auth = service({ challengeTtlSeconds: -1 })
    const login = await auth.login(EMAIL, await invite(auth))
    await expect(auth.changePassword(login.challenge, CHOSEN)).rejects.toThrow(/expired/)
  })

  test('preferences merge instead of replacing', async () => {
    const auth = service()
    await onboard(auth)
    const before = await auth.preferences(EMAIL)
    expect(before.theme).toBe(DEFAULT_PREFERENCES.theme)
    const after = await auth.updatePreferences(EMAIL, {
      locale: 'fr',
      notifications: { ...before.notifications, email: true },
    })
    expect(after.locale).toBe('fr')
    expect(after.notifications.email).toBe(true)
    expect(after.theme).toBe(before.theme)
  })
})
