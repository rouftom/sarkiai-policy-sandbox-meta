'use client'

import * as React from 'react'
import { ChevronRight, Download, FileCheck2, GitMerge, Play, TriangleAlert, Workflow } from 'lucide-react'
import { AnimatedTabsList, Button, Card, CardContent, CardHeader, CardTitle, cn, type TabItem } from '@sps/ui'
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
 * Past runs are listed below: a finished one opens read-only, a failed one resumes
 * from its last released tick.
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
    try {
      for (const [index, domain] of domains.entries()) {
        const start = await startRun(domain)
        setBlocks((previous) => [...previous, blockOf(start, [], [])])
        onRunId?.(start.runId)
        await driveBlock(index, start.runId)
      }
    } catch (e) {
      setError((e as Error).message)
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
    try {
      const start = await startRun(first)
      onRunId?.(start.runId)
      setBlocks([blockOf(start, [], [])])
      void loadHistory()
    } catch (e) {
      setError((e as Error).message)
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
  const [view, setView] = React.useState<'process' | 'result'>('process')
  const views: TabItem[] = [
    { id: 'process', label: t('scenario.tab.process'), icon: Workflow },
    { id: 'result', label: t('scenario.tab.result'), icon: FileCheck2 },
  ]

  return (
    <Card>
      <CardHeader>
        <GitMerge className="h-4 w-4 text-primary" />
        <CardTitle>{t('scenario.title')}</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" onClick={startFacilitated} disabled={busy || domains.length === 0} size="md">
            {t('scenario.facilitated')}
          </Button>
          <Button onClick={runAll} disabled={busy || domains.length === 0} size="md">
            <Play className="h-3.5 w-3.5" /> {busy ? t('scenario.running') : t('scenario.auto')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {busy && <ProcessingBar label={t('scenario.running')} />}

        {blocks.length === 0 && !busy && <p className="text-sm text-muted-foreground">{t('scenario.intro')}</p>}

        {blocks.length > 0 && <AnimatedTabsList items={views} value={view} onValueChange={(value) => setView(value as 'process' | 'result')} dense />}

        {blocks.length > 0 && view === 'process' && (
          <div className="space-y-4">
            {blocks.map((block, index) => (
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
            ))}
          </div>
        )}

        {blocks.length > 0 && view === 'result' && blocks.map((block, index) => {
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
        })}
        {allDone && blocks.length > 1 && <p className="text-[11px] text-muted-foreground">{t('scenario.allDone', { count: blocks.length })}</p>}

        {history && history.length > 0 && (
          <section className="space-y-2 border-t border-border pt-4">
            <p className="text-[12px] font-semibold text-foreground">{t('scenario.history')}</p>
            <ul className="space-y-1">
              {history.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate">
                    {entry.title}
                    <span className="ml-2 text-muted-foreground">
                      {new Date(entry.updatedAt).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {entry.released}/{entry.total}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-px text-[9px] font-semibold',
                      entry.status === 'complete' && 'bg-emerald-500/10 text-emerald-600',
                      entry.status === 'failed' && 'bg-destructive/10 text-destructive',
                      entry.status === 'running' && 'bg-brand-primary/10 text-brand-primary',
                    )}
                  >
                    {t(`scenario.status.${entry.status}` as 'scenario.status.complete')}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => void openRun(entry)} disabled={busy}>
                    {t('scenario.open')}
                  </Button>
                  {entry.status !== 'complete' && (
                    <Button variant="outline" size="sm" onClick={() => void resumeRun(entry)} disabled={busy}>
                      {t('scenario.resume')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
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
