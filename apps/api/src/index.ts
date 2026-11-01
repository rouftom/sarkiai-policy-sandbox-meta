/** Fastify bootstrap. */

import { existsSync, readFileSync } from 'node:fs'
import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { registerRoutes, seedReferenceImages, closeStores } from './routes/index.js'
import { prepareCloudStores } from './engine.js'
import { auth } from './auth.js'
import { config } from './config.js'
import { resetDemoState } from './demo-reset.js'
import { maintainAuditChain, ensureAuditReadIndexes } from './audit-maintenance.js'
import type { PublicOperator } from '@sps/auth'

declare module 'fastify' {
  interface FastifyRequest {
    /** Exact JSON bytes, kept for WhatsApp `X-Hub-Signature-256` verification. */
    rawBody?: Buffer
    /** Operator established by the API-wide Bearer guard (`registerRoutes`). */
    operator?: PublicOperator
  }
}

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // The realtime voice socket carries the session token in its query string: never log it.
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url.replace(/([?&]token=)[^&]*/, '$1[redacted]'),
            host: request.hostname,
            remoteAddress: request.ip,
            remotePort: request.socket?.remotePort,
          }
        },
      },
    },
    // Render terminates TLS in front of the service: without this, every
    // request shares the proxy's IP and the sign-up/sign-in throttles are global.
    trustProxy: true,
    // A signed approval token in the URL is about 200 characters; Fastify's default limit is 100.
    maxParamLength: 1024,
  })

  // Keep the raw bytes of JSON bodies: Meta signs the exact payload, so
  // re-serialising `request.body` would invalidate the HMAC.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const raw = typeof body === 'string' ? Buffer.from(body) : body
    request.rawBody = raw
    if (raw.length === 0) {
      done(null, undefined)
      return
    }
    try {
      done(null, JSON.parse(raw.toString('utf8')))
    } catch (error) {
      done(error as Error, undefined)
    }
  })

  // Browser calls come from the console: the canonical origin, its aliases,
  // loopback and Vercel previews. A self-hosted install with no configured
  // origin keeps the historical permissive policy, so a LAN name or a remapped
  // port never breaks it (see config.web.isAllowedOrigin). Server-to-server
  // calls (Meta webhook, curl) send no Origin and are unaffected.
  await app.register(cors, {
    origin: (origin, callback) => callback(null, config.web.isAllowedOrigin(origin)),
  })
  await registerRoutes(app)
  return app
}

/**
 * Maintenance hatch for hosts without a shell.
 *
 * Render free instances refuse SSH, one-off jobs, pre-deploy commands and
 * start-command overrides, so the only process that can reach `MONGODB_URI` is
 * the web service itself. Committing `apps/api/scripts/reset-on-boot.flag`
 * makes the next deploy wipe the demo state before the console answers;
 * deleting the flag and deploying again disarms it.
 */
async function maybeResetOnBoot(app: FastifyInstance): Promise<void> {
  const flag = new URL('../scripts/reset-on-boot.flag', import.meta.url)
  if (!existsSync(flag)) return

  try {
    const result = await resetDemoState({
      uri: config.mongodb.uri,
      dbName: config.mongodb.dbName,
      serverSelectionTimeoutMs: 15_000,
    })
    app.log.warn(
      { database: result.database, deleted: result.deleted, collections: result.counts.map((entry) => entry.name) },
      'demo reset executed at boot (reset-on-boot.flag present)',
    )
  } catch (error) {
    // The console still boots: a failed wipe must never take the demo down.
    app.log.error(
      { message: error instanceof Error ? error.message : 'unknown error' },
      'demo reset at boot failed',
    )
  }
}

/**
 * Audit chain hatch, same mechanism as the demo reset. Committing
 * `apps/api/scripts/audit-chain.flag` with `check` logs the chain verdict at the
 * next boot; with `purge` it archives the chain and starts a new one. Delete
 * the flag and deploy again once done.
 */
