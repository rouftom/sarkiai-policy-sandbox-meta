'use client'

/**
 * Card for a `request_input` ask from the agent: one value, either text or a
 * file. The card only reports the value. The caller sends it as the next chat
 * turn (text) or hands the file to its upload route.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { FileText, Send } from 'lucide-react'
import { Button, Card, Textarea } from '@sps/ui'
import { useI18n } from '@/lib/i18n'
import type { RequestInputRequest } from '@/lib/agent-ui'
import { AskUserUpload } from './ask-user-upload'

export interface RequestInputCardProps {
  request: RequestInputRequest
  /** Stops submitting, e.g. while the agent is still streaming. */
  disabled?: boolean
  /** Receives the trimmed text, or the chosen file when `input` is `'file'`. */
  onSubmit: (value: string | File) => void
}

export function RequestInputCard({ request, disabled = false, onSubmit }: RequestInputCardProps) {
  const { t } = useI18n()
  const [text, setText] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)

  React.useEffect(() => {
    setText('')
    setFile(null)
  }, [request.id])

  const value: string | File | null = request.input === 'file' ? file : text.trim() || null

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!disabled && value) onSubmit(value)
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md ml-0"
    >
      <Card className="p-5 border-2 border-brand-primary/10 bg-white/50 dark:bg-brand-ink/50 backdrop-blur-2xl rounded-[2.5rem] overflow-hidden">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2.5 rounded-2xl bg-brand-primary text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-light tracking-wider uppercase text-foreground">
              {t('agentui.input.title')}
            </h3>
            <p className="text-[10px] text-muted-foreground font-medium">{request.label}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {request.input === 'file' ? (
            <AskUserUpload
              label={request.label}
              hint={request.hint}
              accept={request.accept}
              file={file}
              disabled={disabled}
              onChange={setFile}
            />
          ) : (
            <div className="space-y-1.5">
              <label htmlFor={`${request.id}-input`} className="text-[10px] font-normal tracking-widest text-muted-foreground ml-1">
                {request.label}
              </label>
              <Textarea
                id={`${request.id}-input`}
                rows={3}
                value={text}
                disabled={disabled}
                placeholder={t('agentui.input.placeholder')}
                onChange={(event) => setText(event.target.value)}
                className="rounded-lg bg-white/80 dark:bg-brand-ink/50 border border-neutral-200 dark:border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-all resize-none"
              />
              {request.hint && <p className="text-[10px] text-muted-foreground ml-1">{request.hint}</p>}
            </div>
          )}

          <Button
            type="submit"
            disabled={disabled || !value}
            className="w-full h-11 rounded-lg bg-brand-primary hover:bg-brand-primary-dark text-white font-normal tracking-widest disabled:opacity-50 transition-all"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {t('agentui.submit')}
          </Button>
        </form>
      </Card>
    </motion.div>
  )
}
