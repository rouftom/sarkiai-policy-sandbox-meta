/**
 * The operator console driven by better-auth.
 *
 * better-auth owns the durable side: `user`, `account`, `session`,
 * `verification` and `twoFactor` collections, the password hash (the legacy
 * scrypt format), the seven-day sessions and the encrypted TOTP material.
 *
 * What stays application-level is the sign-in *state machine*: this console is
 * served from another origin, so it carries a bearer token, not a cookie. The
 * two-factor plugin stores a short-lived signed cookie between the password and
 * the code, which a third-party origin cannot rely on; the challenge envelope
 * below carries the step instead, exactly as the console already expects.
 *
 * The HTTP contract is unchanged: `apps/api/src/auth-routes.ts` keeps calling
 * the same methods and returning the same shapes.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { MongoClient, type MongoClientOptions } from 'mongodb'
import { runWithEndpointContext, type AuthEndpointContext } from '@better-auth/core/context'
import { signJWT, symmetricDecrypt, symmetricEncrypt, verifyJWT } from 'better-auth/crypto'
import { createBetterAuth, type BetterAuthEvents, type BetterAuthInstance } from './config.js'
import {
  AuthError,
  DEFAULT_PREFERENCES,
  assertPassword,
  generatePassword,
  generateTotpSecret,
  hashPassword,
  normalizePreferences,
  otpauthUrl,
  totpStep,
  verifyPassword,
  type ChallengeResult,
  type PasswordResetLink,
  type Preferences,
  type PublicOperator,
  type Role,
  type SessionResult,
  type VerificationResult,
} from '../index.js'

export interface BetterAuthServiceConfig {
  mongodbUri: string
  dbName?: string
  /** better-auth signing key: sessions, JWT links and encrypted TOTP material. */
  secret: string
  /** Public API origin used in the links better-auth builds. */
  baseURL: string
  sessionSecret?: string
  appName?: string
  issuer?: string
  trustedOrigins?: string[]
  sessionTtlSeconds?: number
  challengeTtlSeconds?: number
  resetTtlSeconds?: number
  verificationTtlSeconds?: number
  signup?: boolean
  maxOperators?: number
  events?: BetterAuthEvents
  mongoOptions?: MongoClientOptions
  /** Run better-auth's multi-write operations in a Mongo transaction. */
  transactions?: boolean
}

interface ChallengeClaims {
  v: 1
  sub: string
  purpose: 'mfa' | 'enroll' | 'password'
  jti: string
  exp: number
}

interface PendingEnrollment {
  userId: string
  secret: string
  expiresAt: number
}

interface UserRow {
  id: string
  email: string
  name: string
  role?: string
  firstName?: string
  lastName?: string
  emailVerified?: boolean
  mustChangePassword?: boolean
  twoFactorEnabled?: boolean
  lastLoginAt?: string
  totpLastStep?: number
  preferences?: Partial<Preferences> | null
  createdAt?: string | Date
}

interface TwoFactorRow {
  id: string
  userId: string
  secret: string
  backupCodes: string
}

const BACKUP_CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'
const BACKUP_CODE_COUNT = 10
const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function backupCode(): string {
  const pick = (count: number) =>
    Array.from({ length: count }, () => BACKUP_CODE_ALPHABET[Math.floor(Math.random() * BACKUP_CODE_ALPHABET.length)]).join('')
  return `${pick(5)}-${pick(5)}`
}

function iso(value: string | Date | undefined | null): string {
  if (!value) return new Date(0).toISOString()
  return value instanceof Date ? value.toISOString() : value
}

function signChallenge(claims: ChallengeClaims, secret: string): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function readChallenge(token: string, secret: string): ChallengeClaims | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', secret).update(payload).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ChallengeClaims
    return claims.v === 1 && typeof claims.sub === 'string' && typeof claims.exp === 'number' ? claims : null
  } catch {
    return null
  }
}