async function maybeMaintainAuditChain(app: FastifyInstance): Promise<void> {
  const flag = new URL('../scripts/audit-chain.flag', import.meta.url)
  if (!existsSync(flag)) return
  const mode = readFileSync(flag, 'utf8').trim()
  if (mode !== 'check' && mode !== 'purge') return
  try {
    const result = await maintainAuditChain({ uri: config.mongodb.uri, dbName: config.mongodb.dbName, mode })
    app.log.warn({ mode, before: result.before, after: result.after, archive: result.archive }, 'audit chain maintenance at boot')
  } catch (error) {
    app.log.error({ message: error instanceof Error ? error.message : 'unknown error' }, 'audit chain maintenance at boot failed')
  }
}

/**
 * Reference figures hatch: committing `apps/api/scripts/reference-images.flag`
 * generates the 13 readiness figures after the console answers. The job is
 * idempotent, so the flag may stay; it runs in the background and never blocks boot.
 */
function maybeSeedReferenceImages(app: FastifyInstance): void {
  const flag = new URL('../scripts/reference-images.flag', import.meta.url)
  if (!existsSync(flag)) return
  void seedReferenceImages(app.log)
    .then((result) => app.log.warn(result, 'reference figures seeded at boot'))
    .catch((error) =>
      app.log.error({ message: error instanceof Error ? error.message : 'unknown error' }, 'reference figures seeding failed'),
    )
}

/** How long a stopping instance waits for in-flight work before exiting. */
const SHUTDOWN_TIMEOUT_MS = 20_000

async function main(): Promise<void> {
  const app = await buildServer()
  await maybeMaintainAuditChain(app)

  // Before `auth.isEmpty()`: the console must see the store freshly emptied.
  await maybeResetOnBoot(app)

  // After the optional reset, which drops `audit_logs` and its indexes: create
  // the console's read index once at boot instead of on the first page read.
  // Best-effort, like the lazy path: a failed index never blocks the API.
  const auditIndexed = await ensureAuditReadIndexes({
    uri: config.mongodb.uri,
    dbName: config.mongodb.dbName,
  })
  app.log[auditIndexed ? 'info' : 'warn'](
    { collection: 'audit_logs', index: 'audit_user_ts' },
    auditIndexed ? 'audit read index ready' : 'audit read index unavailable; reads will be slower',
  )

  // Cloud vector store only: create kb_chunks then its Atlas indexes. A failure
  // is logged, not fatal (the console still boots and the provider is visible).
  // Accounts are created from the console: no seeded operator, no seeded password.
  const empty = await auth.isEmpty()
  app.log.info(
    { initialized: !empty, storage: auth.storage, mail: Boolean(config.mail.apiKey) },
    empty ? 'operator store empty · the console will show the root setup screen' : 'operator store ready',
  )
  if (empty && !config.mail.apiKey) {
    app.log.warn('AUTH_RESEND_KEY is not set: the root setup screen cannot mail an invitation.')
  }

  const stores = await prepareCloudStores()
  if (stores.skipped) {
    app.log.info({ retrieval: stores.backend }, 'cloud store bootstrap skipped')
  } else if (stores.error) {
    app.log.error({ retrieval: stores.backend, error: stores.error }, 'cloud store bootstrap failed')
  } else {
    app.log.info(stores, 'cloud vector store ready')
  }

  try {
    await app.listen({ host: config.host, port: config.port })
    app.log.info(`SarkiAI Policy Sandbox API listening on http://${config.host}:${config.port}`)
    maybeSeedReferenceImages(app)
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }

  /**
   * The host stops the instance with SIGTERM on every deploy. Stop accepting,
   * let in-flight requests finish, then release the Mongo clients. A stream
   * that never ends (a closed tab that the proxy still holds) is cut at the
   * deadline rather than keeping the old instance alive for its full timeout.
   */
  let stopping = false
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return
    stopping = true
    app.log.info({ signal }, 'shutting down')
    const deadline = setTimeout(() => {
      app.log.warn({ timeoutMs: SHUTDOWN_TIMEOUT_MS }, 'shutdown deadline reached; exiting')
      process.exit(0)
    }, SHUTDOWN_TIMEOUT_MS)
    deadline.unref()
    try {
      await app.close()
      await closeStores()
      clearTimeout(deadline)
      process.exit(0)
    } catch (error) {
      app.log.error({ message: error instanceof Error ? error.message : 'unknown error' }, 'shutdown failed')
      process.exit(1)
    }
  }

  process.once('SIGTERM', () => void shutdown('SIGTERM'))
  process.once('SIGINT', () => void shutdown('SIGINT'))
}

void main()
