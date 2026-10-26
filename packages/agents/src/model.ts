/**
 * LLM provider factory — LOCAL ONLY (sovereign).
 *
 * Models are served by Ollama through its OpenAI-compatible endpoint
 * (`/v1`). No cloud provider is used, so no data leaves the infrastructure
 * (data-sovereignty and edge-privacy by design).
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

export interface ModelConfig {
  /** Ollama base URL, e.g. http://ollama:11434 (the `/v1` suffix is added). */
  baseURL?: string
  /** Model tag, e.g. qwen2.5:14b. */
  model?: string
  apiKey?: string
}

function ollamaBase(config: ModelConfig): string {
  const base = (config.baseURL ?? process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, '')
  return base.endsWith('/v1') ? base : `${base}/v1`
}

export function createModel(config: ModelConfig = {}): LanguageModel {
  const provider = createOpenAICompatible({
    name: 'ollama',
    baseURL: ollamaBase(config),
    apiKey: config.apiKey ?? 'ollama',
  })
  return provider.chatModel(config.model ?? process.env.OLLAMA_MODEL ?? 'qwen3.5:9b')
}
