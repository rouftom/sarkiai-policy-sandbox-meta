/** Composes the shared packages into the two lenses + the hybrid profile. */

import {
  basetenProvider,
  createModel,
  listBasetenModels,
  listProviderModels,
  recordUsage,
  resolveProvider,
  PolicyOrchestrator,
  MultiAgentCoordinator,
  webSearchFor,
} from '@sps/agents'
import {
  AgenticRetriever,
  AtlasIngestor,
  CorpusSource,
  KB_COLLECTION,
  KB_INDEX_DEFINITIONS,
  ensureAtlasIndexes,
  resolveRetrievalBackend,
  type Retriever,
  type RetrievalBackend,
} from '@sps/retrieval'
import type { LanguageModel } from 'ai'
import { generateText } from 'ai'
import { ReadinessEngine } from '@sps/readiness'
import { AuditService } from '@sps/audit'
import { ReportStore } from '@sps/report'
import { ObjectStore } from '@sps/storage'
import { ScenarioEngine, type ScenarioDefinition } from '@sps/scenarios'
import {
  getWorkflowProfile,
  institutionsForDomain,
  type Domain,
  type ProviderDescriptor,
  type WorkflowLens,
} from '@sps/shared'
import { config } from './config.js'


/**
 * Everything that talks to the chat model. Rebuilt when the operator picks a
 * different Meta model, so the agents, the coordinator and the readiness lens
 * always share one handle.
 */
function buildModelStack(
  provider: ProviderDescriptor,
  modelId: string,
  retriever: Retriever,
  audit: AuditService,
  baseten: ProviderDescriptor | null,
) {
  // The Baseten model routes every request to Baseten; any other id stays on Meta.
  const routeModel = (id: string): ProviderDescriptor =>
    provider.mode !== 'cloud'
      ? { ...provider, models: { ...provider.models, reasoning: id || provider.models.reasoning } }
      : baseten && id === baseten.models.reasoning
        ? baseten
        : { ...provider, models: { ...provider.models, reasoning: id || provider.models.reasoning, vision: id || provider.models.vision } }
  const active: ProviderDescriptor = provider.mode !== 'cloud' ? provider : routeModel(modelId)
  const model = createModel({ provider: active })
  // Web search is a Meta tool (Responses API `web_search`): when Muse Spark Open on
  // Baseten reasons, the search still runs on Meta's default model (hybrid).
  const webSearch = webSearchFor(active) ?? (provider.mode === 'cloud' ? webSearchFor(provider) : undefined)
  const orchestrator = new PolicyOrchestrator({
    model,
    retriever,
    audit,
    provider: active,
    ...(webSearch ? { webSearch } : {}),
    maxOutputTokens: Number(process.env.AGENT_MAX_OUTPUT_TOKENS ?? 4096) || 4096,
  })
  const coordinator = new MultiAgentCoordinator({ model, orchestrator, audit })
  // A per-stage model id is routed like the chat model: Baseten's id to Baseten, any
  // other id to Meta, so a Meta web-search stage keeps working beside a Baseten one.
  const onModel = (id: string): ProviderDescriptor => (provider.mode !== 'cloud' ? { ...active, models: { ...active.models, reasoning: id } } : routeModel(id))
  const readiness = new ReadinessEngine({
    model,
    retriever,
    ...(webSearch ? { webSearch } : {}),
    modelFor: (id) => createModel({ provider: onModel(id) }),
    webSearchFor: (id) => webSearchFor(onModel(id)),
  })
  return { provider: active, model, orchestrator, coordinator, readiness }
}

