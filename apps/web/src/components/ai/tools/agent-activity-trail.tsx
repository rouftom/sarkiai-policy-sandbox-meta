'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ChainOfThought, ChainOfThoughtHeader, ChainOfThoughtContent, ChainOfThoughtStep } from '@sps/ui'
import { AlertCircle, Check, Circle, Loader2 } from 'lucide-react'
import type { ActivityStatus } from '@/lib/activity'
import { formatElapsed } from '@/lib/activity'
import { useI18n } from '@/lib/i18n'
import { useThinkingWord } from '@/components/ai/display/stream-indicator'

export interface TrailStepView {
  key: string
  label: string
  count: number
  status: ActivityStatus
  /** Time the step took, shown on its row once it has finished. */
  durationMs?: number
}

interface AgentActivityTrailProps {
  steps: TrailStepView[]
  /** True while the assistant turn is still streaming. */
  isStreaming: boolean
  /** Epoch ms of the first step, for the elapsed counter. */
  startedAt?: number
  /** Epoch ms when the turn finished: the counter stops here, whenever the view is opened. */
  endedAt?: number
  headerLabel: string
}

const STATUS_ICON: Record<ActivityStatus, React.ReactNode> = {
  pending: <Circle className="h-3 w-3 text-foreground/30" />,
  active: <Loader2 className="h-3 w-3 animate-spin text-brand-primary" />,
  complete: <Check className="h-3 w-3 text-emerald-500" />,
  error: <AlertCircle className="h-3 w-3 text-red-500" />,
}

/** Live elapsed timer, ticking only while streaming. */
function useElapsed(startedAt: number | undefined, active: boolean, endedAt?: number): string {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active || !startedAt) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active, startedAt])
  if (!startedAt) return ''
  // A finished turn shows its real duration, never the time since this view mounted.
  const end = active ? now : endedAt
  if (!end) return ''
  return formatElapsed(Math.max(0, end - startedAt))
}

/**
 * Compact, collapsible rendering of a run of tool calls/steps.
 *
 * - Auto-opened while the turn streams, auto-collapsed once it finishes, so a
 *   long tool chain does not take space after the fact.
 * - Identical consecutive calls are collapsed to a single row with a `×N`.
 * - Interactive UIs are deliberately rendered by the caller, outside this trail,
 *   so collapsing never hides a confirmation card or a form.
 *
 * Shared source of truth for all apps (`@fada/agentic-ui` in the source monorepo).
 */
/** Words shown while a phase runs, so the header says what is happening instead of a fixed sentence. */
const PHASE_WORDS: Record<string, Array<'assistant.think.triangulation' | 'assistant.think.crossCheck' | 'assistant.think.search' | 'assistant.think.reflection' | 'assistant.think.synthesis' | 'assistant.think.drafting' | 'assistant.think.verification' | 'assistant.think.reinforcement' | 'assistant.think.rewrite' | 'assistant.think.saving' | 'assistant.think.tool'>> = {
  retrieving: ['assistant.think.triangulation', 'assistant.think.crossCheck', 'assistant.think.search'],
  generating: ['assistant.think.reflection', 'assistant.think.synthesis', 'assistant.think.drafting'],
  validating: ['assistant.think.verification', 'assistant.think.reinforcement'],
  retry: ['assistant.think.reinforcement', 'assistant.think.rewrite'],
  persisting: ['assistant.think.saving'],
  tool: ['assistant.think.tool', 'assistant.think.search'],
}

/** Step keys are `<stage>-<n>` for pipeline stages and `tool-<id>` for tool calls. */
function phaseOf(key: string): string {
  const head = key.split('-')[0] ?? ''
  return head in PHASE_WORDS ? head : 'generating'
}

export function AgentActivityTrail({ steps, isStreaming, startedAt, endedAt, headerLabel }: AgentActivityTrailProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(isStreaming)
  const elapsed = useElapsed(startedAt, isStreaming, endedAt)

  // Follow the stream: open while running, fold away when done.
  useEffect(() => {
    setOpen(isStreaming)
  }, [isStreaming])

  const totalCount = useMemo(() => steps.reduce((sum, step) => sum + step.count, 0), [steps])
  // Hooks run before any early return: the thinking word follows the running phase.
  const liveStep = steps.find((step) => step.status === 'active')
  const livePhase = liveStep ? phaseOf(liveStep.key) : 'generating'
  const thinking = useThinkingWord((PHASE_WORDS[livePhase] ?? PHASE_WORDS.generating!).map((key) => t(key)), isStreaming && !!liveStep)
  if (steps.length === 0) return null

  // Keep the collapsed/streaming trace bounded; older steps are summarised.
  const MAX_VISIBLE = 12
  const visibleSteps = steps.length > MAX_VISIBLE ? steps.slice(steps.length - MAX_VISIBLE) : steps
  const hiddenCount = steps.length - visibleSteps.length

  // While running, the header label mirrors the current step (animated).
  const activeStep = visibleSteps.find((step) => step.status === 'active')
  const showRunning = isStreaming && !!activeStep

  return (
    <ChainOfThought open={open} onOpenChange={setOpen} className="my-1">
      <ChainOfThoughtHeader className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden text-[10px] font-light tracking-widest text-foreground/40 hover:text-foreground/70">
        <span className="text-foreground/20">·</span>
        <span className={showRunning ? 'truncate text-foreground/80' : 'truncate'}>
          {showRunning ? <span className="animate-pulse">{thinking}…</span> : headerLabel}
        </span>
        {totalCount > 1 && <span className="text-foreground/30">×{totalCount}</span>}
        {elapsed && <span className="text-foreground/30">· {elapsed}</span>}
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent className="border-l border-brand-primary/10 ml-1.5 pl-3 py-1 space-y-0.5">
        {hiddenCount > 0 && <div className="text-[10px] text-foreground/30 pl-4">+{hiddenCount}</div>}
        {visibleSteps.map((step) => (
          <ChainOfThoughtStep
            key={step.key}
            label={
              <span className="flex items-center gap-1.5 min-w-0" title={step.label}>
                {STATUS_ICON[step.status]}
                <span className="text-[11px] font-normal tracking-wide text-foreground/60 truncate">{step.label}</span>
                {step.count > 1 && <span className="text-foreground/30 text-[10px]">×{step.count}</span>}
                {step.durationMs !== undefined && (
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-foreground/30">{formatElapsed(step.durationMs)}</span>
                )}
              </span>
            }
          />
        ))}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}
