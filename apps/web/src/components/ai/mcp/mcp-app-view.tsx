'use client'
import { useMemo, useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AppFrame, AppBridge } from '@mcp-ui/client'
import { X } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

type McpUiDisplayMode = "inline" | "fullscreen" | "pip";

/**
 * Low-level frame: renders an MCP app for an already connected client.
 * The app HTML is read from `toolResult._mcpUiResourceUri`. App code should use
 * `McpAppView` (mcp-app-wrapper.tsx), which handles connection and server lookup.
 */
export interface McpAppFrameProps {
  toolName: string
  toolInput?: any
  toolResult?: any
  client: any
  isConnecting?: boolean
  onError?: (error: Error) => void
  onToolResult?: (data: { tool: string, toolCallId: string, output: any }) => void
  toolCallId?: string
}

export function McpAppFrame({
  toolName,
  toolInput,
  toolResult,
  client,
  isConnecting,
  onError,
  onToolResult,
  toolCallId,
}: McpAppFrameProps) {
  const { t, locale } = useI18n()
  const [displayMode, setDisplayMode] = useState<McpUiDisplayMode>('inline')
  const [html, setHtml] = useState<string | null>(null)
  const [error, setLocalError] = useState<Error | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  // Memoize input/result
  const memoizedInput = useMemo(() => toolInput || {}, [toolInput])
  const [tools, setTools] = useState<any[]>([])

  // Discover tools when client is available
  useEffect(() => {
    if (!client) return
    client.listTools().then((res: any) => {
      if (res?.tools) setTools(res.tools)
    }).catch((err: any) => console.warn('[McpAppView] Failed to list tools:', err))
  }, [client])

  const memoizedResult = useMemo(() => {
    if (toolResult) return toolResult

    // Dynamic discovery: find the tool in the fetched tools list to extract UI metadata
    const toolDef = tools.find((t: any) => t.name === toolName)
    const resourceUri = toolDef?._meta?.ui?.resourceUri

    if (resourceUri) return { _mcpUiResourceUri: resourceUri }
    return undefined
  }, [toolName, toolResult, tools])

  // Stabilize sandbox URL
  const sandboxConfig = useMemo(() => ({
    url: new URL('/sandbox_proxy.html', window.location.origin)
  }), [])

  // Create AppBridge manually to have full control over handlers
  // Recreate bridge when displayMode changes to avoid "Already connected to a transport" error
  // since switching between portal and inline unmounts/mounts AppFrame.
  const appBridge = useMemo(() => {
    if (!client) return null
    const caps = client.getServerCapabilities()

    // Pass initial context directly to constructor so guest has it on first initialize
    const initialContext = {
      displayMode,
      locale: locale,
      availableDisplayModes: ['inline', 'fullscreen'] as McpUiDisplayMode[],
      containerDimensions: displayMode === 'fullscreen'
        ? { width: window.innerWidth, height: window.innerHeight }
        : undefined
    }

    const bridge = new AppBridge(
      client,
      { name: "sps-host", version: "1.0.2" },
      {
        openLinks: {},
        serverTools: caps?.tools,
        serverResources: caps?.resources
      },
      { hostContext: initialContext }
    )

    // Handle display mode requests
    // @ts-ignore
    bridge.onrequestdisplaymode = async ({ mode }: { mode: McpUiDisplayMode }) => {
      if (mode === 'fullscreen' || mode === 'inline' || mode === 'pip') {
        setDisplayMode(mode)
        return { mode }
      }
      return { mode: 'inline' }
    }

    // Handle open links
    bridge.onopenlink = async ({ url }: { url: string }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        window.open(url)
      }
      return { isError: false }
    }

    return bridge
  }, [client, displayMode])

  // Cleanup bridge on unmount or recreation
  useEffect(() => {
    return () => {
      if (appBridge) {
        // @ts-ignore - close exists on bridge (inherited from Protocol)
        appBridge.close().catch(() => { });
      }
    }
  }, [appBridge])

  // Reset connection state when bridge changes
  useEffect(() => {
    setIsConnected(false)
  }, [appBridge])

  // Sync state and dimensions to bridge context when they change AFTER initialization
  useEffect(() => {
    if (appBridge && isConnected) {
      try {
        const dimensions = displayMode === 'fullscreen'
          ? { width: window.innerWidth, height: window.innerHeight }
          : undefined;

        appBridge.setHostContext({
          displayMode,
          locale: locale,
          availableDisplayModes: ['inline', 'fullscreen'],
          containerDimensions: dimensions
        })
      } catch (err) {
        console.warn('[McpAppView] Failed to set host context:', err)
      }
    }
  }, [displayMode, appBridge, isConnected, locale])

  // Handle window resize for fullscreen
  useEffect(() => {
    if (displayMode !== 'fullscreen' || !appBridge || !isConnected) return;

    const handleResize = () => {
      appBridge.setHostContext({
        containerDimensions: { width: window.innerWidth, height: window.innerHeight }
      })
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [displayMode, appBridge, isConnected]);

  // Fetch HTML
  useEffect(() => {
    if (!client || html) return
    let active = true
    const fetchHtml = async () => {
      const uri = (memoizedResult as any)?._mcpUiResourceUri
      if (!uri) return

      try {
        const resource = await client.readResource({ uri })
        if (active && resource?.contents?.[0]?.text) {
          let content = resource.contents[0].text

          const overlayFix = `
<style>
  .excalidraw-textEditorContainer,
  .excalidraw-contextMenuContainer {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
</style>
`
          const audioFix = `
<script>
  (function() {
    const resume = () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        for (const key in window) {
          try {
            const val = window[key];
            if (val && (val instanceof AudioContext)) {
              if (val.state === 'suspended') val.resume();
            }
          } catch(e) {}
        }
        const tempCtx = new AudioContext();
        if (tempCtx.state === 'suspended') tempCtx.resume();
      }
    };
    window.addEventListener('mousedown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  })();
</script>
`
          content = content.replace('</body>', overlayFix + audioFix + '</body>')
          setHtml(content)
        }
      } catch (err) {
        if (active) {
          console.error('[McpAppView] Failed to fetch tool HTML:', err)
          setLocalError(err instanceof Error ? err : new Error(String(err)))
        }
      }
    }
    fetchHtml()
    return () => { active = false }
  }, [client, toolName, html, memoizedResult])

  const handleError = useCallback((err: Error) => {
    console.error('[McpAppView] error:', err)
    setLocalError(err)
    onError?.(err)
  }, [onError])

  const isLoading = !html || !appBridge || !isConnected || isConnecting;
  const sharedStyles = (
    <style>{`
      .mcp-app-container iframe {
        width: 100% !important;
        min-width: 100% !important;
        height: 100% !important;
        min-height: 16rem !important;
        border: none !important;
      }
      /* Hide problematic Excalidraw overlay containers that appear as black blocks */
      .excalidraw-textEditorContainer,
      .excalidraw-contextMenuContainer {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `}</style>
  )

  // Ensure AppFrame is recreated by using a key based on displayMode
  const appFrame = html && appBridge ? (
    <AppFrame
      key={displayMode}
      appBridge={appBridge}
      html={html}
      sandbox={sandboxConfig}
      onInitialized={() => setIsConnected(true)}
      toolInput={memoizedInput}
      toolResult={memoizedResult as any}
      onError={handleError}
    />
  ) : null

  // if (error || (appBridge === null && !isConnecting)) {
  //   return (
  //     <div className="p-4 text-sm text-red-500 bg-red-50 rounded-lg border border-red-100">
  //       Error: {error?.message || "Client not available"}
  //     </div>
  //   )
  // }

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
      <div className="fixed inset-0 z-[1000] bg-black flex flex-col overflow-hidden mcp-app-container">
        {sharedStyles}
        <div className="absolute bottom-14 right-4 z-[1001]">
          <button onClick={() => setDisplayMode('inline')} className="p-2 rounded-lg bg-white/10 text-foreground hover:bg-white/20 transition-colors">
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
      {sharedStyles}
      <div
        className="mcp-app-container relative border border-border/50 bg-transparent shadow-md transition-all h-[18rem] sm:h-[clamp(18rem,50vh,26.25rem)] overflow-hidden"
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {loadingOverlay}
        {appFrame}
      </div>
    </div>
  )
}
