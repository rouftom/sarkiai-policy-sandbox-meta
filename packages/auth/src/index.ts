/**
 * Operator authentication for the console: password, then a second factor.
 *
 * There is no account in the source tree and no seeded password. While the
 * operator store is empty, the console shows a one-time setup screen that asks
 * for the root operator's name and e-mail; the API creates the account with a
 * random password and mails it. The first sign-in forces a password change
 * (`password_change_required`), then the TOTP enrolment (`enrollment_required`):
 * the console shows the otpauth URI (QR) and the operator confirms a 6-digit
 * code once. Later sign-ins require that code, or a single-use backup code.
 *
 * Sessions are stateless HMAC-signed tokens (7 days), so a restart does not sign
 * anyone out and no session table has to be reachable for the demo to work.
 * Operators are persisted in MongoDB when it is reachable; the service keeps an
 * in-memory copy so the console still authenticates while the cluster is down.
 */

import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto'
import { MongoClient, type Collection, type Document } from 'mongodb'

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

export interface OperatorRecord {
  email: string
  name: string
  firstName?: string
  lastName?: string
  role: Role
  passwordHash: string
  /** Set on a freshly invited account: the first sign-in must replace the password. */
  mustChangePassword?: boolean
  totpSecret?: string
  totpEnrolledAt?: string
  backupCodes?: string[]
  preferences: Preferences
  createdAt: string
  lastLoginAt?: string
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

export type LoginResult =
  | { status: 'mfa_required'; challenge: string; expiresAt: string; operator: PublicOperator }
  | { status: 'enrollment_required'; challenge: string; expiresAt: string; operator: PublicOperator }
  | { status: 'password_change_required'; challenge: string; expiresAt: string; operator: PublicOperator }

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

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}

export interface AuthConfig {
  mongodbUri?: string
  dbName?: string
  issuer?: string
  /** HMAC key for sessions and MFA challenges. */
  sessionSecret: string
  sessionTtlSeconds?: number
  challengeTtlSeconds?: number
}

interface SessionClaims {
  v: 1
  sub: string
  role: Role
  name: string
  exp: number
}

interface ChallengeClaims {
  v: 1
  sub: string
  purpose: 'mfa' | 'enroll' | 'password'
  jti: string
  exp: number
}

interface PendingEnrollment {
  email: string
  secret: string
  expiresAt: number
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
  const normalized = code.replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return false
  const counter = Math.floor(now / 1000 / step)
  for (let drift = -window; drift <= window; drift += 1) {
    const candidate = hotp(base32Decode(secret), counter + drift)
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(normalized))) return true
  }
  return false
}

export function otpauthUrl(issuer: string, account: string, secret: string): string {
  const label = `${issuer}:${account}`
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' })
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')
  return `scrypt$16384$8$1$${salt}$${derived}`
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, salt, expected] = parts as [string, string, string, string, string, string]
  const derived = scryptSync(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p) })
  const expectedBuffer = Buffer.from(expected, 'hex')
  return derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer)
}

