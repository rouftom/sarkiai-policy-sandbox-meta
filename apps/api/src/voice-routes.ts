/**
 * Live voice transcription relay to Muse Voice Transcribe (Meta Model API).
 *
 * The browser never receives the Meta key: it opens a WebSocket to this API,
 * which opens the upstream Meta stream and relays frames both ways. The clip
 * route (POST /v1/voice/transcribe) lives in routes/index.ts and is not here.
 *
 *   GET /v1/voice/realtime?token=<session>&sampleRate=16000|24000&languageBias=fr,en
 */

import websocket from '@fastify/websocket'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '@sps/auth'

const VOICE_MODEL = 'muse-voice-transcribe-1.0'
const MAX_SESSION_MS = 10 * 60 * 1000
const MAX_PENDING_FRAMES = 500

export interface VoiceRouteOptions {
  auth: AuthService
  /** Meta key, read from the provider descriptor (`providerApiKey(engine.provider)`). */
  apiKey: string
  /** Meta API base, e.g. `https://api.meta.ai/v1` (`engine.provider.baseURL`). */
  baseURL: string
  model?: string
}

function realtimeUrl(baseURL: string): string {
  const base = baseURL.replace(/\/+$/, '').replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  return `${base}/asr/realtime`
}

function parseLanguageBias(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length >= 2 && code.length <= 40)
    .slice(0, 4)
}

function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  return Buffer.alloc(0)
}

function isEndStream(text: string): boolean {
  try {
    return (JSON.parse(text) as { type?: unknown }).type === 'endStream'
  } catch {
    return false
  }
}

/** Close codes a server may send (1004–1006 are reserved and cannot be sent). */
function safeCloseCode(code: number): number {
  if (code >= 3000 && code <= 4999) return code
  if (code >= 1000 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006) return code
  return 1011
}

export async function registerVoiceRoutes(app: FastifyInstance, options: VoiceRouteOptions): Promise<void> {
  const { auth, apiKey, baseURL, model = VOICE_MODEL } = options
  await app.register(websocket)

  app.get('/v1/voice/realtime', { websocket: true }, (socket, request) => {
    const query = request.query as { token?: string; sampleRate?: string; languageBias?: string }
    const verified = Boolean(query.token) && auth.verifySession(query.token!)
    request.log.info({ verified }, 'voice socket handshake')
    if (!query.token || !verified) {
      socket.close(4401, 'unauthorized')
      request.log.info('voice socket closed: unauthorized')
      return
    }

    const audioEncoding = query.sampleRate === '24000' ? 'PCM_24KHZ' : 'PCM_16KHZ'
    const languageBias = parseLanguageBias(query.languageBias)
    const pending: Array<Buffer | string> = []
    let upstreamReady = false
    let closed = false

    const upstream = new WebSocket(realtimeUrl(baseURL))

    const closeAll = (code: number, reason: string) => {
      if (closed) return
      closed = true
      clearTimeout(timer)
      if (socket.readyState < socket.CLOSING) socket.close(safeCloseCode(code), reason.slice(0, 80))
      if (upstream.readyState === WebSocket.CONNECTING || upstream.readyState === WebSocket.OPEN) {
        upstream.close(1000, 'client_closed')
      }
    }

    const timer = setTimeout(() => closeAll(1000, 'session_limit'), MAX_SESSION_MS)

    const relay = (frame: Buffer | string) => {
      if (closed) return
      if (!upstreamReady) {
        if (pending.length >= MAX_PENDING_FRAMES) return closeAll(1013, 'backpressure')
        pending.push(frame)
        return
      }
      if (upstream.readyState === WebSocket.OPEN) upstream.send(frame)
    }

    upstream.onopen = () => {
      // The first text frame authenticates the stream; audio may only follow it.
      upstream.send(
        JSON.stringify({
          authorization: { accessToken: `Bearer ${apiKey}` },
          audioEncoding,
          model,
          mode: 'ENDPOINTING',
          partialMode: 'CUMULATIVE',
          emitAudioProgress: false,
          ...(languageBias.length ? { languageBias } : {}),
        }),
      )
      upstreamReady = true
      for (const frame of pending.splice(0)) upstream.send(frame)
    }

    upstream.onmessage = (event) => {
      if (typeof event.data === 'string' && socket.readyState === socket.OPEN) socket.send(event.data)
    }

    upstream.onclose = (event) => closeAll(event.code, event.reason)
    upstream.onerror = () => closeAll(1011, 'upstream_error')

    socket.on('message', (data: unknown, isBinary: boolean) => {
      if (isBinary) {
        relay(toBuffer(data))
        return
      }
      if (isEndStream(toBuffer(data).toString('utf8'))) relay(JSON.stringify({ type: 'endStream' }))
    })
    socket.on('close', () => closeAll(1000, 'client_closed'))
    socket.on('error', () => closeAll(1011, 'client_error'))
  })
}
