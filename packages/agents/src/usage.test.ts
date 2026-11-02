import { describe, expect, test } from 'bun:test'
import { generateText, streamText, type LanguageModel } from 'ai'
import type { ProviderDescriptor } from '@sps/shared'
import { MemoryUsageStore, costOf, meterLanguageModel, priceFor, setUsageStore, tokenCounts, usageStore, withUsageContext, type UsageEvent } from './usage'

const meta: ProviderDescriptor = {
  mode: 'cloud',
  label: 'Cloud',
  servedBy: 'Meta',
  baseURL: 'https://api.meta.ai/v1',
  models: { reasoning: 'muse-spark-1.3', vision: 'muse-spark-1.3' },
  residency: 'cloud',
  openWeights: false,
  budgetUsd: 0,
  ready: true,
} as ProviderDescriptor

const usage = {
  inputTokens: { total: 1000, noCache: 1000, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 200, text: 200, reasoning: undefined },
}

function fakeModel(): LanguageModel {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test',
    supportedUrls: {},
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] })
          controller.enqueue({ type: 'text-start', id: 't' })
          controller.enqueue({ type: 'text-delta', id: 't', delta: 'ok' })
          controller.enqueue({ type: 'text-end', id: 't' })
          controller.enqueue({ type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage })
          controller.close()
        },
      }),
    }),
  } as unknown as LanguageModel
}

function failingModel(): LanguageModel {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('provider down')
    },
    doStream: async () => {
      throw new Error('provider down')
    },
  } as unknown as LanguageModel
}

function freshStore(): MemoryUsageStore {
  const store = new MemoryUsageStore()
  setUsageStore(store)
  return store
}

describe('token metering', () => {
  test('counts both AI SDK usage shapes', () => {
    expect(tokenCounts({ inputTokens: 7, outputTokens: 3 })).toEqual({ inputTokens: 7, outputTokens: 3 })
    expect(tokenCounts(usage)).toEqual({ inputTokens: 1000, outputTokens: 200 })
    expect(tokenCounts(undefined)).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  test('prices a listed Meta model from the list price', () => {
    expect(priceFor(meta)).toEqual({ inputPerMTok: 1.25, outputPerMTok: 4.25 })
    expect(costOf(priceFor(meta), 1_000_000, 1_000_000)).toBeCloseTo(5.5, 6)
  })

  test('an unpriced model is recorded with a null cost, not zero', () => {
    const baseten = { ...meta, servedBy: 'Baseten', models: { ...meta.models, reasoning: 'meta-models/muse-spark-open-1026' } }
    expect(priceFor(baseten)).toBeNull()
    expect(costOf(priceFor(baseten), 10, 10)).toBeNull()
  })

  test('local hardware is free, but its tokens are counted', () => {
    const local = { ...meta, mode: 'local' as const, servedBy: 'Ollama' }
    expect(costOf(priceFor(local), 10, 10)).toBe(0)
  })

  test('a generation records its tokens with the request context', async () => {
    const store = freshStore()
    const model = meterLanguageModel(fakeModel(), meta)
    await withUsageContext({ operator: 'op@example.org', route: '/v1/assistant/chat' }, () =>
      generateText({ model, prompt: 'hello' }),
    )
    const events = store.events as UsageEvent[]
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      operator: 'op@example.org',
      route: '/v1/assistant/chat',
      kind: 'chat',
      status: 'ok',
      mode: 'cloud',
      servedBy: 'Meta',
      model: 'muse-spark-1.3',
      inputTokens: 1000,
      outputTokens: 200,
    })
    expect(events[0]!.costUsd).toBeCloseTo((1000 * 1.25 + 200 * 4.25) / 1_000_000, 9)
    expect(typeof events[0]!.latencyMs).toBe('number')
  })

  test('a generation carries the run and the agent from the request context', async () => {
    const store = freshStore()
    const model = meterLanguageModel(fakeModel(), meta)
    await withUsageContext(
      { operator: 'op@example.org', route: '/v1/agents/ask', runId: 'run-1', agentId: 'legal_advisor' },
      () => generateText({ model, prompt: 'hello' }),
    )
    expect(store.events[0]).toMatchObject({ runId: 'run-1', agentId: 'legal_advisor' })
  })

  test('a failed generation is recorded once, as an error with no tokens', async () => {
    const store = freshStore()
    const model = meterLanguageModel(failingModel(), meta)
    await expect(generateText({ model, prompt: 'hello', maxRetries: 0 })).rejects.toThrow('provider down')
    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toMatchObject({
      kind: 'chat',
      status: 'error',
      inputTokens: 0,
      outputTokens: 0,
    })
    expect(typeof store.events[0]!.latencyMs).toBe('number')
  })

  test('a stream that cannot open is recorded once, as an error', async () => {
    const store = freshStore()
    const model = meterLanguageModel(failingModel(), meta)
    const result = streamText({ model, prompt: 'hello', maxRetries: 0 })
    await expect(result.text).rejects.toThrow()
    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toMatchObject({ status: 'error', kind: 'chat' })
  })

  test('a streamed answer records once, when the stream finishes', async () => {
    const store = freshStore()
    const model = meterLanguageModel(fakeModel(), meta)
    const result = streamText({ model, prompt: 'hello' })
    await result.text
    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toMatchObject({ inputTokens: 1000, outputTokens: 200 })
  })

  test('the default store is in memory and is the one the API replaces', () => {
    expect(usageStore()).toBeInstanceOf(MemoryUsageStore)
  })
})
