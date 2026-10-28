'use client'

import * as React from 'react'
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Circle, History, Loader, Waypoints } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select, cn } from '@sps/ui'
import { WORKFLOW_PROFILES } from '@sps/shared'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { SourceDrawer, type WebSourceView } from '@/components/ai/display/source-drawer'
import { ProcessGraph, type ProcessGraphStep, type ProcessState } from '@/components/workflow/process-graph'
import { ReadinessHistory } from '@/components/readiness-history'
import { useReadiness, type Step } from '@/components/readiness-context'

function seconds(ms: number | undefined): string {
  return ms === undefined ? '—' : `${(ms / 1000).toFixed(1)} s`
}

/** The page-title actions: the history toggle and the assessment button. */
export function ReadinessActions() {
  const { t } = useI18n()
  const { view, running, run, showHistory, showAssessment } = useReadiness()
  const inHistory = view === 'history'
  return (
    <div className="flex items-center gap-2">
      <Button
        variant={inHistory ? 'secondary' : 'ghost'}
        size="icon-sm"
        className="h-8 w-8 rounded-lg"
        aria-label={t('readiness.history')}
        aria-pressed={inHistory}
        title={t('readiness.history')}
        onClick={() => (inHistory ? showAssessment() : showHistory())}
      >
        <History className="h-4 w-4" />
      </Button>
      <Button onClick={() => void run()} disabled={running} size="sm">
        {running ? <Loader className="h-3.5 w-3.5 animate-spin" /> : null}
        {running ? t('readiness.running') : t('readiness.run')}
      </Button>
    </div>
  )
}

