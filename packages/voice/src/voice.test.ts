import { describe, expect, test } from 'bun:test'
import { MetaAsrClient } from './asr.js'
import { formatTimestamp, toVoiceFacts } from './facts.js'
import { isMetaAsrCompatible, probeWav, wavProblems } from './wav.js'

interface WavOptions {
  channels?: number
  sampleRate?: number
  bitsPerSample?: number
  audioFormat?: number
  samples?: number
}

/** Build a RIFF/WAVE file in memory: header, fmt chunk, PCM data. */
function makeWav(options: WavOptions = {}): Uint8Array {
  const channels = options.channels ?? 1
  const sampleRate = options.sampleRate ?? 24_000
  const bitsPerSample = options.bitsPerSample ?? 16
  const audioFormat = options.audioFormat ?? 1
  const samples = options.samples ?? sampleRate
  const dataBytes = samples * channels * (bitsPerSample / 8)
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i))
  }

  write(0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, audioFormat, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true)
  view.setUint16(32, channels * (bitsPerSample / 8), true)
  view.setUint16(34, bitsPerSample, true)
  write(36, 'data')
  view.setUint32(40, dataBytes, true)
  return new Uint8Array(buffer)
}

describe('WAV inspection', () => {
  test('reads the format and computes duration', () => {
    const info = probeWav(makeWav({ samples: 12_000 }))
    expect(info).not.toBeNull()
    expect(info?.sampleRate).toBe(24_000)
    expect(info?.channels).toBe(1)
    expect(info?.bitsPerSample).toBe(16)
    expect(info?.durationMs).toBe(500)
    expect(wavProblems(info)).toEqual([])
    expect(isMetaAsrCompatible(makeWav())).toBe(true)
  })

  test('names exactly what to convert', () => {
    const stereo = wavProblems(probeWav(makeWav({ channels: 2 })))
    expect(stereo.join(' ')).toContain('mono')

    const eightBit = wavProblems(probeWav(makeWav({ bitsPerSample: 8 })))
    expect(eightBit.join(' ')).toContain('16-bit')

    const wrongRate = wavProblems(probeWav(makeWav({ sampleRate: 44_100 })))
    expect(wrongRate.join(' ')).toContain('16 kHz or 24 kHz')

    const float = wavProblems(probeWav(makeWav({ audioFormat: 3 })))
    expect(float.join(' ')).toContain('integer PCM')

    expect(wavProblems(probeWav(new Uint8Array([1, 2, 3])))[0]).toContain('RIFF/WAVE')
  })
})

describe('MetaAsrClient', () => {
  test('posts settings plus audio as multipart and maps timed turns', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const client = new MetaAsrClient({
      baseUrl: 'https://api.meta.ai/v1/',
      apiKey: 'secret-key',
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        captured = { url: String(url), init: init ?? {} }
        return new Response(
          JSON.stringify({
            sessionId: 's1',
            transcript: 'Bonjour. Incident déclaré.',
            audioDurationMs: 1000,
            turns: [
              { turnId: 1, startMs: 0, endMs: 400, transcript: 'Bonjour.' },
              { turnId: 2, startMs: 500, endMs: 1000, transcript: 'Incident déclaré.', speaker: 'A' },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }) as unknown as typeof fetch,
    })

    const transcript = await client.transcribe({
      audio: makeWav({ samples: 24_000 }),
      mode: 'DIARIZATION',
      languageBias: ['French'],
      keywords: ['APD'],
      sessionId: 'session-1',
    })

    expect(captured!.url).toBe('https://api.meta.ai/v1/asr/transcribe?sessionId=session-1')
    const headers = captured!.init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret-key')
    const form = captured!.init.body as FormData
    const settings = JSON.parse(String(form.get('request')))
    expect(settings.mode).toBe('DIARIZATION')
    expect(settings.languageBias).toEqual(['French'])
    expect(form.get('audio')).toBeTruthy()

    expect(transcript.transcript).toBe('Bonjour. Incident déclaré.')
    expect(transcript.turns[1]).toEqual({ turnId: 2, startMs: 500, endMs: 1000, text: 'Incident déclaré.', speaker: 'A' })
    expect(transcript.engine).toBe('muse-voice-transcribe')
  })

  test('rejects a stereo file before spending a request', async () => {
    let called = false
    const client = new MetaAsrClient({
      baseUrl: 'https://api.meta.ai/v1',
      apiKey: 'k',
      fetchImpl: (async () => {
        called = true
        return new Response('{}')
      }) as unknown as typeof fetch,
    })
    await expect(client.transcribe({ audio: makeWav({ channels: 2 }) })).rejects.toThrow(/mono/)
    expect(called).toBe(false)
  })

  test('surfaces the API error body', async () => {
    const client = new MetaAsrClient({
      baseUrl: 'https://api.meta.ai/v1',
      apiKey: 'k',
      fetchImpl: (async () => new Response('{"error":"bad audio"}', { status: 400 })) as unknown as typeof fetch,
    })
    await expect(client.transcribe({ audio: makeWav() })).rejects.toThrow(/400.*bad audio/)
  })
})

describe('timed facts', () => {
  test('formats offsets', () => {
    expect(formatTimestamp(0)).toBe('T+00:00')
    expect(formatTimestamp(12_400)).toBe('T+00:12')
    expect(formatTimestamp(3_723_000)).toBe('T+01:02:03')
  })

  test('orders turns and keeps the speaker label', () => {
    const facts = toVoiceFacts({
      sessionId: 's1',
      transcript: '',
      durationMs: 5000,
      turns: [
        { turnId: 2, startMs: 3000, endMs: 5000, text: '  Deuxième.  ', speaker: 'B' },
        { turnId: 1, startMs: 500, endMs: 2000, text: 'Premier.' },
        { turnId: 3, startMs: 2000, endMs: 2500, text: '   ' },
      ],
      engine: 'muse-voice-transcribe',
      model: 'muse-voice-transcribe-1.0',
    })
    expect(facts.map((fact) => fact.text)).toEqual(['Premier.', 'Deuxième.'])
    expect(facts[0]?.at).toBe('T+00:00')
    expect(facts[1]?.at).toBe('T+00:03')
    expect(facts[1]?.speaker).toBe('B')
    expect(facts[1]?.id).toBe('s1:2')
  })

  test('falls back to one fact when there are no turns', () => {
    const facts = toVoiceFacts({
      sessionId: 's2',
      transcript: 'Une note sans segmentation.',
      durationMs: 4000,
      turns: [],
      engine: 'muse-voice-transcribe',
      model: 'muse-voice-transcribe-1.0',
    })
    expect(facts).toHaveLength(1)
    expect(facts[0]?.atMs).toBe(0)
  })
})
