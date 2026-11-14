/**
 * World mode routes.
 *
 * World is built in vertical slices, so this file grows with them: the run
 * sharing mutation (the first audited `world.*` action, on stores that already
 * existed), the cross-country summary read model behind the World page, and the
 * display thresholds an administrator saves for every view.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { z } from 'zod'
import type { AuditService } from '@sps/audit'
import type { CountryStore } from './countries.js'
import {
  worldSettingsPatch,
  worldSharingBody,
  worldSharingParams,
  worldSummaryQuery,
} from './openapi/schemas.js'
import type { ReadinessRunStore } from './readiness-runs.js'
import type { ScenarioRunStore } from './scenario-runs.js'
import { buildWorldSummary } from './world-summary.js'
import { WORLD_SETTINGS_DEFAULTS, WorldSettingsStore } from './world-settings.js'

function validationFailure(reply: FastifyReply, error: z.ZodError) {
  return reply.status(400).send({
    error: 'validation_failed',
    message: 'The request does not match its schema.',
    fields: error.flatten().fieldErrors,
  })
}

/** The signed-in operator; the auth guard runs before every route below. */
function operatorOf(request: FastifyRequest): string {
  if (!request.operator) throw new Error('Operator missing after the auth guard.')
  return request.operator.email
}

/**
 * The display rules are deployment-wide: they change how every operator reads
 * the same runs, so writing them stays with the administrators.
 */
function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.operator?.role === 'admin') return true
  void reply.status(403).send({
    error: 'admin_only',
    message: 'This action is reserved for administrators on this shared deployment.',
  })
  return false
}

export async function registerWorldRoutes(
  app: FastifyInstance,
  deps: {
    readinessRuns: ReadinessRunStore
    scenarioRuns: ScenarioRunStore
    countries: CountryStore
    audit: AuditService
    /** Omitted by tests: an in-memory store then serves the specification defaults. */
    settings?: WorldSettingsStore
  },
): Promise<void> {
  const { readinessRuns, scenarioRuns, countries, audit } = deps
  const settings = deps.settings ?? new WorldSettingsStore({})

  /**
   * The World table and map read model: the latest complete run per (country,
   * sector), with coverage, confidence, freshness and the resolved display
   * state. Summaries only, so `shared` never exposes another operator's report.
   */
  app.get('/v1/world/summary', async (request, reply) => {
    const query = worldSummaryQuery.safeParse(request.query ?? {})
    if (!query.success) return validationFailure(reply, query.error)

    const viewer = operatorOf(request)
    const { sector, scope } = query.data
    const [registry, runs, record] = await Promise.all([
      countries.list(),
      readinessRuns.completeForScope(viewer, scope),
      settings.get(),
    ])

    return buildWorldSummary({ countries: registry, runs, sector, scope, thresholds: record.settings })
  })

  /**
   * Every operator reads the rules that decide how the World view paints a
   * composite; only an administrator may change them.
   */
  app.get('/v1/world/settings', async () => {
    const record = await settings.get()
    return {
      settings: record.settings,
      defaults: WORLD_SETTINGS_DEFAULTS,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    }
  })

  app.put('/v1/world/settings', async (request, reply) => {
    if (!requireAdmin(request, reply)) return reply
    const body = worldSettingsPatch.safeParse(request.body ?? {})
    if (!body.success) return validationFailure(reply, body.error)

    const userId = operatorOf(request)
    const record = await settings.update(body.data, userId)

    await audit
      .logAction({
        actor: 'operator',
        userId,
        action: 'world.settings.updated',
        target: 'world',
        lens: 'hybrid',
      })
      .catch(() => undefined)

    return {
      settings: record.settings,
      defaults: WORLD_SETTINGS_DEFAULTS,
      updatedAt: record.updatedAt,
      updatedBy: record.updatedBy,
    }
  })

  /**
   * Owner-only. A run excluded here leaves the shared scope, other operators'
   * country insights and World aggregates; the owner keeps seeing it in `mine`.
   * Only summaries were ever shared, so no report content is affected.
   */
  app.patch('/v1/world/runs/:kind/:runId/sharing', async (request, reply) => {
    const params = worldSharingParams.safeParse(request.params)
    if (!params.success) return validationFailure(reply, params.error)
    const body = worldSharingBody.safeParse(request.body ?? {})
    if (!body.success) return validationFailure(reply, body.error)

    const userId = operatorOf(request)
    const { kind, runId } = params.data
    const { sharing } = body.data
    const store = kind === 'readiness' ? readinessRuns : scenarioRuns

    const updated = await store.setSharing(runId, userId, sharing)
    if (!updated) return reply.status(404).send({ error: 'not_found' })

    await audit
      .logAction({
        actor: 'operator',
        userId,
        action: 'world.run.sharing.changed',
        target: `${kind}:${runId}`,
        lens: 'hybrid',
      })
      .catch(() => undefined)

    return { run: { kind, id: runId, sharing } }
  })
}