/** The assessment content: live process, result, what-if. The history replaces it when open. */
export function ReadinessPanel({ showStages = true }: { showStages?: boolean }) {
  const { t, locale } = useI18n()
  const { lens, country } = useWorkspace()
  const r = useReadiness()
  const profile = WORKFLOW_PROFILES[lens]
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const liveTotal = r.startedAt !== null && r.running ? r.now - r.startedAt : r.totalMs
  const doneSteps = r.steps.filter((step) => step.status === 'done' || step.status === 'error')

  // The process graph: start → web → one agent per dimension → synthesis → saved.
  const graphSteps: ProcessGraphStep[] = React.useMemo(() => {
    if (r.steps.length === 0) return []
    const everyAgentDone = r.steps.every((step) => step.status === 'done')
    const anyFailed = r.steps.some((step) => step.status === 'error')
    const webState: ProcessState = r.steps.some((step) => step.webSources.length > 0) ? 'success' : r.running ? 'running' : 'idle'
    const synthesisState: ProcessState = r.report ? 'success' : anyFailed ? 'failed' : everyAgentDone ? 'running' : 'idle'
    const webSources = r.steps.reduce((sum, step) => sum + step.webSources.length, 0)
    return [
      { id: 'start', kind: 'start', label: t('readiness.process.start'), state: r.running || r.report ? 'success' : 'idle', detail: `${country.toUpperCase()} · ${r.steps.length} ${t('readiness.dimensionsWord')}` },
      { id: 'web', kind: 'web', label: t('readiness.process.webNode'), state: webState, detail: `${webSources} ${t('readiness.process.sourcesCount')}`, from: ['start'] },
      ...r.steps.map((step) => ({
        id: `agent:${step.dimension}`,
        kind: 'agent' as const,
        label: step.name,
        state: (step.status === 'done' ? 'success' : step.status === 'error' ? 'failed' : step.status === 'running' ? 'running' : 'idle') as ProcessState,
        detail: step.score ? `${step.score.score}/5` : step.status === 'pending' ? t('readiness.process.waiting') : undefined,
        duration: step.durationMs !== undefined ? seconds(step.durationMs) : step.status === 'running' && step.startedAt ? seconds(r.now - step.startedAt) : undefined,
        from: ['web'],
      })),
      { id: 'synthesis', kind: 'synthesis', label: t('readiness.process.synthesis'), state: synthesisState, detail: r.report ? `${r.report.scenario?.composite ?? '—'}/5` : undefined, from: r.steps.map((step) => `agent:${step.dimension}`) },
      { id: 'saved', kind: 'saved', label: t('readiness.process.saved'), state: r.meta ? 'success' : 'idle', detail: r.meta ? formatDate(r.meta.createdAt) : undefined, from: ['synthesis'] },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.steps, r.report, r.meta, r.running, r.now, country, t])

  const selectNode = (id: string) => {
    if (id.startsWith('agent:')) r.openAgent(id.slice('agent:'.length))
  }

  const content = (
    <div className="space-y-6">
      {r.failure && <p className="text-[11px] text-destructive">{r.failure}</p>}

      {graphSteps.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{t('readiness.process.agents', { count: r.steps.length })}</span>
            <span>·</span>
            <span>{t('readiness.process.progress', { done: doneSteps.length, total: r.steps.length })}</span>
            {liveTotal !== undefined && (
              <>
                <span>·</span>
                <span className="font-mono">{seconds(liveTotal)}</span>
              </>
            )}
          </div>
          <ProcessGraph steps={graphSteps} onSelect={selectNode} />
          <ol className="space-y-1">
            {r.steps.map((step) => (
              <StepRow
                key={step.dimension}
                step={step}
                now={r.now}
                open={r.openIds.has(step.dimension)}
                onToggle={() => r.toggleStep(step.dimension)}
                onOpenSource={r.setSource}
              />
            ))}
          </ol>
        </section>
      )}

      {r.report && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {r.meta && <span>{formatDate(r.meta.createdAt)}</span>}
            {r.meta?.runBy && (
              <>
                <span>·</span>
                <span>{t('readiness.runBy', { who: r.meta.runBy })}</span>
              </>
            )}
            {r.totalMs !== undefined && (
              <>
                <span>·</span>
                <span>{t('readiness.duration', { seconds: (r.totalMs / 1000).toFixed(1) })}</span>
              </>
            )}
          </div>
          <p className="text-xs leading-relaxed text-foreground/90">{r.report.summary}</p>
          <div className="flex flex-wrap gap-4 text-[11px]">
            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 dark:bg-brand-primary-dark/30">
              {t('readiness.composite')}: <strong>{r.report.scenario?.composite ?? '—'}/5</strong>
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5">
              {t('readiness.average')}: <strong>{r.report.scenario?.overall ?? '—'}/5</strong>
            </span>
          </div>

          <div className="space-y-2">
            {r.report.scores?.map((score) => (
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
                value={r.change.dimension}
                onValueChange={(value) => r.setChange((state) => ({ ...state, dimension: value }))}
                options={(r.report.scores ?? []).map((score) => ({ value: score.dimension, label: score.dimensionName }))}
                className="min-w-0 flex-1 sm:w-56 sm:flex-none"
              />
              <Input
                type="number"
                step="0.5"
                value={r.change.delta}
                onChange={(event) => r.setChange((state) => ({ ...state, delta: Number(event.target.value) }))}
                className="h-8 w-20 text-[11px]"
                aria-label={t('readiness.delta')}
              />
              <Button onClick={() => void r.simulate()} disabled={r.running} size="sm" variant="secondary">
                {t('readiness.simulate')}
              </Button>
            </div>
            {r.whatIf && (
              <div className="mt-2 space-y-1 text-[11px]">
                <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{r.whatIf.narrative}</pre>
              </div>
            )}
          </div>
        </section>
      )}

      {!r.report && r.steps.length === 0 && <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{t('readiness.empty')}</p>}
    </div>
  )

  return (
    <>
      {r.view === 'history' ? (
        <ReadinessHistory runs={r.history} activeId={r.runId} onOpen={r.openSaved} onBack={r.showAssessment} />
      ) : showStages ? (
        <div className="grid gap-4 lg:grid-cols-3">
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
          <div className="min-w-0 lg:col-span-2">{content}</div>
        </div>
      ) : (
        content
      )}
      <SourceDrawer source={r.source} onClose={() => r.setSource(null)} />
    </>
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