/** better-auth throws `APIError`s whose message is what the console should read. */
function messageOf(error: unknown): string {
  const body = (error as { body?: { message?: string } }).body
  return body?.message ?? (error as Error).message ?? 'Authentication failed.'
}

export class BetterAuthService {
  private readonly client: MongoClient
  private readonly auth: BetterAuthInstance
  private readonly secret: string
  private readonly challengeSecret: string
  private readonly sessionTtl: number
  private readonly challengeTtl: number
  private readonly resetTtl: number
  private readonly verificationTtl: number
  private readonly attempts = new Map<string, { count: number; resetAt: number }>()
  private readonly pendingEnrollments = new Map<string, PendingEnrollment>()
  private creatingRoot = false

  constructor(private readonly config: BetterAuthServiceConfig) {
    this.client = new MongoClient(config.mongodbUri, config.mongoOptions)
    this.secret = config.secret
    this.challengeSecret = config.sessionSecret ?? config.secret
    this.sessionTtl = config.sessionTtlSeconds ?? 7 * 24 * 60 * 60
    this.challengeTtl = config.challengeTtlSeconds ?? 5 * 60
    this.resetTtl = config.resetTtlSeconds ?? 30 * 60
    this.verificationTtl = config.verificationTtlSeconds ?? 24 * 60 * 60
    this.auth = createBetterAuth({
      db: this.client.db(config.dbName),
      client: this.client,
      secret: config.secret,
      baseURL: config.baseURL,
      ...(config.appName ? { appName: config.appName } : {}),
      ...(config.issuer ? { issuer: config.issuer } : {}),
      ...(config.trustedOrigins ? { trustedOrigins: config.trustedOrigins } : {}),
      ...(config.events ? { events: config.events } : {}),
      ...(config.transactions !== undefined ? { transactions: config.transactions } : {}),
    })
  }

  get storage(): 'mongo' {
    return 'mongo'
  }

  get signupEnabled(): boolean {
    return Boolean(this.config.signup)
  }

  /** Typed as `any`: the internal adapter is not part of the public surface. */
  private async ctx(): Promise<any> {
    return await this.auth.$context
  }

  /**
   * better-auth installs an endpoint context around its own `auth.api.*` calls;
   * the internal adapter's database hooks read it. This service drives the
   * adapter directly for the custom challenge flow, so it installs the same
   * context instead of bypassing the hooks and writing raw Mongo documents.
   */
  private async withContext<T>(fn: () => Promise<T>): Promise<T> {
    const context = await this.ctx()
    const endpoint = { context, path: '/internal/auth', headers: new Headers() } as AuthEndpointContext
    return await runWithEndpointContext(endpoint, fn)
  }

  private async findUserById(id: string): Promise<UserRow | null> {
    const ctx = await this.ctx()
    return (await ctx.internalAdapter.findUserById(id)) as UserRow | null
  }

  private async findUserByEmail(email: string): Promise<{ user: UserRow; accounts: Array<{ providerId: string; password?: string }> } | null> {
    const ctx = await this.ctx()
    return (await ctx.internalAdapter.findUserByEmail(normalizeEmail(email), { includeAccounts: true })) as
      | { user: UserRow; accounts: Array<{ providerId: string; password?: string }> }
      | null
  }

  private toPublic(user: UserRow): PublicOperator {
    return {
      email: user.email,
      name: user.name,
      ...(user.firstName ? { firstName: user.firstName } : {}),
      ...(user.lastName ? { lastName: user.lastName } : {}),
      role: (user.role === 'admin' ? 'admin' : 'operator') as Role,
      mfaEnrolled: Boolean(user.twoFactorEnabled),
      mustChangePassword: Boolean(user.mustChangePassword),
      ...(user.lastLoginAt ? { lastLoginAt: iso(user.lastLoginAt) } : {}),
      createdAt: iso(user.createdAt),
      preferences: normalizePreferences(user.preferences),
    }
  }

