'use client'

import * as React from 'react'
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Circle, FileCheck2, Gauge, History, Loader, Waypoints } from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
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
  durationMs?: number
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

export function ReadinessPanel({ showStages = true }: { showStages?: boolean }) {
  const { t, locale } = useI18n()
  const { country, domain, lens } = useWorkspace()
  const [report, setReport] = React.useState<ReadinessReportDto | null>(null)
  const [meta, setMeta] = React.useState<RunMeta | null>(null)
  const [steps, setSteps] = React.useState<Step[]>([])
  const [running, setRunning] = React.useState(false)
  const [startedAt, setStartedAt] = React.useState<number | null>(null)
  const [totalMs, setTotalMs] = React.useState<number | undefined>(undefined)
  const now = useNow(running)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [history, setHistory] = React.useState<ReadinessRunSummaryDto[] | null>(null)
  const [whatIf, setWhatIf] = React.useState<WhatIfResultDto | null>(null)
  const [change, setChange] = React.useState<{ dimension: string; delta: number }>({ dimension: 'digital_infrastructure', delta: 1 })
  const [source, setSource] = React.useState<WebSourceView | null>(null)

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
    const started = Date.now()
    setStartedAt(started)
    try {
      const saved = await api.readinessStream({ country, domain, globalCountry: 'global' }, onEvent)
      setTotalMs(Date.now() - started)
      if (saved) setMeta({ id: saved.id, createdAt: saved.createdAt, runBy: saved.runBy, durationMs: Date.now() - started })
      setHistory(null)
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
    }
  }

  const openRun = async (id: string) => {
    try {
      const run = await api.readinessRun(id)
      setReport(run.report)
      setMeta({ id: run.id, createdAt: run.createdAt, runBy: run.runBy })
      setSteps([])
      setTotalMs(undefined)
      setWhatIf(null)
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const loadHistory = async () => {
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

  const liveTotal = startedAt !== null && running ? now - startedAt : totalMs
  const doneSteps = steps.filter((step) => step.status === 'done' || step.status === 'error')
  const agentsCount = steps.length

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
        <CardHeader>
          <FileCheck2 className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
          <CardTitle>{t('readiness.title')}</CardTitle>
          <DropdownMenu onOpenChange={(open) => open && void loadHistory()}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="h-7 w-7 rounded-lg" aria-label={t('readiness.history')} title={t('readiness.history')}>
                <History className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              <DropdownMenuLabel>{t('readiness.history')}</DropdownMenuLabel>
              {history === null && <DropdownMenuItem disabled>{t('readiness.historyLoading')}</DropdownMenuItem>}
              {history?.length === 0 && <DropdownMenuItem disabled>{t('readiness.historyEmpty')}</DropdownMenuItem>}
              {history?.map((entry) => (
                <DropdownMenuItem key={entry.id} onSelect={() => void openRun(entry.id)} className="flex-col items-start gap-0.5">
                  <span className="text-[11px] font-medium">
                    {formatDate(entry.createdAt)} · {entry.country.toUpperCase()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {entry.runBy} · {t('readiness.composite')} {entry.composite ?? '—'}/5
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={run} disabled={running} size="sm" className="ml-auto">
            {running ? <Loader className="h-3.5 w-3.5 animate-spin" /> : null}
            {running ? t('readiness.running') : t('readiness.run')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Live process: every evaluating agent, its state and its duration */}
          {steps.length > 0 && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span>{t('readiness.process.agents', { count: agentsCount })}</span>
                <span>·</span>
                <span>{t('readiness.process.progress', { done: doneSteps.length, total: agentsCount })}</span>
                {liveTotal !== undefined && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{seconds(liveTotal)}</span>
                  </>
                )}
              </div>
              <ol className="space-y-1">
                {steps.map((step) => (
                  <StepRow key={step.dimension} step={step} now={now} onOpenSource={setSource} />
                ))}
              </ol>
            </section>
          )}

          {/* Result: when, who ran it, the scores and the recommendations */}
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

          {!report && steps.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Gauge className="h-6 w-6 text-muted-foreground/50" />
              <p className="max-w-md text-xs text-muted-foreground">{t('readiness.empty')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <SourceDrawer source={source} onClose={() => setSource(null)} />
    </div>
  )
}

function StepRow({ step, now, onOpenSource }: { step: Step; now: number; onOpenSource: (source: WebSourceView) => void }) {
  const { t } = useI18n()
  const elapsed = step.status === 'running' && step.startedAt ? now - step.startedAt : step.durationMs
  const Icon = step.status === 'done' ? CheckCircle2 : step.status === 'error' ? AlertTriangle : step.status === 'running' ? Loader : Circle
  return (
    <li className="rounded-xl bg-secondary/40 text-[11px]">
      <details className="group">
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
                    <button
                      type="button"
                      className="truncate text-left text-brand-primary-dark hover:underline dark:text-brand-primary-light"
                      onClick={() => onOpenSource({ ...source, snippet: undefined })}
                    >
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
              {step.score.evidence?.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4">
                  {step.score.evidence.slice(0, 5).map((item, index) => (
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
