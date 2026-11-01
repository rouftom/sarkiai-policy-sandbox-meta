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
import { config, localSetupPasswordFallback } from './config.js'
import { MailError, sendEmailVerification, sendInvitation, sendPasswordReset } from './mailer.js'
import { RateLimiter, type RateLimitRule } from './rate-limit.js'
import { turnstileConfig, verifyTurnstile } from './turnstile.js'

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

function failure(
  reply: {
    status: (code: number) => { send: (body: unknown) => unknown }
    header: (name: string, value: string) => unknown
  },
  error: unknown,
) {
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
    if (error.retryAfter) reply.header('Retry-After', String(error.retryAfter))
    return reply.status(status).send({ error: error.code, message: error.message })
  }
  return reply.status(500).send({ error: 'auth_failed', message: (error as Error).message })
}

/**
 * One limiter for every public auth screen: same windows as before, now bounded
 * and pruned (an attacker rotating addresses no longer grows the process).
 */
const attempts = new RateLimiter()

const SETUP_RULE: RateLimitRule = { max: 5, windowMs: 15 * 60_000 }
const SIGNUP_RULE: RateLimitRule = { max: 6, windowMs: 15 * 60_000 }
const RESEND_RULE: RateLimitRule = { max: 5, windowMs: 15 * 60_000 }
const FORGOT_RULE: RateLimitRule = { max: 5, windowMs: 15 * 60_000 }
/** Sign-in was limited per address only: rotating e-mails skipped every cap. */
const LOGIN_IP_RULE: RateLimitRule = { max: 20, windowMs: 15 * 60_000 }
const RESET_RULE: RateLimitRule = { max: 10, windowMs: 15 * 60_000 }

