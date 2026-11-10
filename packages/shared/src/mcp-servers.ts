/**
 * First-party MCP servers, supplied by configuration.
 *
 * The addresses are deployment settings, not code: the API reads `MCP_SERVERS`
 * and the console reads `NEXT_PUBLIC_MCP_SERVERS`, both holding the same JSON
 * array. One parser serves the two processes, so a list accepted by the API is
 * accepted by the console and vice versa.
 *
 * Shape: `[{ "name": "sarkiai_charts", "url": "https://…/mcp", "requiresApiKey": true }]`.
 * `requiresApiKey` defaults to `true`: every first-party server is protected by
 * the shared `SEA_MCP_API_KEY`.
 */

export interface McpServerConfig {
  name: string
  url: string
  /** Protected by the shared `SEA_MCP_API_KEY` (sent as `x-api-key` server-side). */
  requiresApiKey: boolean
}

/**
 * Parses the JSON array from the environment.
 *
 * An unset or empty value yields no servers (MCP tools are simply unavailable).
 * A value that is present but malformed throws: a typo must fail at startup or
 * at build time, not silently remove every tool from the agent.
 */
export function parseMcpServers(raw: string | null | undefined): McpServerConfig[] {
  const trimmed = raw?.trim()
  if (!trimmed) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error('MCP server list is not valid JSON: expected an array of { name, url, requiresApiKey? }.')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('MCP server list must be a JSON array of { name, url, requiresApiKey? }.')
  }

  const seen = new Set<string>()
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`MCP server #${index + 1} must be an object with a name and a url.`)
    }
    const record = entry as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) throw new Error(`MCP server #${index + 1} has no name.`)
    if (seen.has(name)) throw new Error(`MCP server "${name}" is listed twice.`)
    seen.add(name)

    const url = typeof record.url === 'string' ? record.url.trim() : ''
    if (!url) throw new Error(`MCP server "${name}" has no url.`)
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      throw new Error(`MCP server "${name}" has an invalid url: ${url}`)
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(`MCP server "${name}" must use http or https: ${url}`)
    }

    return {
      name,
      url: parsedUrl.toString(),
      requiresApiKey: record.requiresApiKey !== false,
    }
  })
}
