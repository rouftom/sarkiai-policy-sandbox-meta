'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Button, cn } from '@sps/ui'
import { Mic } from 'lucide-react'
import { motion, useAnimationControls } from 'framer-motion'
import { useI18n } from '@/lib/i18n'
import { startRealtimeTranscription, supportsRealtimeVoice, transcribeClip, type RealtimeSession } from '@/lib/voice'
import { api } from '@/lib/api'

interface AudioRecorderProps {
  /**
   * `text` is the whole dictation of the current recording so far. `final` is
   * false while segments are still being transcribed and true once the last one
   * is in.
   */
  onTranscript: (text: string, final: boolean) => void
  /** A recording just started: the composer drops whatever the previous dictation left behind. */
  onRecordingStart?: () => void
  onError?: (message: string) => void
  disabled?: boolean
  /** The institution's colour: the microphone takes it. */
  accent?: string
}

/**
 * Length of one dictation segment. Each segment is a complete recording, so it
 * can be decoded and sent on its own: the text appears while the speaker goes on.
 */
const SEGMENT_MS = 6000

const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

export const AudioRecorder = ({ onTranscript, onRecordingStart, onError, disabled, accent }: AudioRecorderProps) => {
  const { t } = useI18n()
  const controls = useAnimationControls()

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [isCorrecting, setIsCorrecting] = useState(false)

  const mediaStream = useRef<MediaStream | null>(null)
  const session = useRef<RealtimeSession | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const segmentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRequested = useRef(false)
  const committed = useRef('')
  /** Segments are transcribed one after the other, so the text keeps its order. */
  const queue = useRef<Promise<void>>(Promise.resolve())
  const pending = useRef(0)
  const callbacks = useRef({ onTranscript, onRecordingStart, onError })

  useEffect(() => {
    callbacks.current = { onTranscript, onRecordingStart, onError }
  }, [onTranscript, onRecordingStart, onError])

  useEffect(() => {
    return () => {
      session.current?.stop()
      if (segmentTimer.current) clearTimeout(segmentTimer.current)
      if (recorder.current?.state === 'recording') recorder.current.stop()
      mediaStream.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const motionVariants = {
    recording: {
      scale: [null, 1.2],
      transition: {
        repeat: Infinity,
        duration: 0.8,
        repeatType: 'reverse' as const,
      },
    },
    completed: {
      scale: 1,
      transition: {
        damping: 20,
        type: 'spring' as const,
        stiffness: 260,
      },
    },
  }

  /** Any end of a recording (error, refusal, a closed connection) brings the microphone back to rest. */
  const fail = useCallback(
    (message?: string) => {
      setIsRecording(false)
      void controls.start('completed')
      callbacks.current.onError?.(message || t('voice.error'))
    },
    [controls, t],
  )

  /**
   * The last words of a dictation, repaired by the chat model from the sentence before
   * they reach the composer. The original is kept when the repair looks unsafe.
   */
  const finalize = useCallback(
    async (raw: string) => {
      if (!raw.trim()) {
        callbacks.current.onTranscript('', true)
        return
      }
      setIsCorrecting(true)
      const corrected = await api
        .correctVoice({ text: raw })
        .then((result) => result.text)
        .catch(() => raw)
      committed.current = corrected
      setIsCorrecting(false)
      callbacks.current.onTranscript(corrected, true)
    },
    [],
  )

  /** Transcribe one finished segment and append it. Errors surface, the recording goes on. */
  const transcribeSegment = useCallback(
    (blob: Blob, last: boolean) => {
      pending.current += 1
      setIsTranscribing(true)
      queue.current = queue.current.then(async () => {
        try {
          if (blob.size > 0) {
            const text = await transcribeClip(blob)
            if (text) {
              committed.current = join(committed.current, text)
              callbacks.current.onTranscript(committed.current, false)
            }
          }
        } catch (error) {
          console.error('Voice transcription failed:', error)
          callbacks.current.onError?.(error instanceof Error && error.message ? error.message : t('voice.error'))
        } finally {
          pending.current -= 1
          if (pending.current === 0) setIsTranscribing(false)
          if (last) void finalize(committed.current)
        }
      })
    },
    [t],
  )

  const startSegment = useCallback(
    (stream: MediaStream) => {
      const chunks: BlobPart[] = []
      const segment = new MediaRecorder(stream)
      recorder.current = segment
      segment.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      segment.onstop = () => {
        const blob = new Blob(chunks, { type: segment.mimeType || 'audio/webm' })
        const finished = stopRequested.current
        transcribeSegment(blob, finished)
        if (finished) {
          mediaStream.current?.getTracks().forEach((track) => track.stop())
          mediaStream.current = null
          recorder.current = null
        } else {
          startSegment(stream)
        }
      }
      segment.start()
      segmentTimer.current = setTimeout(() => {
        if (segment.state === 'recording') segment.stop()
      }, SEGMENT_MS)
    },
    [transcribeSegment],
  )

  /** The live session, or null when the service does not answer: the caller then records segments. */
  const openLive = useCallback(async (): Promise<RealtimeSession | null> => {
    try {
      return await startRealtimeTranscription({
        // The service sends the whole transcript so far: it replaces what is shown.
        onUpdate(text) {
          committed.current = text
          callbacks.current.onTranscript(text, false)
        },
        // Called once the service has delivered its last words, after stop or on a closed connection.
        onFinished(text) {
          session.current = null
          setIsRecording(false)
          void controls.start('completed')
          void finalize(text || committed.current)
        },
        onError(message) {
          session.current = null
          fail(message)
        },
      })
    } catch (error) {
      console.warn('Live dictation unavailable, recording segments instead:', error)
      return null
    }
  }, [controls, fail, finalize])

  const startRecording = useCallback(async () => {
    committed.current = ''
    stopRequested.current = false
    callbacks.current.onRecordingStart?.()
    setIsRecording(true)
    void controls.start('recording')
    try {
      // Live: words appear as they are spoken. When the live stream is not available, short segments are used.
      const live = supportsRealtimeVoice() ? await openLive() : null
      if (live) {
        if (stopRequested.current) live.stop()
        else session.current = live
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (stopRequested.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      mediaStream.current = stream
      startSegment(stream)
    } catch (error) {
      console.error('Error accessing microphone:', error)
      fail(error instanceof Error && error.message ? error.message : undefined)
    }
  }, [controls, fail, startSegment])

  const stopRecording = useCallback(() => {
    stopRequested.current = true
    if (session.current) {
      // Input stops now; the text is finalised in onFinished, once the service has sent its last utterance.
      session.current.stop()
      return
    }
    if (segmentTimer.current) clearTimeout(segmentTimer.current)
    // Stopping the current segment ends the recording: its last audio is transcribed, then the final text is sent.
    if (recorder.current && recorder.current.state === 'recording') {
      recorder.current.stop()
    } else {
      mediaStream.current?.getTracks().forEach((track) => track.stop())
      mediaStream.current = null
      transcribeSegment(new Blob(), true)
    }
  }, [transcribeSegment])

  const handleToggleRecording = useCallback(async () => {
    if (!isRecording) {
      await startRecording()
    } else {
      setIsRecording(false)
      stopRecording()
      await controls.start('completed')
    }
  }, [isRecording, controls, startRecording, stopRecording])

  return (
    <motion.div initial={false} animate={controls} variants={motionVariants}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleToggleRecording}
        disabled={disabled || isTranscribing || isCorrecting}
        style={accent ? (isRecording ? { backgroundColor: accent, color: '#fff' } : { color: accent }) : undefined}
        className={cn(
          'h-8 w-8 sm:h-8 sm:w-8 rounded-full shrink-0 transition-colors',
          !accent && (isRecording ? 'bg-brand-primary hover:bg-brand-primary text-white' : 'text-brand-primary hover:text-brand-primary/80'),
          accent && 'hover:opacity-80',
        )}
        aria-label={isRecording ? t('voice.stop') : t('voice.start')}
        aria-pressed={isRecording}
      >
        <Mic className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      </Button>
    </motion.div>
  )
}
