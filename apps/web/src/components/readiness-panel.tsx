'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Circle, FileCheck2, History, Loader, Waypoints } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  cn,
} from '@sps/ui'
import { WORKFLOW_PROFILES } from '@sps/shared'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import {
  api,
  type DimensionScoreDto,
  type ReadinessEventDto,
  type ReadinessReportDto,
  type ReadinessRunSummaryDto,
  type WhatIfResultDto,
} from '@/lib/api'
import { SourceDrawer, type WebSourceView } from '@/components/ai/display/source-drawer'
import { ProcessGraph, type ProcessGraphStep, type ProcessState } from '@/components/workflow/process-graph'

type StepStatus = 'pending' | 'running' | 'done' | 'error'

/** One evaluating agent (one dimension) as the live process shows it. */
interface Step {
  dimension: string
  dimensionId: number
  name: string
  status: StepStatus
  durationMs?: number
  startedAt?: number
  webSources: Array<{ title: string; url: string }>
  score?: DimensionScoreDto
  reasoning: string
  attempts?: number
  passages?: { country: number; global: number }
  error?: string
}

interface RunMeta {
  id: string
  createdAt: string
  runBy: string
}

/** Seconds since `since`, updated while the run is live. */
function useNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

function seconds(ms: number | undefined): string {
  return ms === undefined ? '—' : `${(ms / 1000).toFixed(1)} s`
}

/** The steps of a finished run, rebuilt from its report (no timings are stored per step). */
function stepsFromReport(report: ReadinessReportDto): Step[] {
  return report.scores.map((score) => ({
    dimension: score.dimension,
    dimensionId: score.dimensionId,
    name: score.dimensionName,
    status: 'done',
    webSources: score.webSources ?? [],
    score,
    reasoning: '',
  }))
}

