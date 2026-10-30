import { describe, expect, test } from 'bun:test'
import { BASETEN_DEFAULT_MODEL, basetenProvider, listBasetenModels, providerApiKey, resolveProvider } from './provider'

describe('Baseten: Muse Spark open weights next to the Meta models', () => {
  test('no Baseten entry without a key', () => {
    expect(basetenProvider({})).toBeNull()
    expect(basetenProvider({ BASETEN_API_KEY: '' })).toBeNull()
  })

  test('with a key, the configured open model is served by Baseten with the default id', () => {
    const descriptor = basetenProvider({ BASETEN_API_KEY: 'k' })!
    expect(descriptor.servedBy).toBe('Baseten')
    expect(descriptor.models.reasoning).toBe(BASETEN_DEFAULT_MODEL)
    expect(descriptor.baseURL).toBe('https://inference.baseten.co/v1')
  })

  test('its requests use the Baseten key, never the Meta key', () => {
    const env = { BASETEN_API_KEY: 'baseten-key', MODEL_API_KEY: 'meta-key' }
    const descriptor = basetenProvider(env)!
    expect(providerApiKey(descriptor, env)).toBe('baseten-key')
  })

  test('the list shows Baseten’s own entry when it answers', async () => {
    const fetchStub = (async () =>
      new Response(JSON.stringify({ data: [{ id: BASETEN_DEFAULT_MODEL, object: 'model' }] }), { status: 200 })) as unknown as typeof fetch
    const models = await listBasetenModels({ BASETEN_API_KEY: 'k' }, fetchStub)
    expect(models).toEqual([{ id: BASETEN_DEFAULT_MODEL, ownedBy: 'Baseten' }])
  })

  test('the configured model is still listed when Baseten cannot be reached', async () => {
    const fetchStub = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    const models = await listBasetenModels({ BASETEN_API_KEY: 'k' }, fetchStub)
    expect(models).toEqual([{ id: BASETEN_DEFAULT_MODEL, ownedBy: 'Baseten' }])
  })

  test('the cloud provider itself does not change', () => {
    expect(resolveProvider({ SANDBOX_MODE: 'cloud', BASETEN_API_KEY: 'k' }).servedBy).toBe('Meta')
  })
})
