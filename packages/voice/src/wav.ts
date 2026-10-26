/**
 * WAV header inspection.
 *
 * Muse Voice Transcribe accepts one container only: RIFF/WAVE, mono, 16-bit
 * integer PCM, 16 kHz or 24 kHz. WhatsApp delivers OGG/Opus, so a channel
 * adapter must convert first (`ffmpeg -ac 1 -ar 24000 -c:a pcm_s16le`). We check
 * the header instead of guessing: a rejected upload with a precise reason beats
 * a silent, low-quality transcript.
 */

export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  /** Integer PCM only; 3 (IEEE float) is not accepted by the API. */
  audioFormat: number
  dataBytes: number
  durationMs: number
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = ''
  for (let i = 0; i < length; i += 1) value += String.fromCharCode(bytes[offset + i] ?? 0)
  return value
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

/** Read the chunks of a RIFF/WAVE file. Returns null when it is not a WAV. */
export function probeWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.byteLength < 44) return null
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') return null

  const data = view(bytes)
  let offset = 12
  let format: Omit<WavInfo, 'dataBytes' | 'durationMs'> | null = null
  let dataBytes = 0

  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4)
    const size = data.getUint32(offset + 4, true)
    const body = offset + 8
    if (id === 'fmt ' && body + 16 <= bytes.byteLength) {
      format = {
        audioFormat: data.getUint16(body, true),
        channels: data.getUint16(body + 2, true),
        sampleRate: data.getUint32(body + 4, true),
        bitsPerSample: data.getUint16(body + 14, true),
      }
    }
    if (id === 'data') {
      // A streamed WAV may declare size 0 or 0xFFFFFFFF; clamp to what is there.
      const available = Math.max(0, bytes.byteLength - body)
      dataBytes = size === 0 || size > available ? available : size
      break
    }
    offset = body + size + (size % 2)
  }

  if (!format) return null
  const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8)
  return {
    ...format,
    dataBytes,
    durationMs: bytesPerSecond > 0 ? Math.round((dataBytes / bytesPerSecond) * 1000) : 0,
  }
}

/** Reasons a WAV cannot go to Muse Voice Transcribe, empty when it can. */
export function wavProblems(info: WavInfo | null): string[] {
  if (!info) return ['The audio is not a RIFF/WAVE file. Convert it to mono 16-bit PCM WAV first.']
  const problems: string[] = []
  if (info.audioFormat !== 1) problems.push(`Unsupported WAV encoding ${info.audioFormat}; send integer PCM.`)
  if (info.channels !== 1) problems.push(`Send mono audio (this file has ${info.channels} channels).`)
  if (info.bitsPerSample !== 16) problems.push(`Send 16-bit PCM (this file is ${info.bitsPerSample}-bit).`)
  if (info.sampleRate !== 16_000 && info.sampleRate !== 24_000) {
    problems.push(`Send 16 kHz or 24 kHz audio (this file is ${info.sampleRate} Hz).`)
  }
  if (info.dataBytes === 0) problems.push('The WAV contains no audio samples.')
  return problems
}

export function isMetaAsrCompatible(bytes: Uint8Array): boolean {
  return wavProblems(probeWav(bytes)).length === 0
}
