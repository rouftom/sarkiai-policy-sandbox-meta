import { describe, expect, test } from 'bun:test'
import { PROVIDER_MODES, createModel, describeProvider, providerModeFromEnv, resolveProvider } from './index'

/** A clean, empty environment: nothing is configured unless stated. */
const base: Record<string, string | undefined> = {}

describe('provider layer', () => {
  test('defaults to local when SANDBOX_MODE is unset', () => {
    const descriptor = resolveProvider(base)
    expect(descriptor.mode).toBe('local')
    expect(descriptor.residency).toBe('on-premise')
    expect(descriptor.models.reasoning).toBe('qwen3.5:9b')
    expect(descriptor.budgetUsd).toBe(0)
    expect(descriptor.ready).toBe(true)
  })

  test('rejects an unknown SANDBOX_MODE instead of silently falling back', () => {
    expect(() => providerModeFromEnv({ SANDBOX_MODE: 'hybrid-cloud' })).toThrow(/SANDBOX_MODE/)
  })

  test('accepts inline comments and quotes, as found in .env files', () => {
    expect(providerModeFromEnv({ SANDBOX_MODE: 'cloud   # meta model api' })).toBe('cloud')
    expect(providerModeFromEnv({ SANDBOX_MODE: '"sovereign"' })).toBe('sovereign')
    expect(providerModeFromEnv({ SANDBOX_MODE: '' })).toBe('local')
  })

  test('cloud mode points at the Meta Model API and requires a key', () => {
    const unconfigured = resolveProvider({ SANDBOX_MODE: 'cloud' })
    expect(unconfigured.servedBy).toBe('Meta')
    expect(unconfigured.baseURL).toBe('https://api.meta.ai/v1')
    expect(unconfigured.models.reasoning).toBe('muse-spark-1.3')
    expect(unconfigured.models.segmentation).toBe('sam-3.1')
    expect(unconfigured.models.transcription).toBe('muse-voice-transcribe-1.0')
    expect(unconfigured.residency).toBe('cloud')
    expect(unconfigured.openWeights).toBe(false)
    expect(unconfigured.ready).toBe(false)
    expect(unconfigured.reason).toMatch(/MODEL_API_KEY/)

    const configured = resolveProvider({ SANDBOX_MODE: 'cloud', MODEL_API_KEY: 'k' })
    expect(configured.ready).toBe(true)
    expect(configured.reason).toBeUndefined()
  })

  test('the descriptor never carries the API key', () => {
    const descriptor = resolveProvider({ SANDBOX_MODE: 'cloud', MODEL_API_KEY: 'super-secret-key' })
    expect(JSON.stringify(descriptor)).not.toContain('super-secret-key')
  })

  test('cloud honours model overrides and the per-run budget', () => {
    const descriptor = resolveProvider({
      SANDBOX_MODE: 'cloud',
      MODEL_API_KEY: 'k',
      META_REASONING_MODEL: 'muse-spark-1.3-large',
      RUN_BUDGET_USD: '1.50',
    })
    expect(descriptor.models.reasoning).toBe('muse-spark-1.3-large')
    expect(descriptor.budgetUsd).toBe(1.5)
  })

  test('sovereign mode serves Muse Glimmer on-premise by default', () => {
    const descriptor = resolveProvider({ SANDBOX_MODE: 'sovereign' })
    expect(descriptor.mode).toBe('sovereign')
    expect(descriptor.servedBy).toBe('Ollama')
    expect(descriptor.models.reasoning).toBe('muse-glimmer')
    expect(descriptor.openWeights).toBe(true)
    expect(descriptor.residency).toBe('on-premise')
    expect(descriptor.budgetUsd).toBe(0)
  })

  test('sovereign mode can run the same open weights on a hosted endpoint', () => {
    const descriptor = resolveProvider({ SANDBOX_MODE: 'sovereign', BASETEN_API_KEY: 'k' })
    expect(descriptor.servedBy).toBe('Baseten')
    expect(descriptor.openWeights).toBe(true)
    expect(descriptor.baseURL).toBe('https://inference.baseten.co/v1')
  })

  test('base URLs are normalised to the OpenAI-compatible /v1 suffix', () => {
    expect(resolveProvider({ OLLAMA_BASE_URL: 'http://ollama:11434/' }).baseURL).toBe('http://ollama:11434/v1')
    expect(resolveProvider({ OLLAMA_BASE_URL: 'http://ollama:11434/v1' }).baseURL).toBe('http://ollama:11434/v1')
  })

  test('createModel resolves without a network call, in every mode', () => {
    for (const mode of PROVIDER_MODES) {
      const model = createModel({ mode })
      expect(typeof model).toBe('object')
      expect(model).not.toBeNull()
    }
  })

  test('createModel keeps the explicit-endpoint form', () => {
    const model = createModel({ baseURL: 'http://localhost:11434', model: 'qwen3.5:9b' })
    expect(model).toBeDefined()
  })

  test('describeProvider is a one-line mode · model summary', () => {
    expect(describeProvider(resolveProvider({ SANDBOX_MODE: 'local' }))).toBe('local · qwen3.5:9b')
  })
})