function backupCode(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const pick = (count: number) =>
    Array.from({ length: count }, () => alphabet[randomInt(0, alphabet.length)]).join('')
  return `${pick(5)}-${pick(5)}`
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Time-ordered token helpers (payload.signature, both base64url). */
function signToken<T extends object>(payload: T, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

function readToken<T>(token: string, secret: string): T | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  if (expected.length !== signature.length) return null
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

function toPublic(record: OperatorRecord): PublicOperator {
  return {
    email: record.email,
    name: record.name,
    firstName: record.firstName,
    lastName: record.lastName,
    role: record.role,
    mfaEnrolled: Boolean(record.totpSecret),
    mustChangePassword: Boolean(record.mustChangePassword),
    lastLoginAt: record.lastLoginAt,
    createdAt: record.createdAt,
    preferences: normalizePreferences(record.preferences),
  }
}

export class AuthService {
  private readonly issuer: string
  private readonly sessionTtl: number
  private readonly challengeTtl: number
  private readonly memory = new Map<string, OperatorRecord>()
  private readonly attempts = new Map<string, { count: number; resetAt: number }>()
  private readonly pendingEnrollments = new Map<string, PendingEnrollment>()
  private client: MongoClient | null = null
  private mongoFailed = false
  private creatingRoot = false

  constructor(private readonly config: AuthConfig) {
    this.issuer = config.issuer ?? 'SarkiAI Policy Sandbox'
    this.sessionTtl = config.sessionTtlSeconds ?? 7 * 24 * 60 * 60
    this.challengeTtl = config.challengeTtlSeconds ?? 5 * 60
  }

  get storage(): 'mongo' | 'memory' {
    return this.client && !this.mongoFailed ? 'mongo' : 'memory'
  }

  private async operators(): Promise<Collection<Document> | null> {
    if (this.mongoFailed || !this.config.mongodbUri) return null
    try {
      if (!this.client) {
        this.client = new MongoClient(this.config.mongodbUri, { serverSelectionTimeoutMS: 2500 })
        await this.client.connect()
      }
      return this.client.db(this.config.dbName ?? 'policy_sandbox').collection('operators')
    } catch {
      this.mongoFailed = true
      return null
    }
  }

  private async load(email: string): Promise<OperatorRecord | null> {
    const key = normalizeEmail(email)
    const cached = this.memory.get(key)
    if (cached) return cached
    const collection = await this.operators()
    if (!collection) return null
    try {
      const doc = await collection.findOne({ _id: key as unknown as Document['_id'] })
      if (!doc) return null
      const { _id: _ignored, ...rest } = doc as unknown as OperatorRecord & { _id: string }
      const record: OperatorRecord = {
        ...rest,
        preferences: { ...DEFAULT_PREFERENCES, ...rest.preferences, notifications: { ...DEFAULT_PREFERENCES.notifications, ...rest.preferences?.notifications } },
      }
      this.memory.set(key, record)
      return record
    } catch {
      this.mongoFailed = true
      return null
    }
  }

  private async save(record: OperatorRecord): Promise<void> {
    const key = normalizeEmail(record.email)
    this.memory.set(key, record)
    const collection = await this.operators()
    if (!collection) return
    try {
      const { email: _email, ...rest } = record
      await collection.updateOne(
        { _id: key as unknown as Document['_id'] },
        { $set: rest, $setOnInsert: { email: record.email } },
        { upsert: true },
      )
    } catch {
      this.mongoFailed = true
    }
  }

  /** True while the operator store is empty: the console then shows the one-time setup. */
  async isEmpty(): Promise<boolean> {
    if (this.memory.size > 0) return false
    const collection = await this.operators()
    if (!collection) return true
    try {
      const doc = await collection.findOne({}, { projection: { _id: 1 } })
      return !doc
    } catch {
      this.mongoFailed = true
      return true
    }
  }

  /**
   * Create the root operator once. The random password is returned to the caller
   * so it can be mailed; it never reaches an HTTP client and must be replaced on
   * the first sign-in.
   */
  async createRoot(input: {
    firstName: string
    lastName: string
    email: string
  }): Promise<{ operator: PublicOperator; password: string; storage: 'mongo' | 'memory' }> {
    const email = normalizeEmail(input.email)
    if (this.creatingRoot) throw new AuthError('already_initialized', 'This deployment already has an operator.')
    if (!(await this.isEmpty())) throw new AuthError('already_initialized', 'This deployment already has an operator.')

    const firstName = input.firstName.trim()
    const lastName = input.lastName.trim()
    const password = generatePassword()
    const now = new Date().toISOString()
    const record: OperatorRecord = {
      email,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim() || email.split('@')[0]!,
      role: 'admin',
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      preferences: { ...DEFAULT_PREFERENCES },
      createdAt: now,
    }

    this.creatingRoot = true
    try {
      await this.save(record)
    } finally {
      this.creatingRoot = false
    }
    return { operator: toPublic(record), password, storage: this.storage }
  }

  /** Roll back a root creation whose invitation e-mail could not be delivered. */
  async remove(email: string): Promise<void> {
    const key = normalizeEmail(email)
    this.memory.delete(key)
    const collection = await this.operators()
    if (!collection) return
    try {
      await collection.deleteOne({ _id: key as unknown as Document['_id'] })
    } catch {
      this.mongoFailed = true
    }
  }

  /**
   * Replace an invited password. The returned challenge continues the same
   * sign-in, so the operator cannot reach the console without enrolling 2FA.
   */
  async changePassword(challenge: string, newPassword: string): Promise<LoginResult> {
    const claims = this.readChallenge(challenge, 'password')
    assertPassword(newPassword)
    const record = await this.load(claims.sub)
    if (!record) throw new AuthError('not_found', 'Unknown operator.')

    record.passwordHash = hashPassword(newPassword)
    delete record.mustChangePassword
    await this.save(record)

    const enrolled = Boolean(record.totpSecret)
    const next = this.issueChallenge(record, enrolled ? 'mfa' : 'enroll')
    return {
      status: enrolled ? 'mfa_required' : 'enrollment_required',
      challenge: next.token,
      expiresAt: next.expiresAt,
      operator: toPublic(record),
    }
  }
  private throttle(key: string): void {
    const now = Date.now()
    const entry = this.attempts.get(key)
    if (!entry || entry.resetAt < now) {
      this.attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS })
      return
    }
    entry.count += 1
    if (entry.count > MAX_ATTEMPTS) throw new AuthError('rate_limited', 'Too many attempts, try again in a few minutes.')
  }

  private clearThrottle(key: string): void {
    this.attempts.delete(key)
  }

  private issueChallenge(record: OperatorRecord, purpose: 'mfa' | 'enroll' | 'password'): { token: string; expiresAt: string } {
    const exp = Math.floor(Date.now() / 1000) + this.challengeTtl
    const claims: ChallengeClaims = {
      v: 1,
      sub: record.email,
      purpose,
      jti: randomBytes(12).toString('base64url'),
      exp,
    }
    return { token: signToken(claims, this.config.sessionSecret), expiresAt: new Date(exp * 1000).toISOString() }
  }

  private readChallenge(token: string, purpose: 'mfa' | 'enroll' | 'password'): ChallengeClaims {
    const claims = readToken<ChallengeClaims>(token, this.config.sessionSecret)
    if (!claims || claims.v !== 1 || claims.purpose !== purpose) {
      throw new AuthError('challenge_invalid', 'This sign-in attempt expired. Start again.')
    }
    if (claims.exp * 1000 < Date.now()) throw new AuthError('challenge_invalid', 'This sign-in attempt expired. Start again.')
    return claims
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const key = normalizeEmail(email)
    this.throttle(`login:${key}`)
    const record = await this.load(key)
    if (!record || !verifyPassword(password, record.passwordHash)) {
      throw new AuthError('invalid_credentials', 'Invalid credentials.')
    }
    this.clearThrottle(`login:${key}`)

    // A freshly invited account must replace its mailed password before the
    // second factor, so the one-time password never becomes a lasting secret.
    if (record.mustChangePassword) {
      const passwordStep = this.issueChallenge(record, 'password')
      return {
        status: 'password_change_required',
        challenge: passwordStep.token,
        expiresAt: passwordStep.expiresAt,
        operator: toPublic(record),
      }
    }

    const enrolled = Boolean(record.totpSecret)
    const challenge = this.issueChallenge(record, enrolled ? 'mfa' : 'enroll')
    return {
      status: enrolled ? 'mfa_required' : 'enrollment_required',
      challenge: challenge.token,
      expiresAt: challenge.expiresAt,
      operator: toPublic(record),
    }
  }

  /** Start (or restart) TOTP enrolment for an `enrollment_required` challenge. */
  async startEnrollment(challenge: string): Promise<{ secret: string; otpauthUrl: string; account: string }> {
    const claims = this.readChallenge(challenge, 'enroll')
    const record = await this.load(claims.sub)
    if (!record) throw new AuthError('not_found', 'Unknown operator.')
    if (record.totpSecret) throw new AuthError('already_enrolled', 'Two-factor is already enabled.')
    const secret = generateTotpSecret()
    this.pendingEnrollments.set(claims.jti, {
      email: record.email,
      secret,
      expiresAt: claims.exp * 1000,
    })
    return { secret, otpauthUrl: otpauthUrl(this.issuer, record.email, secret), account: record.email }
  }

  private async issueSession(record: OperatorRecord): Promise<SessionResult> {
    const exp = Math.floor(Date.now() / 1000) + this.sessionTtl
    const claims: SessionClaims = { v: 1, sub: record.email, role: record.role, name: record.name, exp }
    record.lastLoginAt = new Date().toISOString()
    await this.save(record)
    return {
      token: signToken(claims, this.config.sessionSecret),
      expiresAt: new Date(exp * 1000).toISOString(),
      operator: toPublic(record),
    }
  }

  /** Confirm the first code, persist the secret, return a session and recovery codes. */
  async confirmEnrollment(challenge: string, code: string): Promise<SessionResult> {
    const claims = this.readChallenge(challenge, 'enroll')
    const pending = this.pendingEnrollments.get(claims.jti)
    if (!pending || pending.expiresAt < Date.now()) {
      throw new AuthError('challenge_invalid', 'Enrolment expired. Start again.')
    }
    if (!verifyTotp(pending.secret, code)) throw new AuthError('code_invalid', 'Invalid or expired code.')
    const record = await this.load(pending.email)
    if (!record) throw new AuthError('not_found', 'Unknown operator.')

    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => backupCode())
    record.totpSecret = pending.secret
    record.totpEnrolledAt = new Date().toISOString()
    record.backupCodes = codes.map((code) => sha256(code))
    this.pendingEnrollments.delete(claims.jti)
    const session = await this.issueSession(record)
    return { ...session, backupCodes: codes }
  }

  /** Second factor for an enrolled operator: TOTP code or single-use backup code. */
  async verify(challenge: string, code: string): Promise<SessionResult> {
    const claims = this.readChallenge(challenge, 'mfa')
    this.throttle(`mfa:${claims.sub}`)
    const record = await this.load(claims.sub)
    if (!record?.totpSecret) throw new AuthError('not_enrolled', 'Two-factor is not enabled for this account.')

    const normalized = code.trim().toLowerCase()
    if (/^\d{6}$/.test(normalized)) {
      if (!verifyTotp(record.totpSecret, normalized)) throw new AuthError('code_invalid', 'Invalid or expired code.')
    } else {
      const digest = sha256(normalized)
      const index = (record.backupCodes ?? []).indexOf(digest)
      if (index === -1) throw new AuthError('code_invalid', 'Invalid or already used recovery code.')
      record.backupCodes = (record.backupCodes ?? []).filter((_, position) => position !== index)
    }

    this.clearThrottle(`mfa:${claims.sub}`)
    return this.issueSession(record)
  }

  verifySession(token: string | undefined): PublicOperator | null {
    if (!token) return null
    const claims = readToken<SessionClaims>(token, this.config.sessionSecret)
    if (!claims || claims.v !== 1 || claims.exp * 1000 < Date.now()) return null
    const record = this.memory.get(normalizeEmail(claims.sub))
    if (!record) return { email: claims.sub, name: claims.name, role: claims.role, mfaEnrolled: true, mustChangePassword: false, createdAt: '', preferences: { ...DEFAULT_PREFERENCES } }
    return toPublic(record)
  }

  async me(email: string): Promise<PublicOperator | null> {
    const record = await this.load(email)
    return record ? toPublic(record) : null
  }

  async preferences(email: string): Promise<Preferences> {
    const record = await this.load(email)
    if (!record) throw new AuthError('not_found', 'Unknown operator.')
    return record.preferences
  }

  /**
   * The Meta model the console last saved, across operators. The engine restores
   * it on boot so a redeploy keeps the chosen model.
   */
  async activeModel(): Promise<string | null> {
    for (const record of this.memory.values()) {
      if (record.preferences.model) return record.preferences.model
    }
    const collection = await this.operators()
    if (!collection) return null
    try {
      const doc = await collection.findOne({ 'preferences.model': { $type: 'string' } }, { projection: { 'preferences.model': 1 } })
      const model = (doc as { preferences?: { model?: unknown } } | null)?.preferences?.model
      return typeof model === 'string' && model ? model : null
    } catch {
      this.mongoFailed = true
      return null
    }
  }

  async updatePreferences(
    email: string,
    patch: Partial<Omit<Preferences, 'notifications'>> & { notifications?: Partial<Preferences['notifications']> },
  ): Promise<Preferences> {
    const record = await this.load(email)
    if (!record) throw new AuthError('not_found', 'Unknown operator.')
    const next: Preferences = normalizePreferences({
      ...record.preferences,
      ...patch,
      notifications: { ...record.preferences.notifications, ...(patch.notifications ?? {}) },
    })
    record.preferences = next
    await this.save(record)
    return next
  }
}
