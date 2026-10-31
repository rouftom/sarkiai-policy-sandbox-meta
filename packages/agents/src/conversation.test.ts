import { describe, expect, test } from 'bun:test'
import { INSTITUTIONS, type InstitutionSpec, type KbChunk } from '@sps/shared'
import type { Retriever } from '@sps/retrieval'
import type { LanguageModel } from 'ai'
import { PolicyOrchestrator } from './orchestrator'
import { buildSystemPrompt } from './prompt'
import { createAgentTools, type ActionSink, type DataPort } from './tools'

const PROVISION = 'Tout traitement de données de santé doit être autorisé par la personne concernée.'

const chunk: KbChunk = {
  id: 'c1',
  filename: 'loi_2024_protection_donnees.pdf',
  text: PROVISION,
  chunkIndex: 0,
  country: 'cm',
  jurisdiction: 'national',
  docType: 'law',
  articleNumber: '12',
  headingPath: 'TITRE I > ARTICLE 12',
  isActive: true,
}

const institution: InstitutionSpec = INSTITUTIONS.find((i) => i.id === 'coordinator') ?? INSTITUTIONS[0]!

function searchSpy() {
  let calls = 0
  const retriever = {
    search: async () => {
      calls += 1
      return [chunk]
    },
  } as unknown as Retriever
  return { retriever, calls: () => calls }
}

/** A model that replays one prepared answer, streamed. */
function streamingModel(text: string): LanguageModel {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test-model',
    supportedUrls: {},
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] })
          controller.enqueue({ type: 'text-start', id: 't1' })
          controller.enqueue({ type: 'text-delta', id: 't1', delta: text })
          controller.enqueue({ type: 'text-end', id: 't1' })
          controller.enqueue({ type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } })
          controller.close()
        },
      }),
    }),
  } as unknown as LanguageModel
}

const baseInput = {
  institution,
  question: 'Bonjour, présente-toi.',
  country: 'cm',
  domain: 'health' as const,
  lens: 'simulation' as const,
  withTools: true,
}

describe('effort: the operator’s choice reaches the model', () => {
  test('a chosen effort is sent as the reasoning effort', async () => {
    let seen: unknown = null
    const base = streamingModel('Bonjour.') as unknown as { doStream: (options: { providerOptions?: unknown }) => Promise<unknown> }
    const model = {
      ...base,
      doStream: async (options: { providerOptions?: unknown }) => {
        seen = options.providerOptions
        return base.doStream(options)
      },
    } as unknown as LanguageModel
    const spy = searchSpy()
    const orchestrator = new PolicyOrchestrator({ model, retriever: spy.retriever })
    await orchestrator.streamAgent({ ...baseInput, effort: 'high' }, { onDelta: () => undefined })
    expect(JSON.stringify(seen)).toContain('"reasoningEffort":"high"')
  })
})

describe('conversation: the assistant decides when to search', () => {
  test('a greeting or a self-introduction does not search the corpus and is not rejected', async () => {
    const spy = searchSpy()
    const orchestrator = new PolicyOrchestrator({ model: streamingModel('Bonjour, je suis le coordinateur interinstitutionnel.'), retriever: spy.retriever })
    const assessment = await orchestrator.streamAgent(baseInput, { onDelta: () => undefined })
    expect(spy.calls()).toBe(0)
    expect(assessment.citations).toHaveLength(0)
    expect(assessment.validation?.ok).toBe(true)
    expect(assessment.gaps).toHaveLength(0)
  })

  test('a conversational answer that quotes an invented provision is still rejected', async () => {
    const spy = searchSpy()
    const orchestrator = new PolicyOrchestrator({
      model: streamingModel('Selon l’article 99, « le traitement est interdit en toutes circonstances ».'),
      retriever: spy.retriever,
    })
    const assessment = await orchestrator.streamAgent({ ...baseInput, maxAttempts: 1 }, { onDelta: () => undefined })
    expect(spy.calls()).toBe(0)
    expect(assessment.validation?.ok).toBe(false)
  })

  test('the prompt without retrieval carries the conversation rules and no fixed context', () => {
    const prompt = buildSystemPrompt({ institution, country: 'cm', domain: 'health', chunks: [], language: 'fr', retrieval: 'on-demand' })
    expect(prompt).toContain('HOW TO WORK')
    expect(prompt).toContain('Greetings, thanks')
    expect(prompt).not.toContain('CONTEXT · RETRIEVED PROVISIONS')
  })
})