  private async createUserRow(input: {
    email: string
    name: string
    firstName: string
    lastName: string
    role: Role
    password: string
    emailVerified: boolean
    mustChangePassword: boolean
  }): Promise<UserRow> {
    return await this.withContext(async () => {
      const ctx = await this.ctx()
      const now = new Date()
      const user = (await ctx.internalAdapter.createUser({
        email: normalizeEmail(input.email),
        name: input.name,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        emailVerified: input.emailVerified,
        mustChangePassword: input.mustChangePassword,
        preferences: { ...DEFAULT_PREFERENCES },
        twoFactorEnabled: false,
        createdAt: now,
        updatedAt: now,
      })) as UserRow
      try {
        await ctx.internalAdapter.createAccount({
          userId: user.id,
          providerId: 'credential',
          accountId: user.id,
          password: hashPassword(input.password),
          createdAt: now,
          updatedAt: now,
        })
      } catch (error) {
        // No credential row means no usable account: do not leave a user behind
        // that would block the "store is empty" setup guard.
        await ctx.internalAdapter.deleteUser(user.id).catch(() => undefined)
        throw error
      }
      return user
    })
  }

  private isDuplicate(error: unknown): boolean {
    const text = `${(error as Error).message ?? ''} ${JSON.stringify((error as { keyPattern?: unknown }).keyPattern ?? '')}`
    return text.includes('E11000') || text.toLowerCase().includes('duplicate key')
  }

  private async isEmptyUnsafe(): Promise<boolean> {
    const ctx = await this.ctx()
    return (await ctx.internalAdapter.countTotalUsers()) === 0
  }

  /** Fail closed: an unreadable store must never reopen the root setup. */
  async isEmpty(): Promise<boolean> {
    try {
      return await this.isEmptyUnsafe()
    } catch {
      return false
    }
  }

  async createRoot(input: {
    firstName: string
    lastName: string
    email: string
  }): Promise<{ operator: PublicOperator; password: string; storage: 'mongo' }> {
    if (this.creatingRoot) throw new AuthError('already_initialized', 'This deployment already has an operator.')
    if (!(await this.isEmpty())) throw new AuthError('already_initialized', 'This deployment already has an operator.')

    const firstName = input.firstName.trim()
    const lastName = input.lastName.trim()
    const password = generatePassword()
    this.creatingRoot = true
    try {
      const user = await this.createUserRow({
        email: input.email,
        name: `${firstName} ${lastName}`.trim() || input.email.split('@')[0]!,
        firstName,
        lastName,
        role: 'admin',
        password,
        emailVerified: true,
        mustChangePassword: true,
      })
      return { operator: this.toPublic(user), password, storage: 'mongo' }
    } catch (error) {
      if (this.isDuplicate(error)) {
        throw new AuthError('already_initialized', 'This deployment already has an operator.')
      }
      throw new AuthError('storage_unavailable', 'The operator store is unreachable; setup was not saved.')
    } finally {
      this.creatingRoot = false
    }
  }

  async listOperators(): Promise<PublicOperator[]> {
    const ctx = await this.ctx()
    const users = (await ctx.internalAdapter.listUsers(500, 0)) as UserRow[]
    return users
      .sort((a, b) => {
        const left = a.lastLoginAt ?? ''
        const right = b.lastLoginAt ?? ''
        return right.localeCompare(left) || a.email.localeCompare(b.email)
      })
      .map((user) => this.toPublic(user))
  }

  async operatorCount(): Promise<number> {
    const ctx = await this.ctx()
    return await ctx.internalAdapter.countTotalUsers()
  }

