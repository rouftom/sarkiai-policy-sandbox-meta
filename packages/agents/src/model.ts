/**
 * LLM provider factory.
 *
 * Historically local-only: models were served by Ollama through its
 * OpenAI-compatible endpoint (`/v1`) and nothing left the machine. The engine
 * now supports three interchangeable modes (see `./provider.ts`) and this
 * module keeps the short backwards-compatible entry point:
 *
 *   createModel()                        → the mode selected by SANDBOX_MODE
 *   createModel({ baseURL, model })      → an explicit local endpoint
 */

import type { LanguageModel } from 'ai'
import type { ProviderDescriptor } from '@sps/shared'
import { createProviderModel, resolveProvider } from './provider'
import { meterLanguageModel } from './usage'

export interface ModelConfig {
  /** Ollama base URL, e.g. http://ollama:11434 (the `/v1` suffix is added). */
  baseURL?: string
  /** Model tag, e.g. muse-glimmer. */
  model?: string
  /** Explicit mode; defaults to `SANDBOX_MODE`. */
  mode?: ProviderDescriptor['mode']
  /** Reuse an already-resolved descriptor instead of reading the environment. */
  provider?: ProviderDescriptor
}

export function createModel(config: ModelConfig = {}): LanguageModel {
  const descriptor =
    config.provider ??
    (config.baseURL || config.model
      ? explicitLocal(config)
      : resolveProvider(process.env, config.mode))
  return meterLanguageModel(createProviderModel(descriptor), descriptor)
}

/** An explicitly configured OpenAI-compatible endpoint (local development). */
function explicitLocal(config: ModelConfig): ProviderDescriptor {
  const base = (config.baseURL ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')
  const baseURL = base.endsWith('/v1') ? base : `${base}/v1`
  const model = config.model ?? process.env.OLLAMA_MODEL ?? 'muse-glimmer'
  return {
    mode: 'local',
    label: 'Local',
    servedBy: 'Ollama',
    baseURL,
    models: { reasoning: model, vision: model },
    residency: 'on-premise',
    openWeights: true,
    budgetUsd: 0,
    ready: true,
  }
}
