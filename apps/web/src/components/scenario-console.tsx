'use client'

import * as React from 'react'
import { ArrowLeft, ChevronRight, Download, TriangleAlert } from 'lucide-react'
import { Button, cn } from '@sps/ui'
import type { Domain } from '@sps/shared'
import {
  api,
  type JointReportDto,
  type ScenarioAgendaItem,
  type ScenarioEventDto,
  type ScenarioRunSummaryDto,
} from '@/lib/api'
import { IncidentTimeline, type TimelineItem } from '@/components/incident-timeline'
import { useI18n } from '@/lib/i18n'
import { ProcessingBar } from '@/components/processing-bar'
import { ScenarioHistory } from '@/components/scenario-history'
import { ProcessGraph, type ProcessGraphStep } from '@/components/workflow/process-graph'

const SEVERITY: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-amber-500',
  high: 'text-orange-500',
  critical: 'text-destructive',
}

function TickReport({ tick }: { tick: JointReportDto }) {
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
            {tick.agreements.map((a, i) => (
              <li key={i}>· {a}</li>
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
                {conflict.positions.map((position, i) => (
                  <p key={i} className="mt-0.5 text-muted-foreground">
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
          <p className="text-[10px] font-semibold text-muted-foreground">
            {t('scenario.openQuestions')}
          </p>
          <ul className="text-xs text-muted-foreground">
            {tick.openQuestions.map((q, i) => (
              <li key={i}>· {q}</li>
            ))}
          </ul>
        </div>
      )}

      <AgentTimings assessments={tick.assessments} />
    </div>
  )
}

/**
 * How many agents took part in this batch and how long each one took. The
 * agents run in parallel, so the batch lasts as long as the slowest one.
 */
function AgentTimings({ assessments }: { assessments: Array<{ agentId: string; role: string; durationMs?: number }> }) {
  const { t } = useI18n()
  const timed = assessments.filter((assessment) => assessment.durationMs !== undefined)
  const slowest = Math.max(0, ...timed.map((assessment) => assessment.durationMs ?? 0))
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[10px] font-semibold text-muted-foreground">
        {t('scenario.assessments', { count: assessments.length })}
        {slowest > 0 && <> · {t('process.batchDuration', { seconds: (slowest / 1000).toFixed(1) })}</>}
      </p>
      {timed.length > 0 && (
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
      )}
    </div>
  )
}

/** One sector's scenario in the console: its own timeline, reports and dossier. */
interface ScenarioBlock {
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

const MAX_SECTORS_KEY = 'sps.scenarios.maxSectors'

/** Starting data of one run, as the start and resume routes give it. */
interface RunStart {
  runId: string
  domain: Domain
  agenda: ScenarioAgendaItem[]
  totalTicks: number
  released: number
}

/**
 * Plays the scenario of each chosen sector, one after another (auto), or releases
 * the first sector's batches one at a time (facilitator). Each sector is a block.
 * The page shows the saved runs while nothing is played, and the run as soon as one
 * starts · opening a saved one hides the table too. A block that finished is
 * read-only, a failed one resumes from its last released tick.
 */
export function ScenarioConsole({
  country,
  domains,
  onRunId,
}: {
  country: string
  domains: Domain[]
  onRunId?: (runId: string) => void
}) {
  const { t, locale } = useI18n()
  const lang: 'en' | 'fr' = locale === 'fr' ? 'fr' : 'en'
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [blocks, setBlocks] = React.useState<ScenarioBlock[]>([])
  const [history, setHistory] = React.useState<ScenarioRunSummaryDto[] | null>(null)
  const [maxSectors, setMaxSectors] = React.useState(5)

  React.useEffect(() => {
    const saved = Number(window.localStorage.getItem(MAX_SECTORS_KEY))
    if (saved >= 1 && saved <= 5) setMaxSectors(saved)
  }, [])

  const changeMaxSectors = (value: number) => {
    setMaxSectors(value)
    window.localStorage.setItem(MAX_SECTORS_KEY, String(value))
  }

  const patchBlock = (index: number, patch: (block: ScenarioBlock) => ScenarioBlock) =>
    setBlocks((previous) => previous.map((block, position) => (position === index ? patch(block) : block)))

  const loadHistory = React.useCallback(async () => {
    try {
      setHistory((await api.scenarioRuns()).runs)
    } catch {
      setHistory([])
    }
  }, [])

  React.useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const downloadDossier = async (runId: string, format: 'json' | 'markdown') => {
    try {
      const body = await api.dossier(runId, format)
      const blob = new Blob([body], {
        type: format === 'markdown' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `dossier-${runId}.${format === 'markdown' ? 'md' : 'json'}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError((cause as Error).message)
    }
  }

  /** Releases the ticks of one block until the scenario ends (or stops on an error). */
  const driveBlock = async (index: number, runId: string) => {
    let finished = false
    while (!finished) {
      const tick = await api.nextTick(runId)
      patchBlock(index, (block) => ({
        ...block,
        events: tick.events.length ? [...block.events, ...tick.events] : block.events,
        reports: tick.report ? [...block.reports, tick.report as JointReportDto] : block.reports,
        released: tick.releasedTicks,
        done: tick.done,
      }))
      finished = tick.done
    }
    void loadHistory()
  }

  const startRun = async (domain: Domain): Promise<RunStart> => {
    const start = await api.startScenario({ country, domain, lang })
    return { runId: start.runId, domain, agenda: start.agenda, totalTicks: start.totalTicks, released: 0 }
  }

  // Auto: the chosen sectors, one scenario after another. One short request per tick:
  // a multi-agent tick takes about a minute, and a single long request is cut by the proxy.
  const runAll = async () => {
    setBusy(true)
    setError(null)
    setBlocks([])
    setShowHistory(false)
    try {
      for (const [index, domain] of domains.slice(0, maxSectors).entries()) {
        const start = await startRun(domain)
        setBlocks((previous) => [...previous, blockOf(start, [], [])])
        onRunId?.(start.runId)
        await driveBlock(index, start.runId)
      }
    } catch (e) {
      setError((e as Error).message)
      setShowHistory(true)
      void loadHistory()
    } finally {
      setBusy(false)
    }
  }

  // Facilitator: the first chosen sector starts; its batches are released one by one.
  const startFacilitated = async () => {
    const first = domains[0]
    if (!first) return
    setBusy(true)
    setError(null)
    setBlocks([])
    setShowHistory(false)
    try {
      const start = await startRun(first)
      onRunId?.(start.runId)
      setBlocks([blockOf(start, [], [])])
      void loadHistory()
    } catch (e) {
      setError((e as Error).message)
      setShowHistory(true)
    } finally {
      setBusy(false)
    }
  }

  const releaseNext = async (index: number) => {
    const block = blocks[index]
    if (!block) return
    setBusy(true)
    setError(null)
    try {
      const tick = await api.nextTick(block.runId)
      patchBlock(index, (current) => ({
        ...current,
        events: tick.events.length ? [...current.events, ...tick.events] : current.events,
        reports: tick.report ? [...current.reports, tick.report as JointReportDto] : current.reports,
        released: tick.releasedTicks,
        done: tick.done,
      }))
    } catch (e) {
      setError((e as Error).message)
      void loadHistory()
    } finally {
      setBusy(false)
    }
  }

  /** Opens a saved run as a block: finished runs read-only, others can go on. */
  const openRun = async (summary: ScenarioRunSummaryDto) => {
    setBusy(true)
    setError(null)
    try {
      const run = await api.scenarioRun(summary.id)
      const agenda = run.events.map((event) => ({ sequence: event.sequence, releaseChunk: event.releaseChunk, title: event.title, visibleTo: event.visibleTo }))
      const events: ScenarioEventDto[] = run.events
        .filter((event) => event.releaseChunk < run.released)
        .map((event) => ({ id: `${run.id}-${event.sequence}`, sequence: event.sequence, releaseChunk: event.releaseChunk, title: event.title, payload: event.payload, visibleTo: event.visibleTo, createdAt: run.updatedAt }))
      setBlocks([
        {
          domain: run.domain as Domain,
          runId: run.id,
          agenda,
          events,
          reports: run.reports,
          released: run.released,
          total: run.total,
          done: run.status === 'complete',
          ...(run.failure ? { failure: run.failure } : {}),
        },
      ])
      onRunId?.(run.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Resumes a failed run from its last released tick, and plays it to the end. */
  const resumeRun = async (summary: ScenarioRunSummaryDto) => {
    setBusy(true)
    setError(null)
    try {
      await openRun(summary)
      const start = await api.resumeScenarioRun(summary.id)
      setBlocks((previous) => previous.map((block) => (block.runId === summary.id ? { ...block, done: false, failure: undefined } : block)))
      onRunId?.(start.runId)
      setBusy(false)
      await driveBlock(0, start.runId)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      void loadHistory()
    }
  }

  const allDone = blocks.length > 0 && blocks.every((block) => block.done)

  /** A run is played here: the table of past runs gives way to it. */
  const [showHistory, setShowHistory] = React.useState(true)
  const backToRuns = () => {
    setBlocks([])
    setError(null)
    setShowHistory(true)
    void loadHistory()
  }

  const graphs = blocks.map((block, index) => (
    <section key={`graph-${block.runId}`} className="space-y-2">
      {blocks.length > 1 && (
        <p className="text-[11px] font-semibold text-muted-foreground">
          {index + 1}/{blocks.length} · {t(`domain.${block.domain}` as 'domain.health')}
        </p>
      )}
      <ProcessGraph
        steps={graphOf(
          block,
          busy && !block.done,
          (key) => t(key),
          (n) => t('scenario.graph.batch', { n }),
          t('scenario.graph.report'),
        )}
        className="h-[360px]"
      />
    </section>
  ))

  const results = blocks.map((block, index) => {
    const items = timelineOf(block)
    const nextAgenda = block.agenda.find((item) => item.releaseChunk === block.released)
    return (
      <section key={block.runId} className="space-y-3 rounded-xl border border-border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[12px] font-semibold text-foreground">
            {t(`domain.${block.domain}` as 'domain.health')}
            {blocks.length > 1 && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{index + 1}/{blocks.length}</span>}
          </p>
          {block.done && (
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="md" onClick={() => void downloadDossier(block.runId, 'markdown')}>
                <Download className="h-3.5 w-3.5" /> {t('scenario.dossier')}
              </Button>
              <Button variant="ghost" size="md" onClick={() => void downloadDossier(block.runId, 'json')}>
                JSON
              </Button>
            </div>
          )}
        </div>

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
            {!busy && block.released > 0 && block.agenda.length > 0 && block.released < block.total && block.runId && (
              <Button onClick={() => void releaseNext(index)} disabled={busy} size="md" className="ml-auto">
                <ChevronRight className="h-3.5 w-3.5" /> {t('scenario.next')}
              </Button>
            )}
          </div>
        )}

        {items.length > 0 && (
          <div className="rounded-xl border border-border p-3">
            <p className="mb-2 text-[10px] font-semibold text-primary">{t('scenario.timeline')}</p>
            <IncidentTimeline items={items} releasedChunks={block.released} totalTicks={block.total} domain={block.domain} />
          </div>
        )}

        <div className="space-y-3">
          {block.reports.map((tick) => (
            <TickReport key={tick.tick} tick={tick} />
          ))}
        </div>
      </section>
    )
  })

  return (
    <section className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {busy && <ProcessingBar label={t('scenario.running')} />}

      {blocks.length === 0 ? (
        !showHistory ? null : (
          <ScenarioHistory
            runs={history}
            busy={busy}
            canStart={domains.length > 0}
            maxSectors={maxSectors}
            onMaxSectorsChange={changeMaxSectors}
            onOpen={(run) => void openRun(run)}
            onResume={(run) => void resumeRun(run)}
            onFacilitate={() => void startFacilitated()}
            onAuto={() => void runAll()}
          />
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={backToRuns} disabled={busy}>
              <ArrowLeft className="h-3.5 w-3.5" /> {t('scenario.back')}
            </Button>
            {allDone && blocks.length > 1 && (
              <p className="text-[11px] text-muted-foreground">{t('scenario.allDone', { count: blocks.length })}</p>
            )}
          </div>
          <div className="space-y-4">{graphs}</div>
          <div className="space-y-4">{results}</div>
        </>
      )}
    </section>
  )
}

/** The process of one run as a graph: start, one node per batch, the joint report. */
function graphOf(block: ScenarioBlock, running: boolean, t: (key: 'scenario.graph.start') => string, tick: (n: number) => string, report: string): ProcessGraphStep[] {
  const batches = [...new Set(block.agenda.map((item) => item.releaseChunk))].sort((a, b) => a - b)
  const steps: ProcessGraphStep[] = [{ id: 'start', kind: 'start', label: t('scenario.graph.start'), state: 'success' }]
  let previous = 'start'
  for (const batch of batches) {
    const id = `batch-${batch}`
    const titles = block.agenda
      .filter((item) => item.releaseChunk === batch)
      .map((item) => item.title)
      .join(' · ')
    const state = block.done || batch < block.released ? 'success' : batch === block.released && running ? 'running' : 'idle'
    steps.push({ id, kind: 'agent', label: tick(batch + 1), detail: titles, state, from: [previous] })
    previous = id
  }
  steps.push({ id: 'report', kind: 'synthesis', label: report, state: block.done ? 'success' : 'idle', from: [previous] })
  return steps
}

/** A block from a start (new run) or an opened run. */
function blockOf(start: RunStart, events: ScenarioEventDto[], reports: JointReportDto[]): ScenarioBlock {
  return {
    domain: start.domain,
    runId: start.runId,
    agenda: start.agenda,
    events,
    reports,
    released: start.released,
    total: start.totalTicks,
    done: false,
  }
}