  async signup(input: {
    firstName: string
    lastName: string
    email: string
    password: string
  }): Promise<VerificationResult> {
    if (!this.config.signup) {
      throw new AuthError('signup_closed', 'Self-service sign-up is closed on this deployment.')
    }
    assertPassword(input.password)
    const email = normalizeEmail(input.email)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AuthError('not_found', 'Enter a valid e-mail address.')
    if (await this.findUserByEmail(email)) throw new AuthError('email_taken', 'An account already exists for this address.')

    const limit = this.config.maxOperators ?? 10
    if ((await this.operatorCount()) >= limit) {
      throw new AuthError('operator_limit', `This demo is limited to ${limit} operator accounts.`)
    }

    const firstName = input.firstName.trim()
    const lastName = input.lastName.trim()
    try {
      const user = await this.createUserRow({
        email,
        name: `${firstName} ${lastName}`.trim() || email.split('@')[0]!,
        firstName,
        lastName,
        role: 'operator',
        password: input.password,
        emailVerified: false,
        mustChangePassword: false,
      })
      return {
        status: 'email_verification_required',
        expiresAt: new Date(Date.now() + this.verificationTtl * 1000).toISOString(),
        operator: this.toPublic(user),
      }
    } catch (error) {
      if (this.isDuplicate(error)) throw new AuthError('email_taken', 'An account already exists for this address.')
      throw new AuthError('storage_unavailable', 'The operator store is unreachable; the account was not created.')
    }
  }

  async createEmailVerification(email: string): Promise<{ token: string; expiresAt: string; email: string; firstName?: string } | null> {
    const found = await this.findUserByEmail(email)
    if (!found || found.user.emailVerified) return null
    const expiresAt = new Date(Date.now() + this.verificationTtl * 1000).toISOString()
    // Same JWT format better-auth's own `/verify-email` endpoint consumes.
    const token = await signJWT(
      { email: found.user.email },
      this.secret,
      this.verificationTtl,
    )
    return {
      token,
      expiresAt,
      email: found.user.email,
      ...(found.user.firstName ? { firstName: found.user.firstName } : {}),
    }
  }

  async verifyEmail(token: string): Promise<{ email: string }> {
    const payload = (await verifyJWT(token, this.secret)) as { email?: unknown } | null
    if (!payload || typeof payload.email !== 'string') {
      throw new AuthError('challenge_invalid', 'This confirmation link has expired. Request a new one.')
    }
    const found = await this.findUserByEmail(payload.email)
    if (!found) throw new AuthError('not_found', 'Unknown operator.')
    if (!found.user.emailVerified) {
      const ctx = await this.ctx()
      await this.withContext(() => ctx.internalAdapter.updateUser(found.user.id, { emailVerified: true }))
    }
    return { email: found.user.email }
  }

  async remove(email: string): Promise<void> {
    const found = await this.findUserByEmail(email)
    if (!found) return
    try {
      const ctx = await this.ctx()
      await this.withContext(() => ctx.internalAdapter.deleteUser(found.user.id))
    } catch {
      /* rollback is best-effort, like the legacy service */
    }
  }

