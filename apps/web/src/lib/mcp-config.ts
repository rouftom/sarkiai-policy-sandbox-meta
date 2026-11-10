import { parseMcpServers, type McpServerConfig } from '@sps/shared'

export type McpServerEntry = McpServerConfig

/**
 * Registry read from `NEXT_PUBLIC_MCP_SERVERS` (JSON array), the same value the
 * API receives as `MCP_SERVERS`. It is public because the browser lists the
 * servers, and inlined at build time, so rebuild after changing it. The proxy
 * route resolves the url server-side; nothing is hardcoded here.
 */
export const MCP_SERVERS: McpServerEntry[] = parseMcpServers(process.env.NEXT_PUBLIC_MCP_SERVERS)

/**
 * Server-side only: authentication headers for a first-party MCP server.
 * Never sends the key to third-party servers. Returns an empty object when the
 * key is not available (e.g. when evaluated in a browser bundle).
 */
export function getMcpAuthHeaders(server?: Pick<McpServerEntry, 'requiresApiKey'> | null): Record<string, string> {
  const key = process.env.SEA_MCP_API_KEY;
  if (!server?.requiresApiKey || !key) return {};
  return { 'x-api-key': key };
}
