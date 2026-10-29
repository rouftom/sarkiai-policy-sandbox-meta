/**
 * Server-side client for the first-party MCP servers (Streamable HTTP, JSON-RPC).
 *
 * The agent calls these tools on the operator's behalf. The shared key
 * (`SEA_MCP_API_KEY`) is added here, on the server, and never leaves it: the
 * browser only receives tool results and UI resource URIs.
 */

export interface McpServerEntry {
  name: string
  url: string
  /** First-party servers protected by the shared `SEA_MCP_API_KEY` (sent as `x-api-key`). */
  requiresApiKey: boolean
}

/**
 * Same registry as the console (apps/web/src/lib/mcp-config.ts). Keep the two in sync.
 * The charts and Word servers run locally (services/mcp-charts, services/mcp-docx,
 * docker-compose) when MCP_CHARTS_URL and MCP_DOCX_URL point at them; otherwise
 * the hosted copies are used.
 */
export const MCP_SERVERS: McpServerEntry[] = [
  { name: 'tic_tac_toe', url: 'https://tic-tac-toe-mcp-app.vercel.app/mcp', requiresApiKey: true },
  { name: 'sarkiai_charts', url: process.env.MCP_CHARTS_URL || 'https://sarkiai-charts-mcp-app.vercel.app/mcp', requiresApiKey: true },
  { name: 'xlab_3d_render', url: 'https://xlab-3d-render-mcp-app.vercel.app/mcp', requiresApiKey: true },
  { name: 'sea_mcp_docx', url: process.env.MCP_DOCX_URL || 'https://sea-mcp-docx.vercel.app/mcp', requiresApiKey: true },
]

export interface McpToolSummary {
  name: string
  description?: string
  /** `_meta.ui.resourceUri` of the tool definition, when the tool renders an app. */
  uiResourceUri?: string
}

export interface McpCallResult {
  result: unknown
  uiResourceUri?: string
}

const TIMEOUT_MS = 20_000
const PROTOCOL_VERSION = '2025-06-18'

type JsonRpcResponse = { result?: unknown; error?: { message?: string } }

function serverNamed(name: string): McpServerEntry {
  const server = MCP_SERVERS.find((entry) => entry.name === name)
  if (!server) throw new Error(`Unknown MCP server "${name}".`)
  return server
}

/** Streamable HTTP answers either plain JSON or one SSE event carrying the JSON-RPC message. */
function parseBody(text: string, contentType: string): JsonRpcResponse {
  if (contentType.includes('text/event-stream')) {
    const data = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
      .pop()
    return data ? (JSON.parse(data) as JsonRpcResponse) : {}
  }
  return text ? (JSON.parse(text) as JsonRpcResponse) : {}
}

export class McpGateway {
  private readonly sessions = new Map<string, string>()
  private readonly tools = new Map<string, McpToolSummary[]>()

  constructor(private readonly key: string | undefined) {}

  /** Names the agent may use, in registry order. */
  get servers(): string[] {
    return MCP_SERVERS.map((entry) => entry.name)
  }

  private headers(server: McpServerEntry, session?: string): Record<string, string> {
    return {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(server.requiresApiKey && this.key ? { 'x-api-key': this.key } : {}),
      ...(session ? { 'mcp-session-id': session } : {}),
    }
  }

  private async post(server: McpServerEntry, body: unknown, session?: string): Promise<Response> {
    return fetch(server.url, {
      method: 'POST',
      headers: this.headers(server, session),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  }

  /** Opens an MCP session once per server and keeps its id. */
  private async session(server: McpServerEntry): Promise<string | undefined> {
    const known = this.sessions.get(server.name)
    if (known) return known
    const init = await this.post(server, {
      jsonrpc: '2.0',
      id: 'init',
      method: 'initialize',
      params: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'sps-agent', version: '1.0.0' },
      },
    })
    if (!init.ok) throw new Error(`${server.name} refused the session (HTTP ${init.status}).`)
    const id = init.headers.get('mcp-session-id') ?? undefined
    if (id) this.sessions.set(server.name, id)
    await this.post(server, { jsonrpc: '2.0', method: 'notifications/initialized' }, id).catch(() => undefined)
    return id
  }

  private async rpc(server: McpServerEntry, method: string, params: unknown): Promise<unknown> {
    const session = await this.session(server)
    const response = await this.post(server, { jsonrpc: '2.0', id: `${Date.now()}`, method, params }, session)
    if (response.status === 404 && session) {
      this.sessions.delete(server.name)
      throw new Error(`${server.name} session expired; retry the call.`)
    }
    if (!response.ok) throw new Error(`${server.name} answered HTTP ${response.status}.`)
    const message = parseBody(await response.text(), response.headers.get('content-type') ?? '')
    if (message.error) throw new Error(`${server.name}: ${message.error.message ?? 'error'}`)
    return message.result
  }

  async listTools(serverName: string): Promise<McpToolSummary[]> {
    const server = serverNamed(serverName)
    const cached = this.tools.get(server.name)
    if (cached) return cached
    const result = (await this.rpc(server, 'tools/list', {})) as { tools?: Array<Record<string, unknown>> } | undefined
    const tools: McpToolSummary[] = (result?.tools ?? []).map((tool) => {
      const meta = tool._meta as { ui?: { resourceUri?: string } } | undefined
      return {
        name: String(tool.name),
        ...(typeof tool.description === 'string' ? { description: tool.description.slice(0, 300) } : {}),
        ...(meta?.ui?.resourceUri ? { uiResourceUri: meta.ui.resourceUri } : {}),
      }
    })
    this.tools.set(server.name, tools)
    return tools
  }

  async callTool(serverName: string, tool: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const server = serverNamed(serverName)
    const definition = (await this.listTools(server.name).catch(() => [])).find((entry) => entry.name === tool)
    const result = (await this.rpc(server, 'tools/call', { name: tool, arguments: args })) as
      | { _meta?: { ui?: { resourceUri?: string } } }
      | undefined
    const uiResourceUri = result?._meta?.ui?.resourceUri ?? definition?.uiResourceUri
    return { result, ...(uiResourceUri ? { uiResourceUri } : {}) }
  }
}
