/** Shared operator auth instance (one per process). */

import { AuthService } from '@sps/auth'
import { config } from './config.js'

const secret = config.auth.sessionSecret
if (!secret) {
  // Local dev only: sessions are still signed, but with a well-known key.
  console.warn('[auth] SESSION_SECRET / APPROVAL_SECRET is not set — using an insecure development key.')
}

export const auth = new AuthService({
  mongodbUri: config.mongodb.uri,
  dbName: config.mongodb.dbName,
  sessionSecret: secret || 'sps-dev-insecure-session-secret',
})