  async createPasswordReset(email: string): Promise<PasswordResetLink | null> {
    const found = await this.findUserByEmail(email)
    if (!found) return null
    const token = randomBytes(18).toString('base64url')
    const expiresAt = new Date(Date.now() + this.resetTtl * 1000)
    try {
      const ctx = await this.ctx()
      await this.withContext(() =>
        ctx.internalAdapter.createVerificationValue({
          identifier: `reset-password:${token}`,
          value: found.user.id,
          expiresAt,
        }),
      )
    } catch {
      throw new AuthError('storage_unavailable', 'The operator store is unreachable, so a reset link cannot be issued.')
    }
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      email: found.user.email,
      ...(found.user.firstName ? { firstName: found.user.firstName } : {}),
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<PublicOperator> {
    assertPassword(newPassword)
    const ctx = await this.ctx()
    const verification = await ctx.internalAdapter.findVerificationValue(`reset-password:${token}`)
    if (!verification || verification.expiresAt < new Date()) {
      throw new AuthError('challenge_invalid', 'This reset link is invalid. Request a new one.')
    }
    try {
      // Consumes the verification record, re-hashes, revokes every session and
      // fires the `onPasswordReset` event.
      await this.auth.api.resetPassword({ body: { token, newPassword } })
    } catch (error) {
      throw this.mapApiError(error)
    }
    const user = await this.findUserById(String(verification.value))
    if (!user) throw new AuthError('not_found', 'Unknown operator.')
    // A completed reset clears the "replace the mailed password" flag, like the
    // legacy service.
    const updated = (await this.withContext(() =>
      ctx.internalAdapter.updateUser(user.id, { mustChangePassword: false }),
    )) as UserRow
    this.clearThrottle(`login:${user.email}`)
    return this.toPublic(updated)
  }

  private mapApiError(error: unknown): AuthError {
    const message = messageOf(error)
    if (/invalid token|expired/i.test(message)) {
      return new AuthError('challenge_invalid', 'This link is invalid or expired. Request a new one.')
    }
    if (/password too short|password too long/i.test(message)) {
      return new AuthError('weak_password', message)
    }
    if (/invalid password|invalid credentials/i.test(message)) {
      return new AuthError('invalid_credentials', 'Invalid credentials.')
    }
    if (/user not found/i.test(message)) {
      return new AuthError('not_found', 'Unknown operator.')
    }
    return new AuthError('storage_unavailable', message)
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

  private issueChallenge(user: UserRow, purpose: 'mfa' | 'enroll' | 'password'): { token: string; expiresAt: string } {
    const exp = Math.floor(Date.now() / 1000) + this.challengeTtl
    const claims: ChallengeClaims = {
      v: 1,
      sub: user.id,
      purpose,
      jti: randomBytes(12).toString('base64url'),
      exp,
    }
    return { token: signChallenge(claims, this.challengeSecret), expiresAt: new Date(exp * 1000).toISOString() }
  }

  private readChallenge(token: string, purpose: 'mfa' | 'enroll' | 'password'): ChallengeClaims {
    const claims = readChallenge(token, this.challengeSecret)
    if (!claims || claims.purpose !== purpose) {
      throw new AuthError('challenge_invalid', 'This sign-in attempt expired. Start again.')
    }
    if (claims.exp * 1000 < Date.now()) throw new AuthError('challenge_invalid', 'This sign-in attempt expired. Start again.')
    return claims
  }

  async login(email: string, password: string): Promise<ChallengeResult> {
    const key = normalizeEmail(email)
    this.throttle(`login:${key}`)
    const found = await this.findUserByEmail(key)
    const credential = found?.accounts.find((account) => account.providerId === 'credential')
    if (!found || !credential?.password || !verifyPassword(password, credential.password)) {
      throw new AuthError('invalid_credentials', 'Invalid credentials.')
    }
    this.clearThrottle(`login:${key}`)

    if (!found.user.emailVerified) {
      throw new AuthError('email_not_verified', 'Confirm your e-mail address first: we sent you a link.')
    }

    if (found.user.mustChangePassword) {
      const step = this.issueChallenge(found.user, 'password')
      return {
        status: 'password_change_required',
        challenge: step.token,
        expiresAt: step.expiresAt,
        operator: this.toPublic(found.user),
      }
    }

    const enrolled = Boolean(found.user.twoFactorEnabled)
    const step = this.issueChallenge(found.user, enrolled ? 'mfa' : 'enroll')
    return {
      status: enrolled ? 'mfa_required' : 'enrollment_required',
      challenge: step.token,
      expiresAt: step.expiresAt,
      operator: this.toPublic(found.user),
    }
  }

  async changePassword(challenge: string, newPassword: string): Promise<ChallengeResult> {
    const claims = this.readChallenge(challenge, 'password')
    assertPassword(newPassword)
    const user = await this.findUserById(claims.sub)
    if (!user) throw new AuthError('not_found', 'Unknown operator.')

    const ctx = await this.ctx()
    const updated = (await this.withContext(async () => {
      await ctx.internalAdapter.updatePassword(user.id, hashPassword(newPassword))
      // A password change ends every token issued before it, like the legacy
      // `sessionVersion` bump. better-auth 1.7 renamed the sweep: the internal
      // `deleteSessions` now takes session tokens, `deleteUserSessions` takes
      // the owner.
      await ctx.internalAdapter.deleteUserSessions(user.id)
      return await ctx.internalAdapter.updateUser(user.id, { mustChangePassword: false })
    })) as UserRow
    this.clearThrottle(`login:${user.email}`)

    const enrolled = Boolean(updated.twoFactorEnabled)
    const next = this.issueChallenge(updated, enrolled ? 'mfa' : 'enroll')
    return {
      status: enrolled ? 'mfa_required' : 'enrollment_required',
      challenge: next.token,
      expiresAt: next.expiresAt,
      operator: this.toPublic(updated),
    }
  }

  async startEnrollment(challenge: string): Promise<{ secret: string; otpauthUrl: string; account: string }> {
    const claims = this.readChallenge(challenge, 'enroll')
    const user = await this.findUserById(claims.sub)
    if (!user) throw new AuthError('not_found', 'Unknown operator.')
    if (user.twoFactorEnabled) throw new AuthError('already_enrolled', 'Two-factor is already enabled.')
    const secret = generateTotpSecret()
    this.pendingEnrollments.set(claims.jti, {
      userId: user.id,
      secret,
      expiresAt: claims.exp * 1000,
    })
    return {
      secret,
      otpauthUrl: otpauthUrl(this.config.issuer ?? 'SarkiAI Policy Sandbox', user.email, secret),
      account: user.email,
    }
  }

  private async issueSession(user: UserRow): Promise<SessionResult> {
    return await this.withContext(async () => {
      const ctx = await this.ctx()
      const lastLoginAt = new Date().toISOString()
      const updated = (await ctx.internalAdapter.updateUser(user.id, { lastLoginAt })) as UserRow
      const session = await ctx.internalAdapter.createSession(user.id)
      if (!session) throw new AuthError('storage_unavailable', 'The session could not be created; try again.')
      return {
        token: session.token,
        expiresAt: new Date(session.expiresAt).toISOString(),
        operator: this.toPublic({ ...updated, lastLoginAt }),
      }
    })
  }

  async confirmEnrollment(challenge: string, code: string): Promise<SessionResult> {
    const claims = this.readChallenge(challenge, 'enroll')
    const pending = this.pendingEnrollments.get(claims.jti)
    if (!pending || pending.expiresAt < Date.now()) {
      throw new AuthError('challenge_invalid', 'Enrolment expired. Start again.')
    }
    const enrollmentStep = totpStep(pending.secret, code)
    if (enrollmentStep === null) throw new AuthError('code_invalid', 'Invalid or expired code.')
    const user = await this.findUserById(pending.userId)
    if (!user) throw new AuthError('not_found', 'Unknown operator.')

    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () => backupCode())
    const ctx = await this.ctx()
    // Same shape the `two-factor` plugin reads: encrypted secret and codes.
    const encryptedSecret = await symmetricEncrypt({ key: this.secret, data: pending.secret })
    const encryptedCodes = await symmetricEncrypt({ key: this.secret, data: JSON.stringify(codes) })
    await this.withContext(async () => {
      await ctx.adapter.deleteMany({ model: 'twoFactor', where: [{ field: 'userId', value: user.id }] })
      await ctx.adapter.create({
        model: 'twoFactor',
        data: { userId: user.id, secret: encryptedSecret, backupCodes: encryptedCodes },
      })
      await ctx.internalAdapter.updateUser(user.id, { twoFactorEnabled: true, totpLastStep: enrollmentStep })
    })

    this.pendingEnrollments.delete(claims.jti)
    const session = await this.issueSession(user)
    return { ...session, backupCodes: codes }
  }

  async verify(challenge: string, code: string): Promise<SessionResult> {
    const claims = this.readChallenge(challenge, 'mfa')
    this.throttle(`mfa:${claims.sub}`)
    const user = await this.findUserById(claims.sub)
    if (!user?.twoFactorEnabled) throw new AuthError('not_enrolled', 'Two-factor is not enabled for this account.')

    const ctx = await this.ctx()
    const row = (await ctx.adapter.findOne({
      model: 'twoFactor',
      where: [{ field: 'userId', value: user.id }],
    })) as TwoFactorRow | null
    if (!row) throw new AuthError('not_enrolled', 'Two-factor is not enabled for this account.')
    const secret = await symmetricDecrypt({ key: this.secret, data: row.secret })

    const normalized = code.trim().toLowerCase()
    if (/^\d{6}$/.test(normalized)) {
      const step = totpStep(secret, normalized)
      if (step === null) throw new AuthError('code_invalid', 'Invalid or expired code.')
      if (user.totpLastStep !== undefined && step <= user.totpLastStep) {
        throw new AuthError('code_invalid', 'This code was already used. Wait for the next one.')
      }
      await this.withContext(() => ctx.internalAdapter.updateUser(user.id, { totpLastStep: step }))
    } else {
      const codes = JSON.parse(await symmetricDecrypt({ key: this.secret, data: row.backupCodes })) as string[]
      const remaining = codes.filter((entry) => entry.toLowerCase() !== normalized)
      if (remaining.length === codes.length) {
        throw new AuthError('code_invalid', 'Invalid or already used recovery code.')
      }
      const encryptedCodes = await symmetricEncrypt({ key: this.secret, data: JSON.stringify(remaining) })
      await this.withContext(() =>
        ctx.adapter.updateMany({
          model: 'twoFactor',
          update: { backupCodes: encryptedCodes },
          where: [
            { field: 'userId', value: user.id },
            { field: 'backupCodes', value: row.backupCodes },
          ],
        }),
      )
    }

    this.clearThrottle(`mfa:${claims.sub}`)
    return await this.issueSession(user)
  }

  /**
   * Sessions are better-auth sessions: the bearer plugin resolves the header,
   * and a deleted session or a removed account fails at once.
   */
  async verifySession(token: string | undefined): Promise<PublicOperator | null> {
    if (!token) return null
    try {
      const result = await this.auth.api.getSession({
        headers: new Headers({ authorization: `Bearer ${token}` }),
      })
      return result ? this.toPublic(result.user as UserRow) : null
    } catch {
      return null
    }
  }

  async revokeSessions(email: string): Promise<void> {
    const found = await this.findUserByEmail(email)
    if (!found) return
    const ctx = await this.ctx()
    await this.withContext(() => ctx.internalAdapter.deleteUserSessions(found.user.id))
  }

  async close(): Promise<void> {
    await this.client.close().catch(() => undefined)
  }

  async me(email: string): Promise<PublicOperator | null> {
    const found = await this.findUserByEmail(email)
    return found ? this.toPublic(found.user) : null
  }

  async preferences(email: string): Promise<Preferences> {
    const found = await this.findUserByEmail(email)
    if (!found) throw new AuthError('not_found', 'Unknown operator.')
    return normalizePreferences(found.user.preferences)
  }

  async activeModel(): Promise<string | null> {
    const ctx = await this.ctx()
    const users = (await ctx.internalAdapter.listUsers(500, 0)) as UserRow[]
    for (const user of users) {
      const model = normalizePreferences(user.preferences).model
      if (model) return model
    }
    return null
  }

  async updatePreferences(
    email: string,
    patch: Partial<Omit<Preferences, 'notifications'>> & { notifications?: Partial<Preferences['notifications']> },
  ): Promise<Preferences> {
    const found = await this.findUserByEmail(email)
    if (!found) throw new AuthError('not_found', 'Unknown operator.')
    const next = normalizePreferences({
      ...normalizePreferences(found.user.preferences),
      ...patch,
      notifications: { ...normalizePreferences(found.user.preferences).notifications, ...(patch.notifications ?? {}) },
    })
    const ctx = await this.ctx()
    await this.withContext(() => ctx.internalAdapter.updateUser(found.user.id, { preferences: next }))
    return next
  }
}
