/**
 * Voice dictation for the console.
 *
 * A recording is decoded in the browser and re-encoded as 16 kHz mono WAV (the
 * only container Muse Voice Transcribe takes), then sent to POST
 * /v1/voice/transcribe. The API relays it to Meta: the key never reaches the
 * browser. Live dictation is built from short segments of this same path (see
 * the audio recorder), because a WebSocket cannot pass the serverless relay.
 */

import { api } from './api'

const TARGET_RATE = 16000

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
