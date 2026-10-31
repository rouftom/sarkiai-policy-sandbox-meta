/**
 * Token metering for every language-model call.
 *
 * The model is wrapped once, in `createModel`, so every `generateText`,
 * `streamText` and `generateObject` in the engine reports its usage without each
 * call site knowing about it. The operator, the route, the run and the agent
 * come from an async context set by the API and the orchestrator; the cost comes
 * from a price table.
 *
 * A price that is not in the table is recorded as `costUsd: null`, never as 0:
 * a missing tariff must not look like a free model.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { wrapLanguageModel, type LanguageModel } from 'ai'
import type { ProviderDescriptor } from '@sps/shared'

export type UsageKind = 'chat' | 'retrieval' | 'image' | 'voice' | 'sam'
export type UsageStatus = 'ok' | 'error'
/** What a row counts: tokens for text, images/seconds/calls for the other capabilities. */
export type UsageUnit = 'token' | 'image' | 'second' | 'call'

export interface UsageContext {
  operator?: string
  route?: string
  runId?: string
  /** The agent that produced the call (institution id), when one is known. */
  agentId?: string
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
  agentId?: string
  /** Which capability spent the tokens; rows written before this field existed are read as `chat`. */
  kind: UsageKind
  status: UsageStatus
  /** Wall-clock duration of the call, when the meter could measure it. */
  latencyMs?: number
  mode: ProviderDescriptor['mode']
  servedBy: string
  model: string
  inputTokens: number
  outputTokens: number
  /** Non-token work (images, audio seconds, calls); absent on token rows. */
  units?: number
  unit?: UsageUnit
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

/** What the meter needs to know about the provider: its mode, vendor and model id. */
export interface UsageSource {
  mode: ProviderDescriptor['mode']
  servedBy: string
  models: { reasoning: string }
}

/** Price for a deployment's model: free on the institution's hardware, null when unknown. */
export function priceFor(descriptor: UsageSource): UsagePrice | null {
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

export interface RecordUsageOptions {
  kind?: UsageKind
  status?: UsageStatus
  latencyMs?: number
}

export function recordUsage(descriptor: UsageSource, usage: unknown, options: RecordUsageOptions = {}): void {
  const { inputTokens, outputTokens } = tokenCounts(usage)
  const status = options.status ?? 'ok'
  // A successful call that reported no tokens spent nothing worth a row; a
  // failed call is recorded even with zero tokens so the error rate is real.
  if (status === 'ok' && inputTokens === 0 && outputTokens === 0) return
  void recordEvent({
    kind: options.kind ?? 'chat',
    status,
    mode: descriptor.mode,
    servedBy: descriptor.servedBy,
    model: descriptor.models.reasoning,
    inputTokens,
    outputTokens,
    costUsd: costOf(priceFor(descriptor), inputTokens, outputTokens),
    ...(options.latencyMs === undefined ? {} : { latencyMs: Math.max(0, Math.round(options.latencyMs)) }),
  })
}

function recordEvent(event: Omit<UsageEvent, 'ts'>): void {
  const row: UsageEvent = { ts: new Date().toISOString(), ...currentUsageContext(), ...event }
  void store.append(row).catch(() => undefined)
}

export interface CapabilityUsage {
  kind: UsageKind
  /** How many images, audio seconds or calls the work represents. */
  units: number
  unit: UsageUnit
  model: string
  mode: ProviderDescriptor['mode']
  servedBy: string
  /** Explicit price when the caller's capability table has one; null when unknown. */
  costUsd: number | null
  latencyMs?: number
  status?: UsageStatus
}

/**
 * Records a call that is not billed in tokens (an image, an audio second, a
 * segmentation call). Costing stays with the caller: a capability without a
 * confirmed tariff passes `costUsd: null`, never 0.
 */
export function recordCapabilityUsage(input: CapabilityUsage): void {
  const status = input.status ?? 'ok'
  if (status === 'ok' && input.units <= 0) return
  void recordEvent({
    kind: input.kind,
    status,
    mode: input.mode,
    servedBy: input.servedBy,
    model: input.model,
    inputTokens: 0,
    outputTokens: 0,
    units: Math.max(0, input.units),
    unit: input.unit,
    costUsd: input.costUsd,
    ...(input.latencyMs === undefined ? {} : { latencyMs: Math.max(0, Math.round(input.latencyMs)) }),
  })
}

/** Wraps a language model so every call records its tokens, its latency and its failures. */
export function meterLanguageModel(model: LanguageModel, descriptor: ProviderDescriptor): LanguageModel {
  return wrapLanguageModel({
    model: model as Parameters<typeof wrapLanguageModel>[0]['model'],
    middleware: {
      specificationVersion: 'v3',
      wrapGenerate: async ({ doGenerate }) => {
        const startedAt = Date.now()
        try {
          const result = await doGenerate()
          recordUsage(descriptor, result.usage, { latencyMs: Date.now() - startedAt })
          return result
        } catch (error) {
          recordUsage(descriptor, undefined, { status: 'error', latencyMs: Date.now() - startedAt })
          throw error
        }
      },
      wrapStream: async ({ doStream }) => {
        const startedAt = Date.now()
        let opened: Awaited<ReturnType<typeof doStream>>
        try {
          opened = await doStream()
        } catch (error) {
          recordUsage(descriptor, undefined, { status: 'error', latencyMs: Date.now() - startedAt })
          throw error
        }
        // A stream reports its tokens once, on `finish`; a frame error before
        // then is recorded as a failure and never counted twice.
        let recorded = false
        const stream = opened.stream.pipeThrough(
          new TransformStream({
            transform(part, controller) {
              if (!recorded && part.type === 'finish') {
                recorded = true
                recordUsage(descriptor, part.usage, { latencyMs: Date.now() - startedAt })
              } else if (!recorded && part.type === 'error') {
                recorded = true
                recordUsage(descriptor, undefined, { status: 'error', latencyMs: Date.now() - startedAt })
              }
              controller.enqueue(part)
            },
          }),
        )
        return { ...opened, stream }
      },
    },
  }) as LanguageModel
}

