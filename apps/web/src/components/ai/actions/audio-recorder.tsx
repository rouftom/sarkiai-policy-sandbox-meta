'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { Button, cn } from '@sps/ui'
import { Mic } from 'lucide-react'
import { motion, useAnimationControls } from 'framer-motion'
import { useI18n } from '@/lib/i18n'
import {
  startRealtimeTranscription,
  supportsRealtimeVoice,
  transcribeClip,
  type RealtimeSession,
} from '@/lib/voice'

interface AudioRecorderProps {
  /**
   * `text` is the whole dictation of the current recording so far. `final` is
   * false while an utterance is still in progress and true once it is complete.
   */
  onTranscript: (text: string, final: boolean) => void
  onError?: (message: string) => void
  disabled?: boolean
}

const join = (...parts: string[]) => parts.filter(Boolean).join(' ')

export const AudioRecorder = ({ onTranscript, onError, disabled }: AudioRecorderProps) => {
  const { t } = useI18n()
  const controls = useAnimationControls()

  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const session = useRef<RealtimeSession | null>(null)
  const stopRequested = useRef(false)
  const mediaStream = useRef<MediaStream | null>(null)
  const mediaRecorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<BlobPart[]>([])
  const committed = useRef('')
  const partial = useRef('')
  const callbacks = useRef({ onTranscript, onError })

  useEffect(() => {
    callbacks.current = { onTranscript, onError }
  }, [onTranscript, onError])

  useEffect(() => {
    return () => {
      session.current?.stop()
      if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop()
      mediaStream.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const motionVariants = {
    recording: {
      scale: [null, 1.2],
      transition: {
        repeat: Infinity,
        duration: 0.8,
        repeatType: "reverse" as const,
      }
    },
    completed: {
      scale: 1,
      transition: {
        damping: 20,
        type: "spring" as const,
        stiffness: 260,
      }
    },
  }

  const fail = useCallback(
    (message?: string) => {
      setIsRecording(false)
      callbacks.current.onError?.(message || t('voice.error'))
    },
    [t],
  )

  const emitRealtime = useCallback((final: boolean) => {
    const text = final ? committed.current : join(committed.current, partial.current)
    callbacks.current.onTranscript(text, final)
  }, [])

  const finishClip = useCallback(async () => {
    const blob = new Blob(chunks.current, { type: mediaRecorder.current?.mimeType || 'audio/webm' })
    chunks.current = []
    mediaRecorder.current = null
    if (blob.size === 0) return
    setIsTranscribing(true)
    try {
      const text = await transcribeClip(blob)
      if (text) {
        committed.current = join(committed.current, text)
        callbacks.current.onTranscript(committed.current, true)
      }
    } catch (error) {
      console.error('Voice transcription failed:', error)
      callbacks.current.onError?.(error instanceof Error && error.message ? error.message : t('voice.error'))
    } finally {
      setIsTranscribing(false)
    }
  }, [t])

  const startRecording = useCallback(async () => {
    committed.current = ''
    partial.current = ''
    stopRequested.current = false
    setIsRecording(true)
    void controls.start("recording")
    try {
      if (supportsRealtimeVoice()) {
        const started = await startRealtimeTranscription({
          onPartial(text) {
            partial.current = text
            emitRealtime(false)
          },
          onFinal(text) {
            committed.current = join(committed.current, text)
            partial.current = ''
            emitRealtime(true)
          },
          onError(message) {
            session.current = null
            fail(message)
          },
        })
        if (stopRequested.current) {
          started.stop()
        } else {
          session.current = started
        }
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (stopRequested.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      mediaStream.current = stream
      mediaRecorder.current = new MediaRecorder(stream)
      chunks.current = []
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }
      mediaRecorder.current.onstop = () => {
        mediaStream.current?.getTracks().forEach((track) => track.stop())
        mediaStream.current = null
        void finishClip()
      }
      mediaRecorder.current.start()
    } catch (error) {
      console.error('Error accessing microphone:', error)
      fail(error instanceof Error && error.message ? error.message : undefined)
    }
  }, [controls, emitRealtime, fail, finishClip])

  const stopRecording = useCallback(() => {
    stopRequested.current = true
    if (session.current) {
      session.current.stop()
      session.current = null
    }
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
    }
    mediaStream.current?.getTracks().forEach((track) => track.stop())
  }, [])

  const handleToggleRecording = useCallback(async () => {
    if (!isRecording) {
      await startRecording()
    } else {
      setIsRecording(false)
      stopRecording()
      await controls.start("completed")
    }
  }, [isRecording, controls, startRecording, stopRecording])

  return (
    <motion.div
      initial={false}
      animate={controls}
      variants={motionVariants}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleToggleRecording}
        disabled={disabled || isTranscribing}
        className={cn(
          "h-8 w-8 sm:h-8 sm:w-8 rounded-full shrink-0 transition-colors",
          isRecording
            ? "bg-brand-primary hover:bg-brand-primary text-white"
            : "text-brand-primary hover:text-brand-primary/80"
        )}
        aria-label={isRecording ? t('voice.stop') : t('voice.start')}
        aria-pressed={isRecording}
      >
        <Mic className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      </Button>
    </motion.div>
  )
}