export function ReadinessPanel({ showStages = true, runId }: { showStages?: boolean; runId?: string }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { country, domain, lens } = useWorkspace()
  const [report, setReport] = React.useState<ReadinessReportDto | null>(null)
  const [meta, setMeta] = React.useState<RunMeta | null>(null)
  const [steps, setSteps] = React.useState<Step[]>([])
  const [running, setRunning] = React.useState(false)
  const [totalMs, setTotalMs] = React.useState<number | undefined>(undefined)
  const [startedAt, setStartedAt] = React.useState<number | null>(null)
  const now = useNow(running)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [history, setHistory] = React.useState<ReadinessRunSummaryDto[] | null>(null)
  const [whatIf, setWhatIf] = React.useState<WhatIfResultDto | null>(null)
  const [change, setChange] = React.useState<{ dimension: string; delta: number }>({ dimension: 'digital_infrastructure', delta: 1 })
  const [source, setSource] = React.useState<WebSourceView | null>(null)
  const [openIds, setOpenIds] = React.useState<Set<string>>(new Set())

  const profile = WORKFLOW_PROFILES[lens]
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  const patchStep = (dimension: string, patch: Partial<Step>) =>
    setSteps((previous) => previous.map((step) => (step.dimension === dimension ? { ...step, ...patch } : step)))

  const onEvent = (event: ReadinessEventDto) => {
    if (event.type === 'start') {
      setSteps(
        event.dimensions.map((entry) => ({
          dimension: entry.dimension,
          dimensionId: entry.dimensionId,
          name: entry.name,
          status: 'pending',
          webSources: [],
          reasoning: '',
        })),
      )
    } else if (event.type === 'web') {
      patchStep(event.dimension, { webSources: event.sources })
    } else if (event.type === 'running') {
      patchStep(event.dimension, { status: 'running', startedAt: Date.now() })
    } else if (event.type === 'result') {
      patchStep(event.dimension, {
        status: 'done',
        durationMs: event.durationMs,
        score: event.score,
        reasoning: event.reasoning,
        attempts: event.attempts,
        passages: { country: event.countryPassages, global: event.globalPassages },
      })
    } else if (event.type === 'error') {
      patchStep(event.dimension, { status: 'error', durationMs: event.durationMs, error: event.message })
    } else if (event.type === 'done') {
      setReport(event.report as ReadinessReportDto)
    }
  }

  const run = async () => {
    setRunning(true)
    setWhatIf(null)
    setFailure(null)
    setReport(null)
    setMeta(null)
    setSteps([])
    setOpenIds(new Set())
    const started = Date.now()
    setStartedAt(started)
    try {
      const saved = await api.readinessStream({ country, domain, globalCountry: 'global' }, onEvent)
      setTotalMs(Date.now() - started)
      if (saved) {
        setMeta({ id: saved.id, createdAt: saved.createdAt, runBy: saved.runBy })
        // The run has its own address: it can be reopened, shared or bookmarked.
        router.replace(`/readiness/${saved.id}`)
      }
      setHistory(null)
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
    }
  }

  // An evaluation opened from its address (or from the history).
  React.useEffect(() => {
    if (!runId) return
    let cancelled = false
    api
      .readinessRun(runId)
      .then((run) => {
        if (cancelled) return
        setReport(run.report)
        setMeta({ id: run.id, createdAt: run.createdAt, runBy: run.runBy })
        setSteps(stepsFromReport(run.report))
        setTotalMs(undefined)
        setWhatIf(null)
      })
      .catch((caught) => {
        if (!cancelled) setFailure(caught instanceof Error ? caught.message : String(caught))
      })
    return () => {
      cancelled = true
    }
  }, [runId])

  const openHistory = async () => {
    setHistoryOpen(true)
    if (history !== null) return
    try {
      setHistory((await api.readinessRuns()).runs)
    } catch {
      setHistory([])
    }
  }

  const simulate = async () => {
    if (!report) return
    try {
      setWhatIf(await api.whatIf({ country, domain, changes: { [change.dimension]: change.delta }, scores: report.scores }))
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const toggleStep = (id: string) =>
    setOpenIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const liveTotal = startedAt !== null && running ? now - startedAt : totalMs
  const doneSteps = steps.filter((step) => step.status === 'done' || step.status === 'error')

  // The process graph: start → web → one agent per dimension → synthesis → saved.
  const graphSteps: ProcessGraphStep[] = React.useMemo(() => {
    if (steps.length === 0) return []
    const agentIds = steps.map((step) => `agent:${step.dimension}`)
    const webSources = steps.reduce((sum, step) => sum + step.webSources.length, 0)
    const everyAgentDone = steps.every((step) => step.status === 'done')
    const anyFailed = steps.some((step) => step.status === 'error')
    const anyRunning = steps.some((step) => step.status === 'running')
    const webState: ProcessState = steps.some((step) => step.webSources.length > 0) ? 'success' : running ? 'running' : 'idle'
    const synthesisState: ProcessState = report ? 'success' : anyFailed ? 'failed' : everyAgentDone ? 'running' : 'idle'
    return [
      { id: 'start', kind: 'start', label: t('readiness.process.start'), state: running || report ? 'success' : 'idle', detail: `${country.toUpperCase()} · ${steps.length} dimensions` },
      { id: 'web', kind: 'web', label: t('readiness.process.webNode'), state: webState, detail: `${webSources} ${t('readiness.process.sourcesCount')}`, from: ['start'] },
      ...steps.map((step) => ({
        id: `agent:${step.dimension}`,
        kind: 'agent' as const,
        label: step.name,
        state: (step.status === 'done' ? 'success' : step.status === 'error' ? 'failed' : step.status === 'running' ? 'running' : 'idle') as ProcessState,
        detail: step.score ? `${step.score.score}/5` : step.status === 'pending' ? t('readiness.process.waiting') : undefined,
        duration: step.durationMs !== undefined ? seconds(step.durationMs) : step.status === 'running' && step.startedAt ? seconds(now - step.startedAt) : undefined,
        from: ['web'],
      })),
      { id: 'synthesis', kind: 'synthesis', label: t('readiness.process.synthesis'), state: synthesisState, detail: report ? `${report.scenario?.composite ?? '—'}/5` : undefined, from: agentIds },
      { id: 'saved', kind: 'saved', label: t('readiness.process.saved'), state: meta ? 'success' : 'idle', detail: meta ? formatDate(meta.createdAt) : undefined, from: ['synthesis'] },
    ]
  }, [steps, report, meta, running, now, country, t])

  const selectNode = (id: string) => {
    if (!id.startsWith('agent:')) return
    const dimension = id.slice('agent:'.length)
    setOpenIds((previous) => new Set(previous).add(dimension))
    document.getElementById(`step-${dimension}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {failure && <p className="text-[11px] text-destructive lg:col-span-3">{failure}</p>}

      {showStages && (
        <Card>
          <CardHeader>
            <Activity className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('workflow.stages')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-xs">
            {Object.entries(profile.stages).map(([stage, enabled]) => (
              <div key={stage} className="flex items-center justify-between">
                <span className="capitalize text-muted-foreground">{stage.replace(/_/g, ' ')}</span>
                <span className={enabled ? 'font-medium text-brand-primary dark:text-brand-primary-light' : 'text-muted-foreground/50'}>
                  {enabled ? t('workflow.on') : t('workflow.off')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className={showStages ? 'lg:col-span-2' : 'lg:col-span-3'}>
        <CardHeader className="flex-wrap">
          <FileCheck2 className="h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light" />
          <div className="min-w-0 flex-1">
            <CardTitle>{t('readiness.title')}</CardTitle>
            <p className="truncate text-[11px] text-muted-foreground">{t('readiness.subtitle')}</p>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="icon-sm" className="h-8 w-8 rounded-lg" aria-label={t('readiness.history')} title={t('readiness.history')} onClick={() => void openHistory()}>
              <History className="h-4 w-4" />
            </Button>
            <Button onClick={run} disabled={running} size="sm">
              {running ? <Loader className="h-3.5 w-3.5 animate-spin" /> : null}
              {running ? t('readiness.running') : t('readiness.run')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {graphSteps.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{t('readiness.process.agents', { count: steps.length })}</span>
                <span>·</span>
                <span>{t('readiness.process.progress', { done: doneSteps.length, total: steps.length })}</span>
                {liveTotal !== undefined && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{seconds(liveTotal)}</span>
                  </>
                )}
              </div>
              <ProcessGraph steps={graphSteps} onSelect={selectNode} />
              <ol className="space-y-1">
                {steps.map((step) => (
                  <StepRow
                    key={step.dimension}
                    step={step}
                    now={now}
                    open={openIds.has(step.dimension)}
                    onToggle={() => toggleStep(step.dimension)}
                    onOpenSource={setSource}
                  />
                ))}
              </ol>
            </section>
          )}

          {report && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {meta && <span>{formatDate(meta.createdAt)}</span>}
                {meta?.runBy && (
                  <>
                    <span>·</span>
                    <span>{t('readiness.runBy', { who: meta.runBy })}</span>
                  </>
                )}
                {totalMs !== undefined && (
                  <>
                    <span>·</span>
                    <span>{t('readiness.duration', { seconds: (totalMs / 1000).toFixed(1) })}</span>
                  </>
                )}
              </div>
              <p className="text-xs leading-relaxed text-foreground/90">{report.summary}</p>
              <div className="flex flex-wrap gap-4 text-[11px]">
                <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 dark:bg-brand-primary-dark/30">
                  {t('readiness.composite')}: <strong>{report.scenario?.composite ?? '—'}/5</strong>
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5">
                  {t('readiness.average')}: <strong>{report.scenario?.overall ?? '—'}/5</strong>
                </span>
              </div>

              <div className="space-y-2">
                {report.scores?.map((score) => (
                  <details key={score.dimension} className="group rounded-xl bg-secondary/40 p-2 text-[11px]">
                    <summary className="flex cursor-pointer list-none items-center gap-2">
                      <span className="w-8 shrink-0 text-muted-foreground">D{score.dimensionId}</span>
                      <span className="min-w-0 flex-1 truncate">{score.dimensionName}</span>
                      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-secondary">
                        <span className="block h-full rounded-full bg-brand-primary dark:bg-brand-primary-light" style={{ width: `${(score.score / 5) * 100}%` }} />
                      </span>
                      <span className="w-8 shrink-0 text-right font-semibold">{score.score}/5</span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-2 space-y-2 pl-10 text-[11px]">
                      <p className="text-muted-foreground">{score.maturity}</p>
                      {score.recommendations?.length > 0 && (
                        <div>
                          <p className="font-semibold">{t('readiness.recommendations')}</p>
                          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                            {score.recommendations.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {score.gaps?.length > 0 && (
                        <div>
                          <p className="font-semibold">{t('readiness.gaps')}</p>
                          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                            {score.gaps.map((item, index) => (
                              <li key={index}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </details>
                ))}
              </div>

              <div className="rounded-lg border border-border bg-secondary/40 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                  <Waypoints className="h-3.5 w-3.5" /> {t('readiness.whatIf')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    ariaLabel={t('readiness.dimension')}
                    value={change.dimension}
                    onValueChange={(value) => setChange((state) => ({ ...state, dimension: value }))}
                    options={(report.scores ?? []).map((score) => ({ value: score.dimension, label: score.dimensionName }))}
                    className="min-w-0 flex-1 sm:w-56 sm:flex-none"
                  />
                  <Input
                    type="number"
                    step="0.5"
                    value={change.delta}
                    onChange={(event) => setChange((state) => ({ ...state, delta: Number(event.target.value) }))}
                    className="h-8 w-20 text-[11px]"
                    aria-label={t('readiness.delta')}
                  />
                  <Button onClick={simulate} disabled={running} size="sm" variant="secondary">
                    {t('readiness.simulate')}
                  </Button>
                </div>
                {whatIf && (
                  <div className="mt-2 space-y-1 text-[11px]">
                    <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{whatIf.narrative}</pre>
                  </div>
                )}
              </div>
            </section>
          )}

          {!report && steps.length === 0 && <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{t('readiness.empty')}</p>}
        </CardContent>
      </Card>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-3xl p-0">
          <DialogHeader className="border-b border-border px-5 py-3">
            <DialogTitle className="text-sm font-semibold">{t('readiness.history')}</DialogTitle>
          </DialogHeader>
          <div className="custom-scrollbar max-h-[60vh] space-y-1 overflow-y-auto p-3">
            {history === null && <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">{t('readiness.historyLoading')}</p>}
            {history?.length === 0 && <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">{t('readiness.historyEmpty')}</p>}
            {history?.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={entry.id === runId ? 'true' : undefined}
                onClick={() => {
                  setHistoryOpen(false)
                  router.push(`/readiness/${entry.id}`)
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-brand-primary/5',
                  entry.id === runId && 'bg-brand-primary/10',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-foreground">
                    {formatDate(entry.createdAt)} · {entry.country.toUpperCase()}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {entry.runBy} · {t('readiness.composite')} {entry.composite ?? '—'}/5 · {entry.dimensions} {t('readiness.dimensionsWord')}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <SourceDrawer source={source} onClose={() => setSource(null)} />
    </div>
  )
}

function StepRow({
  step,
  now,
  open,
  onToggle,
  onOpenSource,
}: {
  step: Step
  now: number
  open: boolean
  onToggle: () => void
  onOpenSource: (source: WebSourceView) => void
}) {
  const { t } = useI18n()
  const elapsed = step.status === 'running' && step.startedAt ? now - step.startedAt : step.durationMs
  const Icon = step.status === 'done' ? CheckCircle2 : step.status === 'error' ? AlertTriangle : step.status === 'running' ? Loader : Circle
  return (
    <li id={`step-${step.dimension}`} className="rounded-xl bg-secondary/40 text-[11px]">
      <details open={open} onToggle={(event) => { if (event.currentTarget.open !== open) onToggle() }} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2">
          <Icon
            className={cn(
              'h-3.5 w-3.5 shrink-0',
              step.status === 'done' && 'text-emerald-600 dark:text-emerald-400',
              step.status === 'error' && 'text-destructive',
              step.status === 'running' && 'animate-spin text-brand-primary dark:text-brand-primary-light',
              step.status === 'pending' && 'text-muted-foreground/50',
            )}
          />
          <span className="min-w-0 flex-1 truncate">{step.name}</span>
          <span className="shrink-0 text-muted-foreground">
            {step.status === 'pending' ? t('readiness.process.waiting') : step.status === 'running' ? t('readiness.process.running') : step.status === 'error' ? t('readiness.process.failed') : t('readiness.process.finished')}
          </span>
          <span className="w-14 shrink-0 text-right font-mono text-muted-foreground">{elapsed !== undefined ? seconds(elapsed) : ''}</span>
          {step.score && <span className="w-8 shrink-0 text-right font-semibold">{step.score.score}/5</span>}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 px-3 pb-3 pl-8 text-muted-foreground">
          {step.passages && (
            <p>
              {t('readiness.process.passages', { country: step.passages.country, global: step.passages.global })}
              {step.attempts ? ` · ${t('readiness.process.attempts', { count: step.attempts })}` : ''}
            </p>
          )}
          {step.webSources.length > 0 && (
            <div>
              <p className="font-semibold text-foreground">{t('readiness.process.web')}</p>
              <ul className="space-y-0.5">
                {step.webSources.map((source) => (
                  <li key={source.url} className="truncate">
                    <button type="button" className="truncate text-left text-brand-primary-dark hover:underline dark:text-brand-primary-light" onClick={() => onOpenSource({ ...source })}>
                      {source.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {step.reasoning && (
            <details className="rounded-lg bg-card p-2">
              <summary className="cursor-pointer font-semibold text-foreground">{t('readiness.process.reasoning')}</summary>
              <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed">{step.reasoning}</pre>
            </details>
          )}
          {step.score && (
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{t('readiness.process.output')}</p>
              <p>
                {step.score.score}/5 · {step.score.maturity}
              </p>
              {step.score.recommendations?.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4">
                  {step.score.recommendations.slice(0, 5).map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {step.error && <p className="text-destructive">{step.error}</p>}
        </div>
      </details>
    </li>
  )
}
