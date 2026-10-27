/** Fastify bootstrap. */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerRoutes } from './routes/index.js'
import { prepareCloudStores } from './engine.js'
import { auth } from './auth.js'
import { config } from './config.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Exact JSON bytes, kept for WhatsApp `X-Hub-Signature-256` verification. */
    rawBody?: Buffer
  }
}

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

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

  await app.register(cors, { origin: true })
  await registerRoutes(app)
  return app
}

async function main(): Promise<void> {
  const app = await buildServer()

  // Cloud vector store only: create kb_chunks then its Atlas indexes. A failure
  // is logged, not fatal (the console still boots and the provider is visible).
  const operator = await auth.bootstrap()
  if (operator.seeded) {
    app.log.info({ email: operator.email, storage: operator.storage }, 'operator seeded from environment')
  } else {
    app.log.info({ email: operator.email, storage: operator.storage }, 'operator store ready')
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
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void main()
