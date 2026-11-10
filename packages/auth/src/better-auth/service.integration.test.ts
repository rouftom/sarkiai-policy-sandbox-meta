import { afterAll, describe, expect, test } from 'bun:test'
import { MongoClient } from 'mongodb'
import { totpCode } from '../index'
import { BetterAuthService } from './service'

/**
 * Integration test · requires MongoDB. It runs against a throw-away database
 * next to the main one and drops it afterwards.
 *
 *   MONGO_URL=mongodb://localhost:27017 bun test packages/auth
 *
 * Skipped automatically when `MONGO_URL` is unset.
 */
const mongoUri = process.env.MONGO_URL
const DB_NAME = process.env.SPS_AUTH_TEST_DB ?? `sps_better_auth_test_${Date.now()}`
const SECRET = 'sps-test-secret-at-least-32-characters-long'
const SESSION_SECRET = 'sps-test-session-secret'
const ROOT = 'root@sarkiai.dev'
const CHANGED = 'policy-sandbox-2026'
const RESET = 'policy-sandbox-2027'
const SIGNUP = 'judge@sarkiai.dev'
const SIGNUP_PASSWORD = 'policy-sandbox-judge-7'

function service(overrides: Partial<ConstructorParameters<typeof BetterAuthService>[0]> = {}) {
  return new BetterAuthService({
    mongodbUri: mongoUri!,
    dbName: DB_NAME,
    secret: SECRET,
    sessionSecret: SESSION_SECRET,
    baseURL: 'http://localhost:8000',
    signup: true,
    maxOperators: 5,
    mongoOptions: { serverSelectionTimeoutMS: 5_000 },
    ...overrides,
  })
}