export function createEngine() {
  // One provider decision for the whole engine. In cloud mode the chat model
  // is not read from the environment: it is selected from Meta's model list.
  const provider = resolveProvider(process.env)
  const baseten = basetenProvider(process.env)
  const retrievalBackend = resolveRetrievalBackend(provider.mode, config.retrieval.backend)

  // Corpus search: lexical index (Atlas Search in the cloud, a MongoDB text
  // index elsewhere) driven by the Meta model of the mode, which plans the
  // queries, runs sub-agents, judges and ranks. No other model is called.
  const source = new CorpusSource({
    mongodbUri: config.mongodb.uri,
    dbName: config.mongodb.dbName,
    collectionName: config.retrieval.atlas.collection,
    textIndex: config.retrieval.atlas.textIndex,
    searchMode: retrievalBackend,
  })
  // The engine's live model, read by the retriever at call time (set below).
  const live: { model: LanguageModel | null; reasoning: string } = { model: null, reasoning: provider.models.reasoning }
  const retriever: AgenticRetriever = new AgenticRetriever({
    source,
    // Read at call time: a model switch (Muse Spark ↔ Muse Spark Open) applies at once.
    think: async (prompt, options) => {
      if (!live.model) throw new Error('model not ready')
      const result = await generateText({
        model: live.model,
        prompt,
        ...(options?.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        // Planning, judging and ranking are short structured steps: low effort
        // keeps each one fast and cheap; the token budget stays as a ceiling.
        providerOptions: { meta: { reasoningEffort: 'low' }, 'openai-compatible': { reasoningEffort: 'low' } },
      })
      return result.text
    },
    modelLabel: () => live.reasoning,
    defaultDepth: config.retrieval.depth,
  })

  const audit = new AuditService({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
  const reports = new ReportStore({ mongodbUri: config.mongodb.uri, dbName: config.mongodb.dbName })
  const storage = new ObjectStore({
    endpoint: config.s3.endpoint,
    bucket: config.s3.bucket,
    accessKey: config.s3.accessKey,
    secretKey: config.s3.secretKey,
  })

  const engine = {
    retriever,
    retrievalBackend,
    audit,
    reports,
    storage,
    ...buildModelStack(provider, '', retriever, audit, baseten),
    /**
     * The deployment's catalogue mode. It does not change when a Baseten model is
     * active, so the operator can always switch back to a Meta model.
     */
    catalogMode: provider.mode,
    /**
     * The deployment's own provider, independent of the chat model in use. Meta-only
     * services (SAM 3.1, Muse Voice Transcribe) read their endpoint and key from
     * here, so they keep running when Muse Spark Open on Baseten does the reasoning.
     */
    catalogProvider: provider,
    /** Point the engine at a model id of the catalogue. Rebuilds the model stack. */
    useModel(modelId: string): ProviderDescriptor {
      if (provider.mode !== 'cloud') return engine.provider
      Object.assign(engine, buildModelStack(provider, modelId, retriever, audit, baseten))
      live.model = engine.model
      live.reasoning = engine.provider.models.reasoning
      return engine.provider
    },
    /** Chat-capable models this key may use: Meta's list, plus Baseten's when configured. */
    async listModels() {
      const meta = await listProviderModels(provider)
      return baseten ? [...meta, ...(await listBasetenModels(process.env))] : meta
    },
  }
  live.model = engine.model
  live.reasoning = engine.provider.models.reasoning
  return engine
}

export interface CloudStorePreparation {
  backend: RetrievalBackend
  skipped: boolean
  supported?: boolean
  collectionCreated?: boolean
  created?: string[]
  updated?: string[]
  unchanged?: string[]
  error?: string
}

/**
 * Prepare the cloud vector store at startup · and only in cloud mode.
 *
 * Local Mongo has no Atlas Search, so `sovereign` and `local` never try. The
 * collection is created first (a fresh cluster otherwise returns
 * NamespaceNotFound); index creation is idempotent. A failure is reported, not
 * fatal: `/v1/provider` and the rest of the console still boot, and the next
 * request surfaces the retrieval error explicitly.
 */
export async function prepareCloudStores(): Promise<CloudStorePreparation> {
  const provider = resolveProvider(process.env)
  const backend = resolveRetrievalBackend(provider.mode, config.retrieval.backend)

  if (provider.mode !== 'cloud' || backend !== 'atlas' || !config.retrieval.atlas.autoIndexes) {
    return { backend, skipped: true }
  }

  try {
    // Definitions come from @sps/retrieval, not from a file: the API image only
    // ships packages/ + apps/api/, so reading deploy/ here used to fail silently
    // and the indexes were never created on Render.
    const result = await ensureAtlasIndexes({
      uri: config.mongodb.uri,
      dbName: config.mongodb.dbName,
      collection: config.retrieval.atlas.collection ?? KB_COLLECTION,
      indexes: KB_INDEX_DEFINITIONS,
    })
    return { backend, skipped: false, ...result }
  } catch (error) {
    return { backend, skipped: false, error: (error as Error).message }
  }
}

/** Direct ingestion/status client for the Knowledge base screen. */
export function createKnowledgeIngestor(): AtlasIngestor {
  return new AtlasIngestor({
    mongodbUri: config.mongodb.uri,
    dbName: config.mongodb.dbName,
    collectionName: config.retrieval.atlas.collection ?? KB_COLLECTION,
    textIndex: config.retrieval.atlas.textIndex,
    autoIndexes: config.retrieval.atlas.autoIndexes,
    searchMode: resolveRetrievalBackend(resolveProvider(process.env).mode, config.retrieval.backend),
  })
}

/**
 * Record a provider switch in the audit chain · and only a switch.
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
