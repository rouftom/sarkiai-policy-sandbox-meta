import { describe, expect, test } from 'bun:test'
import { searchWeb } from './web-search'

const answerText = 'The national strategy was adopted in 2024. It sets a data governance target.'

function mockFetch(payload: unknown, seen: { body?: unknown; url?: string } = {}): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url)
    seen.body = JSON.parse(String(init?.body))
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as unknown as typeof fetch
}

describe('searchWeb', () => {
  test('asks the Responses API for web_search with its results', async () => {
    const seen: { body?: unknown; url?: string } = {}
    await searchWeb('AI strategy Cameroon', {
      baseURL: 'https://api.meta.ai/v1/',
      apiKey: 'test',
      model: 'muse-spark-1.1',
      fetchImpl: mockFetch({ output: [] }, seen),
    })
    expect(seen.url).toBe('https://api.meta.ai/v1/responses')
    expect(seen.body).toEqual({
      model: 'muse-spark-1.1',
      input: 'AI strategy Cameroon',
      tools: [{ type: 'web_search', search_context_size: 'medium' }],
      include: ['web_search_call.results'],
    })
  })

  test('returns the answer, every source considered, and the cited spans', async () => {
    const answer = await searchWeb('q', {
      baseURL: 'https://api.meta.ai/v1',
      apiKey: 'test',
      model: 'muse-spark-1.1',
      fetchImpl: mockFetch({
        output: [
          {
            type: 'web_search_call',
            results: [
              { type: 'text_result', title: 'Strategy', url: 'https://example.org/strategy', snippet: 'adopted' },
              { type: 'text_result', title: 'Other', url: 'https://example.org/other' },
            ],
          },
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: answerText,
                annotations: [
                  {
                    type: 'url_citation',
                    url: 'https://example.org/strategy',
                    title: 'Strategy',
                    start_index: 0,
                    end_index: answerText.indexOf('.') + 1,
                  },
                ],
              },
            ],
          },
        ],
      }),
    })
    expect(answer.text).toBe(answerText)
    expect(answer.sources.map((source) => source.url)).toEqual(['https://example.org/strategy', 'https://example.org/other'])
    expect(answer.citations).toEqual([
      { title: 'Strategy', url: 'https://example.org/strategy', text: 'The national strategy was adopted in 2024.' },
    ])
  })

  test('fails loudly on an upstream error', async () => {
    const failing = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch
    await expect(
      searchWeb('q', { baseURL: 'https://api.meta.ai/v1', apiKey: 'k', model: 'm', fetchImpl: failing }),
    ).rejects.toThrow('Web search failed (503)')
  })
})
