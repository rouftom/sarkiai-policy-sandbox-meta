/**
 * Operator auth, preferences and the audit feed.
 *
 * The console (Vercel) and the API (Render) are different origins, so the
 * session travels as an `Authorization: Bearer <token>` header rather than a
 * cookie: no third-party-cookie policy can break the demo. Tokens are stateless
 * and signed for seven days; the client drops the token on sign-out.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z, ZodError } from 'zod'
import type { AuditService } from '@sps/audit'
import { AuthError, type PublicOperator } from '@sps/auth'
import { auth } from './auth.js'
import { MailError, sendEmailVerification, sendInvitation, sendPasswordReset } from './mailer.js'

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

const setupInput = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().email().max(200),
})

const passwordChange = z.object({
  challenge: z.string().min(10).max(4096),
  password: z.string().min(12).max(200),
})

const forgotInput = z.object({
  email: z.string().email().max(200),
})

const resetInput = z.object({
  token: z.string().min(10).max(4096),
  password: z.string().min(12).max(200),
})

const signupInput = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().email().max(200),
  password: z.string().min(12).max(200),
})

function failure(reply: { status: (code: number) => { send: (body: unknown) => unknown } }, error: unknown) {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'invalid_request', message: 'Invalid request body.' })
  }
  if (error instanceof MailError) {
    return reply
      .status(error.code === 'mail_not_configured' ? 503 : 502)
      .send({ error: error.code, message: error.message })
  }
  if (error instanceof AuthError) {
    const status =
      error.code === 'rate_limited' || error.code === 'operator_limit'
        ? 429
        : error.code === 'invalid_credentials'
          ? 401
          : error.code === 'signup_closed' || error.code === 'email_not_verified'
            ? 403
            : error.code === 'storage_unavailable'
              ? 503
              : error.code === 'already_initialized' || error.code === 'email_taken'
                ? 409
                : 400
    return reply.status(status).send({ error: error.code, message: error.message })
  }
  return reply.status(500).send({ error: 'auth_failed', message: (error as Error).message })
}

/** Best-effort audit trail: never block a sign-in because Mongo is down. */
function recorder(audit: AuditService) {
  return async (actor: string, action: string, target?: string, userId?: string) => {
    try {
      await audit.logAction({ actor, action, target, userId, lens: 'hybrid' })
    } catch {
      /* audit store unreachable · the console still works */
    }
  }
}

