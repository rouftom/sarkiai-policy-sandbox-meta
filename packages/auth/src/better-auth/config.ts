/**
 * better-auth configuration for the operator console.
 *
 * `BetterAuthService` owns the live routes. This module builds the instance with
 * the same guarantees the legacy service had, so the cut-over did not have to
 * rewrite authentication blind:
 *
 * - the console and the API are different origins, so the `bearer` plugin keeps
 *   the session in an `Authorization` header instead of a cookie;
 * - the password hash format is the one the operators already have, through
 *   `emailAndPassword.password.hash/verify`, so nobody has to reset a password;
 * - TOTP and single-use recovery codes come from the `twoFactor` plugin, and
 *   administrators manage accounts through the `admin` plugin (`operator` and
 *   `admin` roles);
 * - sessions live seven days in MongoDB and are read on every request, so a
 *   removal or a revoke invalidates them at once (`storeSessionInDatabase`,
 *   cookie cache disabled);
 * - mail and audit stay application concerns: the caller passes the mailer and
 *   the event hooks, exactly like `Mailer` and `AuditService` today.
 *
 * See `docs/AUTH-BETTER-AUTH-MIGRATION.md` for the route mapping and the
 * remaining phases.
 */

import type { Db, IndexSpecification, MongoClient } from 'mongodb'
import { betterAuth } from 'better-auth'
import type { BetterAuthOptions } from 'better-auth/types'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { admin, twoFactor } from 'better-auth/plugins'
import { bearer } from 'better-auth/plugins/bearer'
import { createAccessControl } from 'better-auth/plugins/access'
import {
  getAuthTablesWithResolvedIndexes,
  getDatabaseFieldIndexName,
} from '@better-auth/core/db/internal'
import {
  adminAc as adminPluginAc,
  defaultStatements as adminStatements,
} from 'better-auth/plugins/admin/access'
import { hashPassword, verifyPassword } from '../index.js'

/** One transactional e-mail the application has to send. */
export interface AuthMessage {
  to: string
  name: string
  url: string
  token: string
  /** Seconds, when the caller wants to render the lifetime. */
  expiresIn?: number
}

/**
 * Delivery hooks. The API passes its existing Resend mailer; a local install
 * that has no transport can pass a mailer that throws, or leave `mail` out and
 * get a clear error instead of a silent no-send.
 */
export interface BetterAuthMailer {
  sendResetPassword(message: AuthMessage): Promise<void>
  sendVerificationEmail(message: AuthMessage): Promise<void>
}

/**
 * Audit and side-effect hooks. Every hook is best-effort: better-auth must not
 * fail a sign-in because the audit store is down, which is the rule the current
 * routes already follow.
 */
export interface BetterAuthEvents {
  onUserCreated?(input: { id: string; email: string; name: string }): Promise<void> | void
  onSessionCreated?(input: { userId: string; token: string }): Promise<void> | void
  onPasswordReset?(input: { id: string; email: string }): Promise<void> | void
}

export interface BetterAuthInput {
  /** Mongo database the adapter writes to. */
  db: Db
  /** The connected client, kept by the adapter. */
  client: MongoClient
  /** Signing key. better-auth wants at least 32 characters. */
  secret: string
  /** Public origin of the API, used in the links better-auth builds. */
  baseURL: string
  /** Console origins allowed to call the API cross-origin. */
  trustedOrigins?: string[]
  appName?: string
  /** TOTP issuer shown in the authenticator app. */
  issuer?: string
  cookiePrefix?: string
  /** Defaults to `baseURL` starting with `https:`. */
  useSecureCookies?: boolean
  mail?: BetterAuthMailer
  events?: BetterAuthEvents
  rateLimit?: { enabled?: boolean; window?: number; max?: number }
  /**
   * Multi-write operations (a password reset revoking every session) run in a
   * MongoDB transaction when this is true. Transactions need a replica set or
   * a mongos, so the default is false: a bare local `mongod`, which the project
   * supports, refuses them. Turn it on for an Atlas or clustered deployment.
   */
  transactions?: boolean
  /** Override the collection names when an install uses a prefix. */
  models?: {
    user?: string
    session?: string
    account?: string
    verification?: string
    twoFactor?: string
  }
}

const DAY = 60 * 60 * 24

/**
 * Access control for the `admin` plugin. The application keeps its own
 * `role` check on every route; this only decides who may call better-auth's
 * user-management endpoints.
 */
