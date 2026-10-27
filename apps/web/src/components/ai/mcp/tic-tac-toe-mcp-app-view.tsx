'use client'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AppFrame, AppBridge } from '@mcp-ui/client'
import { X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

type McpUiDisplayMode = "inline" | "fullscreen" | "pip";

interface TicTacToeMcpAppViewProps {
  toolName: string
  toolInput?: any
  toolResult?: any
  client: any
  isConnecting?: boolean
  onError?: (error: Error) => void
  onToolResult?: (data: { tool: string, toolCallId: string, output: any }) => void
  toolCallId?: string
}

export function TicTacToeMcpAppView({
  toolName,
  toolInput,
  toolResult,
  client,
  isConnecting,
  onError,
  onToolResult,
  toolCallId,
}: TicTacToeMcpAppViewProps) {
  const { t, locale } = useI18n()
  const [displayMode, setDisplayMode] = useState<McpUiDisplayMode>('inline')
  const [html, setHtml] = useState<string | null>(null)
  const [error, setLocalError] = useState<Error | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Local state to keep track of tool result updates from moves
  const [localResult, setLocalResult] = useState(toolResult)

  const memoizedInput = useMemo(() => toolInput || {}, [toolInput])

  // Sync localResult with prop updates from parent if needed
  useEffect(() => {
    setLocalResult(toolResult)
  }, [toolResult])

  const sandboxConfig = useMemo(() => ({
    url: new URL('/sandbox_tictactoe.html', window.location.origin)
  }), [])

  const appBridge = useMemo(() => {
    if (!client) return null
    const caps = client.getServerCapabilities()

    const initialContext = {
      displayMode,
      availableDisplayModes: ['inline', 'fullscreen'] as McpUiDisplayMode[]
    }

    const bridge = new AppBridge(
      client,
      { name: "sps-tic-tac-toe-host", version: "1.0.0" },
      {
        openLinks: {},
        serverTools: caps?.tools,
        serverResources: caps?.resources
      },
      { hostContext: initialContext }
    )

    // @ts-ignore
    bridge.onrequestdisplaymode = async ({ mode }: { mode: McpUiDisplayMode }) => {
      setDisplayMode(mode)
      return { mode }
    }

    return bridge
  }, [client, displayMode])

  useEffect(() => {
    const handleGameMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (data && data.method === 'notifications/tic-tac-toe/user-move') {
        const gameState = data.params.gameState;
        if (client) {
          try {
            // We call the tool on behalf of the user. 
            // The proxy will intercept and add the agent's move.
            const result = await client.callTool({
              name: 'play_tic_tac_toe',
              arguments: {
                gameState,
                locale: locale
              }
            });

            setLocalResult(result);
          } catch (err) {
            console.error('[TicTacToeMcpAppView] Error calling tool through proxy:', err);
          }
        }
      }
    };

    window.addEventListener('message', handleGameMessage);
    return () => window.removeEventListener('message', handleGameMessage);
  }, [client, locale]);

  useEffect(() => {
    return () => {
      if (appBridge) {
        // @ts-ignore
        appBridge.close().catch(() => { });
      }
    }
  }, [appBridge])

  useEffect(() => {
    if (!client || html) return
    let active = true
    const fetchHtml = async () => {
      try {
        const resourceUri = "ui://tic-tac-toe/mcp-app.html"
        const resource = await client.readResource({ uri: resourceUri })
        if (active && resource?.contents?.[0]?.text) {
          setHtml(resource.contents[0].text)
        }
      } catch (err) {
        if (active) {
          setLocalError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }
    fetchHtml()
    return () => { active = false }
  }, [client, html])

  const handleError = useCallback((err: Error) => {
    setLocalError(err)
    onError?.(err)
  }, [onError])

  const isLoading = !html || !appBridge || !isConnected || isConnecting;

  const appFrame = html && appBridge ? (
    <AppFrame
      appBridge={appBridge}
      html={html}
      sandbox={sandboxConfig}
      onInitialized={() => setIsConnected(true)}
      toolInput={memoizedInput}
      toolResult={localResult}
      onError={handleError}
    />
  ) : null;

  const loadingOverlay = isLoading && (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity duration-300">
      <div className="flex flex-col items-center gap-4">
        <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <div className="text-white/60 text-xs font-medium animate-pulse tracking-wider">
          {t('chat.connecting_to_game')}
        </div>
      </div>
    </div>
  );

  if (displayMode === 'fullscreen') {
    return createPortal(
      <div className="fixed inset-0 z-[1000] bg-black flex flex-col overflow-hidden">
        <div className="absolute top-4 right-4 z-[1001]">
          <button onClick={() => setDisplayMode('inline')} className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 w-full h-full relative">
          {loadingOverlay}
          {appFrame}
        </div>
      </div>,
      document.body
    )
  }

  return (
    <div className="w-full">
      <div className="w-full aspect-[4/5] sm:aspect-square min-h-[550px] sm:min-h-[400px] relative rounded-3xl overflow-hidden shadow-2xl border border-white/5 [&_iframe]:!w-full [&_iframe]:!h-full">
        {loadingOverlay}
        {appFrame}
      </div>
    </div>
  )
}
