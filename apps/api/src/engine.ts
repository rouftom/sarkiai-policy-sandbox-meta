/** Composes the shared packages into the two lenses + the hybrid profile. */

import { createModel } from '@sps/agents'
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
  const model = createModel({
    baseURL: config.ollama.baseUrl,
    model: config.ollama.model,
  })

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
  const orchestrator = new PolicyOrchestrator({ model, retriever, audit })
  const coordinator = new MultiAgentCoordinator({ model, orchestrator, audit })
  const readiness = new ReadinessEngine({ model, retriever })
  const storage = new ObjectStore({
    endpoint: config.s3.endpoint,
    bucket: config.s3.bucket,
    accessKey: config.s3.accessKey,
    secretKey: config.s3.secretKey,
  })

  return { model, retriever, audit, reports, orchestrator, coordinator, readiness, storage }
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