describe.skipIf(!mongoUri)('better-auth service (integration: MongoDB)', () => {
  test('root setup, TOTP replay refusal, recovery codes, reset and sign-up verification', async () => {
    const auth = service()
    try {
      expect(auth.storage).toBe('mongo')
      expect(await auth.isEmpty()).toBe(true)

      // ── Root setup ────────────────────────────────────────────────────────
      const created = await auth.createRoot({ firstName: 'Ada', lastName: 'Njoya', email: ROOT })
      expect(created.storage).toBe('mongo')
      expect(created.operator.role).toBe('admin')
      expect(created.operator.mustChangePassword).toBe(true)
      await expect(auth.createRoot({ firstName: 'Ada', lastName: 'Njoya', email: ROOT })).rejects.toThrow(/already/i)
      expect(await auth.isEmpty()).toBe(false)

      // ── Forced password change, then TOTP enrolment ───────────────────────
      const passwordStep = await auth.login(ROOT, created.password)
      expect(passwordStep.status).toBe('password_change_required')
      expect(passwordStep.operator.mfaEnrolled).toBe(false)

      const enrolledStep = await auth.changePassword(passwordStep.challenge, CHANGED)
      expect(enrolledStep.status).toBe('enrollment_required')

      const enrollment = await auth.startEnrollment(enrolledStep.challenge)
      expect(enrollment.otpauthUrl).toContain('otpauth://totp/')
      const enrollmentCode = totpCode(enrollment.secret)
      const session = await auth.confirmEnrollment(enrolledStep.challenge, enrollmentCode)
      const backupCodes = session.backupCodes ?? []
      expect(backupCodes).toHaveLength(10)

      const signedIn = await auth.verifySession(session.token)
      expect(signedIn?.email).toBe(ROOT)
      expect(signedIn?.mfaEnrolled).toBe(true)

      // ── TOTP replay refusal ───────────────────────────────────────────────
      const mfa = await auth.login(ROOT, CHANGED)
      expect(mfa.status).toBe('mfa_required')
      // The enrolment code was already consumed: replaying it must fail.
      await expect(auth.verify(mfa.challenge, enrollmentCode)).rejects.toThrow(/already used|invalid/i)
      // The next time step succeeds.
      const nextCode = totpCode(enrollment.secret, Date.now() + 30_000)
      const totpSession = await auth.verify(mfa.challenge, nextCode)
      expect((await auth.verifySession(totpSession.token))?.email).toBe(ROOT)

      // ── Single-use recovery codes ─────────────────────────────────────────
      const backupChallenge = await auth.login(ROOT, CHANGED)
      const backupSession = await auth.verify(backupChallenge.challenge, backupCodes[0]!)
      expect((await auth.verifySession(backupSession.token))?.email).toBe(ROOT)
      await expect(auth.verify(backupChallenge.challenge, backupCodes[0]!)).rejects.toThrow(
        /already used|invalid/i,
      )

      // ── Preferences and operator list ─────────────────────────────────────
      const preferences = await auth.updatePreferences(ROOT, {
        locale: 'fr',
        notifications: { email: true },
      })
      expect(preferences.locale).toBe('fr')
      expect(preferences.notifications.email).toBe(true)
      expect(preferences.notifications.digest).toBe(true)
      expect(await auth.activeModel()).toBeNull()

      const operators = await auth.listOperators()
      expect(operators.map((operator) => operator.email)).toContain(ROOT)
      expect(await auth.operatorCount()).toBe(1)

      // ── Password reset ────────────────────────────────────────────────────
      const reset = await auth.createPasswordReset(ROOT)
      expect(reset?.email).toBe(ROOT)
      const afterReset = await auth.resetPassword(reset!.token, RESET)
      expect(afterReset.mustChangePassword).toBe(false)
      expect(afterReset.mfaEnrolled).toBe(true)

      // Every session issued before the reset is gone.
      expect(await auth.verifySession(totpSession.token)).toBeNull()
      expect(await auth.verifySession(backupSession.token)).toBeNull()

      // The link is single-use and the old password no longer works.
      await expect(auth.resetPassword(reset!.token, RESET)).rejects.toThrow(/invalid|expired/i)
      await expect(auth.login(ROOT, CHANGED)).rejects.toThrow(/invalid/i)
      const afterPassword = await auth.login(ROOT, RESET)
      expect(afterPassword.status).toBe('mfa_required')

      // ── Public sign-up and e-mail verification ────────────────────────────
      const signup = await auth.signup({
        firstName: 'Grace',
        lastName: 'Mensah',
        email: SIGNUP,
        password: SIGNUP_PASSWORD,
      })
      expect(signup.status).toBe('email_verification_required')
      await expect(auth.login(SIGNUP, SIGNUP_PASSWORD)).rejects.toThrow(/confirm/i)
      await expect(
        auth.signup({ firstName: 'Grace', lastName: 'Mensah', email: SIGNUP, password: SIGNUP_PASSWORD }),
      ).rejects.toThrow(/already exists/i)

      const verification = await auth.createEmailVerification(SIGNUP)
      expect(verification?.email).toBe(SIGNUP)
      expect(await auth.verifyEmail(verification!.token)).toEqual({ email: SIGNUP })
      const judge = await auth.login(SIGNUP, SIGNUP_PASSWORD)
      expect(judge.status).toBe('enrollment_required')
      expect(await auth.verifyEmail(verification!.token)).toEqual({ email: SIGNUP })
    } finally {
      await auth.close()
    }
  }, 60_000)

  test('self-service sign-up stays closed when the deployment disables it', async () => {
    const auth = service({ signup: false })
    try {
      await expect(
        auth.signup({ firstName: 'No', lastName: 'Entry', email: 'closed@sarkiai.dev', password: SIGNUP_PASSWORD }),
      ).rejects.toThrow(/closed/i)
    } finally {
      await auth.close()
    }
  }, 30_000)

  afterAll(async () => {
    if (!mongoUri) return
    const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5_000 })
    try {
      await client.db(DB_NAME).dropDatabase()
    } finally {
      await client.close()
    }
  })
})
