'use client'

/**
 * One turn of the policy assistant, rendered like the organization `ChatMessage`:
 * the operator's question in a StarBorder bubble, the agent's reasoning and its
 * activity trail above the answer, the answer written with AnimatedTextCompletion,
 * a pulsing dot while the turn is active, then the sources and the actions.
 */

import * as React from 'react'
import { motion } from 'framer-motion'
import type { AgentUiRequest } from '@/lib/agent-ui'
import { Check, Copy, RotateCw } from 'lucide-react'
import { StarBorder, cn } from '@sps/ui'
import { AnimatedTextCompletion } from '@/components/ui/animated-text-completion'
import { MessageReasoning } from '@/components/ai/display/message-reasoning'
import { AgentActivityTrail, type TrailStepView } from '@/components/ai/tools/agent-activity-trail'
import { useI18n } from '@/lib/i18n'
import type { AssessmentDto } from '@/lib/api'

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  citations?: AssessmentDto['citations']
  validation?: AssessmentDto['validation']
  agentName?: string
  steps?: TrailStepView[]
  /** Epoch ms when the turn started, for the elapsed counter. */
  startedAt?: number
  /** The turn is still being written. */
  active?: boolean
  /** Interactive cards the agent opened on this turn (questions, approvals). */
  cards?: AgentUiRequest[]
}

export function ChatMessage({
  turn,
  isLast,
  onRegenerate,
}: {
  turn: ChatTurn
  isLast: boolean
  onRegenerate?: () => void
}) {
  const { t } = useI18n()
  const [copied, setCopied] = React.useState(false)

  const copy = () => {
    void navigator.clipboard?.writeText(turn.content).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  if (turn.role === 'user') {
    return (
      <div className="group/user mx-1 mt-2 flex flex-col items-end gap-2 py-4 sm:gap-3">
        <div className="flex max-w-[90%] flex-row-reverse items-start gap-2 sm:max-w-[85%] sm:gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:gap-2">
            <StarBorder as="div" className="rounded-2xl rounded-tr-none" color="var(--primary)" speed="2s" thickness={4} isAnimate={false}>
              <div className="rounded-2xl rounded-tr-none border-none bg-primary/10 px-4 py-2 text-xs font-semibold leading-relaxed text-foreground backdrop-blur-md dark:bg-primary/20 sm:text-xs">
                <AnimatedTextCompletion isLast={isLast} text={turn.content} isStreaming={false} />
              </div>
            </StarBorder>
            <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/user:opacity-100">
              <button
                type="button"
                onClick={copy}
                aria-label={t('common.copy')}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const hasText = turn.content.length > 0
  return (
    <div className="mx-2 flex flex-col items-start gap-2 py-4 sm:gap-2">
      {turn.reasoning && (
        <MessageReasoning
          reasoningPart={{ reasoning: turn.reasoning }}
          isReasoningStreaming={!!turn.active}
          isLast={isLast}
          isMessageActive={!!turn.active}
          t={(key) => t(key as 'chat.reasoning')}
        />
      )}

      {turn.steps && turn.steps.length > 0 && (
        <div className="w-full">
          <AgentActivityTrail
            steps={turn.steps}
            agents={turn.agentName ? [turn.agentName] : []}
            isStreaming={!!turn.active}
            startedAt={turn.startedAt}
            headerLabel={t('assistant.trail.header')}
          />
        </div>
      )}

      <div className="-mt-1.5 flex w-full min-w-0 flex-col gap-2 sm:gap-3">
        <div className="bg-transparent text-xs font-medium text-foreground sm:text-[13px]">
          {hasText && <AnimatedTextCompletion isLast={isLast} text={turn.content} isStreaming={!!turn.active} />}

          {turn.active && (
            <div className="mt-3 flex items-center gap-3">
              <motion.div
                animate={{ scale: [1, 1.15, 1.15, 1, 1], backgroundColor: ['#4f46e5', '#ffffff', '#4f46e5', '#ffffff', '#4f46e5'] }}
                transition={{ duration: 2, ease: 'easeInOut', repeat: Infinity }}
                className="h-3.5 w-3.5 rounded-full"
              />
            </div>
          )}

          {turn.validation && !turn.active && (
            <p
              className={cn(
                'mt-1.5 text-[10px]',
                turn.validation.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
              )}
            >
              {turn.validation.ok
                ? turn.validation.attempts > 1
                  ? t('citation.verifiedAfterRetry', { attempts: turn.validation.attempts })
                  : t('citation.verified')
                : t('citation.rejected', { count: turn.validation.rejected.length })}
            </p>
          )}

          {turn.citations && turn.citations.length > 0 && !turn.active && (
            <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[10px]">
              {turn.citations.slice(0, 4).map((citation, index) => {
                const label = [citation.filename, citation.articleNumber ? `Article ${citation.articleNumber}` : '', citation.headingPath ?? '']
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <li key={index} className="text-muted-foreground">
                    {citation.sourceUrl ? (
                      <a
                        href={citation.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-brand-primary-dark hover:underline dark:text-brand-primary-light"
                      >
                        {label}
                      </a>
                    ) : (
                      <span className="font-semibold">{label}</span>
                    )}
                    {citation.quote && <p className="mt-0.5 line-clamp-2 italic opacity-80">“{citation.quote}”</p>}
                  </li>
                )
              })}
            </ul>
          )}

          {hasText && !turn.active && (
            <div className="mt-2 flex items-center gap-1">
              <button
                type="button"
                onClick={copy}
                aria-label={t('common.copy')}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              {isLast && onRegenerate && (
                <button
                  type="button"
                  onClick={onRegenerate}
                  aria-label={t('assistant.regenerate')}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
