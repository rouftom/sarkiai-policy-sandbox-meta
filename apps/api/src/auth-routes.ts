/**
 * Operator auth, preferences and the audit feed.
 *
 * The console (Vercel) and the API (Render) are different origins, so the
 * session travels as an `Authorization: Bearer <token>` header rather than a
 * cookie: no third-party-cookie policy can break the demo. Tokens are stateless
 * and signed for seven days; the client drops the token on sign-out.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuditService } from '@sps/audit'
import { AuthError, type PublicOperator } from '@sps/auth'
import { auth } from './auth.js'

function bearer(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return undefined
  return header.slice('Bearer '.length).trim()
}

export function currentOperator(request: FastifyRequest): PublicOperator | null {
  return auth.verifySession(bearer(request))
}

const credentials = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
})

const codeStep = z.object({
  challenge: z.string().min(10).max(4096),
  code: z.string().min(4).max(32),
})

function failure(reply: { status: (code: number) => { send: (body: unknown) => unknown } }, error: unknown) {
  if (error instanceof AuthError) {
    const status = error.code === 'rate_limited' ? 429 : error.code === 'invalid_credentials' ? 401 : 400
    return reply.status(status).send({ error: error.code, message: error.message })
  }
  return reply.status(500).send({ error: 'auth_failed', message: (error as Error).message })
}

/** Best-effort audit trail: never block a sign-in because Mongo is down. */
function recorder(audit: AuditService) {
  return async (actor: string, action: string, target?: string) => {
    try {
      await audit.logAction({ actor, action, target, lens: 'hybrid' })
    } catch {
      /* audit store unreachable — the console still works */
    }
  }
}

export async function registerAuthRoutes(app: FastifyInstance, audit: AuditService): Promise<void> {
  const record = recorder(audit)

  app.post('/v1/auth/login', async (request, reply) => {
    const body = credentials.parse(request.body)
    try {
      const result = await auth.login(body.email, body.password)
      await record(result.operator.email, 'auth.password_accepted', result.status)
      return result
    } catch (error) {
      await record(body.email, 'auth.failed')
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/mfa/enroll', async (request, reply) => {
    const { challenge } = z.object({ challenge: z.string().min(10).max(4096) }).parse(request.body)
    try {
      return await auth.startEnrollment(challenge)
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/mfa/confirm', async (request, reply) => {
    const body = codeStep.parse(request.body)
    try {
      const session = await auth.confirmEnrollment(body.challenge, body.code)
      await record(session.operator.email, 'auth.mfa_enrolled')
      await record(session.operator.email, 'auth.login')
      return session
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/mfa/verify', async (request, reply) => {
    const body = codeStep.parse(request.body)
    try {
      const session = await auth.verify(body.challenge, body.code)
      await record(session.operator.email, 'auth.login')
      return session
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.get('/v1/auth/me', async (request, reply) => {
    const operator = currentOperator(request)
    if (!operator) return reply.status(401).send({ error: 'unauthorized' })
    return { operator }
  })

  app.post('/v1/auth/logout', async (request) => {
    const operator = currentOperator(request)
    if (operator) await record(operator.email, 'auth.logout')
    return { ok: true }
  })

  app.get('/v1/preferences', async (request, reply) => {
    const operator = currentOperator(request)
    if (!operator) return reply.status(401).send({ error: 'unauthorized' })
    return { preferences: await auth.preferences(operator.email) }
  })

  app.put('/v1/preferences', async (request, reply) => {
    const operator = currentOperator(request)
    if (!operator) return reply.status(401).send({ error: 'unauthorized' })
    const patch = z
      .object({
        theme: z.enum(['light', 'dark', 'system']).optional(),
        pack: z.string().max(40).optional(),
        locale: z.enum(['en', 'fr']).optional(),
        density: z.enum(['comfortable', 'compact']).optional(),
        radius: z.enum(['rounded', 'square']).optional(),
        notifications: z
          .object({ whatsapp: z.boolean(), email: z.boolean(), digest: z.boolean() })
          .partial()
          .optional(),
      })
      .parse(request.body)
    const preferences = await auth.updatePreferences(operator.email, patch)
    await record(operator.email, 'preferences.updated')
    return { preferences }
  })

  // ── Audit feed (console page) ─────────────────────────────────────────────
  app.get('/v1/audit/events', async (request, reply) => {
    const operator = currentOperator(request)
    if (!operator) return reply.status(401).send({ error: 'unauthorized' })
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }).parse(request.query)
    try {
      const [events, chain] = await Promise.all([audit.listAudit(limit), audit.verifyChain()])
      return { events, chain }
    } catch (error) {
      return reply.status(503).send({ error: 'audit_unavailable', message: (error as Error).message })
    }
  })
}
