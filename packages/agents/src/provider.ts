/**
 * Provider layer: one engine, three interchangeable inference backends.
 *
 *   cloud      Meta Model API — Muse Spark (reasoning + vision), SAM 3.1
 *              (segmentation), Muse Voice Transcribe (speech).
 *   sovereign  Muse Glimmer (30B, Apache-2.0) served on-premise by Ollama, or a
 *              hosted open-weight provider (Baseten / Modal).
 *   local      any Ollama-served model (qwen3.5:9b + bge-m3 embeddings) for
 *              offline development.
 *
 * The mode is a configuration decision (`SANDBOX_MODE`), never a code path:
 * every agent, the coordinator and the readiness engine receive the same
 * `LanguageModel` handle. Switching mode changes *where* the work happens and
 * is recorded in the audit trail as `provider.switched`.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { ProviderDescriptor, ProviderMode } from '@sps/shared'

export const PROVIDER_MODES: readonly ProviderMode[] = ['cloud', 'sovereign', 'local'] as const

export const PROVIDER_LABELS: Record<ProviderMode, string> = {
  cloud: 'Meta Model API',
  sovereign: 'Open weights',
  local: 'Local',
}

type Env = Record<string, string | undefined>

/** Read an env var, stripping inline comments, surrounding quotes and blanks. */
function env(source: Env, name: string, fallback = ''): string {
  const raw = source[name]
  if (raw === undefined) return fallback
  const value = raw.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim()
  return value || fallback
}

/** OpenAI-compatible clients expect the `/v1` suffix on the base URL. */
function withV1(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '')
  return base.endsWith('/v1') ? base : `${base}/v1`
}

export function isProviderMode(value: string): value is ProviderMode {
  return (PROVIDER_MODES as readonly string[]).includes(value)
}

/** Resolve `SANDBOX_MODE`, defaulting to `local` (nothing leaves the machine). */
export function providerModeFromEnv(source: Env = process.env): ProviderMode {
  const mode = env(source, 'SANDBOX_MODE', 'local').toLowerCase()
  if (!isProviderMode(mode)) {
    throw new Error(
      `Unknown SANDBOX_MODE "${mode}". Expected one of: ${PROVIDER_MODES.join(' | ')}.`,
    )
  }
  return mode
}

/**
 * Describe the active provider without exposing any secret.
 *
 * `ready` reports whether the mode can actually answer: a cloud mode without
 * `MODEL_API_KEY` is selected but not configured, so the UI can say so instead
 * of failing on the first question.
 */
export function resolveProvider(source: Env = process.env, modeOverride?: ProviderMode): ProviderDescriptor {
  const mode = modeOverride ?? providerModeFromEnv(source)
  const budgetUsd = Number(env(source, 'RUN_BUDGET_USD', '0')) || 0
  const embedding = env(source, 'EMBEDDING_MODEL', 'bge-m3')

  if (mode === 'cloud') {
    const apiKey = env(source, 'MODEL_API_KEY')
    return {
      mode,
      label: PROVIDER_LABELS.cloud,
      servedBy: 'Meta',
      baseURL: withV1(env(source, 'META_BASE_URL', 'https://api.meta.ai/v1')),
      // The chat model is chosen from Meta's model list and saved as a preference;
      // it is never read from the environment. Empty until the engine selects one.
      models: {
        reasoning: '',
        vision: '',
        segmentation: env(source, 'META_SAM_MODEL', 'sam-3.1'),
        transcription: env(source, 'META_VOICE_MODEL', 'muse-voice-transcribe-1.0'),
        embedding,
      },
      residency: 'cloud',
      openWeights: false,
      budgetUsd,
      ready: Boolean(apiKey),
      ...(apiKey ? {} : { reason: 'MODEL_API_KEY is not set.' }),
    }
  }

  if (mode === 'sovereign') {
    // Preference order: Ollama on-premise, then a hosted open-weight provider.
    const modalUrl = env(source, 'MODAL_ENDPOINT_URL')
    const basetenKey = env(source, 'BASETEN_API_KEY')
    const model = env(source, 'MUSE_GLIMMER_MODEL', 'muse-glimmer')

    if (modalUrl) {
      return {
        mode,
        label: PROVIDER_LABELS.sovereign,
        servedBy: 'Modal',
        baseURL: withV1(modalUrl),
        models: { reasoning: model, vision: model, embedding },
        residency: 'cloud',
        openWeights: true,
        budgetUsd,
        ready: true,
      }
    }

    if (basetenKey) {
      return {
        mode,
        label: PROVIDER_LABELS.sovereign,
        servedBy: 'Baseten',
        baseURL: withV1(env(source, 'BASETEN_BASE_URL', 'https://inference.baseten.co/v1')),
        models: { reasoning: env(source, 'BASETEN_MODEL', model), vision: env(source, 'BASETEN_MODEL', model), embedding },
        residency: 'cloud',
        openWeights: true,
        budgetUsd,
        ready: true,
      }
    }

    return {
      mode,
      label: PROVIDER_LABELS.sovereign,
      servedBy: 'Ollama',
      baseURL: withV1(env(source, 'OLLAMA_BASE_URL', 'http://localhost:11434')),
      models: { reasoning: model, vision: model, embedding },
      residency: 'on-premise',
      openWeights: true,
      budgetUsd: 0,
      ready: true,
    }
  }

  return {
    mode: 'local',
    label: PROVIDER_LABELS.local,
    servedBy: 'Ollama',
    baseURL: withV1(env(source, 'OLLAMA_BASE_URL', 'http://localhost:11434')),
    models: {
      reasoning: env(source, 'OLLAMA_MODEL', 'qwen3.5:9b'),
      vision: env(source, 'OLLAMA_MODEL', 'qwen3.5:9b'),
      embedding,
    },
    residency: 'on-premise',
    openWeights: true,
    budgetUsd: 0,
    ready: true,
  }
}

