/**
 * World mode routes.
 *
 * World is built in vertical slices, so this file grows with them: the run
 * sharing mutation (the first audited `world.*` action, on stores that already
 * existed) and the cross-country summary read model behind the World page.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuditService } from '@sps/audit'
import type { CountryStore } from './countries.js'
import type { ReadinessRunStore } from './readiness-runs.js'
import type { ScenarioRunStore } from './scenario-runs.js'
import { buildWorldSummary, type WorldSector } from './world-summary.js'

const sharingParams = z.object({
  kind: z.enum(['readiness', 'scenario']),
  runId: z.string().min(1).max(120),
})

const sharingBody = z.object({
  sharing: z.enum(['shared', 'excluded']).describe('Whether other operators see this run summary.'),
})

/** Keep in sync with `COUNTRY_SECTORS`; `satisfies` makes a drifted entry a type error. */
const SUMMARY_SECTORS = [
  'health',
  'education',
  'telecom',
  'public_services',
  'agriculture',
  'all',
] as const satisfies readonly WorldSector[]

const summaryQuery = z.object({
  sector: z.enum(SUMMARY_SECTORS).default('all'),
  scope: z.enum(['mine', 'shared']).default('mine'),
})

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

export async function registerWorldRoutes(
  app: FastifyInstance,
  deps: {
    readinessRuns: ReadinessRunStore
    scenarioRuns: ScenarioRunStore
    countries: CountryStore
    audit: AuditService
  },
): Promise<void> {
  const { readinessRuns, scenarioRuns, countries, audit } = deps

  /**
   * The World table and map read model: the latest complete run per (country,
   * sector), with coverage, confidence, freshness and the resolved display
   * state. Summaries only, so `shared` never exposes another operator's report.
   */
  app.get('/v1/world/summary', async (request, reply) => {
    const query = summaryQuery.safeParse(request.query ?? {})
    if (!query.success) return validationFailure(reply, query.error)

    const viewer = operatorOf(request)
    const { sector, scope } = query.data
    const [registry, runs] = await Promise.all([
      countries.list(),
      readinessRuns.completeForScope(viewer, scope),
    ])

    return buildWorldSummary({ countries: registry, runs, sector, scope })
  })

  /**
   * Owner-only. A run excluded here leaves the shared scope, other operators'
   * country insights and World aggregates; the owner keeps seeing it in `mine`.
   * Only summaries were ever shared, so no report content is affected.
   */
  app.patch('/v1/world/runs/:kind/:runId/sharing', async (request, reply) => {
    const params = sharingParams.safeParse(request.params)
    if (!params.success) return validationFailure(reply, params.error)
    const body = sharingBody.safeParse(request.body ?? {})
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
