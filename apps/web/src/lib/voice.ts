/**
 * Voice dictation for the console.
 *
 * A recording is decoded in the browser and re-encoded as 16 kHz mono WAV (the
 * only container Muse Voice Transcribe takes), then sent to POST
 * /v1/voice/transcribe. The API relays it to Meta: the key never reaches the
 * browser. Live dictation is built from short segments of this same path (see
 * the audio recorder), because a WebSocket cannot pass the serverless relay.
 */

import { API_URL, api } from './api'
import { readToken } from './session'
import { TurnBook } from './turn-book'

const TARGET_RATE = 16000

export interface RealtimeHandlers {
  /** The whole transcript so far: finished utterances in order, then the one in progress. */
  onUpdate(text: string): void
  /** The session has ended (after stop, or an error): the complete transcript. */
  onFinished(text: string): void
  onError(message: string): void
}

export interface RealtimeSession {
  stop(): void
}

/** Linear resampling; good enough for speech recognition input. */
export function resampleLinear(samples: Float32Array, inputRate: number, outputRate = TARGET_RATE): Float32Array {
  if (inputRate === outputRate) return samples
  const ratio = inputRate / outputRate
  const length = Math.max(1, Math.floor(samples.length / ratio))
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const position = i * ratio
    const index = Math.floor(position)
    const fraction = position - index
    const a = samples[index] ?? 0
    const b = samples[index + 1] ?? a
    out[i] = a + (b - a) * fraction
  }
  return out
}

export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0))
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
  }
  return out
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

/** RIFF/WAVE, mono, 16-bit PCM, 16 kHz. */
export function encodeWav16k(samples: Float32Array, inputRate: number): Blob {
  const pcm = floatToPcm16(resampleLinear(samples, inputRate, TARGET_RATE))
  const dataBytes = pcm.length * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, TARGET_RATE, true)
  view.setUint32(28, TARGET_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * 2, pcm[i] ?? 0, true)
  return new Blob([buffer], { type: 'audio/wav' })
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const mono = new Float32Array(buffer.length)
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel)
    for (let i = 0; i < data.length; i++) mono[i] = (mono[i] ?? 0) + (data[i] ?? 0) / buffer.numberOfChannels
  }
  return mono
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Decode any browser recording (webm, ogg, mp4) and re-encode it for Meta. */
async function toWav16k(blob: Blob): Promise<Blob> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    return encodeWav16k(mixToMono(decoded), decoded.sampleRate)
  } finally {
    void context.close()
  }
}

/** Transcribe one recorded segment through the API. Resolves with the transcript. */
export async function transcribeClip(blob: Blob): Promise<string> {
  const wav = await toWav16k(blob)
  const result = await api.transcribeVoice({
    audioBase64: await blobToBase64(wav),
    filename: 'clip.wav',
    mode: 'PUSH_TO_TALK',
  })
  return result.transcript.trim()
}

/** AudioWorklet and WebSocket exist, and the page can reach the microphone. */
export function supportsRealtimeVoice(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof WebSocket !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  )
}

