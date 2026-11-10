/** Shared operator auth instance (one per process). */

import { createHash } from 'node:crypto'
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

if (!config.mongodb.configured) {
  // Operator auth is durable by design now: the legacy in-memory service is
  // gone, so an install without `MONGODB_URI` still targets the local default
  // and logs the requirement instead of silently keeping accounts in RAM.
  console.warn(
    '[auth] MONGODB_URI is not set · operator accounts need a MongoDB store; using the local default.',
  )
}

/**
 * better-auth owns the accounts: `user`, `account`, `session`, `verification`
 * and `twoFactor`. It is the only backend; the in-memory legacy service was
 * removed once the production cut-over was validated.
 */
export const auth = new BetterAuthService({
  mongodbUri: config.mongodb.uri,
  dbName: config.mongodb.dbName,
  secret: betterAuthSecret(),
  sessionSecret,
  baseURL: config.auth.baseUrl,
  cookiePrefix: config.auth.cookiePrefix,
  signup: config.auth.signup,
  maxOperators: config.auth.maxOperators,
  transactions: config.auth.betterAuthTransactions,
  trustedOrigins: config.web.allowedOrigins,
})
