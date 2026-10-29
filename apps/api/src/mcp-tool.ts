/**
 * A small helper around the MCP gateway: find the tool by name, call it, and
 * report a failed call as a message instead of throwing (the Word server may be
 * old, unreachable, or refuse a block type).
 */

import type { McpGateway } from './mcp.js'

export type McpCall =
  | { ok: true; tool: string; result: unknown }
  | { ok: false; message: string }

export async function callMcpTool(
  mcp: McpGateway | undefined,
  server: string,
  pattern: RegExp,
  args: Record<string, unknown>,
): Promise<McpCall> {
  if (!mcp) return { ok: false, message: 'MCP gateway not configured' }
  try {
    const tools = await mcp.listTools(server)
    const tool = tools.find((entry) => pattern.test(entry.name))
    if (!tool) return { ok: false, message: `${server} exposes no matching tool` }
    const response = await mcp.callTool(server, tool.name, args)
    const result = response.result as { isError?: boolean; content?: Array<{ text?: string }> } | undefined
    if (result?.isError) return { ok: false, message: (result.content?.[0]?.text ?? 'tool error').slice(0, 160) }
    return { ok: true, tool: tool.name, result: response.result }
  } catch (error) {
    return { ok: false, message: (error as Error).message.slice(0, 160) }
  }
}
