/**
 * Timed facts from a voice note.
 *
 * A transcript is not evidence: a joint situation report needs to know *when*
 * something was said, and by which speaker label. These helpers turn the ASR
 * output into small, ordered facts the scenario engine and the console can
 * render on the incident timeline.
 */

import type { VoiceTranscript, VoiceTurn } from './asr.js'

export interface VoiceFact {
  id: string
  /** Offset from the start of the recording, in milliseconds. */
  atMs: number
  /** Human-readable offset, e.g. "T+00:12". */
  at: string
  speaker?: string
  text: string
}

/** "T+00:12" / "T+01:04:07" · monospaced in the UI, sortable by `atMs`. */
export function formatTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `T+${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `T+${pad(minutes)}:${pad(seconds)}`
}

/**
 * One fact per speech turn, ordered by start offset. When the engine returns no
 * turns (PUSH_TO_TALK), the whole transcript becomes a single fact at T+00:00.
 */
export function toVoiceFacts(transcript: VoiceTranscript): VoiceFact[] {
  const turns: VoiceTurn[] =
    transcript.turns.length > 0
      ? [...transcript.turns].sort((a, b) => a.startMs - b.startMs)
      : [{ turnId: 1, startMs: 0, endMs: transcript.durationMs, text: transcript.transcript }]

  return turns
    .filter((turn) => turn.text.trim().length > 0)
    .map((turn, index) => ({
      id: `${transcript.sessionId}:${index + 1}`,
      atMs: turn.startMs,
      at: formatTimestamp(turn.startMs),
      ...(turn.speaker ? { speaker: turn.speaker } : {}),
      text: turn.text.trim(),
    }))
}

/**
 * Vocabulary bias for a policy recording: acronyms and institutions the model is
 * likely to mishear in French or English.
 */
export const POLICY_KEYWORDS: readonly string[] = [
  'APD',
  'ANSSI',
  'MINPOSTEL',
  'Qdrant',
  'SarkiAI',
  'protection des données',
  'données de santé',
  'notification',
  'soixante-douze heures',
]
