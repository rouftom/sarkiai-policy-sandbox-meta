/** Shared operator auth instance (one per process). */

import { createHash } from 'node:crypto'
import { AuthService } from '@sps/auth'
import { BetterAuthService } from '@sps/auth/better-auth'
import { config, isLocalOrigin } from './config.js'

const secret = config.auth.sessionSecret
/** Values that are public in this repository (`.env.example`, the code itself). */
const PUBLIC_SECRETS = new Set(['change-me-approval-secret', 'sps-dev-insecure-session-secret'])
if (!secret || PUBLIC_SECRETS.has(secret)) {
  // Anyone could forge a session with a public key. A cloud deployment served on
  // a public origin refuses to start; a local or on-premise run only warns.
  const publicOrigin = config.web.canonicalUrl
  if (config.deployment.cloud && publicOrigin && !isLocalOrigin(publicOrigin)) {
    throw new Error('[auth] SESSION_SECRET (or APPROVAL_SECRET) must be set to a private value on a cloud deployment.')
  }
  console.warn('[auth] SESSION_SECRET / APPROVAL_SECRET is missing or public · sessions use an insecure key; set a private value.')
}

const sessionSecret = secret || 'sps-dev-insecure-session-secret'

/**
 * better-auth refuses a signing key shorter than 32 characters. The legacy
 * secret can be shorter (local installs), so derive a stable 64-character key
 * from it instead of silently generating a new one — a rotation would make the
 * encrypted TOTP material and every session unreadable.
 */
function betterAuthSecret(): string {
  const configured = config.auth.betterAuthSecret
  const material = configured || sessionSecret
  if (!configured) {
    console.warn('[auth] BETTER_AUTH_SECRET is not set · deriving the better-auth key from SESSION_SECRET.')
  } else if (configured.length < 32) {
    console.warn('[auth] BETTER_AUTH_SECRET is shorter than 32 characters · deriving the better-auth key from it.')
  }
  if (material.length >= 32) return material
  return createHash('sha256').update(material).digest('hex')
}

/**
 * better-auth owns the accounts whenever a Mongo store is configured: `user`,
 * `account`, `session`, `verification` and `twoFactor`. Without one the legacy
 * in-memory service keeps the console usable on a bare local install. Both
 * expose the same method surface, so the routes never branch.
 */
export const auth: AuthService | BetterAuthService = config.mongodb.configured
  ? new BetterAuthService({
      mongodbUri: config.mongodb.uri,
      dbName: config.mongodb.dbName,
      secret: betterAuthSecret(),
      sessionSecret,
      baseURL: config.auth.baseUrl,
      signup: config.auth.signup,
      maxOperators: config.auth.maxOperators,
      transactions: config.auth.betterAuthTransactions,
      trustedOrigins: config.web.allowedOrigins,
    })
  : new AuthService({
      dbName: config.mongodb.dbName,
      sessionSecret,
      signup: config.auth.signup,
      maxOperators: config.auth.maxOperators,
    })