/** Counts one attempt and raises the same 429 the auth surface always returned. */
function limit(rule: RateLimitRule, key: string, message: string): void {
  if (!config.rateLimit.enabled) return
  const verdict = attempts.take(rule, key)
  if (!verdict.allowed) throw new AuthError('rate_limited', message, verdict.retryAfter)
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
  function throttleSetup(ip: string): void {
    limit(SETUP_RULE, `setup:${ip}`, 'Too many setup attempts, try again later.')
  }

  app.get('/v1/auth/setup', async () => ({
    initialized: !(await auth.isEmpty()),
    storage: auth.storage,
    // The console only shows the Signup entry point when the API opens it.
    signup: auth.signupEnabled,
  }))

  // What the console needs to render the reset form's human check. Public: the
  // site key is meant for browsers, and `required` lets the widget disappear on
  // installs that run without Turnstile.
  app.get('/v1/auth/captcha', async () => turnstileConfig())

  // ── Public sign-up (cloud demo only) ──────────────────────────────────────
  // The judge creates an account with their own password, then enrols TOTP:
  // no session is issued before the second factor exists.
  function throttleSignup(ip: string): void {
    limit(SIGNUP_RULE, `signup:${ip}`, 'Too many sign-up attempts, try again later.')
  }

  app.post('/v1/auth/signup', async (request, reply) => {
    try {
      const body = signupInput.parse(request.body)

      // Same human check as the reset form: no token, no account. Disabled
      // (local, sovereign, or keys missing) the helper accepts every request.
      const header = request.headers['x-turnstile-token']
      const raw = Array.isArray(header) ? header[0] : header
      if (!(await verifyTurnstile(raw, 'signup', request.ip))) {
        return reply.status(403).send({
          error: 'captcha_failed',
          message: 'Human verification failed.',
        })
      }

      throttleSignup(request.ip)
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
      limit(RESEND_RULE, `resend:${request.ip}`, 'Too many requests, try again later.')
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
  function throttleForgot(ip: string): void {
    limit(FORGOT_RULE, `forgot:${ip}`, 'Too many reset requests, try again later.')
  }

  app.post('/v1/auth/password/forgot', async (request, reply) => {
    try {
      const body = forgotInput.parse(request.body)

      // Human check before anything else: no token, no e-mail. Disabled (local,
      // sovereign, or keys missing) the helper accepts every request.
      const header = request.headers['x-turnstile-token']
      const raw = Array.isArray(header) ? header[0] : header
      if (!(await verifyTurnstile(raw, 'password_reset', request.ip))) {
        return reply.status(403).send({
          error: 'captcha_failed',
          message: 'Human verification failed.',
        })
      }

      throttleForgot(request.ip)
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
      // The token is single-use, but nothing stopped an unlimited guessing loop.
      limit(RESET_RULE, `reset:${request.ip}`, 'Too many reset attempts, try again later.')
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
        // A local install with no mail transport would otherwise be locked out:
        // hand the one-time password back in the response instead. The screen
        // shows it once. A public host keeps the rollback-and-retry behaviour.
        if (
          error instanceof MailError &&
          localSetupPasswordFallback(error.code, config.web.canonicalUrl)
        ) {
          await record(created.operator.email, 'auth.root_created', undefined, created.operator.email)
          return reply.status(201).send({
            ok: true,
            email: created.operator.email,
            storage: created.storage,
            delivery: 'local',
            password: created.password,
          })
        }
        // No e-mail, no account: the screen stays usable and setup can be retried.
        await auth.remove(created.operator.email)
        throw error
      }

      await record(created.operator.email, 'auth.root_created', undefined, created.operator.email)
      return reply.status(201).send({
        ok: true,
        email: created.operator.email,
        storage: created.storage,
        delivery: 'email',
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
      // Per-IP cap on top of the per-address one in AuthService: rotating
      // e-mails used to bypass the only existing counter.
      limit(LOGIN_IP_RULE, `login-ip:${request.ip}`, 'Too many sign-in attempts, try again later.')
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

  // ── Audit feed (console page + dashboard) ─────────────────────────────────
  /**
   * One endpoint for two readers:
   *   - the audit page asks for a page (`limit` + `offset`, optional `q`) and
   *     gets the exact total for its pagination;
   *   - the dashboard asks for the recent rows and, with `stats=7`, the exact
   *     total plus the seven-day breakdown used by its charts.
   * Every query is per operator and served by the `audit_user_ts` index.
   */
  app.get('/v1/audit/events', async (request, reply) => {
    const operator = currentOperator(request)
    if (!operator) return reply.status(401).send({ error: 'unauthorized' })
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(500).default(50),
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
        q: z.string().trim().max(120).optional(),
        stats: z.coerce.number().int().min(1).max(31).optional(),
        tz: z.string().trim().max(64).optional(),
        from: z.string().trim().max(40).optional(),
      })
      .safeParse(request.query)
    if (!query.success) return reply.status(400).send({ error: query.error.flatten() })
    const { limit, offset, q, stats, tz, from } = query.data

    if (stats !== undefined) {
      if (!tz || !from) return reply.status(400).send({ error: 'stats_requires_tz_and_from' })
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz })
      } catch {
        return reply.status(400).send({ error: 'invalid_timezone' })
      }
      const fromMs = Date.parse(from)
      const now = Date.now()
      if (Number.isNaN(fromMs) || fromMs > now || now - fromMs > (stats + 1) * 86_400_000) {
        return reply.status(400).send({ error: 'invalid_window' })
      }
    }

    try {
      const [events, chain, total, rows] = await Promise.all([
        audit.listAudit(limit, operator.email, offset, q),
        audit.verifyChainCached(),
        audit.countAudit(operator.email, q),
        stats !== undefined && tz && from ? audit.auditWindow(operator.email, from, tz) : Promise.resolve([]),
      ])
      if (stats === undefined) return { events, chain, total }
      const days = new Map<string, number>()
      const actions = new Map<string, number>()
      for (const row of rows) {
        days.set(row.day, (days.get(row.day) ?? 0) + row.count)
        actions.set(row.action, (actions.get(row.action) ?? 0) + row.count)
      }
      return {
        events,
        chain,
        total,
        days: [...days]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, count]) => ({ day, count })),
        actions: [...actions].sort((a, b) => b[1] - a[1]).map(([action, count]) => ({ action, count })),
      }
    } catch (error) {
      return reply.status(503).send({ error: 'audit_unavailable', message: (error as Error).message })
    }
  })
}