export const statement = {
  ...adminStatements,
} as const

export const ac = createAccessControl(statement)

export const operatorRole = ac.newRole({
  user: ['get', 'update'],
  session: ['list', 'revoke'],
})

export const adminRole = ac.newRole({
  ...adminPluginAc.statements,
})

export const ROLES = {
  operator: operatorRole,
  admin: adminRole,
}

function requireMail<K extends keyof BetterAuthMailer>(
  mail: BetterAuthMailer | undefined,
  method: K,
): BetterAuthMailer[K] {
  if (!mail) {
    return (async () => {
      throw new Error(
        `[auth] ${String(method)} needs a mailer; pass \`mail\` to createBetterAuth() or configure a transport.`,
      )
    }) as BetterAuthMailer[K]
  }
  return mail[method]
}

/**
 * Build the better-auth options. Kept separate from `createBetterAuth` so the
 * database index bootstrap can derive the exact same schema (the adapter and
 * the bootstrap must agree on collection and index names).
 */
export function createAuthOptions(input: BetterAuthInput): BetterAuthOptions {
  const secure = input.useSecureCookies ?? input.baseURL.startsWith('https:')
  const mail = input.mail

  return {
    appName: input.appName ?? 'SarkiAI Policy Sandbox',
    baseURL: input.baseURL,
    secret: input.secret,
    trustedOrigins: input.trustedOrigins ?? [],
    database: mongodbAdapter(input.db, {
      client: input.client,
      transaction: input.transactions ?? false,
    }),

    emailAndPassword: {
      enabled: true,
      // Same minimum as `MIN_PASSWORD_LENGTH` in @sps/auth.
      minPasswordLength: 12,
      maxPasswordLength: 200,
      // Public sign-up is confirmed by e-mail before the second factor.
      requireEmailVerification: true,
      // A completed reset must end every session it was meant to protect.
      revokeSessionsOnPasswordReset: true,
      // Thirty minutes, like `resetTtl` in @sps/auth (better-auth defaults to one hour).
      resetPasswordTokenExpiresIn: 30 * 60,
      password: {
        hash: async (password: string) => hashPassword(password),
        verify: async ({ hash, password }: { hash: string; password: string }) =>
          verifyPassword(password, hash),
      },
      sendResetPassword: async ({ user, url, token }) => {
        await requireMail(mail, 'sendResetPassword')({
          to: user.email,
          name: user.name,
          url,
          token,
          expiresIn: 30 * 60,
        })
      },
      onPasswordReset: async ({ user }) => {
        await input.events?.onPasswordReset?.({ id: user.id, email: user.email })
      },
    },

    emailVerification: {
      // The sign-up route decides when to send, so this is not automatic.
      sendOnSignUp: false,
      autoSignInAfterVerification: false,
      expiresIn: DAY,
      sendVerificationEmail: async ({ user, url, token }) => {
        await requireMail(mail, 'sendVerificationEmail')({
          to: user.email,
          name: user.name,
          url,
          token,
          expiresIn: DAY,
        })
      },
    },

    user: {
      modelName: input.models?.user ?? 'user',
      additionalFields: {
        firstName: { type: 'string', required: false, input: true },
        lastName: { type: 'string', required: false, input: true },
        // Theme, language, density, notification consent and the chosen model.
        preferences: { type: 'json', required: false, input: true },
        // A freshly invited account must replace its mailed password.
        mustChangePassword: { type: 'boolean', required: false, defaultValue: false, input: true },
        lastLoginAt: { type: 'string', required: false, input: false },
        // Last accepted TOTP time step: a code cannot be used twice.
        totpLastStep: { type: 'number', required: false, input: false },
      },
    },

    account: { modelName: input.models?.account ?? 'account' },
    verification: { modelName: input.models?.verification ?? 'verification' },

    session: {
      modelName: input.models?.session ?? 'session',
      // Seven days, like the signed tokens the console carries today.
      expiresIn: 7 * DAY,
      updateAge: DAY,
      // Read on every request: a removal or a revoke invalidates at once.
      storeSessionInDatabase: true,
      // No signed-cookie cache: a stale cache would survive a revoke.
      cookieCache: { enabled: false },
    },

    advanced: {
      cookiePrefix: input.cookiePrefix ?? 'sps-',
      useSecureCookies: secure,
      defaultCookieAttributes: {
        // The console and the API are different origins. `SameSite=None` needs
        // `Secure`, which a local plain-HTTP install does not have.
        sameSite: secure ? ('none' as const) : ('lax' as const),
        secure,
        path: '/',
      },
    },

    rateLimit: {
      // Defense in depth: the Fastify routes keep their own per-IP limiter, and
      // better-auth bounds its endpoints even if that one is disabled.
      enabled: input.rateLimit?.enabled ?? true,
      window: input.rateLimit?.window ?? 60,
      max: input.rateLimit?.max ?? 100,
      customRules: {
        '/sign-in/email': { window: 15 * 60, max: 20 },
        '/sign-up/email': { window: 15 * 60, max: 6 },
        '/forget-password': { window: 15 * 60, max: 5 },
        '/send-verification-email': { window: 15 * 60, max: 5 },
        '/two-factor/verify-totp': { window: 5 * 60, max: 10 },
        '/two-factor/verify-backup-code': { window: 5 * 60, max: 10 },
      },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            try {
              await input.events?.onUserCreated?.({ id: user.id, email: user.email, name: user.name })
            } catch {
              /* audit is best-effort */
            }
          },
        },
      },
      session: {
        create: {
          after: async (session) => {
            try {
              await input.events?.onSessionCreated?.({ userId: session.userId, token: session.token })
            } catch {
              /* audit is best-effort */
            }
          },
        },
      },
    },

    plugins: [
      bearer(),
      admin({
        ac,
        roles: ROLES,
        defaultRole: 'operator',
      }) as any,
      twoFactor({
        issuer: input.issuer ?? 'SarkiAI Policy Sandbox',
        // Recovery codes are secret material: keep them encrypted at rest
        // instead of the plugin's plain-JSON default.
        backupCodeOptions: { storeBackupCodes: 'encrypted' },
      }) as any,
    ],
  } as BetterAuthOptions
}

