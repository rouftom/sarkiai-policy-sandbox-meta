'use client'

import { useEffect, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { MCP_SERVERS, type McpServerEntry } from '@/lib/mcp-config'
import { useMcpClient } from '@/lib/use-mcp-client'
import { useI18n, type MessageKey } from '@/lib/i18n'

const SERVER_LABEL_KEYS: Record<string, MessageKey> = {
  tic_tac_toe: 'mcp.server.tic_tac_toe',
  sarkiai_charts: 'mcp.server.sarkiai_charts',
  xlab_3d_render: 'mcp.server.xlab_3d_render',
  sea_mcp_excalidraw: 'mcp.server.sea_mcp_excalidraw',
}

/** List of the registered MCP servers with their live connection state. Reusable in preferences. */
export function McpServers({ servers = MCP_SERVERS }: { servers?: McpServerEntry[] }) {
  const { t } = useI18n()

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium text-foreground">{t('mcp.serversTitle')}</h3>
        <p className="text-xs text-muted-foreground">{t('mcp.serversDescription')}</p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {servers.map((server) => (
          <McpServerRow key={server.name} server={server} />
        ))}
      </ul>
    </div>
  )
}

function McpServerRow({ server }: { server: McpServerEntry }) {
  const { t } = useI18n()
  const { mcpClient, connect, isConnecting, error } = useMcpClient(server.name)

  useEffect(() => {
    if (!mcpClient && !isConnecting && !error) connect()
  }, [mcpClient, isConnecting, error, connect])

  const labelKey = SERVER_LABEL_KEYS[server.name]
  const label = labelKey ? t(labelKey) : server.name

  let status: ReactNode
  if (mcpClient) {
    status = (
      <span className="inline-flex items-center gap-1.5 text-emerald-600">
        <CheckCircle2 className="h-4 w-4" />
        {t('mcp.status.connected')}
      </span>
    )
  } else if (error) {
    status = (
      <span className="inline-flex items-center gap-1.5 text-destructive">
        <AlertCircle className="h-4 w-4" />
        {t('mcp.status.error')}
      </span>
    )
  } else if (isConnecting) {
    status = (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('mcp.status.connecting')}
      </span>
    )
  } else {
    status = <span className="text-muted-foreground">{t('mcp.status.idle')}</span>
  }

  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{label}</p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{server.name}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs">
        {status}
        {error && !mcpClient && (
          <button
            type="button"
            onClick={() => connect()}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" />
            {t('mcp.retry')}
          </button>
        )}
      </div>
    </li>
  )
}
