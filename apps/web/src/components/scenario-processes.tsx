'use client'

/**
 * The running scenario as a carousel: one slide per process (one sector's run),
 * with its graph, its incident timeline, what the agents produced batch after
 * batch, the sources behind each assessment, and the chain-of-thought trail the
 * audit service kept. The arrows, the dots and the arrow keys move horizontally
 * between processes; each process exports itself as HTML, Markdown, Word or JSON.
 */

import * as React from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader,
  TriangleAlert,
} from 'lucide-react'
import {
  Button,
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@sps/ui'
import type { Domain } from '@sps/shared'
import {
  api,
  type AssessmentDto,
  type CoTTraceDto,
  type JointReportDto,
  type ScenarioAgendaItem,
  type ScenarioEventDto,
} from '@/lib/api'
import { IncidentTimeline, type TimelineItem } from '@/components/incident-timeline'
import { ICON_BUTTON_OUTLINE } from '@/components/icon-button-styles'
import { SourceDrawer, type WebSourceView } from '@/components/ai/display/source-drawer'
import { ProcessGraph, type ProcessGraphStep } from '@/components/workflow/process-graph'
import { useI18n } from '@/lib/i18n'

const SEVERITY: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-amber-500',
  high: 'text-orange-500',
  critical: 'text-destructive',
}

type ExportFormat = 'html' | 'markdown' | 'docx' | 'json'

/** One sector's scenario in the console: its own timeline, reports and dossier. */
export interface ScenarioBlock {
  domain: Domain
  runId: string
  agenda: ScenarioAgendaItem[]
  events: ScenarioEventDto[]
  reports: JointReportDto[]
  released: number
  total: number
  done: boolean
  failure?: string
}