/**
 * Build the better-auth instance. Construction touches no network: the adapter
 * only stores the `Db`, so this is safe at import time and in tests.
 */
export function createBetterAuth(input: BetterAuthInput) {
  return betterAuth(createAuthOptions(input) as any)
}

/** One index better-auth depends on, resolved to its stored collection. */
export interface AuthIndex {
  collection: string
  name: string
  keys: IndexSpecification
  unique: boolean
}

/**
 * The indexes better-auth's own schema declares, derived from the real options
 * rather than copied by hand.
 *
 * The MongoDB adapter creates them lazily on the first write for a model. A
 * deployment whose rows were inserted by the one-off migration (`auth:migrate`)
 * never went through that path, so the auth collections can stay unindexed:
 * `user.email`, `session.token`, `session.userId`, `account.userId`,
 * `verification.identifier` and the two `twoFactor` lookups all miss their
 * index. `BetterAuthService.ensureIndexes()` applies this list at boot, which
 * makes the lazy path and the migrated collections converge.
 */
export function authIndexes(input: BetterAuthInput): AuthIndex[] {
  const { tables, indexesByTable } = getAuthTablesWithResolvedIndexes(createAuthOptions(input))
  const resolved: AuthIndex[] = []

  // Field-level metadata (`index: true` / `unique: true`) is what the core
  // schema uses for `user.email`, `session.token`, `session.userId`,
  // `account.userId`, `verification.identifier` and the `twoFactor` lookups.
  // The adapter's table-level resolver does not expand it, so it is expanded
  // here with better-auth's own naming helper.
  for (const table of Object.values(tables)) {
    const collection = table.modelName
    for (const [fieldName, field] of Object.entries(table.fields)) {
      if (!field.index && !field.unique) continue
      const column = field.fieldName ?? fieldName
      const unique = field.unique ?? false
      resolved.push({
        collection,
        name: getDatabaseFieldIndexName(collection, column, unique),
        keys: { [column === 'id' ? '_id' : column]: 1 } as IndexSpecification,
        unique,
      })
    }
  }

  // Table-level indexes declared by plugins.
  for (const [collection, indexes] of indexesByTable) {
    for (const index of indexes) {
      resolved.push({
        collection,
        name: index.name,
        keys: Object.fromEntries(
          index.columns.map((field) => [field === 'id' ? '_id' : field, 1 as const]),
        ) as IndexSpecification,
        unique: index.unique ?? false,
      })
    }
  }

  const seen = new Set<string>()
  return resolved.filter((index) => {
    const key = `${index.collection}.${index.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export type BetterAuthInstance = ReturnType<typeof createBetterAuth>
