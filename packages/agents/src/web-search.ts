/**
 * Live web search for answers that must be up to date.
 *
 * Meta's search grounding is the `web_search` tool of the Responses API
 * (`POST /v1/responses`). The model decides whether to search, returns an
 * answer with `url_citation` annotations, and — when asked with
 * `include: ["web_search_call.results"]` — the raw hits it saw. Those hits are
 * kept with the answer so a jury can check what the model read.
 *
 * Web sources are not legal sources: the policy corpus stays the only basis for
 * a legal claim (see the citation validator). Web results are labelled as such.
 */

import { providerApiKey, relayHeaders } from './provider'
import type { ProviderDescriptor } from '@sps/shared'

export interface WebSource {
  title: string
  url: string
  snippet?: string
}

export interface WebCitation {
  title: string
  url: string
  /** The span of the answer this source supports. */
  text: string
}

export interface WebAnswer {
  query: string
  text: string
  /** Every source the model considered (search results). */
  sources: WebSource[]
  /** The sources the answer actually cites. */
  citations: WebCitation[]
  model: string
  searchedAt: string
}

export type WebSearch = (query: string) => Promise<WebAnswer>

export interface WebSearchOptions {
  baseURL: string
  apiKey: string
  model: string
  headers?: Record<string, string>
  contextSize?: 'low' | 'medium' | 'high'
  fetchImpl?: typeof fetch
}

interface ResponsesOutputBlock {
  type?: string
  text?: string
  annotations?: Array<{ type?: string; url?: string; title?: string; start_index?: number; end_index?: number }>
}

interface ResponsesOutputItem {
  type?: string
  results?: Array<{ title?: string; url?: string; snippet?: string }>
  content?: ResponsesOutputBlock[]
}

/** Search the live web with Meta's `web_search` tool and return the answer with its sources. */
export async function searchWeb(query: string, options: WebSearchOptions): Promise<WebAnswer> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(`${options.baseURL.replace(/\/+$/, '')}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: JSON.stringify({
      model: options.model,
      input: query,
      tools: [{ type: 'web_search', search_context_size: options.contextSize ?? 'medium' }],
      include: ['web_search_call.results'],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  if (!response.ok) throw new Error(`Web search failed (${response.status}).`)
  const payload = (await response.json()) as { output?: ResponsesOutputItem[] }

  const sources = new Map<string, WebSource>()
  const citations: WebCitation[] = []
  let text = ''
  for (const item of payload.output ?? []) {
    if (item.type === 'web_search_call') {
      for (const hit of item.results ?? []) {
        if (!hit.url || sources.has(hit.url)) continue
        sources.set(hit.url, {
          title: hit.title || hit.url,
          url: hit.url,
          ...(hit.snippet ? { snippet: hit.snippet } : {}),
        })
      }
    }
    if (item.type === 'message') {
      for (const block of item.content ?? []) {
        if (block.type !== 'output_text' || !block.text) continue
        text += block.text
        for (const annotation of block.annotations ?? []) {
          if (annotation.type !== 'url_citation' || !annotation.url) continue
          const span = block.text.slice(annotation.start_index ?? 0, annotation.end_index ?? 0)
          citations.push({ title: annotation.title || annotation.url, url: annotation.url, text: span })
          if (!sources.has(annotation.url)) sources.set(annotation.url, { title: annotation.title || annotation.url, url: annotation.url })
        }
      }
    }
  }

  return {
    query,
    text: text.trim(),
    sources: [...sources.values()],
    citations,
    model: options.model,
    searchedAt: new Date().toISOString(),
  }
}

/**
 * The web search bound to the active provider. Only Meta's cloud mode offers
 * `web_search`; elsewhere (and without a key) there is no search, and the
 * agent is told so instead of guessing.
 */
export function webSearchFor(descriptor: ProviderDescriptor, source: Record<string, string | undefined> = process.env): WebSearch | undefined {
  if (descriptor.mode !== 'cloud') return undefined
  const headers = relayHeaders(source)
  // Through the egress relay the relay holds the Meta key: the shared secret is enough to call it.
  const apiKey = providerApiKey(descriptor, source) || (Object.keys(headers).length > 0 ? 'relay' : '')
  const model = descriptor.models.reasoning
  if (!apiKey || !model) return undefined
  return (query) =>
    searchWeb(query, {
      baseURL: descriptor.baseURL,
      apiKey,
      model,
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    })
}