describe('tools: records and approved deletions', () => {
  function context(overrides: { data?: DataPort; actions?: ActionSink } = {}) {
    const emitted: unknown[] = []
    const proposed: Array<Record<string, unknown>> = []
    const actions: ActionSink = overrides.actions ?? {
      propose: async (input) => {
        proposed.push(input as unknown as Record<string, unknown>)
        return { id: 'act-1' }
      },
    }
    const data: DataPort = overrides.data ?? {
      list: async (entity) => [{ entity, id: 'r1' }],
      get: async (entity, id) => (id === 'r1' ? { entity, id, country: 'cm' } : null),
      remove: async () => true,
    }
    const tools = createAgentTools({
      runId: 'run-1',
      userId: 'ada@sarkiai.dev',
      institutionId: 'coordinator',
      country: 'cm',
      retriever: searchSpy().retriever,
      actions,
      data,
      emit: (event) => emitted.push(event),
    })
    return { tools, emitted, proposed }
  }
  const call = { toolCallId: 't', messages: [] } as never

  test('list_records and get_record read the operator’s records', async () => {
    const { tools } = context()
    const listed = (await tools.list_records!.execute!({ entity: 'readiness_runs', limit: 5 }, call)) as { count: number }
    expect(listed.count).toBe(1)
    const found = (await tools.get_record!.execute!({ entity: 'readiness_runs', id: 'r1' }, call)) as { found: boolean }
    expect(found.found).toBe(true)
    const missing = (await tools.get_record!.execute!({ entity: 'readiness_runs', id: 'nope' }, call)) as { found: boolean }
    expect(missing.found).toBe(false)
  })

  test('a deletion is only proposed: nothing is removed and the card waits for approval', async () => {
    let removed = false
    const { tools, emitted, proposed } = context({
      data: {
        list: async () => [],
        get: async () => null,
        remove: async () => {
          removed = true
          return true
        },
      },
    })
    const result = (await tools.propose_deletion!.execute!({ entity: 'scenario_runs', id: 's1', reason: 'Duplicate of the June run.' }, call)) as { status: string; next: string }
    expect(result.status).toBe('pending_approval')
    expect(result.next).toContain('Continue your answer now')
    expect(removed).toBe(false)
    expect(proposed[0]).toMatchObject({ kind: 'delete_record', payload: { entity: 'scenario_runs', id: 's1' }, risk: 'high' })
    expect(emitted.some((event) => (event as { ui?: { kind?: string } }).ui?.kind === 'approval')).toBe(true)
  })

  test('a corpus search reports the provisions it read, so citations match them', async () => {
    const seen: KbChunk[][] = []
    const tools = createAgentTools({
      runId: 'run-2',
      institutionId: 'coordinator',
      country: 'cm',
      retriever: searchSpy().retriever,
      onCorpusChunks: (found) => seen.push(found),
      emit: () => undefined,
    })
    await tools.search_corpus!.execute!({ query: 'consentement données de santé' }, call)
    expect(seen).toHaveLength(1)
    expect(seen[0]?.[0]?.id).toBe('c1')
  })
})

describe('gaps wait for the operator', () => {
  test('record_gap proposes an action and writes nothing until it is approved', async () => {
    const proposed: Array<Record<string, unknown>> = []
    let audited = false
    const tools = createAgentTools({
      runId: 'run-3',
      userId: 'ada@sarkiai.dev',
      institutionId: 'coordinator',
      country: 'cm',
      retriever: searchSpy().retriever,
      audit: { logAction: async () => (audited = true) } as never,
      actions: {
        propose: async (input) => {
          proposed.push(input as unknown as Record<string, unknown>)
          return { id: 'gap-1' }
        },
      },
      emit: () => undefined,
    })
    const result = (await tools.record_gap!.execute!({ description: 'Aucune disposition sur la conservation.', severity: 'high' }, { toolCallId: 't', messages: [] } as never)) as { status: string }
    expect(result.status).toBe('pending_approval')
    expect(proposed[0]).toMatchObject({ kind: 'record_gap', risk: 'high' })
    expect(audited).toBe(false)
  })
})

