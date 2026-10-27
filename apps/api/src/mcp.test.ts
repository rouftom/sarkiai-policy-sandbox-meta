import { afterEach, describe, expect, test } from 'bun:test'
import { McpGateway } from './mcp'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** A stub Streamable HTTP server: checks the key header and the session id, answers tools/call as SSE. */
function stubServer(calls: Array<{ method: string; headers: Headers }>) {
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body ?? '{}')) as { method: string; id?: string }
    calls.push({ method: body.method, headers })
    if (body.method === 'initialize') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 'init', result: {} }), {
        headers: { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' },
      })
    }
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (body.method === 'tools/list') {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 'bar', _meta: { ui: { resourceUri: 'ui://bar' } } }] } }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    const payload = { jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'done' }] } }
    return new Response(`event: message\ndata: ${JSON.stringify(payload)}\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    })
  }) as typeof fetch
}

describe('MCP gateway', () => {
  test('opens one session, sends the key server-side, and parses SSE results', async () => {
    const calls: Array<{ method: string; headers: Headers }> = []
    stubServer(calls)
    const gateway = new McpGateway('secret-test-key')
    const { result, uiResourceUri } = await gateway.callTool('sarkiai_charts', 'bar', { x: 1 })
    expect(uiResourceUri).toBe('ui://bar')
    expect(result).toEqual({ content: [{ type: 'text', text: 'done' }] })
    expect(calls.map((call) => call.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/call'])
    expect(calls[0]!.headers.get('x-api-key')).toBe('secret-test-key')
    expect(calls[3]!.headers.get('mcp-session-id')).toBe('sess-1')
  })

  test('refuses servers outside the registry without calling them', async () => {
    const calls: Array<{ method: string; headers: Headers }> = []
    stubServer(calls)
    await expect(new McpGateway('k').callTool('evil_server', 'x', {})).rejects.toThrow('Unknown MCP server')
    expect(calls).toHaveLength(0)
  })
})
