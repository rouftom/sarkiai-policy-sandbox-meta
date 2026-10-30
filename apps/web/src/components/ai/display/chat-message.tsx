'use client'

/**
 * One turn of the policy assistant, rendered like the organization `ChatMessage`:
 * the operator's question in a StarBorder bubble, the agent's reasoning and its
 * activity trail above the answer, the answer written with AnimatedTextCompletion,
 * a pulsing dot while the turn is active, then the sources and the actions.
 */

import * as React from 'react'
import type { AgentUiRequest } from '@/lib/agent-ui'
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Copy, GalleryHorizontal, List, RotateCw, ShieldCheck } from 'lucide-react'
import { Button, StarBorder, cn } from '@sps/ui'
import { AnimatedTextCompletion } from '@/components/ui/animated-text-completion'
import { MessageReasoning } from '@/components/ai/display/message-reasoning'
import { AgentActivityTrail, type TrailStepView } from '@/components/ai/tools/agent-activity-trail'
import { useI18n } from '@/lib/i18n'
import type { AssessmentDto } from '@/lib/api'
import { CitationDialog, type CitationView } from '@/components/ai/display/citation-dialog'
import { StreamLoader } from '@/components/ai/display/stream-loaders'
import { SourceDrawer, type WebSourceView } from '@/components/ai/display/source-drawer'

export interface ChatTurn {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  citations?: AssessmentDto['citations']
  webSources?: AssessmentDto['webSources']
  validation?: AssessmentDto['validation']
  agentName?: string
  /** Auto mode: every institution the question was routed to (the first one answers). */
  routedTo?: string[]
  steps?: TrailStepView[]
  /** Epoch ms when the turn started, for the elapsed counter. */
  startedAt?: number
  /** Epoch ms when the turn finished. */
  endedAt?: number
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
  const [openCitation, setOpenCitation] = React.useState<CitationView | null>(null)
  const [openSource, setOpenSource] = React.useState<WebSourceView | null>(null)

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
            isStreaming={!!turn.active}
            startedAt={turn.startedAt}
            endedAt={turn.endedAt}
            headerLabel={t('assistant.trail.header')}
          />
        </div>
      )}

      <div className="-mt-1.5 flex w-full min-w-0 flex-col gap-2 sm:gap-3">
        <div className="min-w-0 break-words bg-transparent text-xs font-medium text-foreground sm:text-[13px]">
          {hasText && <AnimatedTextCompletion isLast={isLast} text={turn.content} isStreaming={!!turn.active} />}

          {turn.active && (
            <div className="mt-3">
              <StreamLoader />
            </div>
          )}

          {turn.validation && !turn.active && (
            <div
              role="status"
              className={cn(
                'mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-[11px] font-medium leading-snug shadow-sm',
                turn.validation.ok
                  ? 'bg-emerald-50 text-emerald-950 dark:bg-emerald-950/70 dark:text-emerald-50'
                  : 'bg-amber-50 text-amber-950 dark:bg-amber-950/70 dark:text-amber-50',
              )}
            >
              {turn.validation.ok ? (
                <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0">
                {turn.validation.ok
                  ? turn.validation.attempts > 1
                    ? t('citation.verifiedAfterRetry', { attempts: turn.validation.attempts })
                    : t('citation.verified')
                  : t('citation.rejected', { count: turn.validation.rejected.length })}
              </span>
            </div>
          )}

          {turn.citations && turn.citations.length > 0 && !turn.active && (
            <CitationStrip citations={turn.citations.slice(0, 6)} onOpen={(citation) => setOpenCitation(citation)} />
          )}
          <CitationDialog citation={openCitation} onClose={() => setOpenCitation(null)} />
          <SourceDrawer source={openSource} onClose={() => setOpenSource(null)} />

          {turn.webSources && turn.webSources.length > 0 && !turn.active && (
            <div className="mt-2 min-w-0 space-y-1 border-t border-border/60 pt-2 text-[10px]">
              <p className="font-semibold text-muted-foreground">{t('assistant.webSources')}</p>
              <ul className="min-w-0 space-y-0.5">
                {turn.webSources.slice(0, 6).map((source) => (
                  <li key={source.url} className="min-w-0 truncate" title={source.title}>
                    <button
                      type="button"
                      onClick={() => setOpenSource({ ...source, searchedAt: turn.startedAt ? new Date(turn.startedAt).toISOString() : undefined })}
                      className="block max-w-full truncate text-left text-brand-primary-dark hover:underline dark:text-brand-primary-light"
                    >
                      {source.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
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

type CitationItem = NonNullable<ChatTurn['citations']>[number]

const VIEW_KEY = 'sps.citations.view'

/**
 * The sources of an answer, as a list or a horizontal carousel. The toggle is
 * remembered on this device. Each source opens the passage in the citation modal.
 */
function CitationStrip({ citations, onOpen }: { citations: CitationItem[]; onOpen: (citation: CitationItem) => void }) {
  const { t } = useI18n()
  const [view, setView] = React.useState<'list' | 'swipe'>('list')
  const track = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY)
    if (saved === 'list' || saved === 'swipe') setView(saved)
  }, [])

  const toggle = () => {
    const next = view === 'list' ? 'swipe' : 'list'
    setView(next)
    window.localStorage.setItem(VIEW_KEY, next)
  }

  const scroll = (direction: -1 | 1) => track.current?.scrollBy({ left: direction * (track.current.clientWidth * 0.85), behavior: 'smooth' })

  const label = (citation: CitationItem) =>
    [citation.filename, citation.articleNumber ? `Article ${citation.articleNumber}` : '', citation.headingPath ?? ''].filter(Boolean).join(' · ')

  const card = (citation: CitationItem, index: number) => (
    <button
      key={index}
      type="button"
      onClick={() => onOpen(citation)}
      className="group block w-full min-w-0 overflow-hidden rounded-xl bg-card px-3 py-2 text-left shadow-sm transition-colors hover:bg-brand-primary/5"
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-brand-primary-dark group-hover:underline dark:text-brand-primary-light">
        <span className="min-w-0 flex-1 truncate" title={label(citation)}>
          {label(citation)}
        </span>
        {citation.images && citation.images.length > 0 && (
          <span className="shrink-0 rounded bg-brand-primary/10 px-1 font-normal">{citation.images.length}</span>
        )}
      </span>
      {citation.quote && <span className="mt-0.5 line-clamp-2 block text-[10px] italic text-muted-foreground">“{citation.quote}”</span>}
    </button>
  )

  return (
    <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold text-muted-foreground">{t('assistant.citations.count', { count: citations.length })}</p>
        <div className="flex items-center gap-1">
          {view === 'swipe' && (
            <>
              <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-md" aria-label={t('assistant.citations.previous')} onClick={() => scroll(-1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-sm" className="h-6 w-6 rounded-md" aria-label={t('assistant.citations.next')} onClick={() => scroll(1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 rounded-md"
            aria-label={view === 'list' ? t('assistant.citations.swipe') : t('assistant.citations.list')}
            title={view === 'list' ? t('assistant.citations.swipe') : t('assistant.citations.list')}
            onClick={toggle}
          >
            {view === 'list' ? <GalleryHorizontal className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {view === 'list' ? (
        <ul className="space-y-1.5">
          {citations.map((citation, index) => (
            <li key={index}>{card(citation, index)}</li>
          ))}
        </ul>
      ) : (
        <div ref={track} className="flex snap-x snap-mandatory items-start gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {citations.map((citation, index) => (
            <div key={index} className="w-[85%] shrink-0 snap-start sm:w-[60%]">
              {card(citation, index)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
