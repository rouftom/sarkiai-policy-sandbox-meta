import { NextRequest } from 'next/server'
import { MCP_SERVERS, getMcpAuthHeaders } from '@/lib/mcp-config'

export const dynamic = 'force-dynamic'

/**
 * Resolves the target MCP server from the `server` param (or x-mcp-server header).
 * Unknown or missing names are rejected: never fall back to another server.
 */
function getTarget(req: NextRequest) {
  const serverName = req.nextUrl.searchParams.get('server') || req.headers.get('x-mcp-server')
  const server = MCP_SERVERS.find((s) => s.name === serverName)
  if (!server) return null
  return {
    url: server.url,
    // Server-side API key for first-party MCP apps (never exposed to the browser)
    authHeaders: getMcpAuthHeaders(server),
  }
}

const CLIENT_AUTH_HEADERS = new Set(['x-api-key', 'authorization', 'api-key', 'apikey', 'x-apikey', 'api-token', 'x-auth-token', 'cookie'])

const UNKNOWN_SERVER = () => Response.json({ error: 'Unknown or missing MCP server' }, { status: 400 })
const UNAUTHORIZED = () => Response.json({ error: 'unauthorized' }, { status: 401 })

/**
 * The proxy adds the server-side MCP key, so it only serves signed-in operators:
 * the console's Bearer session is checked against the API (`/v1/auth/me`) and
 * the answer cached for a minute. The Bearer header itself is never forwarded.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
const SESSION_CACHE_MS = 60_000
const sessionCache = new Map<string, number>()

async function isSignedIn(req: NextRequest): Promise<boolean> {
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Bearer ')) return false
  const token = header.slice('Bearer '.length).trim()
  if (!token) return false
  const now = Date.now()
  const cachedUntil = sessionCache.get(token)
  if (cachedUntil && cachedUntil > now) return true
  try {
    const response = await fetch(`${API_URL}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!response.ok) return false
    if (sessionCache.size > 500) sessionCache.clear()
    sessionCache.set(token, now + SESSION_CACHE_MS)
    return true
  } catch {
    return false
  }
}

/**
 * MCP Proxy that acts as a transparent pass-through to support
 * standard MCP streaming transports (JSON-RPC over SSE/HTTP).
 * This avoids CORS issues while preserving the streaming nature of MCP.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await isSignedIn(req))) return UNAUTHORIZED()
    const target = getTarget(req)
    if (!target) return UNKNOWN_SERVER()

    const headers = new Headers()
    req.headers.forEach((value, key) => {
      const k = key.toLowerCase()
      // Never forward browser credentials/cookies to remote MCP servers
      if (k !== 'host' && k !== 'content-length' && k !== 'connection' && !CLIENT_AUTH_HEADERS.has(k)) {
        headers.set(key, value)
      }
    })

    // Ensure remote server sees correct types
    headers.set('Accept', 'application/json, text/event-stream')
    for (const [k, v] of Object.entries(target.authHeaders)) headers.set(k, v)

    const response = await fetch(target.url, {
      method: 'POST',
      headers,
      body: req.body,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    return passThrough(response)
  } catch (error: unknown) {
    console.error('MCP Proxy POST error:', error)
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}

/**
 * GET handler for SSE connections.
 * The StreamableHTTPClientTransport uses GET for Server-Sent Events.
 */
export async function GET(req: NextRequest) {
  try {
    if (!(await isSignedIn(req))) return UNAUTHORIZED()
    const target = getTarget(req)
    if (!target) return UNKNOWN_SERVER()

    const headers = new Headers()
    headers.set('Accept', 'text/event-stream')

    // Forward the session header so Streamable HTTP sessions stay bound
    const sessionId = req.headers.get('mcp-session-id')
    if (sessionId) {
      headers.set('mcp-session-id', sessionId)
    }
    for (const [k, v] of Object.entries(target.authHeaders)) headers.set(k, v)

    const response = await fetch(target.url, {
      method: 'GET',
      headers,
    })

    return passThrough(response)
  } catch (error: unknown) {
    console.error('MCP Proxy GET error:', error)
    return Response.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 })
  }
}

function passThrough(response: Response) {
  const contentType = response.headers.get('content-type') || 'application/json'
  const isStream = contentType.includes('text/event-stream')
  const responseHeaders: Record<string, string> = { 'Content-Type': contentType }
  if (isStream) {
    responseHeaders['Cache-Control'] = 'no-cache'
    responseHeaders['Connection'] = 'keep-alive'
  }
  // Keep the Streamable HTTP session id so the client can continue the session
  const sessionId = response.headers.get('mcp-session-id')
  if (sessionId) responseHeaders['mcp-session-id'] = sessionId

  return new Response(response.body, { status: response.status, headers: responseHeaders })
}
