'use client'

import * as React from 'react'
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Circle, Download, FileCheck2, History, ListChecks, Loader, Play, Plus, RotateCcw, Settings2, Waypoints, Workflow } from 'lucide-react'
import {
  AnimatedTabsList,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  Switch,
  Tabs,
  TabsContent,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  type TabItem,
} from '@sps/ui'
import { READINESS_DIMENSIONS, WORKFLOW_PROFILES, flagOf } from '@sps/shared'
import { type DimensionScoreDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { SourceDrawer, type WebSourceView } from '@/components/ai/display/source-drawer'
import { ProcessGraph, type ProcessGraphStep, type ProcessState } from '@/components/workflow/process-graph'
import { ReadinessHistory } from '@/components/readiness-history'
import { useReadiness, type Step } from '@/components/readiness-context'

function seconds(ms: number | undefined): string {
  return ms === undefined ? 'n/a' : `${(ms / 1000).toFixed(1)} s`
}

/**
 * The page-title actions: the history toggle (pressed while it is shown) and a
 * plus button that opens the settings of a new assessment, with the start action.
 */
export function ReadinessActions() {
  const { t } = useI18n()
  const { view, running, run, showHistory, showAssessment, creating, setCreating, resumable, resume } = useReadiness()
  const inHistory = view === 'history'
  const start = () => {
    setCreating(false)
    void run()
  }
  return (
    <TooltipProvider>
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            aria-label={t('readiness.history')}
            aria-pressed={inHistory}
            onClick={() => (inHistory ? showAssessment() : showHistory())}
            className={cn(
              'h-8 w-8 rounded-lg transition-colors',
              inHistory
                ? 'bg-brand-primary text-white shadow-sm hover:bg-brand-primary/90'
                : 'bg-transparent text-muted-foreground hover:bg-brand-primary/10 hover:text-brand-primary dark:hover:text-brand-primary-light',
            )}
          >
            <History className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">{t('readiness.history')}</TooltipContent>
      </Tooltip>
      {resumable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              aria-label={t('readiness.resume')}
              disabled={running}
              onClick={() => void resume()}
              className="h-8 w-8 rounded-lg bg-transparent text-brand-primary hover:bg-brand-primary/10"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">
            {t('readiness.resume')} · {resumable.completed}/{resumable.total}
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            aria-label={t('readiness.new')}
            disabled={running}
            onClick={() => setCreating(true)}
            className="h-8 w-8 rounded-lg bg-brand-primary text-white shadow-sm hover:bg-brand-primary/90"
          >
            {running ? <Loader className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">{t('readiness.new')}</TooltipContent>
      </Tooltip>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl p-0"
        >
          <DialogHeader className="border-b border-border px-5 py-3">
            <DialogTitle className="text-sm font-semibold">{t('readiness.newTitle')}</DialogTitle>
            <DialogDescription className="text-[11px]">{t('readiness.newDescription')}</DialogDescription>
          </DialogHeader>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
            <SettingsTab />
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('readiness.history.cancel')}
            </Button>
            <Button onClick={start} disabled={running}>
              <Play className="h-3.5 w-3.5" /> {t('readiness.start')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  )
}

type Tab = 'process' | 'steps' | 'result' | 'settings'

/** Details of one node of the process, shown in a popup when the node is clicked. */
interface NodeInfo {
  id: string
  kind: ProcessGraphStep['kind']
  label: string
  state: ProcessState
  detail?: string
  duration?: string
  step?: Step
}

const NODE_KINDS: ProcessGraphStep['kind'][] = ['start', 'web', 'agent', 'synthesis', 'saved']

/** The written part of a dimension in the console's language, as the API keeps it. */
function textOf(score: DimensionScoreDto, lang: 'fr' | 'en') {
  return (
    score.localized?.[lang] ?? {
      summary: score.summary ?? '',
      evidence: score.evidence,
      gaps: score.gaps,
      recommendations: score.recommendations,
    }
  )
}

/** Placeholder lines shown while a tab's content is loading. */
function ShimmerLines({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 py-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="shimmer h-10 rounded-lg bg-secondary" style={{ width: `${100 - index * 12}%` }} />
      ))}
    </div>
  )
}

