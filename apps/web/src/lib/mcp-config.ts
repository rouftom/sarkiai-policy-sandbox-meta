export interface McpServerEntry {
  name: string;
  url: string;
  /** First-party servers protected by the shared SEA_MCP_API_KEY (sent as `x-api-key`). */
  requiresApiKey?: boolean;
}

export const MCP_SERVERS: McpServerEntry[] = [
  {
    name: 'tic_tac_toe',
    url: 'https://tic-tac-toe-mcp-app.vercel.app/mcp',
    requiresApiKey: true,
  },
  {
    name: 'sarkiai_charts',
    url: 'https://sarkiai-charts-mcp-app.vercel.app/mcp',
    requiresApiKey: true,
  },
  {
    name: 'xlab_3d_render',
    url: 'https://xlab-3d-render-mcp-app.vercel.app/mcp',
    requiresApiKey: true,
  },
  {
    name: 'sea_mcp_excalidraw',
    url: 'https://sea-mcp-excalidraw.vercel.app/mcp',
    requiresApiKey: true,
  },
];

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