/** Capture processor: batches ~4096 samples per message, sent to the main thread. */
const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.parts = []
    this.size = 0
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel) {
      this.parts.push(channel.slice(0))
      this.size += channel.length
      if (this.size >= 4096) {
        const out = new Float32Array(this.size)
        let offset = 0
        for (const part of this.parts) {
          out.set(part, offset)
          offset += part.length
        }
        this.port.postMessage(out, [out.buffer])
        this.parts = []
        this.size = 0
      }
    }
    return true
  }
}
registerProcessor('pcm-capture', PcmCapture)
`

function realtimeUrl(token: string): string {
  const base = API_URL.replace(/\/+$/, '').replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
  return `${base}/v1/voice/realtime?token=${encodeURIComponent(token)}`
}

const CLOSE_REASONS: Record<number, string> = {
  1008: 'The voice request was rejected.',
  1011: 'The transcription service failed.',
  1013: 'Too many voice requests, try again shortly.',
  4401: 'Sign in again to use voice dictation.',
}

/**
 * Live dictation. Resolves once the socket is open and the microphone is
 * streaming; `stop()` ends the stream and waits for the last utterance.
 */
/**
 * Live dictation. The microphone starts at once and its frames wait in a queue
 * until the service has acknowledged the session, so the first words are kept.
 */
export async function startRealtimeTranscription(handlers: RealtimeHandlers): Promise<RealtimeSession> {
  const token = readToken()
  if (!token) throw new Error('Sign in to use voice dictation.')

  const socket = new WebSocket(realtimeUrl(token))
  socket.binaryType = 'arraybuffer'
  const book = new TurnBook()
  const queue: ArrayBuffer[] = []
  let acknowledged = false
  let stopping = false
  let finished = false
  let closeTimer: ReturnType<typeof setTimeout> | undefined

  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(closeTimer)
    handlers.onFinished(book.text())
  }

  // The service acknowledges the session with a `sessionId` frame.
  const acknowledge = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('The voice service did not answer in time.'))
    }, 12_000)
    const fail = () => {
      clearTimeout(timer)
      reject(new Error('The voice service did not answer.'))
    }
    socket.onerror = fail
    socket.onclose = fail
    socket.onmessage = (event) => {
      if (typeof event.data === 'string' && event.data.includes('sessionId')) {
        clearTimeout(timer)
        resolve()
      }
    }
  })

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })
  const context = new AudioContext()
  const workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }))
  let source: MediaStreamAudioSourceNode | null = null
  let worklet: AudioWorkletNode | null = null
  let mute: GainNode | null = null
  let released = false

  const releaseMicrophone = () => {
    if (released) return
    released = true
    stream.getTracks().forEach((track) => track.stop())
    source?.disconnect()
    worklet?.disconnect()
    mute?.disconnect()
    void context.close()
  }

  try {
    await context.audioWorklet.addModule(workletUrl)
  } catch (error) {
    releaseMicrophone()
    socket.close(1000)
    throw error
  } finally {
    URL.revokeObjectURL(workletUrl)
  }

  source = context.createMediaStreamSource(stream)
  worklet = new AudioWorkletNode(context, 'pcm-capture')
  mute = context.createGain()
  mute.gain.value = 0
  worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
    const pcm = floatToPcm16(resampleLinear(event.data, context.sampleRate, TARGET_RATE)).buffer as ArrayBuffer
    if (!acknowledged) {
      queue.push(pcm)
      return
    }
    if (socket.readyState === WebSocket.OPEN) socket.send(pcm)
  }
  source.connect(worklet)
  worklet.connect(mute)
  mute.connect(context.destination)

  try {
    await acknowledge
  } catch (error) {
    releaseMicrophone()
    throw error
  }
  acknowledged = true
  // The words spoken while the session was opening go out first, in order.
  for (const frame of queue.splice(0)) socket.send(frame)

  socket.onmessage = (event) => {
    if (typeof event.data !== 'string') return
    let message: { type?: string; transcript?: string; turnId?: number; message?: string }
    try {
      message = JSON.parse(event.data)
    } catch {
      return
    }
    if (message.type === 'speechStart' && typeof message.turnId === 'number') {
      book.start(message.turnId)
      return
    }
    if (message.type === 'transcript' && message.transcript) {
      book.partial(message.transcript.trim())
      handlers.onUpdate(book.text())
    } else if (message.type === 'speechComplete' && typeof message.turnId === 'number') {
      book.complete(message.turnId, message.transcript ?? '')
      handlers.onUpdate(book.text())
    } else if (message.type === 'error') {
      handlers.onError(message.message ?? 'The transcription service failed.')
    }
  }

  socket.onclose = (event) => {
    releaseMicrophone()
    if (!stopping && event.code !== 1000) {
      handlers.onError(CLOSE_REASONS[event.code] ?? 'The voice connection closed.')
    }
    finish()
  }

  return {
    stop() {
      if (stopping) return
      stopping = true
      // Input ends now; the service delivers what it still holds, then closes.
      releaseMicrophone()
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'endStream' }))
        closeTimer = setTimeout(() => socket.close(1000), 4000)
      } else {
        finish()
        socket.close(1000)
      }
    },
  }
}
