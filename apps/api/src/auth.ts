/** Shared operator auth instance (one per process). */

import { AuthService } from '@sps/auth'
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

export const auth = new AuthService({
  mongodbUri: config.mongodb.uri,
  dbName: config.mongodb.dbName,
  sessionSecret: secret || 'sps-dev-insecure-session-secret',
  signup: config.auth.signup,
  maxOperators: config.auth.maxOperators,
})
