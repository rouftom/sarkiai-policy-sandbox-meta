/**
 * Shared operator-auth primitives for the console: the public types, the error
 * codes, the password hash kept compatible with the legacy store, and the TOTP
 * helpers.
 *
 * The durable accounts, sessions and second factor are owned by better-auth
 * (`@sps/auth/better-auth`). This module no longer implements a backend of its
 * own: it holds what both the migration and the live service need without
 * pulling in a database client.
 */

import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'

export type Role = 'operator' | 'admin'

export interface Preferences {
  theme: 'light' | 'dark' | 'system'
  pack: string
  locale: 'en' | 'fr'
  density: 'comfortable' | 'compact'
  radius: 'rounded' | 'square'
  notifications: { whatsapp: boolean; email: boolean; digest: boolean }
  /** Meta model id chosen from the Meta model list (never read from the environment). */
  model?: string
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'light',
  pack: 'meta',
  locale: 'en',
  density: 'comfortable',
  // The console's chrome is square by default; the app-bar menu switches it.
  radius: 'square',
  notifications: { whatsapp: true, email: false, digest: true },
}

/**
 * Coerce a stored/partial preferences object into the current shape. Older
 * operator documents pre-date `radius`, so they fall back to square rather than
 * leaving the attribute unset.
 */
export function normalizePreferences(preferences?: Partial<Preferences> | null): Preferences {
  return {
    ...DEFAULT_PREFERENCES,
    ...preferences,
    radius: preferences?.radius === 'rounded' ? 'rounded' : 'square',
    notifications: { ...DEFAULT_PREFERENCES.notifications, ...(preferences?.notifications ?? {}) },
  }
}

export interface PublicOperator {
  email: string
  name: string
  firstName?: string
  lastName?: string
  role: Role
  mfaEnrolled: boolean
  mustChangePassword: boolean
  lastLoginAt?: string
  createdAt: string
  preferences: Preferences
}

export interface SessionResult {
  token: string
  expiresAt: string
  operator: PublicOperator
  backupCodes?: string[]
}

/** A sign-in step that carries a challenge to the next form. */
export type ChallengeResult =
  | { status: 'mfa_required'; challenge: string; expiresAt: string; operator: PublicOperator }
  | { status: 'enrollment_required'; challenge: string; expiresAt: string; operator: PublicOperator }
  | { status: 'password_change_required'; challenge: string; expiresAt: string; operator: PublicOperator }

/** Sign-up done: no challenge yet, the e-mail link has to be opened first. */
export type VerificationResult = { status: 'email_verification_required'; expiresAt: string; operator: PublicOperator }

export type LoginResult = ChallengeResult | VerificationResult

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'rate_limited'
  | 'challenge_invalid'
  | 'code_invalid'
  | 'not_found'
  | 'not_enrolled'
  | 'already_enrolled'
  | 'already_initialized'
  | 'weak_password'
  | 'email_taken'
  | 'email_not_verified'
  | 'signup_closed'
  | 'operator_limit'
  | 'storage_unavailable'

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
    /** Seconds the client should wait, when the error is a rate limit. */
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export interface PasswordResetLink {
  token: string
  expiresAt: string
  email: string
  firstName?: string
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const BACKUP_CODE_COUNT = 10
const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000

function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').toUpperCase().replace(/\s/g, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of clean) {
    const index = BASE32.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hotp(secret: Buffer, counter: number, digits = 6): string {
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(buffer).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)
  return String(binary % 10 ** digits).padStart(digits, '0')
}

/** Random base32 secret for an authenticator app. */
export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes))
}

export function totpCode(secret: string, now = Date.now(), step = 30, digits = 6): string {
  return hotp(base32Decode(secret), Math.floor(now / 1000 / step), digits)
}

/** Accepts the previous and next step (clock drift, code typed slowly). */
export function verifyTotp(secret: string, code: string, now = Date.now(), window = 1, step = 30): boolean {
  return totpStep(secret, code, now, window, step) !== null
}

/** The time step a valid code belongs to, or null: lets a caller refuse a replay. */
export function totpStep(secret: string, code: string, now = Date.now(), window = 1, step = 30): number | null {
  const normalized = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return null
  const counter = Math.floor(now / 1000 / step)
  for (let drift = -window; drift <= window; drift += 1) {
    const candidate = hotp(base32Decode(secret), counter + drift)
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(normalized))) return counter + drift
  }
  return null
}

export function otpauthUrl(issuer: string, account: string, secret: string): string {
  const label = `${issuer}:${account}`
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' })
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}

/**
 * Password hashing shared with the better-auth migration (`@sps/auth/better-auth`):
 * better-auth is configured with these exact functions so an operator keeps the
 * password hash it already has instead of being asked to reset it.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')
  return `scrypt$16384$8$1$${salt}$${derived}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, salt, expected] = parts as [string, string, string, string, string, string]
  const derived = scryptSync(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p) })
  const expectedBuffer = Buffer.from(expected, 'hex')
  return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer)
}

/** Minimum length accepted when the operator replaces an invited password. */
export const MIN_PASSWORD_LENGTH = 12

const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * One-time password mailed to a freshly invited operator: 20 characters, at
 * least one lower-case, one upper-case and one digit. It only lives long enough
 * for the first sign-in, which then forces a replacement.
 */
export function generatePassword(groups = 5, size = 4): string {
  const draw = () => PASSWORD_ALPHABET[randomInt(0, PASSWORD_ALPHABET.length)]!
  const chars = [
    'abcdefghijkmnpqrstuvwxyz'[randomInt(0, 24)]!,
    'ABCDEFGHJKLMNPQRSTUVWXYZ'[randomInt(0, 24)]!,
    '23456789'[randomInt(0, 8)]!,
  ]
  const total = groups * size
  while (chars.length < total) chars.push(draw())
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1)
    ;[chars[i], chars[j]] = [chars[j]!, chars[i]!]
  }
  const raw = chars.join('')
  return Array.from({ length: groups }, (_, index) => raw.slice(index * size, (index + 1) * size)).join('-')
}

export function assertPassword(password: string): void {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError('weak_password', `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new AuthError('weak_password', 'Mix letters and digits.')
  }
}

/**
 * The slice of the auth surface a consumer actually needs. Routes that only
 * verify a bearer token depend on this interface, not on the concrete service.
 */
export interface SessionVerifier {
  verifySession(token: string | undefined): Promise<PublicOperator | null>
}
