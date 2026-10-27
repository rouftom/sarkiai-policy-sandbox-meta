import { describe, expect, test } from 'bun:test'
import { AuthService, totpCode } from './index'

/**
 * Integration test — requires MongoDB (the reset links live in their own
 * collection). Run with:  MONGO_URL=mongodb://localhost:27017 bun test
 * Skipped automatically when MONGO_URL is unset.
 */
const mongoUri = process.env.MONGO_URL
const SECRET = 'test-session-secret'
const EMAIL = 'reset@sarkiai.dev'
const OLD = 'policy-sandbox-2026'
const NEW = 'policy-sandbox-2027'

function service(): AuthService {
  return new AuthService({
    sessionSecret: SECRET,
    ...(mongoUri ? { mongodbUri: mongoUri, dbName: `sps_reset_test_${Date.now()}` } : {}),
  })
}

describe.skipIf(!mongoUri)('password reset (integration: MongoDB)', () => {
  test('issues a single-use link, keeps TOTP enrolled and invalidates siblings', async () => {
    const auth = service()
    const { password: invited } = await auth.createRoot({ firstName: 'Ada', lastName: 'Njoya', email: EMAIL })
    const login = await auth.login(EMAIL, invited)
    const changed = await auth.changePassword(login.challenge, OLD)
    const enrollment = await auth.startEnrollment(changed.challenge)
    await auth.confirmEnrollment(changed.challenge, totpCode(enrollment.secret))

    const first = await auth.createPasswordReset(EMAIL)
    const second = await auth.createPasswordReset(EMAIL)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()

    const operator = await auth.resetPassword(first!.token, NEW)
    expect(operator.email).toBe(EMAIL)
    // MFA survives a reset: the next sign-in still asks for a code.
    expect(operator.mfaEnrolled).toBe(true)

    // Same link twice: rejected.
    await expect(auth.resetPassword(first!.token, NEW)).rejects.toThrow(/already used|invalid/)

    // The sibling link was invalidated by the completed reset.
    await expect(auth.resetPassword(second!.token, NEW)).rejects.toThrow(/already used|invalid/)

    // The old password no longer signs in; the new one reaches the second factor.
    await expect(auth.login(EMAIL, OLD)).rejects.toThrow(/invalid/i)
    const next = await auth.login(EMAIL, NEW)
    expect(next.status).toBe('mfa_required')

    // Unknown addresses never reveal whether an account exists.
    expect(await auth.createPasswordReset('nobody@sarkiai.dev')).toBeNull()
  })
})
