/**
 * Voice transcription with Muse Voice Transcribe · POST /v1/asr/transcribe
 * (Meta Model API). It returns a full transcript plus timed turns: the policy
 * engine only needs the timeline.
 *
 * Meta accepts one container: RIFF/WAVE, mono, 16-bit PCM, 16 or 24 kHz. The
 * header is checked before the upload; the error names what to convert.
 */

import { probeWav, wavProblems } from './wav.js'

export type VoiceMode = 'PUSH_TO_TALK' | 'ENDPOINTING' | 'DIARIZATION'

export interface VoiceProvider {
  mode: 'cloud' | 'sovereign' | 'local'
  servedBy: string
  baseURL: string
  models: { transcription?: string }
}

export interface VoiceTurn {
  turnId: number
  startMs: number
  endMs: number
  text: string
  /** Present in DIARIZATION mode; session-scoped, not a person's name. */
  speaker?: string
}

export interface VoiceTranscript {
  sessionId: string
  transcript: string
  durationMs: number
  turns: VoiceTurn[]
  engine: 'muse-voice-transcribe'
  model: string
}

export interface VoiceRequest {
  audio: Uint8Array
  filename?: string
  mode?: VoiceMode
  languageBias?: string[]
  keywords?: string[]
  sessionId?: string
  signal?: AbortSignal
}

export interface MetaAsrOptions {
  baseUrl: string
  apiKey: string
  /** Extra headers, e.g. the egress relay secret. */
  headers?: Record<string, string>
  model?: string
  fetchImpl?: typeof fetch
}


interface MetaAsrResponse {
  sessionId?: string
  transcript?: string
  audioDurationMs?: number
  turns?: Array<{ turnId?: number; startMs?: number; endMs?: number; transcript?: string; speaker?: string }>
}

interface LocalAsrResponse {
  text?: string
  language?: string
  segments?: Array<{ start?: number; end?: number; text?: string }>
}

function randomSessionId(): string {
  return `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function audioBlob(audio: Uint8Array): Blob {
  return new Blob([audio as unknown as BlobPart], { type: 'audio/wav' })
}

export class MetaAsrClient {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly headers: Record<string, string>
  private readonly model: string
  private readonly fetchImpl: typeof fetch

  constructor(options: MetaAsrOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.apiKey = options.apiKey
    this.headers = options.headers ?? {}
    this.model = options.model ?? 'muse-voice-transcribe-1.0'
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async transcribe(request: VoiceRequest): Promise<VoiceTranscript> {
    const problems = wavProblems(probeWav(request.audio))
    if (problems.length > 0) {
      throw new Error(`Muse Voice Transcribe rejected this audio: ${problems.join(' ')}`)
    }

    const sessionId = request.sessionId ?? randomSessionId()
    const settings = {
      model: this.model,
      audioEncoding: 'WAV',
      mode: request.mode ?? 'ENDPOINTING',
      ...(request.languageBias?.length ? { languageBias: request.languageBias } : {}),
      ...(request.keywords?.length ? { keywords: request.keywords } : {}),
    }

    const form = new FormData()
    // The API reads `request` as JSON and `audio` as the file part.
    form.append('request', JSON.stringify(settings))
    form.append('audio', audioBlob(request.audio), request.filename ?? 'note.wav')

    const response = await this.fetchImpl(
      `${this.baseUrl}/asr/transcribe?sessionId=${encodeURIComponent(sessionId)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, ...this.headers },
        body: form,
        signal: request.signal,
      },
    )
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300)
      throw new Error(`Muse Voice Transcribe failed (${response.status}): ${detail}`)
    }

    const payload = (await response.json()) as MetaAsrResponse
    const turns = (payload.turns ?? []).map((turn, index) => ({
      turnId: turn.turnId ?? index + 1,
      startMs: Math.max(0, Math.round(turn.startMs ?? 0)),
      endMs: Math.max(0, Math.round(turn.endMs ?? 0)),
      text: (turn.transcript ?? '').trim(),
      ...(turn.speaker ? { speaker: turn.speaker } : {}),
    }))
    const info = probeWav(request.audio)
    return {
      sessionId: payload.sessionId ?? sessionId,
      transcript: (payload.transcript ?? turns.map((turn) => turn.text).join(' ')).trim(),
      durationMs: payload.audioDurationMs ?? info?.durationMs ?? 0,
      turns,
      engine: 'muse-voice-transcribe',
      model: this.model,
    }
  }
}
