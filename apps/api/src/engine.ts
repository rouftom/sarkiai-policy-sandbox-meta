/** Composes the shared packages into the two lenses + the hybrid profile. */

import { createModel, resolveProvider } from '@sps/agents'
import { PolicyOrchestrator } from '@sps/agents'
import { MultiAgentCoordinator } from '@sps/agents'
import { PolicyRetriever } from '@sps/retrieval'
import { ReadinessEngine } from '@sps/readiness'
import { AuditService } from '@sps/audit'
import { ReportStore } from '@sps/report'
import { ObjectStore } from '@sps/storage'
import { ScenarioEngine, type ScenarioDefinition } from '@sps/scenarios'
import { getWorkflowProfile, institutionsForDomain, type Domain, type WorkflowLens } from '@sps/shared'
import { config } from './config.js'

export function createEngine() {
  // One provider decision for the whole engine: every agent, the coordinator
  // and the readiness lens share the same model handle.
  const provider = resolveProvider(process.env)
  const model = createModel({ provider })

  const retriever = new PolicyRetriever({
    qdrantUrl: config.qdrant.url,
    qdrantApiKey: config.qdrant.apiKey || undefined,
    collectionName: config.qdrant.collection,
    embeddingsBaseUrl: config.embeddings.baseUrl,
    embeddingModel: config.embeddings.model,
    rerankUrl: config.rerank.url || undefined,
    rerankModel: config.rerank.model,
  })

  const audit = new AuditService({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
  const reports = new ReportStore({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
  const orchestrator = new PolicyOrchestrator({ model, retriever, audit, provider })
  const coordinator = new MultiAgentCoordinator({ model, orchestrator, audit })
  const readiness = new ReadinessEngine({ model, retriever })
  const storage = new ObjectStore({
    endpoint: config.s3.endpoint,
    bucket: config.s3.bucket,
    accessKey: config.s3.accessKey,
    secretKey: config.s3.secretKey,
  })

  return { model, provider, retriever, audit, reports, orchestrator, coordinator, readiness, storage }
}

/**
 * Record a provider switch in the audit chain — and only a switch.
 *
 * The last `provider.switched` record is the mode in force; when the running
 * mode matches it nothing is written, so restarts do not flood the chain.
 * Best-effort: an unreachable audit store must not prevent the API from
 * booting (the UI badge still reflects the live descriptor).
 */
export async function recordProviderSwitch(
  provider: ReturnType<typeof resolveProvider>,
  audit: AuditService,
): Promise<'recorded' | 'unchanged' | 'unavailable'> {
  try {
    const previous = await audit.lastAction('provider.switched')
    const previousMode = previous?.target?.split(':')[1]
    const previousModel = previous?.target?.split(':')[2]
    if (previousMode === provider.mode && previousModel === provider.models.reasoning) return 'unchanged'

    await audit.logAction({
      actor: 'system',
      action: 'provider.switched',
      target: `provider:${provider.mode}:${provider.models.reasoning}`,
      lens: 'hybrid',
    })
    return 'recorded'
  } catch {
    return 'unavailable'
  }
}

export function createScenario(definition: ScenarioDefinition, lens: WorkflowLens) {
  const profile = getWorkflowProfile(lens)
  if (!profile.stages.scenario) {
    throw new Error(`Lens "${lens}" does not run scenarios.`)
  }
  return new ScenarioEngine(definition)
}

export function agentsFor(country: string, domain: Domain) {
  return institutionsForDomain(domain).map((institution) => ({ ...institution, country }))
}
