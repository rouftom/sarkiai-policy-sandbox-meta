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
      models: {
        reasoning: env(source, 'META_REASONING_MODEL', 'muse-spark-1.3'),
        vision: env(source, 'META_VISION_MODEL', 'muse-spark-1.3'),
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

/** Build the chat model for a descriptor (lazy: no network call happens here). */
export function createProviderModel(descriptor: ProviderDescriptor, source: Env = process.env): LanguageModel {
  const provider = createOpenAICompatible({
    name: descriptor.servedBy.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'provider',
    baseURL: descriptor.baseURL,
    apiKey: providerApiKey(descriptor, source),
  })
  return provider.chatModel(descriptor.models.reasoning)
}

/** One-line, secret-free summary used in logs, the API and the UI badge. */
export function describeProvider(descriptor: ProviderDescriptor): string {
  return `${descriptor.mode} · ${descriptor.models.reasoning}`
}
