/**
 * Data migration plan from the legacy `operators` collection to better-auth.
 *
 * The legacy service stores one document per operator, keyed by the lower-cased
 * e-mail, with the scrypt password hash, the base32 TOTP secret and the
 * SHA-256 digests of the recovery codes. better-auth stores four documents
 * instead:
 *
 * - `user` — identity, role, preferences, `mustChangePassword`,
 *   `twoFactorEnabled`;
 * - `account` — the `credential` provider and the password hash (unchanged:
 *   `createBetterAuth` is configured with the legacy hash/verify functions);
 * - `twoFactor` — the TOTP secret and the backup codes, both encrypted with the
 *   auth secret (better-auth decrypts them on read);
 * - `session` — created on the first sign-in, so nothing to migrate.
 *
 * The planning functions here are pure (except `planTwoFactor`, which encrypts),
 * so they can be tested and dry-run without a database. The runner in phase 3
 * writes them in order (user, account, twoFactor) inside a transaction when the
 * deployment supports one.
 */

import { createHash } from 'node:crypto'
import { symmetricEncrypt } from 'better-auth/crypto'
import type { Preferences } from '../index.js'

/** The persisted legacy operator document, minus Mongo's `_id`. */
export interface LegacyOperator {
  email: string
  name: string
  firstName?: string
  lastName?: string
  role: 'operator' | 'admin'
  passwordHash: string
  mustChangePassword?: boolean
  /** Public sign-up only: the address still has to be confirmed. */
  emailVerificationPending?: boolean
  totpSecret?: string
  totpEnrolledAt?: string
  /** SHA-256 digests of the single-use codes, never the codes themselves. */
  backupCodes?: string[]
  /** Last accepted TOTP time step, carried over so an old code cannot replay. */
  totpLastStep?: number
  preferences?: Partial<Preferences>
  createdAt: string
  lastLoginAt?: string
}

export interface PlannedUser {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: 'operator' | 'admin'
  firstName?: string
  lastName?: string
  preferences?: Partial<Preferences>
  mustChangePassword: boolean
  lastLoginAt?: string
  totpLastStep?: number
  twoFactorEnabled: boolean
  createdAt: Date
  updatedAt: Date
}

export interface PlannedAccount {
  id: string
  userId: string
  providerId: 'credential'
  accountId: string
  password: string
  createdAt: Date
  updatedAt: Date
}

export interface PlannedTwoFactor {
  id: string
  userId: string
  /** Encrypted base32 secret, as better-auth stores it. */
  secret: string
  /** Encrypted JSON array of single-use codes. */
  backupCodes: string
  createdAt: Date
  updatedAt: Date
}

export interface OperatorMigrationPlan {
  user: PlannedUser
  account: PlannedAccount
}

/**
 * Deterministic identifier: the same operator always maps to the same user id,
 * so a re-run is idempotent and a session issued before a retry still matches.
 */
export function legacyUserId(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32)
}

function accountId(userId: string): string {
  return `${userId}-credential`
}

/** Identity and credential documents for one operator. */
export function planOperatorMigration(operator: LegacyOperator): OperatorMigrationPlan {
  const id = legacyUserId(operator.email)
  const createdAt = new Date(operator.createdAt)
  const updatedAt = operator.lastLoginAt ? new Date(operator.lastLoginAt) : createdAt

  return {
    user: {
      id,
      name: operator.name,
      email: operator.email.trim().toLowerCase(),
      emailVerified: !operator.emailVerificationPending,
      image: null,
      role: operator.role,
      ...(operator.firstName ? { firstName: operator.firstName } : {}),
      ...(operator.lastName ? { lastName: operator.lastName } : {}),
      ...(operator.preferences ? { preferences: operator.preferences } : {}),
      mustChangePassword: Boolean(operator.mustChangePassword),
      ...(operator.lastLoginAt ? { lastLoginAt: operator.lastLoginAt } : {}),
      ...(operator.totpLastStep !== undefined ? { totpLastStep: operator.totpLastStep } : {}),
      twoFactorEnabled: Boolean(operator.totpSecret),
      createdAt,
      updatedAt,
    },
    account: {
      id: accountId(id),
      userId: id,
      providerId: 'credential',
      accountId: id,
      // Kept verbatim: better-auth verifies it with the legacy function.
      password: operator.passwordHash,
      createdAt,
      updatedAt,
    },
  }
}

/**
 * The `twoFactor` document, or `null` when the operator never enrolled.
 * `secret` is the auth secret (the same one passed to `createBetterAuth`),
 * because better-auth decrypts both fields with it.
 *
 * The recovery codes are deliberately not carried over. The legacy store keeps
 * only a SHA-256 digest of each code (`packages/auth/src/index.ts`), while
 * better-auth compares the codes in clear text and re-encrypts the list. The
 * digests cannot be reversed, so the migrated row starts with an empty list and
 * the operator regenerates codes after signing in.
 */
export async function planTwoFactor(
  operator: LegacyOperator,
  secret: string,
): Promise<PlannedTwoFactor | null> {
  if (!operator.totpSecret) return null
  const userId = legacyUserId(operator.email)
  const createdAt = new Date(operator.totpEnrolledAt ?? operator.createdAt)
  const updatedAt = createdAt

  return {
    id: `${userId}-totp`,
    userId,
    secret: await symmetricEncrypt({ key: secret, data: operator.totpSecret }),
    backupCodes: await symmetricEncrypt({ key: secret, data: '[]' }),
    createdAt,
    updatedAt,
  }
}

/** Warnings a dry run should surface before anyone writes to production. */
export function migrationWarnings(operator: LegacyOperator): string[] {
  const warnings: string[] = []
  if (operator.totpSecret && operator.backupCodes?.length) {
    warnings.push(
      `${operator.email}: legacy recovery codes are digests and cannot be imported; the operator must regenerate them`,
    )
  } else if (operator.totpSecret) {
    warnings.push(`${operator.email}: TOTP enrolled without recovery codes`)
  }
  if (operator.mustChangePassword && operator.totpSecret) {
    warnings.push(
      `${operator.email}: both mustChangePassword and an enrolled TOTP (the legacy service repairs this pair)`,
    )
  }
  if (!operator.passwordHash.startsWith('scrypt$')) {
    warnings.push(`${operator.email}: password hash is not in the scrypt$ format the verifier accepts`)
  }
  return warnings
}
