import { describe, expect, test } from 'bun:test'
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { hashPassword } from '../index'
import {
  legacyUserId,
  migrationWarnings,
  planOperatorMigration,
  planTwoFactor,
  type LegacyOperator,
} from './migrate'

const SECRET = 'sps-test-secret-at-least-32-characters-long'
const CREATED = '2026-01-05T09:30:00.000Z'
const LOGIN = '2026-02-01T18:00:00.000Z'

function operator(overrides: Partial<LegacyOperator> = {}): LegacyOperator {
  return {
    email: 'Ada.Operator@SarkiAI.dev',
    name: 'Ada Operator',
    firstName: 'Ada',
    lastName: 'Operator',
    role: 'admin',
    passwordHash: hashPassword('policy-sandbox-2026'),
    preferences: { theme: 'dark' },
    createdAt: CREATED,
    lastLoginAt: LOGIN,
    ...overrides,
  }
}

describe('legacy operator mapping', () => {
  test('the user id is deterministic and e-mail based', () => {
    const a = legacyUserId('Ada.Operator@SarkiAI.dev')
    const b = legacyUserId('  ada.operator@sarkiai.dev ')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
  })

  test('maps identity, role and preferences, and keeps the password hash verbatim', () => {
    const source = operator()
    const { user, account } = planOperatorMigration(source)

    expect(user.id).toBe(legacyUserId(source.email))
    expect(user.email).toBe('ada.operator@sarkiai.dev')
    expect(user.name).toBe('Ada Operator')
    expect(user.role).toBe('admin')
    expect(user.preferences).toEqual({ theme: 'dark' })
    expect(user.emailVerified).toBe(true)
    expect(user.mustChangePassword).toBe(false)
    expect(user.twoFactorEnabled).toBe(false)
    expect(user.lastLoginAt).toBe(LOGIN)
    expect(user.createdAt).toEqual(new Date(CREATED))
    expect(user.updatedAt).toEqual(new Date(LOGIN))

    expect(account.userId).toBe(user.id)
    expect(account.providerId).toBe('credential')
    expect(account.password).toBe(source.passwordHash)
  })

  test('a pending verification keeps the address unverified', () => {
    const { user } = planOperatorMigration(operator({ emailVerificationPending: true }))
    expect(user.emailVerified).toBe(false)
  })

  test('an enrolled operator is flagged for the second factor', () => {
    const { user } = planOperatorMigration(operator({ totpSecret: 'JBSWY3DPEHPK3PXP' }))
    expect(user.twoFactorEnabled).toBe(true)
  })
})

describe('two-factor migration', () => {
  test('nothing to migrate when the operator never enrolled', async () => {
    expect(await planTwoFactor(operator(), SECRET)).toBeNull()
  })

  test('the secret and the recovery codes are encrypted with the auth secret', async () => {
    const source = operator({ totpSecret: 'JBSWY3DPEHPK3PXP', backupCodes: ['abcde-23456'] })
    const row = await planTwoFactor(source, SECRET)
    expect(row).not.toBeNull()
    expect(row?.userId).toBe(legacyUserId(source.email))
    expect(row?.secret).not.toContain('JBSWY3DPEHPK3PXP')

    // better-auth reads both fields with `symmetricDecrypt` and the auth secret.
    expect(await symmetricDecrypt({ key: SECRET, data: row!.secret })).toBe('JBSWY3DPEHPK3PXP')
    expect(JSON.parse(await symmetricDecrypt({ key: SECRET, data: row!.backupCodes }))).toEqual([
      'abcde-23456',
    ])
  })

  test('a different secret cannot read the row', async () => {
    const row = await planTwoFactor(operator({ totpSecret: 'JBSWY3DPEHPK3PXP' }), SECRET)
    const encrypted = await symmetricEncrypt({ key: 'another-secret-at-least-32-characters', data: 'x' })
    expect(encrypted).not.toBe(row!.secret)
    await expect(
      symmetricDecrypt({ key: 'another-secret-at-least-32-characters', data: row!.secret }),
    ).rejects.toBeDefined()
  })

  test('an enrolled operator without recovery codes keeps an empty list', async () => {
    const row = await planTwoFactor(operator({ totpSecret: 'JBSWY3DPEHPK3PXP' }), SECRET)
    expect(JSON.parse(await symmetricDecrypt({ key: SECRET, data: row!.backupCodes }))).toEqual([])
  })
})

describe('migration warnings', () => {
  test('silent on a clean operator', () => {
    expect(migrationWarnings(operator({ totpSecret: 'JBSWY3DPEHPK3PXP', backupCodes: ['abcde-23456'] }))).toEqual([])
  })

  test('flags a TOTP without recovery codes', () => {
    const warnings = migrationWarnings(operator({ totpSecret: 'JBSWY3DPEHPK3PXP' }))
    expect(warnings.some((warning) => warning.includes('without recovery codes'))).toBe(true)
  })

  test('flags a hash the verifier would reject', () => {
    const warnings = migrationWarnings(operator({ passwordHash: 'bcrypt$whatever' }))
    expect(warnings.some((warning) => warning.includes('not in the scrypt$ format'))).toBe(true)
  })

  test('flags the mustChangePassword + TOTP pair', () => {
    const warnings = migrationWarnings(
      operator({ mustChangePassword: true, totpSecret: 'JBSWY3DPEHPK3PXP', backupCodes: ['abcde-23456'] }),
    )
    expect(warnings.some((warning) => warning.includes('mustChangePassword'))).toBe(true)
  })
})
