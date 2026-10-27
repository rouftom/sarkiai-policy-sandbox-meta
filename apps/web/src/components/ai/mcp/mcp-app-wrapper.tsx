/**
 * Public entry point for MCP apps (interactive UI shipped by an MCP server, rendered in a sandboxed iframe).
 *
 * How the agent flow feeds it: when a tool result carries `_meta.ui.resourceUri`
 * (the `ui://...` resource that holds the app HTML), render
 *
 *   <McpAppView
 *     server={serverName}                       // registry name, e.g. "sarkiai_charts"
 *     resourceUri={result._meta.ui.resourceUri}
 *     toolName={toolName}
 *     toolInput={toolInput}
 *     toolResult={result}
 *     onClose={() => ...}                       // optional
 *   />
 *
 * `server` must be a name from `MCP_SERVERS` (src/lib/mcp-config.ts). The chat
 * stream does not tell the browser which server produced a result, so the owner
 * must pass it (e.g. from a server-injected field on the tool result, as the
 * organization app did with `_mcpServerName`). Unknown names fail without any request.
 */
'use client'

import { useEffect, useMemo } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { McpAppFrame } from './mcp-app-view'
import { TicTacToeMcpAppView } from './tic-tac-toe-mcp-app-view'
import { useMcpClient } from '@/lib/use-mcp-client'
import { useI18n } from '@/lib/i18n'

export interface McpAppViewProps {
  server: string
  resourceUri?: string
  toolName?: string
  toolInput?: unknown
  toolResult?: unknown
  onClose?(): void
}

export function McpAppView({
  server,
  resourceUri,
  toolName = '',
  toolInput,
  toolResult,
  onClose,
}: McpAppViewProps) {
  const { t } = useI18n()
  const { mcpClient, connect, isConnecting, error } = useMcpClient(server)

  // Retry only when the user asks for it (see the retry button): a failed connection is not retried automatically
  useEffect(() => {
    if (!mcpClient && !isConnecting && !error) connect()
  }, [mcpClient, isConnecting, error, connect])

  // The frame reads the app HTML from `_mcpUiResourceUri` on the result
  const frameResult = useMemo(() => {
    if (!resourceUri) return toolResult
    const base = typeof toolResult === 'object' && toolResult !== null ? toolResult : {}
    return { ...base, _mcpUiResourceUri: resourceUri }
  }, [resourceUri, toolResult])

  const isTicTacToe = toolName === 'play_tic_tac_toe'

  let view
  if (error && !mcpClient) {
    view = (
      <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{t('mcp.connectionFailed')}</span>
      </div>
    )
  } else if (isTicTacToe) {
    view = (
      <TicTacToeMcpAppView
        toolName={toolName}
        toolInput={toolInput}
        toolResult={frameResult}
        client={mcpClient}
        isConnecting={isConnecting}
      />
    )
  } else {
    view = (
      <McpAppFrame
        toolName={toolName}
        toolInput={toolInput}
        toolResult={frameResult}
        client={mcpClient}
        isConnecting={isConnecting}
      />
    )
  }

  return (
    <div className="relative w-full">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={t('mcp.close')}
          title={t('mcp.close')}
          className="absolute right-2 top-2 z-20 rounded-lg bg-background/80 p-1.5 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {view}
    </div>
  )
}
