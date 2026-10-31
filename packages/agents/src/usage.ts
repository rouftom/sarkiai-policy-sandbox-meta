/**
 * Token metering for every language-model call.
 *
 * The model is wrapped once, in `createModel`, so every `generateText`,
 * `streamText` and `generateObject` in the engine reports its usage without each
 * call site knowing about it. The operator and the route come from an async
 * context set by the API for the request; the cost comes from a price table.
 *
 * A price that is not in the table is recorded as `costUsd: null`, never as 0:
 * a missing tariff must not look like a free model.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { wrapLanguageModel, type LanguageModel } from 'ai'
import type { ProviderDescriptor } from '@sps/shared'

export interface UsageContext {
  operator?: string
  route?: string
  runId?: string
}

const context = new AsyncLocalStorage<UsageContext>()

/** Runs `fn` with the given usage context (used by tests and background jobs). */
export function withUsageContext<T>(ctx: UsageContext, fn: () => T): T {
  return context.run(ctx, fn)
}

/** Sets the usage context for the rest of the current async chain (the API request). */
export function enterUsageContext(ctx: UsageContext): void {
  context.enterWith(ctx)
}

export function currentUsageContext(): UsageContext {
  return context.getStore() ?? {}
}

export interface UsageEvent {
  ts: string
  operator?: string
  route?: string
  runId?: string
  mode: ProviderDescriptor['mode']
  servedBy: string
  model: string
  inputTokens: number
  outputTokens: number
  /** Estimated from the list price; null when no price is known for this model. */
  costUsd: number | null
}

export interface UsageStore {
  append(event: UsageEvent): Promise<void>
}

/** Keeps the most recent events in memory: the default when no database is configured. */
export class MemoryUsageStore implements UsageStore {
  readonly events: UsageEvent[] = []

  constructor(private readonly limit = 10_000) {}

  async append(event: UsageEvent): Promise<void> {
    this.events.push(event)
    if (this.events.length > this.limit) this.events.splice(0, this.events.length - this.limit)
  }
}

let store: UsageStore = new MemoryUsageStore()

/** The API installs its database store at boot. */
export function setUsageStore(next: UsageStore): void {
  store = next
}

export function usageStore(): UsageStore {
  return store
}

export interface UsagePrice {
  inputPerMTok: number
  outputPerMTok: number
}

/**
 * List prices in USD per million tokens, keyed by `servedBy` then model id.
 * Meta: muse-spark-1.3 at the time of the hackathon (see `@sps/gazette` pricing).
 * Other models are absent on purpose until a tariff is confirmed.
 */
export const LIST_PRICES: Record<string, Record<string, UsagePrice>> = {
  Meta: {
    'muse-spark-1.3': { inputPerMTok: 1.25, outputPerMTok: 4.25 },
  },
}

/** Price for a deployment's model: free on the institution's hardware, null when unknown. */
export function priceFor(descriptor: Pick<ProviderDescriptor, 'mode' | 'servedBy' | 'models'>): UsagePrice | null {
  if (descriptor.mode === 'local') return { inputPerMTok: 0, outputPerMTok: 0 }
  return LIST_PRICES[descriptor.servedBy]?.[descriptor.models.reasoning] ?? null
}

export function costOf(price: UsagePrice | null, inputTokens: number, outputTokens: number): number | null {
  if (!price) return null
  return (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000
}

/** AI SDK usage: a number in older providers, `{ total }` in newer ones. */
export function tokenCounts(usage: unknown): { inputTokens: number; outputTokens: number } {
  const u = (usage ?? {}) as { inputTokens?: unknown; outputTokens?: unknown }
  const count = (value: unknown) =>
    typeof value === 'number' ? value : typeof (value as { total?: unknown })?.total === 'number' ? (value as { total: number }).total : 0
  return { inputTokens: count(u.inputTokens), outputTokens: count(u.outputTokens) }
}

export function recordUsage(descriptor: ProviderDescriptor, usage: unknown): void {
  const { inputTokens, outputTokens } = tokenCounts(usage)
  if (inputTokens === 0 && outputTokens === 0) return
  const event: UsageEvent = {
    ts: new Date().toISOString(),
    ...currentUsageContext(),
    mode: descriptor.mode,
    servedBy: descriptor.servedBy,
    model: descriptor.models.reasoning,
    inputTokens,
    outputTokens,
    costUsd: costOf(priceFor(descriptor), inputTokens, outputTokens),
  }
  void store.append(event).catch(() => undefined)
}

/** Wraps a language model so each call records its tokens. */
export function meterLanguageModel(model: LanguageModel, descriptor: ProviderDescriptor): LanguageModel {
  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]['model'],
    middleware: {
      specificationVersion: 'v3',
      wrapGenerate: async ({ doGenerate }) => {
        const result = await doGenerate()
        recordUsage(descriptor, result.usage)
        return result
      },
      wrapStream: async ({ doStream }) => {
        const result = await doStream()
        const stream = result.stream.pipeThrough(
          new TransformStream({
            transform(part, controller) {
              if (part.type === 'finish') recordUsage(descriptor, part.usage)
              controller.enqueue(part)
            },
          }),
        )
        return { ...result, stream }
      },
    },
  }) as LanguageModel
}
