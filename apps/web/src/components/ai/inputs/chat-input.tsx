'use client'

import { Button, Textarea, cn } from '@sps/ui'
import { ArrowUp, Square } from 'lucide-react'
import { forwardRef, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import { AudioRecorder } from '../actions/audio-recorder'

interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void
  handleSubmit: (e?: React.FormEvent) => void
  status?: string
  stop?: () => void
  placeholder?: string
  /** Menu opened by the "+" button (the sandbox's institution, model, attachment and new-chat submenus). */
  optionsMenu?: React.ReactNode
  onFocus?: () => void
  onBlur?: () => void
  onClose?: () => void
  isStreaming?: boolean
  /** Dictation: when provided, the microphone button is shown. `text` is the whole dictation so far. */
  onTranscript?: (text: string, final: boolean) => void
}

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(
  function ChatInput({ input, handleInputChange, handleSubmit, status = 'ready', stop, placeholder: customPlaceholder, optionsMenu, onFocus, onBlur, onClose, isStreaming, onTranscript }, ref) {
    const { t } = useI18n()

    const placeholderText = customPlaceholder || t('assistant.placeholder')

    const isMultiline = input.includes('\n') || input.length > 60

    return (
      <>
        <form onSubmit={handleSubmit} className="relative">
          <div className={cn(
            "bg-white dark:bg-brand-ink rounded-3xl overflow-hidden shadow-2xl transition-all flex box-border",
            isMultiline ? "flex-col" : "flex-row items-center gap-1 px-2 py-1 min-h-[40px]"
          )}>
            {!isMultiline && optionsMenu}

            {/* Textarea Area */}
            <div className={cn(
              "overflow-y-auto custom-scrollbar flex-1",
              isMultiline ? "max-h-[120px] px-4 pt-2" : "flex items-center h-full"
            )}>
              <Textarea
                ref={ref}
                value={input}
                onChange={handleInputChange}
                placeholder={placeholderText}
                disabled={isStreaming}
                rows={1}
                aria-label={placeholderText}
                className={cn(
                  "resize-none border-0 !bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground dark:placeholder:text-white/75 text-xs sm:text-sm p-0 pl-1 min-h-[28px] max-h-[120px] self-center py-1 leading-tight",
                  isMultiline ? "w-full" : "flex-1"
                )}
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            {/* Action buttons */}
            <div className={cn(
              "flex items-center justify-end gap-1",
              isMultiline ? "px-2 py-1.5" : "shrink-0"
            )}>
              <div className="flex-1">
                {isMultiline && optionsMenu}
              </div>

              {onTranscript && <AudioRecorder onTranscript={onTranscript} disabled={isStreaming} />}

              <Button
                type={isStreaming ? 'button' : 'submit'}
                size="icon"
                disabled={!input?.trim() && !isStreaming}
                onClick={(e) => {
                  if (isStreaming) {
                    e.preventDefault()
                    stop?.()
                  }
                }}
                className="h-7 w-7 rounded-lg bg-primary hover:bg-primary/90 shadow-lg shrink-0 flex items-center justify-center border-0"
                aria-label={isStreaming ? t('assistant.stop') : t('assistant.send')}
              >
                {isStreaming ? (
                  <Square className="h-3.5 w-3.5 fill-current dark:text-black" aria-hidden="true" />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5 dark:text-slate-800" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* !!! Ne décommente pas !!! */}
        {/* <div className="text-center -mt-1">
          <p className="inline-block text-[10px] sm:text-xs text-foreground">
            {t('chat.powered_by')}
          </p>
        </div> */}
      </>
    )
  }
)
