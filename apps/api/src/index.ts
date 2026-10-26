/** Fastify bootstrap. */

import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerRoutes } from './routes/index.js'
import { config } from './config.js'

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })
  await app.register(cors, { origin: true })
  await registerRoutes(app)
  return app
}

async function main(): Promise<void> {
  const app = await buildServer()
  try {
    await app.listen({ host: config.host, port: config.port })
    app.log.info(`SarkiAI Policy Sandbox API listening on http://${config.host}:${config.port}`)
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

void main()