function citationLabel(citation: AssessmentDto['citations'][number]): string {
  return [
    citation.country?.toUpperCase(),
    citation.filename,
    citation.articleNumber ? `ARTICLE ${citation.articleNumber}` : '',
    citation.headingPath ?? '',
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * What one agent produced in a batch: its findings, and behind a toggle the
 * provisions it cited and the web pages it read. A web source opens the drawer
 * with its excerpt; a provision opens it too when it carries an address.
 */
function AssessmentOutput({
  assessment,
  onSource,
}: {
  assessment: AssessmentDto
  onSource: (source: WebSourceView) => void
}) {
  const { t } = useI18n()
  const [sourcesOpen, setSourcesOpen] = React.useState(false)
  const citations = assessment.citations ?? []
  const webSources = assessment.webSources ?? []
  const sourceCount = citations.length + webSources.length

  return (
    <div className="rounded-lg bg-secondary/40 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">{assessment.agentId}</span>
        <span className="text-[10px] text-muted-foreground">
          {t('scenario.confidence', { value: assessment.confidence })}
        </span>
        {sourceCount > 0 && (
          <button
            type="button"
            onClick={() => setSourcesOpen((open) => !open)}
            aria-expanded={sourcesOpen}
            className="ml-auto inline-flex items-center gap-1 rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-semibold text-brand-primary-dark transition-colors hover:bg-brand-primary/20 dark:bg-brand-primary-dark/30 dark:text-brand-primary-light"
          >
            {sourceCount} {t('scenario.sources')}
            <ChevronDown className={cn('h-3 w-3 transition-transform', sourcesOpen && 'rotate-180')} />
          </button>
        )}
      </div>

      {assessment.findings.length > 0 && (
        <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-foreground">
          {assessment.findings.map((finding, index) => (
            <li key={index} className="flex gap-1.5">
              <span className="text-brand-primary">·</span>
              <span className="min-w-0">{finding}</span>
            </li>
          ))}
        </ul>
      )}

      {sourcesOpen && sourceCount > 0 && (
        <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
          {citations.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">{t('scenario.legalSources')}</p>
              <ul className="mt-1 space-y-1">
                {citations.map((citation, index) => {
                  const label = citationLabel(citation)
                  const body = (
                    <>
                      <span className="font-medium">{label}</span>
                      {citation.quote && <span className="text-muted-foreground"> · « {citation.quote} »</span>}
                    </>
                  )
                  return (
                    <li key={citation.chunkId ?? `${label}-${index}`}>
                      {citation.sourceUrl ? (
                        <button
                          type="button"
                          title={t('scenario.source.open')}
                          onClick={() =>
                            onSource({
                              title: label,
                              url: citation.sourceUrl as string,
                              snippet: citation.quote,
                            })
                          }
                          className="flex w-full items-start gap-1 rounded-md bg-background/70 px-2 py-1 text-left text-[10px] text-foreground transition-colors hover:bg-background"
                        >
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-brand-primary" />
                          <span className="min-w-0">{body}</span>
                        </button>
                      ) : (
                        <div className="rounded-md bg-background/70 px-2 py-1 text-[10px] text-foreground">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {webSources.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">{t('scenario.webSources')}</p>
              <ul className="mt-1 space-y-1">
                {webSources.map((source) => (
                  <li key={source.url}>
                    <button
                      type="button"
                      onClick={() => onSource(source)}
                      className="flex w-full items-center gap-1 rounded-md bg-secondary/60 px-2 py-1 text-left text-[10px] text-foreground hover:bg-secondary"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0 text-brand-primary" />
                      <span className="min-w-0 truncate">{source.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TickReport({ tick, onSource }: { tick: JointReportDto; onSource: (source: WebSourceView) => void }) {
  const { t } = useI18n()
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground">
          {t('scenario.batch', { n: tick.tick + 1 })}
        </span>
        <span className="text-xs">{tick.summary}</span>
      </div>

      {tick.agreements.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold text-primary">{t('scenario.agreements')}</p>
          <ul className="text-xs">
            {tick.agreements.map((agreement, index) => (
              <li key={index}>· {agreement}</li>
            ))}
          </ul>
        </div>
      )}

      {tick.conflicts.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold text-destructive">{t('scenario.conflicts')}</p>
          <ul className="space-y-1">
            {tick.conflicts.map((conflict) => (
              <li key={conflict.id} className="rounded-lg bg-secondary/60 p-2 text-xs">
                <div className="flex items-center gap-1">
                  <TriangleAlert className={cn('h-3.5 w-3.5', SEVERITY[conflict.severity])} />
                  <span className="font-semibold">
                    {conflict.between[0]} ↔ {conflict.between[1]}
                  </span>
                  <span className={cn('ml-auto', SEVERITY[conflict.severity])}>
                    {t(`severity.${conflict.severity}` as 'severity.low')}
                  </span>
                </div>
                <p className="mt-1">{conflict.summary}</p>
                {conflict.positions.map((position, index) => (
                  <p key={index} className="mt-0.5 text-muted-foreground">
                    <span className="font-semibold">{position.agentId}</span> : {position.position}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tick.openQuestions.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold text-muted-foreground">{t('scenario.openQuestions')}</p>
          <ul className="text-xs text-muted-foreground">
            {tick.openQuestions.map((question, index) => (
              <li key={index}>· {question}</li>
            ))}
          </ul>
        </div>
      )}

      {tick.assessments.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-muted-foreground">
            {t('scenario.outputs')} · {t('scenario.assessments', { count: tick.assessments.length })}
          </p>
          {tick.assessments.map((assessment) => (
            <AssessmentOutput key={assessment.agentId} assessment={assessment} onSource={onSource} />
          ))}
        </div>
      )}

      <AgentTimings assessments={tick.assessments} />
    </div>
  )
}

/**
 * How many agents took part in this batch and how long each one took. The agents
 * run in parallel, so the batch lasts as long as the slowest one.
 */
function AgentTimings({ assessments }: { assessments: Array<AssessmentDto & { durationMs?: number }> }) {
  const { t } = useI18n()
  const timed = assessments.filter((assessment) => assessment.durationMs !== undefined)
  const slowest = Math.max(0, ...timed.map((assessment) => assessment.durationMs ?? 0))
  if (timed.length === 0) return null
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground">
        {t('process.batchDuration', { seconds: (slowest / 1000).toFixed(1) })}
      </p>
      <ul className="space-y-1">
        {timed.map((assessment) => (
          <li key={assessment.agentId} className="flex items-center gap-2 text-[11px]">
            <span className="min-w-0 flex-1 truncate">{assessment.agentId}</span>
            <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-secondary">
              <span
                className="block h-full rounded-full bg-brand-primary dark:bg-brand-primary-light"
                style={{ width: `${((assessment.durationMs ?? 0) / slowest) * 100}%` }}
              />
            </span>
            <span className="w-14 shrink-0 text-right font-mono text-muted-foreground">
              {((assessment.durationMs ?? 0) / 1000).toFixed(1)} s
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function timelineOf(block: ScenarioBlock): TimelineItem[] {
  const payloads = new Map(block.events.map((event) => [event.sequence, event.payload]))
  if (block.agenda.length > 0) {
    return block.agenda.map((item) => ({
      sequence: item.sequence,
      releaseChunk: item.releaseChunk,
      title: item.title,
      visibleTo: item.visibleTo,
      payload: payloads.get(item.sequence),
    }))
  }
  return block.events.map((event) => ({
    sequence: event.sequence,
    releaseChunk: event.releaseChunk,
    title: event.title,
    visibleTo: event.visibleTo,
    payload: event.payload,
  }))
}

/** The process of one run as a graph: start, one node per batch, the joint report. */
function graphOf(
  block: ScenarioBlock,
  running: boolean,
  t: (key: 'scenario.graph.start') => string,
  tick: (n: number) => string,
  report: string,
): ProcessGraphStep[] {
  const batches = [...new Set(block.agenda.map((item) => item.releaseChunk))].sort((a, b) => a - b)
  const steps: ProcessGraphStep[] = [
    { id: 'start', kind: 'start', label: t('scenario.graph.start'), state: 'success' },
  ]
  let previous = 'start'
  for (const batch of batches) {
    const id = `batch-${batch}`
    const titles = block.agenda
      .filter((item) => item.releaseChunk === batch)
      .map((item) => item.title)
      .join(' · ')
    const state =
      block.done || batch < block.released ? 'success' : batch === block.released && running ? 'running' : 'idle'
    steps.push({ id, kind: 'agent', label: tick(batch + 1), detail: titles, state, from: [previous] })
    previous = id
  }
  steps.push({ id: 'report', kind: 'synthesis', label: report, state: block.done ? 'success' : 'idle', from: [previous] })
  return steps
}

/** The chain-of-thought trail of one process, loaded when the panel is opened. */
function ProcessCot({ runId, revision }: { runId: string; revision: number }) {
  const { t } = useI18n()
  const [trace, setTrace] = React.useState<CoTTraceDto[] | null>(null)

  React.useEffect(() => {
    let live = true
    setTrace(null)
    api
      .auditTrace(runId)
      .then((result) => {
        if (live) setTrace(result.trace)
      })
      .catch(() => {
        if (live) setTrace([])
      })
    return () => {
      live = false
    }
  }, [runId, revision])

  if (trace === null) {
    return (
      <div className="space-y-1.5" aria-busy="true" aria-label={t('scenario.cot.loading')}>
        <div className="shimmer h-3 w-3/4 rounded bg-secondary" />
        <div className="shimmer h-3 w-2/3 rounded bg-secondary" />
        <div className="shimmer h-3 w-1/2 rounded bg-secondary" />
      </div>
    )
  }

  if (trace.length === 0) {
    return <p className="text-[11px] text-muted-foreground">{t('scenario.cot.empty')}</p>
  }

  const groups = new Map<string, CoTTraceDto[]>()
  for (const step of trace) {
    const list = groups.get(step.agentId) ?? []
    list.push(step)
    groups.set(step.agentId, list)
  }

  return (
    <div className="custom-scrollbar max-h-[360px] space-y-3 overflow-y-auto pr-1">
      <p className="text-[10px] font-semibold text-muted-foreground">
        {t('scenario.cot.steps', { count: trace.length })}
      </p>
      {[...groups.entries()].map(([agentId, steps]) => (
        <div key={agentId} className="space-y-2">
          <p className="text-[11px] font-semibold text-foreground">{agentId}</p>
          {steps.map((step) => (
            <ChainOfThoughtStep
              key={step.id}
              status="complete"
              label={
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {t('scenario.step', { n: step.step })} · {step.model}
                </span>
              }
              description={<span className="whitespace-pre-wrap text-[11px]">{step.thought}</span>}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function downloadExport(file: { filename: string; mime: string; content: string; encoding: 'utf8' | 'base64' }) {
  const bytes =
    file.encoding === 'base64'
      ? Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(file.content)
  const blob = new Blob([bytes], { type: file.mime })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** The export of one process: HTML, Markdown, Word or JSON, behind an icon. */
function ProcessExport({ runId, disabled }: { runId: string; disabled: boolean }) {
  const { t } = useI18n()
  const [busy, setBusy] = React.useState<ExportFormat | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const formats: Array<{ id: ExportFormat; label: string }> = [
    { id: 'html', label: 'HTML' },
    { id: 'markdown', label: 'Markdown' },
    { id: 'docx', label: 'Word' },
    { id: 'json', label: 'JSON' },
  ]

  const run = async (format: ExportFormat) => {
    if (busy) return
    setBusy(format)
    setFailure(null)
    try {
      downloadExport(await api.scenarioExport(runId, format))
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {failure && (
        <p className="max-w-[220px] truncate text-[10px] text-destructive" title={failure}>
          {t('scenario.export.failed', { message: failure })}
        </p>
      )}
      <DropdownMenu>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('scenario.export')}
                  disabled={disabled || busy !== null}
                  className={ICON_BUTTON_OUTLINE}
                >
                  {busy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">
              {t('scenario.export')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DropdownMenuContent align="end">
          {formats.map((format) => (
            <DropdownMenuItem key={format.id} onSelect={() => void run(format.id)}>
              {format.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** One process: its graph, its progress, its timeline, its outputs and its CoT. */
function ProcessSlide({
  block,
  running,
  onReleaseNext,
  onSource,
}: {
  block: ScenarioBlock
  running: boolean
  onReleaseNext: () => void
  onSource: (source: WebSourceView) => void
}) {
  const { t } = useI18n()
  const [cotOpen, setCotOpen] = React.useState(false)
  // The trail is fetched the first time the panel is opened, then kept mounted
  // so closing and reopening it does not reload the whole trace.
  const [cotSeen, setCotSeen] = React.useState(false)
  const items = timelineOf(block)
  const nextAgenda = block.agenda.find((item) => item.releaseChunk === block.released)

  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <ProcessGraph
        steps={graphOf(
          block,
          running,
          (key) => t(key),
          (n) => t('scenario.graph.batch', { n }),
          t('scenario.graph.report'),
        )}
        className="h-[360px]"
      />

      {block.failure && <p className="text-[11px] text-destructive">{block.failure}</p>}

      {!block.done && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/60 p-2">
          <span className="text-xs text-muted-foreground">
            {t('scenario.progress', { released: block.released, total: block.total })}
            {nextAgenda ? `, ${t('scenario.upNext', { title: nextAgenda.title })}` : ''}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {nextAgenda ? t('scenario.seenBy', { agents: nextAgenda.visibleTo.join(', ') }) : ''}
          </span>
          {!running && !block.failure && block.agenda.length > 0 && block.released < block.total && (
            <Button onClick={onReleaseNext} disabled={running} size="md" className="ml-auto">
              <ChevronRight className="h-3.5 w-3.5" /> {t('scenario.next')}
            </Button>
          )}
        </div>
      )}

      {items.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-[10px] font-semibold text-primary">{t('scenario.timeline')}</p>
          <IncidentTimeline
            items={items}
            releasedChunks={block.released}
            totalTicks={block.total}
            domain={block.domain}
          />
        </div>
      )}

      <div className="space-y-3">
        {block.reports.map((tick) => (
          <TickReport key={tick.tick} tick={tick} onSource={onSource} />
        ))}
      </div>

      <ChainOfThought
        open={cotOpen}
        onOpenChange={(open) => {
          setCotOpen(open)
          if (open) setCotSeen(true)
        }}
        className="rounded-xl border border-border p-3"
      >
        <ChainOfThoughtHeader className="text-[11px] font-semibold">{t('scenario.cot')}</ChainOfThoughtHeader>
        <ChainOfThoughtContent>
          {cotSeen && <ProcessCot runId={block.runId} revision={block.reports.length} />}
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  )
}

/**
 * The processes of the open run side by side. A process is a sector's run: its
 * graph and its reports stay whole, and the carousel moves between sectors
 * instead of stacking them down the page.
 */
export function ScenarioCarousel({
  blocks,
  busy,
  onReleaseNext,
}: {
  blocks: ScenarioBlock[]
  busy: boolean
  onReleaseNext: (index: number) => void
}) {
  const { t } = useI18n()
  const [active, setActive] = React.useState(0)
  const [source, setSource] = React.useState<WebSourceView | null>(null)
  const previousCount = React.useRef(blocks.length)

  // A new process (the next sector of an automatic run) takes the stage; a
  // shorter list clamps the index instead of leaving the track blank.
  React.useEffect(() => {
    if (blocks.length > previousCount.current) setActive(blocks.length - 1)
    else if (active > blocks.length - 1) setActive(Math.max(0, blocks.length - 1))
    previousCount.current = blocks.length
  }, [blocks.length, active])

  if (blocks.length === 0) return null

  const current = Math.min(active, blocks.length - 1)
  const block = blocks[current]!
  const many = blocks.length > 1
  const move = (next: number) => setActive(Math.max(0, Math.min(blocks.length - 1, next)))

  return (
    <div className="space-y-2">
      <div
        role="group"
        aria-roledescription="carousel"
        aria-label={t('scenario.process', { index: current + 1, total: blocks.length })}
        tabIndex={many ? 0 : -1}
        onKeyDown={(event) => {
          if (!many) return
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            move(current + 1)
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            move(current - 1)
          }
        }}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
      >
        <p className="text-[12px] font-semibold text-foreground">
          {many ? t('scenario.process', { index: current + 1, total: blocks.length }) : t('scenario.process.single')}
          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
            {t(`domain.${block.domain}` as 'domain.health')}
          </span>
        </p>
        <span
          className={cn(
            'rounded-full px-1.5 py-px text-[9px] font-semibold',
            block.done
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : block.failure
                ? 'bg-destructive/10 text-destructive'
                : 'bg-brand-primary/10 text-brand-primary',
          )}
        >
          {block.done
            ? t('scenario.status.complete')
            : block.failure
              ? t('scenario.status.failed')
              : t('scenario.status.running')}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          {many && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t('scenario.process.prev')}
                      disabled={current === 0}
                      onClick={() => move(current - 1)}
                      className={ICON_BUTTON_OUTLINE}
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">
                    {t('scenario.process.prev')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <div className="flex items-center gap-1 px-1">
                {blocks.map((item, index) => (
                  <button
                    key={item.runId}
                    type="button"
                    aria-label={t('scenario.process.goTo', { n: index + 1 })}
                    aria-current={index === current ? 'true' : undefined}
                    onClick={() => move(index)}
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      index === current ? 'w-4 bg-brand-primary' : 'w-1.5 bg-border hover:bg-muted-foreground/40',
                    )}
                  />
                ))}
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label={t('scenario.process.next')}
                      disabled={current === blocks.length - 1}
                      onClick={() => move(current + 1)}
                      className={ICON_BUTTON_OUTLINE}
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">
                    {t('scenario.process.next')}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          <ProcessExport runId={block.runId} disabled={block.reports.length === 0} />
        </div>
      </div>

      <div className="overflow-hidden">
        <div
          className="flex items-start transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {blocks.map((item, index) => (
            <div key={item.runId} className="min-w-full" aria-hidden={index !== current}>
              <ProcessSlide
                block={item}
                running={busy && !item.done}
                onReleaseNext={() => onReleaseNext(index)}
                onSource={setSource}
              />
            </div>
          ))}
        </div>
      </div>

      <SourceDrawer source={source} onClose={() => setSource(null)} />
    </div>
  )
}