export function ReadinessPanel({ showStages = true }: { showStages?: boolean }) {
  const { t, locale } = useI18n()
  const { lens, country } = useWorkspace()
  const r = useReadiness()
  const [tab, setTab] = React.useState<Tab>('process')
  const lang: 'fr' | 'en' = locale === 'fr' ? 'fr' : 'en'
  const busy = r.loading || r.localizing
  const situation = r.report?.situation?.[lang] ?? r.report?.situation?.en ?? r.report?.situation?.fr
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
      { id: 'synthesis', kind: 'synthesis', label: t('readiness.process.synthesis'), state: synthesisState, detail: r.report ? `${r.report.scenario?.composite ?? 'n/a'}/5` : undefined, from: r.steps.map((step) => `agent:${step.dimension}`) },
      { id: 'saved', kind: 'saved', label: t('readiness.process.saved'), state: r.meta ? 'success' : 'idle', detail: r.meta ? formatDate(r.meta.createdAt) : undefined, from: ['synthesis'] },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.steps, r.report, r.meta, r.running, r.now, country, t])

  const nodeInfo = (id: string | null): NodeInfo | null => {
    if (!id) return null
    const node = graphSteps.find((entry) => entry.id === id)
    if (!node) return null
    const step = node.kind === 'agent' ? r.steps.find((entry) => `agent:${entry.dimension}` === id) : undefined
    return { id, kind: node.kind, label: node.label, state: node.state, detail: node.detail, duration: node.duration, step }
  }

  const selectNode = (id: string) => r.setSelectedNode(id)

  // The tabs and their counters show only an assessment: running, finished, or opened by its id.
  const hasAssessment = r.running || r.steps.length > 0 || r.report !== null || r.runId !== undefined

  const processTab = busy ? <ShimmerLines /> : (
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
      {graphSteps.length > 0 ? (
        <ProcessGraph
          steps={graphSteps}
          onSelect={selectNode}
          renderPopover={(id, close) => (
            <NodeCard info={nodeInfo(id)} close={close} onOpenSteps={() => { close(); setTab('steps') }} />
          )}
        />
      ) : (
        <p className="py-16 text-center text-[11px] text-muted-foreground">{t('readiness.empty')}</p>
      )}
    </section>
  )

  const stepsTab = busy ? <ShimmerLines rows={6} /> : (
    <section className="space-y-2">
      {r.steps.length === 0 && <p className="py-16 text-center text-[11px] text-muted-foreground">{t('readiness.empty')}</p>}
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
  )

  const resultTab = busy ? <ShimmerLines rows={6} /> : (
    <section className="space-y-4">
      {!r.report && r.steps.some((step) => step.score) ? (
        <LiveScores steps={r.steps} />
      ) : !r.report ? (
        <p className="py-16 text-center text-[11px] text-muted-foreground">{t('readiness.empty')}</p>
      ) : (
        <>
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
          <div className="space-y-2 rounded-xl bg-secondary/40 p-4">
            <p className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
              <span className="text-base leading-none" aria-hidden="true">{flagOf(r.report.country)}</span>
              {situation?.headline || t('readiness.situation.missing')}
            </p>
            {situation && <p className="text-xs leading-relaxed text-foreground/90">{situation.situation}</p>}
            {situation && <p className="text-[11px] leading-relaxed text-muted-foreground">{situation.context}</p>}
          </div>
          <div className="flex flex-wrap gap-4 text-[11px]">
            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 dark:bg-brand-primary-dark/30">
              {t('readiness.composite')}: <strong>{r.report.scenario?.composite ?? 'n/a'}/5</strong>
            </span>
            <span className="rounded-full bg-secondary px-2 py-0.5">
              {t('readiness.average')}: <strong>{r.report.scenario?.overall ?? 'n/a'}/5</strong>
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
                  {textOf(score, lang).recommendations?.length > 0 && (
                    <div>
                      <p className="font-semibold">{t('readiness.recommendations')}</p>
                      <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {textOf(score, lang).recommendations.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {textOf(score, lang).gaps?.length > 0 && (
                    <div>
                      <p className="font-semibold">{t('readiness.gaps')}</p>
                      <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                        {textOf(score, lang).gaps.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>

          <div className="rounded-xl bg-secondary/40 p-3">
            <p className="text-[12px] font-semibold text-foreground">{t('readiness.report.title')}</p>
            <p className="mb-3 text-[11px] text-muted-foreground">{t('readiness.report.hint')}</p>
            <div className="flex flex-wrap items-center gap-2">
              {(['html', 'markdown', 'docx'] as const).map((format) => (
                <Button
                  key={format}
                  size="sm"
                  variant={format === 'html' ? undefined : 'secondary'}
                  onClick={() => void r.generateReport(format)}
                  disabled={r.reportBusy !== null}
                  aria-busy={r.reportBusy === format}
                >
                  {r.reportBusy === format ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  {format === 'html' ? `${t('readiness.report.generate')} · HTML` : format === 'markdown' ? 'Markdown' : 'Word'}
                </Button>
              ))}
            </div>
            {r.reportFile && (
              <ul className="mt-3 space-y-1 text-[11px]">
                {r.reportFile.assets.map((asset) => (
                  <li key={asset.kind} className="flex flex-wrap items-center gap-2">
                    <Badge tone={asset.status === 'included' ? 'success' : asset.status === 'fallback' ? 'warning' : 'neutral'}>{asset.status}</Badge>
                    <span className="font-medium">{t(`readiness.report.asset.${asset.kind}` as 'readiness.report.asset.chart')}</span>
                    <span className="text-muted-foreground">{asset.tool ? `${asset.tool} · ` : ''}{asset.message}</span>
                  </li>
                ))}
              </ul>
            )}
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
        </>
      )}
    </section>
  )

  const settingsTab = <SettingsTab />

  const tabs: TabItem[] = [
    { id: 'process', label: t('readiness.tab.process'), icon: Workflow },
    { id: 'steps', label: t('readiness.tab.steps'), icon: ListChecks },
    { id: 'result', label: t('readiness.tab.result'), icon: FileCheck2 },
    { id: 'settings', label: t('readiness.tab.settings'), icon: Settings2 },
  ]

  const assessment = (
    <>
      {r.failure && <p className="mb-3 text-[11px] text-destructive">{r.failure}</p>}
      {!hasAssessment ? (
        <EmptyAssessment />
      ) : (
        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="space-y-4">
          <AnimatedTabsList items={tabs} value={tab} onValueChange={(value) => setTab(value as Tab)} dense />
          <TabsContent value="process">{processTab}</TabsContent>
          <TabsContent value="steps">{stepsTab}</TabsContent>
          <TabsContent value="result">{resultTab}</TabsContent>
          <TabsContent value="settings">{settingsTab}</TabsContent>
        </Tabs>
      )}
    </>
  )

  return (
    <>
      {r.view === 'history' ? (
        <>
          {r.failure && <p className="mb-3 text-[11px] text-destructive">{r.failure}</p>}
          <ReadinessHistory runs={r.history} activeId={r.runId} onOpen={r.openSaved} onDelete={r.deleteRun} deletingId={r.deletingId} />
        </>
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
          <div className="min-w-0 lg:col-span-2">{assessment}</div>
        </div>
      ) : (
        assessment
      )}

      <SourceDrawer source={r.source} onClose={() => r.setSource(null)} />
    </>
  )
}

/** No assessment yet: the explanation and the way to start one. */
function EmptyAssessment() {
  const { t } = useI18n()
  const r = useReadiness()
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{t('readiness.empty')}</p>
      <Button size="sm" onClick={() => r.setCreating(true)}>
        <Plus className="h-3.5 w-3.5" /> {t('readiness.startNew')}
      </Button>
    </div>
  )
}

/** The dimensions finished so far, while the assessment is still running. */
function LiveScores({ steps }: { steps: Step[] }) {
  const { t, locale } = useI18n()
  const done = steps.filter((step) => step.score)
  const lang: 'fr' | 'en' = locale === 'fr' ? 'fr' : 'en'
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">{t('readiness.live.partial', { done: done.length, total: steps.length })}</p>
      {done.map((step) => (
        <details key={step.dimension} className="group rounded-xl bg-secondary/40 p-2 text-[11px]">
          <summary className="flex cursor-pointer list-none items-center gap-2">
            <span className="w-8 shrink-0 text-muted-foreground">D{step.dimensionId}</span>
            <span className="min-w-0 flex-1 truncate">{step.name}</span>
            <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-brand-primary dark:bg-brand-primary-light" style={{ width: `${((step.score?.score ?? 0) / 5) * 100}%` }} />
            </span>
            <span className="w-8 shrink-0 text-right font-semibold">{step.score?.score}/5</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-2 pl-10 text-[11px]">
            <p className="text-muted-foreground">{step.score?.maturity}</p>
            {step.score && textOf(step.score, lang).recommendations.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {textOf(step.score, lang).recommendations.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
      ))}
    </div>
  )
}

/** The card of one node, shown next to the node as a dropdown: state, model, what it does. */
function NodeCard({ info, close, onOpenSteps }: { info: NodeInfo | null; close: () => void; onOpenSteps: () => void }) {
  const { t } = useI18n()
  const r = useReadiness()
  if (!info) return null
  const step = info.step
  const stateLabel =
    info.state === 'success'
      ? t('readiness.process.finished')
      : info.state === 'running'
        ? t('readiness.process.running')
        : info.state === 'failed'
          ? t('readiness.process.failed')
          : t('readiness.process.waiting')
  return (
    <>
      <div className="flex items-start gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-foreground">{info.label}</p>
          <p className="text-[10px] text-muted-foreground">{t(`readiness.node.kind.${info.kind}` as 'readiness.node.kind.start')}</p>
        </div>
        <button type="button" onClick={close} aria-label={t('common.close')} className="rounded-md px-1.5 text-[14px] leading-none text-muted-foreground hover:bg-secondary hover:text-foreground">
          ×
        </button>
      </div>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-[11px]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-secondary/60 p-2.5">
          <dt className="text-muted-foreground">{t('readiness.node.state')}</dt>
          <dd className="font-medium">{stateLabel}</dd>
          {info.duration && (
            <>
              <dt className="text-muted-foreground">{t('readiness.node.duration')}</dt>
              <dd className="font-mono">{info.duration}</dd>
            </>
          )}
          {info.detail && (
            <>
              <dt className="text-muted-foreground">{t('readiness.node.result')}</dt>
              <dd>{info.detail}</dd>
            </>
          )}
          {info.kind !== 'start' && info.kind !== 'saved' && (
            <>
              <dt className="text-muted-foreground">{t('readiness.node.model')}</dt>
              <dd className="truncate font-mono text-[10px]">{info.kind === 'web' ? `web_search · ${r.settings.models.webSearch || r.model || 'n/a'}` : info.kind === 'agent' ? r.settings.models.evaluate || r.model || 'n/a' : r.settings.models.synthesis || r.model || 'n/a'}</dd>
            </>
          )}
        </dl>

        <section className="space-y-1">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('readiness.node.doesTitle')}</h3>
          <p className="leading-relaxed text-foreground/90">{t(`readiness.node.does.${info.kind}` as 'readiness.node.does.start')}</p>
        </section>

        {step && (
          <section className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('readiness.node.inputs')}</h3>
            <p className="text-muted-foreground">
              {step.passages ? t('readiness.process.passages', { country: step.passages.country, global: step.passages.global }) : 'n/a'}
              {step.webSources.length > 0 ? ` · ${step.webSources.length} ${t('readiness.process.sourcesCount')}` : ''}
            </p>
            <p className="text-muted-foreground">{t('readiness.node.settingsLine', { k: r.settings.perDimensionK, effort: r.settings.reasoningEffort, web: r.settings.useWeb ? 'on' : 'off' })}</p>
          </section>
        )}

        {step?.score && (
          <section className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('readiness.node.outputs')}</h3>
            <p>
              {step.score.score}/5 · {step.score.maturity} · {Math.round(step.score.confidence * 100)} %
            </p>
            {step.score.recommendations?.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                {step.score.recommendations.slice(0, 4).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        {step && step.reasoning && (
          <section className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('readiness.process.reasoning')}</h3>
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-secondary/60 p-2 font-sans text-[10px] leading-relaxed">{step.reasoning}</pre>
          </section>
        )}

        {step && (
          <div className="flex justify-end pt-1">
            <Button variant="secondary" size="sm" onClick={onOpenSteps}>
              {t('readiness.node.openSteps')}
            </Button>
          </div>
        )}
      </div>
    </>
  )
}

/** Choices for the next assessment: the agents by task and their models, the search, the dimensions. */
function SettingsTab() {
  const { t } = useI18n()
  const r = useReadiness()
  const allSelected = r.settings.dimensions.length === READINESS_DIMENSIONS.length
  const chatOptions = [{ value: '', label: `${t('readiness.settings.default')} · ${r.model || 'n/a'}` }, ...r.chatModels.map((entry) => ({ value: entry.id, label: entry.id }))]
  const setModel = (task: 'webSearch' | 'evaluate' | 'synthesis' | 'report', value: string) =>
    r.setSettings({ models: { ...r.settings.models, [task]: value || undefined } })
  const toggleDimension = (id: string) => {
    const has = r.settings.dimensions.includes(id)
    if (has && r.settings.dimensions.length === 1) return
    const next = has ? r.settings.dimensions.filter((entry) => entry !== id) : [...r.settings.dimensions, id]
    r.setSettings({ dimensions: READINESS_DIMENSIONS.map((dimension) => dimension.shortName).filter((entry) => next.includes(entry)) })
  }
  const rows: Array<{ key: string; task: string; agent: string; control: React.ReactNode }> = [
    {
      key: 'retrieval',
      task: t('readiness.settings.task.corpus'),
      agent: t('readiness.settings.agent.corpus'),
      control: <Select ariaLabel={t('readiness.settings.task.corpus')} value="voyage-4" onValueChange={() => {}} options={[{ value: 'voyage-4', label: 'voyage-4 · embeddings · rerank-2' }]} disabled size="md" className="w-full" />,
    },
    {
      key: 'webSearch',
      task: t('readiness.settings.task.web'),
      agent: t('readiness.settings.agent.web'),
      control: <Select ariaLabel={t('readiness.settings.task.web')} value={r.settings.models.webSearch ?? ''} onValueChange={(value) => setModel('webSearch', value)} options={chatOptions} size="md" className="w-full" />,
    },
    {
      key: 'evaluate',
      task: t('readiness.settings.task.evaluate'),
      agent: t('readiness.settings.agent.evaluate'),
      control: <Select ariaLabel={t('readiness.settings.task.evaluate')} value={r.settings.models.evaluate ?? ''} onValueChange={(value) => setModel('evaluate', value)} options={chatOptions} size="md" className="w-full" />,
    },
    {
      key: 'synthesis',
      task: t('readiness.settings.task.synthesis'),
      agent: t('readiness.settings.agent.synthesis'),
      control: (
        <div className="space-y-1">
          <Select ariaLabel={t('readiness.settings.task.synthesis')} value={r.settings.models.synthesis ?? ''} onValueChange={(value) => setModel('synthesis', value)} options={chatOptions} size="md" className="w-full" />
          <p className="text-[10px] text-muted-foreground">{t('readiness.settings.synthesisNote')}</p>
        </div>
      ),
    },
    {
      key: 'report',
      task: t('readiness.settings.task.report'),
      agent: t('readiness.settings.agent.report'),
      control: <Select ariaLabel={t('readiness.settings.task.report')} value="muse-image-1.0" onValueChange={() => {}} options={[{ value: 'muse-image-1.0', label: 'muse-image-1.0 · cover · charts MCP · docx MCP' }]} disabled size="md" className="w-full" />,
    },
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-xl bg-secondary/40 p-4">
        <h3 className="text-[12px] font-semibold text-foreground">{t('readiness.settings.agents')}</h3>
        <p className="text-[11px] text-muted-foreground">{t('readiness.settings.agentsHint')}</p>
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.key} className="space-y-1.5 rounded-lg bg-card p-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium text-foreground">{row.task}</p>
                <p className="truncate text-[10px] text-muted-foreground">{row.agent}</p>
              </div>
              {row.control}
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-4">
        <section className="space-y-4 rounded-xl bg-secondary/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-foreground">{t('readiness.settings.web')}</p>
              <p className="text-[11px] text-muted-foreground">{t('readiness.settings.webHint')}</p>
            </div>
            <Switch checked={r.settings.useWeb} onCheckedChange={(checked) => r.setSettings({ useWeb: checked })} aria-label={t('readiness.settings.web')} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-[11px]">
              <span className="text-muted-foreground">{t('readiness.settings.passages')}</span>
              <Select
                ariaLabel={t('readiness.settings.passages')}
                value={String(r.settings.perDimensionK)}
                onValueChange={(value) => r.setSettings({ perDimensionK: Number(value) })}
                options={[3, 5, 8].map((value) => ({ value: String(value), label: String(value) }))}
                size="md"
                className="w-full"
              />
            </label>
            <label className="space-y-1 text-[11px]">
              <span className="text-muted-foreground">{t('readiness.settings.effort')}</span>
              <Select
                ariaLabel={t('readiness.settings.effort')}
                value={r.settings.reasoningEffort}
                onValueChange={(value) => r.setSettings({ reasoningEffort: value as 'low' | 'medium' | 'high' })}
                options={[
                  { value: 'low', label: 'low' },
                  { value: 'medium', label: 'medium' },
                  { value: 'high', label: 'high' },
                ]}
                size="md"
                className="w-full"
              />
            </label>
          </div>
          <div className="space-y-3 border-t border-border/60 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold text-foreground">{t('readiness.settings.dimensions')}</h3>
              <button
                type="button"
                className="text-[11px] font-semibold text-brand-primary hover:underline disabled:opacity-40 dark:text-brand-primary-light"
                onClick={() => r.setSettings({ dimensions: READINESS_DIMENSIONS.map((dimension) => dimension.shortName) })}
                disabled={allSelected}
              >
                {t('readiness.settings.all')}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {READINESS_DIMENSIONS.map((dimension) => (
                <label key={dimension.shortName} className="flex cursor-pointer items-center gap-2 rounded-lg bg-card px-3 py-2 text-[11px]">
                  <input
                    type="checkbox"
                    checked={r.settings.dimensions.includes(dimension.shortName)}
                    onChange={() => toggleDimension(dimension.shortName)}
                    className="h-3.5 w-3.5 accent-brand-primary"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    D{dimension.id} · {dimension.name}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">{t('readiness.settings.atLeastOne')}</p>
          </div>
        </section>
      </div>
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
  const { t, locale } = useI18n()
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
              {textOf(step.score, locale === 'fr' ? 'fr' : 'en').recommendations.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-4">
                  {textOf(step.score, locale === 'fr' ? 'fr' : 'en').recommendations.slice(0, 5).map((item, index) => (
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
