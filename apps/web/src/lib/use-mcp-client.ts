'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js'
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { readToken } from './session'
import {
  type ClientCapabilitiesWithExtensions,
  UI_EXTENSION_CAPABILITIES,
} from '@mcp-ui/client'
import { MCP_SERVERS } from '@/lib/mcp-config'

// Registry of client instances by server name
const mcpClients: Record<string, McpClient> = {}
const connectionPromises: Record<string, Promise<McpClient | null>> = {}

async function getOrCreateMcpClient(serverName: string = 'xlab_3d_render'): Promise<McpClient | null> {
  // Return existing client
  if (mcpClients[serverName]) {
    return mcpClients[serverName]
  }

  // Only servers from the registry can be reached (the proxy enforces the same rule)
  if (!MCP_SERVERS.some((s) => s.name === serverName)) {
    console.error(`[useMcpClient] Unknown MCP server: ${serverName}`)
    return null
  }

  // Return pending connection
  if (serverName in connectionPromises) {
    return connectionPromises[serverName]!;
  }

  // Create new connection
  connectionPromises[serverName] = (async () => {
    try {
      // Create the client with UI extension capabilities
      const capabilities: ClientCapabilitiesWithExtensions = {
        roots: { listChanged: true },
        extensions: UI_EXTENSION_CAPABILITIES,
      }

      const client = new McpClient(
        { name: `sps-${serverName.toLowerCase()}-client`, version: '1.0.0' },
        { capabilities: capabilities as ClientCapabilities }
      )

      // Requests go through the same-origin proxy, which resolves `server` against the registry
      const proxyUrl = new URL('/api/mcp/proxy', window.location.origin)
      proxyUrl.searchParams.set('server', serverName)

      // The proxy only serves signed-in operators: send the console session.
      const token = readToken()
      const transport = new StreamableHTTPClientTransport(proxyUrl, {
        requestInit: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      })

      await client.connect(transport)

      mcpClients[serverName] = client
      return client
    } catch (err) {
      console.error(`[useMcpClient] Connection to ${serverName} failed:`, err)
      delete connectionPromises[serverName]
      return null
    }
  })()

  return connectionPromises[serverName]
}

export function useMcpClient(serverName: string) {
  const [mcpClient, setMcpClient] = useState<McpClient | null>(mcpClients[serverName] || null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const connectCalledRef = useRef(false)

  const connect = useCallback(async () => {
    // Prevent multiple connect calls or redundant state changes
    if (mcpClients[serverName]) {
      if (!mcpClient) setMcpClient(mcpClients[serverName])
      return mcpClients[serverName]
    }

    if (serverName in connectionPromises) {
      setIsConnecting(true)
      const client = await connectionPromises[serverName]
      setMcpClient(client as unknown as typeof mcpClient)
      setError(client ? null : new Error(`Connection to ${serverName} failed`))
      setIsConnecting(false)
      return client
    }

    connectCalledRef.current = true
    setIsConnecting(true)

    const client = await getOrCreateMcpClient(serverName)

    setMcpClient(client)
    setError(client ? null : new Error(`Connection to ${serverName} failed`))
    setIsConnecting(false)

    return client
  }, [mcpClient, serverName])

  // Sync with global state
  useEffect(() => {
    if (mcpClients[serverName] && mcpClient !== mcpClients[serverName]) {
      setMcpClient(mcpClients[serverName])
    }
  }, [mcpClient, serverName])

  return {
    mcpClient,
    connect,
    error,
    isConnected: !!mcpClient,
    isConnecting
  }
}
