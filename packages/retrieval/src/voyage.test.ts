import { describe, expect, test } from 'bun:test'
import { VoyageClient } from './voyage'

function client(fetchImpl: typeof fetch) {
  return new VoyageClient({
    apiKey: 'voyage-key',
    baseUrl: 'https://voyage.example/v1/',
    embeddingModel: 'voyage-4',
    rerankModel: 'rerank-2',
    fetchImpl,
  })
}

describe('Voyage embeddings', () => {
  test('orders vectors by the provider index', async () => {
    let body: Record<string, any> = {}
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, any>
      return new Response(
        JSON.stringify({
          data: [
            { index: 1, embedding: [0, 1] },
            { index: 0, embedding: [1, 0] },
          ],
        }),
      )
    }) as typeof fetch

    const vectors = await client(fakeFetch).embed(['a', 'b'], 'query')
    expect(vectors).toEqual([
      [1, 0],
      [0, 1],
    ])
    expect(body.model).toBe('voyage-4')
    expect(body.input_type).toBe('query')
    expect(body.input).toEqual(['a', 'b'])
  })

  test('fails clearly when the count does not match', async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ data: [{ index: 0, embedding: [1] }] }))) as unknown as typeof fetch
    await expect(client(fakeFetch).embed(['a', 'b'])).rejects.toThrow('1 vectors for 2 inputs')
  })

  test('refuses to call without an API key', async () => {
    const empty = new VoyageClient({ apiKey: '' })
    await expect(empty.embed(['a'])).rejects.toThrow('VOYAGE_API_KEY is not configured')
  })
})

describe('Voyage rerank', () => {
  test('returns indices and scores', async () => {
    let body: Record<string, any> = {}
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, any>
      return new Response(
        JSON.stringify({
          data: [
            { index: 1, relevance_score: 0.91 },
            { index: 0, relevance_score: 0.12 },
          ],
        }),
      )
    }) as typeof fetch

    const hits = await client(fakeFetch).rerank('question', ['first', 'second'], 2)
    expect(hits).toEqual([
      { index: 1, score: 0.91 },
      { index: 0, score: 0.12 },
    ])
    expect(body.model).toBe('rerank-2')
    expect(body.documents).toEqual(['first', 'second'])
  })
})