export async function registerAuthRoutes(app: FastifyInstance, audit: AuditService): Promise<void> {
  const record = recorder(audit)

  // ── One-time root setup ───────────────────────────────────────────────────
  // No operator exists until someone completes this screen; the account is
  // created with a random password and mailed through Resend.
  const setupAttempts = new Map<string, { count: number; resetAt: number }>()
  const SETUP_WINDOW_MS = 15 * 60 * 1000
  const SETUP_MAX_ATTEMPTS = 5

  function throttleSetup(ip: string): void {
    const now = Date.now()
    const entry = setupAttempts.get(ip)
    if (!entry || entry.resetAt < now) {
      setupAttempts.set(ip, { count: 1, resetAt: now + SETUP_WINDOW_MS })
      return
    }
    entry.count += 1
    if (entry.count > SETUP_MAX_ATTEMPTS) {
      throw new AuthError('rate_limited', 'Too many setup attempts, try again later.')
    }
  }

  app.get('/v1/auth/setup', async () => ({
    initialized: !(await auth.isEmpty()),
    storage: auth.storage,
    // The console only shows the Signup entry point when the API opens it.
    signup: auth.signupEnabled,
  }))

  // ── Public sign-up (cloud demo only) ──────────────────────────────────────
  // The judge creates an account with their own password, then enrols TOTP:
  // no session is issued before the second factor exists.
  const signupAttempts = new Map<string, { count: number; resetAt: number }>()
  const SIGNUP_WINDOW_MS = 15 * 60 * 1000
  const SIGNUP_MAX_ATTEMPTS = 6

  function throttleSignup(ip: string): void {
    const now = Date.now()
    const entry = signupAttempts.get(ip)
    if (!entry || entry.resetAt < now) {
      signupAttempts.set(ip, { count: 1, resetAt: now + SIGNUP_WINDOW_MS })
      return
    }
    entry.count += 1
    if (entry.count > SIGNUP_MAX_ATTEMPTS) {
      throw new AuthError('rate_limited', 'Too many sign-up attempts, try again later.')
    }
  }

  app.post('/v1/auth/signup', async (request, reply) => {
    try {
      throttleSignup(request.ip)
      const body = signupInput.parse(request.body)
      const result = await auth.signup(body)
      try {
        await sendVerificationTo(result.operator.email)
      } catch (error) {
        // No confirmation e-mail, no account: the form stays usable and can be retried.
        await auth.remove(result.operator.email)
        throw error
      }
      await record(result.operator.email, 'auth.signup', undefined, result.operator.email)
      return reply.status(201).send(result)
    } catch (error) {
      return failure(reply, error)
    }
  })

  // ── Sign-up confirmation ──────────────────────────────────────────────────
  // The address is confirmed from the e-mail link, before the second factor.
  // Resending always answers 200 for an unknown or confirmed address.
  async function sendVerificationTo(email: string): Promise<void> {
    const link = await auth.createEmailVerification(email)
    if (!link) return
    await sendEmailVerification({
      to: link.email,
      ...(link.firstName ? { firstName: link.firstName } : {}),
      token: link.token,
      expiresAt: link.expiresAt,
    })
  }

  const resendAttempts = new Map<string, { count: number; resetAt: number }>()
  const RESEND_WINDOW_MS = 15 * 60 * 1000
  const RESEND_MAX_ATTEMPTS = 5

  app.post('/v1/auth/email/verify', async (request, reply) => {
    try {
      const body = z.object({ token: z.string().min(10).max(4096) }).parse(request.body)
      const result = await auth.verifyEmail(body.token)
      await record(result.email, 'auth.email_verified', undefined, result.email)
      return { ok: true, email: result.email }
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/email/resend', async (request, reply) => {
    try {
      const now = Date.now()
      const entry = resendAttempts.get(request.ip)
      if (!entry || entry.resetAt < now) {
        resendAttempts.set(request.ip, { count: 1, resetAt: now + RESEND_WINDOW_MS })
      } else if (++entry.count > RESEND_MAX_ATTEMPTS) {
        throw new AuthError('rate_limited', 'Too many requests, try again later.')
      }
      const body = forgotInput.parse(request.body)
      try {
        await sendVerificationTo(body.email.trim().toLowerCase())
      } catch (error) {
        if (!(error instanceof MailError)) throw error
        request.log.error({ error: error.code }, 'confirmation e-mail could not be sent')
      }
      return { ok: true }
    } catch (error) {
      return failure(reply, error)
    }
  })

  // ── Password reset ────────────────────────────────────────────────────────
  // Requesting a link always answers 200, even for an unknown address: the
  // console must not become an account-enumeration oracle. The link is signed
  // and single-use; the route throttles by IP.
  const forgotAttempts = new Map<string, { count: number; resetAt: number }>()
  const FORGOT_WINDOW_MS = 15 * 60 * 1000
  const FORGOT_MAX_ATTEMPTS = 5

  function throttleForgot(ip: string): void {
    const now = Date.now()
    const entry = forgotAttempts.get(ip)
    if (!entry || entry.resetAt < now) {
      forgotAttempts.set(ip, { count: 1, resetAt: now + FORGOT_WINDOW_MS })
      return
    }
    entry.count += 1
    if (entry.count > FORGOT_MAX_ATTEMPTS) {
      throw new AuthError('rate_limited', 'Too many reset requests, try again later.')
    }
  }

  app.post('/v1/auth/password/forgot', async (request, reply) => {
    try {
      throttleForgot(request.ip)
      const body = forgotInput.parse(request.body)
      const reset = await auth.createPasswordReset(body.email)
      if (reset) {
        try {
          await sendPasswordReset({
            to: reset.email,
            ...(reset.firstName ? { firstName: reset.firstName } : {}),
            token: reset.token,
            expiresAt: reset.expiresAt,
          })
          await record(reset.email, 'auth.password_reset_requested', undefined, reset.email)
        } catch (error) {
          if (!(error instanceof MailError)) throw error
          // Anti-enumeration: the response does not reveal that mail failed.
          request.log.error({ error: error.code }, 'password reset e-mail could not be sent')
        }
      }
      return { ok: true }
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/password/reset', async (request, reply) => {
    try {
      const body = resetInput.parse(request.body)
      const operator = await auth.resetPassword(body.token, body.password)
      await record(operator.email, 'auth.password_reset', undefined, operator.email)
      return { ok: true }
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/setup', async (request, reply) => {
    try {
      throttleSetup(request.ip)
      const body = setupInput.parse(request.body)
      if (!(await auth.isEmpty())) {
        return reply.status(409).send({
          error: 'already_initialized',
          message: 'This deployment already has an operator.',
        })
      }

      const created = await auth.createRoot(body)
      try {
        await sendInvitation({
          to: created.operator.email,
          firstName: body.firstName,
          lastName: body.lastName,
          password: created.password,
        })
      } catch (error) {
        // No e-mail, no account: the screen stays usable and setup can be retried.
        await auth.remove(created.operator.email)
        throw error
      }

      await record(created.operator.email, 'auth.root_created', undefined, created.operator.email)
      return reply.status(201).send({
        ok: true,
        email: created.operator.email,
        storage: created.storage,
      })
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/password', async (request, reply) => {
    try {
      const body = passwordChange.parse(request.body)
      const result = await auth.changePassword(body.challenge, body.password)
      await record(result.operator.email, 'auth.password_changed', undefined, result.operator.email)
      return result
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/login', async (request, reply) => {
    let email = 'unknown'
    try {
      const body = credentials.parse(request.body)
      email = body.email
      const result = await auth.login(body.email, body.password)
      await record(result.operator.email, 'auth.password_accepted', result.status, result.operator.email)
      return result
    } catch (error) {
      await record(email, 'auth.failed')
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/mfa/enroll', async (request, reply) => {
    try {
      const { challenge } = z.object({ challenge: z.string().min(10).max(4096) }).parse(request.body)
      return await auth.startEnrollment(challenge)
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/mfa/confirm', async (request, reply) => {
    try {
      const body = codeStep.parse(request.body)
      const session = await auth.confirmEnrollment(body.challenge, body.code)
      await record(session.operator.email, 'auth.mfa_enrolled', undefined, session.operator.email)
      await record(session.operator.email, 'auth.login', undefined, session.operator.email)
      return session
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.post('/v1/auth/mfa/verify', async (request, reply) => {
    try {
      const body = codeStep.parse(request.body)
      const session = await auth.verify(body.challenge, body.code)
      await record(session.operator.email, 'auth.login', undefined, session.operator.email)
      return session
    } catch (error) {
      return failure(reply, error)
    }
  })

  app.get('/v1/auth/me', async (request, reply) => {
    const operator = currentOperator(request)
    if (!operator) return reply.status(401).send({ error: 'unauthorized' })
    // Hydrate from Mongo: `verifySession` is stateless and its in-memory copy is
    // empty after a restart, which used to reset preferences to the defaults.
    const hydrated = await auth.me(operator.email)
    return { operator: hydrated ?? operator }
  })

  app.post('/v1/auth/logout', async (request) => {
    const operator = currentOperator(request)
    if (operator) await record(operator.email, 'auth.logout', undefined, operator.email)
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
    await record(operator.email, 'preferences.updated', undefined, operator.email)
    return { preferences }
  })

  // ── Audit feed (console page) ─────────────────────────────────────────────
  app.get('/v1/audit/events', async (request, reply) => {
    const operator = currentOperator(request)
    if (!operator) return reply.status(401).send({ error: 'unauthorized' })
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) }).parse(request.query)
    try {
      const [events, chain] = await Promise.all([
        audit.listAudit(limit, operator.email),
        audit.verifyChain(),
      ])
      return { events, chain }
    } catch (error) {
      return reply.status(503).send({ error: 'audit_unavailable', message: (error as Error).message })
    }
  })
}
