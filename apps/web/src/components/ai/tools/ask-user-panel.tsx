'use client'

/**
 * Card for an `ask_user` question from the agent: one question with optional
 * choices (single or multiple) and an optional free-text answer. The answer
 * is one string, the selected option labels then the free text, joined with
 * ', '. It goes back as the next chat turn.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import { HelpCircle, Send } from 'lucide-react'
import { Button, Checkbox, Input, RadioGroup, RadioGroupItem } from '@sps/ui'
import { useI18n } from '@/lib/i18n'
import type { AskUserRequest } from '@/lib/agent-ui'

export interface AskUserPanelProps {
  request: AskUserRequest
  /** Stops answering, e.g. while the agent is still streaming. */
  disabled?: boolean
  /** Receives the answer as one string (see the component comment). */
  onAnswer: (answer: string) => void
}

const fieldClass =
  'h-7 rounded-lg text-sm font-medium border border-neutral-500 dark:border-neutral-700 focus-visible:border-brand-primary focus-visible:ring-1 focus-visible:ring-brand-primary !bg-transparent shadow-none'

export function AskUserPanel({ request, disabled = false, onAnswer }: AskUserPanelProps) {
  const { t } = useI18n()
  const options = request.options ?? []
  const showFreeText = request.allowFreeText || options.length === 0
  const [selected, setSelected] = React.useState<string[]>([])
  const [freeText, setFreeText] = React.useState('')

  React.useEffect(() => {
    setSelected([])
    setFreeText('')
  }, [request.id])

  // In single choice, a typed answer replaces the picked option and vice versa.
  const changeFreeText = (value: string) => {
    setFreeText(value)
    if (!request.multi && value) setSelected([])
  }

  const answer = [
    ...options.filter((option) => selected.includes(option.id)).map((option) => option.label),
    freeText.trim(),
  ]
    .filter(Boolean)
    .join(', ')
  const canSubmit = !disabled && answer.length > 0

  const submit = () => {
    if (canSubmit) onAnswer(answer)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      role="dialog"
      aria-label={request.question}
      className="sticky bottom-0 z-[120] mx-2 mb-1 rounded-2xl border-none bg-white/95 dark:bg-brand-primary-dark/95 backdrop-blur-md shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)] overflow-hidden"
    >
      <div className="flex items-start gap-2 px-3 pt-2.5 pb-1.5 bg-brand-primary/5 dark:bg-brand-primary/10">
        <HelpCircle className="h-4 w-4 text-brand-primary mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400">
            {t('agentui.ask.title')}
          </p>
          <p className="text-[11px] font-semibold tracking-tight text-foreground leading-relaxed mt-0.5">
            {request.question}
          </p>
        </div>
      </div>

      <div className="px-3 py-2 space-y-2.5 max-h-[46vh] overflow-y-auto custom-scrollbar">
        {options.length > 0 &&
          (request.multi ? (
            <div className="space-y-1" role="group" aria-label={request.question}>
              {options.map((option) => (
                <label key={option.id} className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    className="mt-0.5"
                    disabled={disabled}
                    checked={selected.includes(option.id)}
                    onCheckedChange={(checked) =>
                      setSelected((prev) =>
                        checked === true ? [...prev, option.id] : prev.filter((id) => id !== option.id),
                      )
                    }
                  />
                  <OptionText label={option.label} description={option.description} />
                </label>
              ))}
            </div>
          ) : (
            <RadioGroup
              value={selected[0] ?? ''}
              disabled={disabled}
              onValueChange={(id) => {
                setSelected([id])
                setFreeText('')
              }}
              className="space-y-1"
              aria-label={request.question}
            >
              {options.map((option) => (
                <label key={option.id} className="flex items-start gap-2 cursor-pointer">
                  <RadioGroupItem value={option.id} className="mt-0.5" />
                  <OptionText label={option.label} description={option.description} />
                </label>
              ))}
            </RadioGroup>
          ))}

        {showFreeText && (
          <div className="space-y-1">
            {options.length > 0 && (
              <label
                htmlFor={`${request.id}-free`}
                className="block text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400 ml-0.5"
              >
                {t('agentui.ask.other')}
              </label>
            )}
            <Input
              id={`${request.id}-free`}
              aria-label={t('agentui.ask.other')}
              value={freeText}
              disabled={disabled}
              placeholder={t('agentui.ask.placeholder')}
              onChange={(event) => changeFreeText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey) return
                event.preventDefault()
                submit()
              }}
              className={fieldClass}
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-3 py-2 bg-neutral-50/60 dark:bg-brand-primary-dark/20">
        <Button
          type="button"
          size="sm"
          disabled={!canSubmit}
          onClick={submit}
          className="h-8 rounded-lg px-3 text-[10px] font-black tracking-widest gap-1"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {t('agentui.submit')}
        </Button>
      </div>
    </motion.div>
  )
}

function OptionText({ label, description }: { label: string; description?: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-xs text-foreground">{label}</span>
      {description && <span className="block text-[10px] text-muted-foreground leading-relaxed">{description}</span>}
    </span>
  )
}