/** API key for a descriptor — read at call time, never stored in the descriptor. */
export function providerApiKey(descriptor: ProviderDescriptor, source: Env = process.env): string {
  if (descriptor.mode === 'cloud') return env(source, 'MODEL_API_KEY')
  if (descriptor.servedBy === 'Baseten') return env(source, 'BASETEN_API_KEY')
  if (descriptor.servedBy === 'Modal') return env(source, 'MODAL_API_KEY', 'modal')
  return 'ollama'
}

/**
 * Optional egress relay: some container networks cannot reach the Meta API
 * directly, so `META_BASE_URL` points at our own relay and the shared secret
 * travels in a header. The key itself never leaves the server.
 */
function relayHeaders(source: Env): Record<string, string> {
  const relayKey = env(source, 'MODEL_RELAY_KEY')
  return relayKey ? { 'x-sps-relay-key': relayKey } : {}
}

/** Build the chat model for a descriptor (lazy: no network call happens here). */
export function createProviderModel(descriptor: ProviderDescriptor, source: Env = process.env): LanguageModel {
  const headers = relayHeaders(source)
  const provider = createOpenAICompatible({
    name: descriptor.servedBy.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'provider',
    baseURL: descriptor.baseURL,
    apiKey: providerApiKey(descriptor, source),
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  })
  return provider.chatModel(descriptor.models.reasoning)
}

export interface ProviderModelInfo {
  id: string
  ownedBy?: string
}

/**
 * Non-chat models the Meta list also returns: embeddings, rerankers, segmentation,
 * speech, image generation and moderation. They cannot answer a policy question.
 */
const NON_CHAT_MODEL = /embed|rerank|\bsam\b|sam-|voice|transcri|whisper|speech|tts|image|moderat|guard|safety/i

/** Keep only the chat-capable entries of a provider's `GET /models` answer. */
export function eligibleChatModels(payload: unknown): ProviderModelInfo[] {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown })?.data)
      ? ((payload as { data: unknown[] }).data)
      : []
  const seen = new Set<string>()
  const out: ProviderModelInfo[] = []
  for (const row of rows) {
    const entry = row as { id?: unknown; owned_by?: unknown; object?: unknown }
    if (typeof entry.id !== 'string' || !entry.id) continue
    if (entry.object !== undefined && entry.object !== 'model') continue
    if (NON_CHAT_MODEL.test(entry.id) || seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push({ id: entry.id, ...(typeof entry.owned_by === 'string' ? { ownedBy: entry.owned_by } : {}) })
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

/** Ask the provider which models this key may use. The key stays on the server. */
export async function listProviderModels(
  descriptor: ProviderDescriptor,
  source: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderModelInfo[]> {
  const response = await fetchImpl(`${descriptor.baseURL.replace(/\/+$/, '')}/models`, {
    headers: { Authorization: `Bearer ${providerApiKey(descriptor, source)}`, ...relayHeaders(source) },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Meta model list failed (${response.status}).`)
  return eligibleChatModels(await response.json())
}

/** One-line, secret-free summary used in logs, the API and the UI badge. */
export function describeProvider(descriptor: ProviderDescriptor): string {
  return `${descriptor.mode} · ${descriptor.models.reasoning}`
}
