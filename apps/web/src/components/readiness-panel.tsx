'use client'

import * as React from 'react'
import { Activity, AlertTriangle, CheckCircle2, ChevronDown, Circle, Download, FileCheck2, ListChecks, Loader, Play, Plus, RotateCcw, Settings2, Waypoints, Workflow } from 'lucide-react'
import {
  AnimatedTabsList,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
  MultiSelect,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  type TabItem,
} from '@sps/ui'
import { READINESS_DIMENSIONS, flagOf, type Domain } from '@sps/shared'
import { type DimensionScoreDto, type ReadinessReportDto, type ReadinessReportFileDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { SourceDrawer, type WebSourceView } from '@/components/ai/display/source-drawer'
import { ProcessGraph, type ProcessGraphStep, type ProcessGraphView, type ProcessState } from '@/components/workflow/process-graph'
import { ReadinessHistory } from '@/components/readiness-history'
import { CollapsiblePanel } from '@/components/shared/collapsible-panel'
import { ICON_BUTTON_OUTLINE } from '@/components/icon-button-styles'
import { useReadiness, type ReadinessTab, type ReportFormat, type RunMeta, type SectorResult, type Step } from '@/components/readiness-context'

function seconds(ms: number | undefined): string {
  return ms === undefined ? 'n/a' : `${(ms / 1000).toFixed(1)} s`
}

/**
 * The page-title actions: a plus button that opens the settings of a new assessment,
 * with the start action and the way to resume an interrupted run.
 */
export function ReadinessActions() {
  const { t } = useI18n()
  const { running, run, creating, setCreating, openCreate, startDomains, setStartDomains, settings, resumable, resume } = useReadiness()
  const { sectors: sectorOptions } = useWorkspace()
  const start = () => {
    setCreating(false)
    void run()
  }
  return (
    <TooltipProvider>
    <div className="flex items-center gap-2">
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
            onClick={openCreate}
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
            <div className="mb-4 space-y-1.5">
              <p className="text-[12px] font-semibold text-foreground">{t('app.domains')}</p>
              <p className="text-[10px] text-muted-foreground">{t('readiness.sectors.max', { max: settings.maxDomains })}</p>
              <MultiSelect
                ariaLabel={t('app.domains')}
                values={startDomains}
                onValuesChange={(values) => setStartDomains(values as Domain[])}
                options={sectorOptions.map((value) => ({ value, label: t(`domain.${value}` as 'domain.health') }))}
                maxSelected={settings.maxDomains}
                className="w-full"
              />
            </div>
            <SettingsTab />
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('readiness.history.cancel')}
            </Button>
            <Button onClick={start} disabled={running || startDomains.length === 0}>
              <Play className="h-3.5 w-3.5" /> {t('readiness.start')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </TooltipProvider>
  )
}


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

export function ReadinessPanel() {
  const { t, locale } = useI18n()
  const { country } = useWorkspace()
  const r = useReadiness()
  const { tab, setTab } = r
  const lang: 'fr' | 'en' = locale === 'fr' ? 'fr' : 'en'
  const busy = r.loading || r.localizing
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const liveTotal = r.startedAt !== null && r.running ? r.now - r.startedAt : r.totalMs
  const doneSteps = r.steps.filter((step) => step.status === 'done' || step.status === 'error')

  /**
   * A series has one report per sector: the Result tab shows the comparison and the
   * report of the sector picked in a selector, since `report` is null for a series.
   */
  const series = r.lanes.length > 1
  /** A saved run of a series brings its sectors, even though it opens on one report. */
  const showComparison = r.batch.length > 1
  const [sectorView, setSectorView] = React.useState('')
  const lane = series ? r.lanes.find((entry) => entry.domain === sectorView) ?? r.lanes[0] : undefined
  const shownReport = series ? lane?.report ?? null : r.report
  const shownSteps = series ? lane?.steps ?? [] : r.steps
  const shownRunning = series ? r.running && !lane?.report : r.running
  React.useEffect(() => {
    if (series) r.resetWhatIf()
    // A projection belongs to the sector it was run on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectorView, series])

  const graphSteps: ProcessGraphStep[] = React.useMemo(
    () => processGraphOf({ steps: r.steps, report: r.report, meta: r.meta, running: r.running, now: r.now, country, t, formatDate }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [r.steps, r.report, r.meta, r.running, r.now, country, t],
  )

  const nodeInfo = (id: string | null): NodeInfo | null => nodeInfoOf(graphSteps, r.steps, id)

  const selectNode = React.useCallback((id: string) => r.setSelectedNode(id), [r.setSelectedNode])

  // The tabs and their counters show only an assessment: running, finished, or opened by its id.
  const hasAssessment = assessmentStarted(r)

  const graphViews = graphViewsOf(graphSteps, t)

  const progressSummary = (
    <>
      <span>{t('readiness.process.agents', { count: r.steps.length })}</span>
      {r.sectorProgress && r.sectorProgress.total > 1 && (
        <>
          <span>·</span>
          <span>
            {t('readiness.sector.progress', {
              n: r.sectorProgress.index + 1,
              total: r.sectorProgress.total,
              name: t(`domain.${r.sectorProgress.domain}` as 'domain.health'),
            })}
          </span>
        </>
      )}
      <span>·</span>
      <span>{t('readiness.process.progress', { done: doneSteps.length, total: r.steps.length })}</span>
      {liveTotal !== undefined && (
        <>
          <span>·</span>
          <span className="font-mono">{seconds(liveTotal)}</span>
        </>
      )}
    </>
  )

  // The graph is never replaced by the shimmer once it has steps: a localization or a
  // reload of a saved run must not make the process disappear from the tab.
  const processTab = busy && graphSteps.length === 0 ? <ShimmerLines /> : (
    <section className="space-y-3">
      {r.lanes.length > 1 ? (
        <LaneGraphs onOpenSteps={() => setTab('steps')} />
      ) : graphSteps.length > 0 ? (
        <CollapsiblePanel title={t('readiness.graph.title')} meta={progressSummary}>
          <ProcessGraph
            steps={graphSteps}
            views={graphViews}
            viewLabel={t('readiness.graph.view.label')}
            onSelect={selectNode}
            renderPopover={(id, close) => (
              <NodeCard info={nodeInfo(id)} close={close} onOpenSteps={() => { close(); setTab('steps') }} />
            )}
            className="h-[520px] rounded-none"
          />
        </CollapsiblePanel>
      ) : (
        <p className="py-16 text-center text-[11px] text-muted-foreground">{t('readiness.empty')}</p>
      )}
    </section>
  )

  const stepList = (steps: Step[]) => (
    <ol className="space-y-1">
      {steps.map((step) => (
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
  )

  const stepsTab = busy ? <ShimmerLines rows={6} /> : (
    <section className="space-y-2">
      {series ? (
        r.lanes.map((lane) => (
          <section key={lane.domain} className="space-y-1">
            <p className="text-[12px] font-semibold text-foreground">{t(`domain.${lane.domain}` as 'domain.health')}</p>
            {stepList(lane.steps)}
          </section>
        ))
      ) : (
        stepList(r.steps)
      )}
    </section>
  )

  const resultTab = busy ? <ShimmerLines rows={6} /> : (
    <section className="space-y-4">
      {showComparison && <SectorComparison batch={r.batch} />}
      {series && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{t('readiness.result.sector')}</span>
          <Select
            ariaLabel={t('readiness.result.sector')}
            value={lane?.domain ?? ''}
            onValueChange={setSectorView}
            options={r.lanes.map((entry) => ({ value: entry.domain, label: t(`domain.${entry.domain}` as 'domain.health') }))}
            size="sm"
            className="w-48"
          />
        </div>
      )}
      {!shownReport && shownSteps.some((step) => step.score) ? (
        <LiveScores steps={shownSteps} />
      ) : !shownReport && shownRunning ? (
        <ProcessingState />
      ) : shownReport ? (
        <ReportBody
          report={shownReport}
          meta={series ? null : r.meta}
          totalMs={series ? lane?.totalMs : r.totalMs}
          running={shownRunning}
          reportFile={series ? null : r.reportFile}
        />
      ) : null}
    </section>
  )

  const settingsTab = <SettingsTab />

  const assessment = (
    <>
      {r.failure && <p className="mb-3 text-[11px] text-destructive">{r.failure}</p>}
      {!hasAssessment ? (
        r.historyTotal === 0 && <EmptyAssessment />
      ) : (
        <Tabs value={tab} onValueChange={(value) => setTab(value as ReadinessTab)} className="space-y-4">
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
      {assessment}
      {!r.runId && !assessmentStarted(r) && !r.creating && (r.historyTotal === null || r.historyTotal > 0) && (
        <section className="mt-6">
          <CollapsiblePanel title={t('readiness.history')} contentClassName="p-3">
            <ReadinessHistory version={r.historyVersion} onOpen={r.openSaved} onDelete={r.deleteRun} deletingId={r.deletingId} />
          </CollapsiblePanel>
        </section>
      )}

      <SourceDrawer source={r.source} onClose={() => r.setSource(null)} />
    </>
  )
}

/** The report of one assessment or one sector of a series: situation, scores, generated file, what-if. */
function ReportBody({
  report,
  meta,
  totalMs,
  running,
  reportFile,
}: {
  report: ReadinessReportDto
  meta: RunMeta | null
  totalMs: number | undefined
  running: boolean
  reportFile: ReadinessReportFileDto | null
}) {
  const { t, locale } = useI18n()
  const r = useReadiness()
  const lang: 'fr' | 'en' = locale === 'fr' ? 'fr' : 'en'
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  const situation = report.situation?.[lang] ?? report.situation?.en ?? report.situation?.fr
  return (
    <>
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
      <div className="space-y-2 rounded-xl bg-secondary/40 p-4">
        <p className="flex items-center gap-2 text-[12px] font-semibold text-foreground">
          <span className="text-base leading-none" aria-hidden="true">{flagOf(report.country)}</span>
          {situation?.headline || t('readiness.situation.missing')}
        </p>
        {situation && <p className="text-xs leading-relaxed text-foreground/90">{situation.situation}</p>}
        {situation && <p className="text-[11px] leading-relaxed text-muted-foreground">{situation.context}</p>}
      </div>
      <div className="flex flex-wrap gap-4 text-[11px]">
        <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 dark:bg-brand-primary-dark/30">
          {t('readiness.composite')}: <strong>{report.scenario?.composite ?? 'n/a'}/5</strong>
        </span>
        <span className="rounded-full bg-secondary px-2 py-0.5">
          {t('readiness.average')}: <strong>{report.scenario?.overall ?? 'n/a'}/5</strong>
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

      {reportFile && (
        <div className="rounded-xl bg-secondary/40 p-3">
          <p className="text-[12px] font-semibold text-foreground">{t('readiness.report.title')}</p>
          <ul className="mt-3 space-y-1 text-[11px]">
            {reportFile.assets.map((asset) => (
              <li key={asset.kind} className="flex flex-wrap items-center gap-2">
                <Badge tone={asset.status === 'included' ? 'success' : asset.status === 'fallback' ? 'warning' : 'neutral'}>{asset.status}</Badge>
                <span className="font-medium">{t(`readiness.report.asset.${asset.kind}` as 'readiness.report.asset.chart')}</span>
                <span className="text-muted-foreground">{asset.tool ? `${asset.tool} · ` : ''}{asset.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-border bg-secondary/40 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          <Waypoints className="h-3.5 w-3.5" /> {t('readiness.whatIf')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            ariaLabel={t('readiness.dimension')}
            value={report.scores?.some((score) => score.dimension === r.change.dimension) ? r.change.dimension : report.scores?.[0]?.dimension ?? ''}
            onValueChange={(value) => r.setChange((state) => ({ ...state, dimension: value }))}
            options={(report.scores ?? []).map((score) => ({ value: score.dimension, label: score.dimensionName }))}
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
          <Button onClick={() => void r.simulate(report)} disabled={running || r.simulateBusy} size="sm" variant="secondary">
            {r.simulateBusy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : null}
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
  )
}

/** No assessment yet: the explanation and the way to start one. */
function EmptyAssessment() {
  const { t } = useI18n()
  const r = useReadiness()
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{t('readiness.empty')}</p>
      <Button size="sm" onClick={() => r.openCreate()}>
        <Plus className="h-3.5 w-3.5" /> {t('readiness.startNew')}
      </Button>
    </div>
  )
}

function assessmentStarted(r: ReturnType<typeof useReadiness>): boolean {
  // The sectors of a series each have a graph: the series is an assessment of its own,
  // even though its steps live in the lanes rather than in `steps`.
  return r.running || r.steps.length > 0 || r.report !== null || r.runId !== undefined || r.lanes.length > 0
}

/** Exports the open assessment's report, in the page header between the tabs and the plus button. Shown once there is a report. */
export function ReadinessExport() {
  const { t } = useI18n()
  const r = useReadiness()
  if (!r.report) return null
  const formats: Array<{ id: ReportFormat; label: string }> = [
    { id: 'html', label: 'HTML' },
    { id: 'markdown', label: 'Markdown' },
    { id: 'docx', label: 'Word' },
  ]
  return (
    <DropdownMenu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('readiness.report.generate')}
                disabled={r.reportBusy !== null}
                className={ICON_BUTTON_OUTLINE}
              >
                {r.reportBusy ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">{t('readiness.report.generate')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="end">
        {formats.map((format) => (
          <DropdownMenuItem key={format.id} onSelect={() => void r.generateReport(format.id)}>
            {format.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The tabs of the open assessment, in the page header before the actions. Shown once there is an assessment. */
export function ReadinessTabs() {
  const { t } = useI18n()
  const r = useReadiness()
  if (!assessmentStarted(r)) return null
  const items: TabItem[] = [
    { id: 'process', label: t('readiness.tab.process'), icon: Workflow },
    { id: 'steps', label: t('readiness.tab.steps'), icon: ListChecks },
    { id: 'result', label: t('readiness.tab.result'), icon: FileCheck2 },
    { id: 'settings', label: t('readiness.tab.settings'), icon: Settings2 },
  ]
  return (
    <div className="min-w-[260px] max-w-md">
      <AnimatedTabsList items={items} value={r.tab} onValueChange={(value) => r.setTab(value as ReadinessTab)} dense />
    </div>
  )
}

/** The sectors of the series side by side: one row per dimension, one column per sector. */
function SectorComparison({ batch }: { batch: SectorResult[] }) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-semibold text-foreground">{t('readiness.compare.title')}</p>
      <div className="overflow-x-auto rounded-xl bg-secondary/40 p-2">
        <table className="w-full min-w-[32rem] text-[11px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-2 py-1.5 font-medium">{t('readiness.compare.dimension')}</th>
              {batch.map((sector) => (
                <th key={sector.runId} className="px-2 py-1.5 font-medium">
                  {t(`domain.${sector.domain}` as 'domain.health')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {READINESS_DIMENSIONS.map((dimension) => (
              <tr key={dimension.shortName} className="border-t border-border/60">
                <td className="px-2 py-1.5">
                  <span className="mr-1.5 font-mono text-muted-foreground">D{dimension.id}</span>
                  {dimension.name}
                </td>
                {batch.map((sector) => {
                  const score = sector.scores.find((entry) => entry.dimension === dimension.shortName)
                  return (
                    <td key={sector.runId} className="px-2 py-1.5">
                      {score ? (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-secondary">
                            <span className="block h-full rounded-full bg-brand-primary dark:bg-brand-primary-light" style={{ width: `${(score.score / 5) * 100}%` }} />
                          </span>
                          <span className="font-semibold">{score.score}/5</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-border font-semibold">
              <td className="px-2 py-1.5">{t('readiness.compare.composite')}</td>
              {batch.map((sector) => (
                <td key={sector.runId} className="px-2 py-1.5">
                  {sector.composite === null ? '—' : `${sector.composite}/5`}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Waiting for the first result of a running assessment. */
function ProcessingState() {
  const { t } = useI18n()
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center text-[11px] text-muted-foreground">
      <Loader className="h-6 w-6 animate-spin text-brand-primary dark:text-brand-primary-light" aria-hidden="true" />
      <p>{t('readiness.processing')}</p>
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
type Translate = ReturnType<typeof useI18n>['t']

/** The process of one assessment as a graph: start, web search, one node per dimension, synthesis, saved. */
function processGraphOf({
  steps,
  report,
  meta,
  running,
  now,
  country,
  t,
  formatDate,
}: {
  steps: Step[]
  report: ReadinessReportDto | null
  meta: RunMeta | null
  running: boolean
  now: number
  country: string
  t: Translate
  formatDate: (iso: string) => string
}): ProcessGraphStep[] {
  if (steps.length === 0) return []
  const everyAgentDone = steps.every((step) => step.status === 'done')
  const anyFailed = steps.some((step) => step.status === 'error')
  const webState: ProcessState = steps.some((step) => step.webSources.length > 0) ? 'success' : running ? 'running' : 'idle'
  const synthesisState: ProcessState = report ? 'success' : anyFailed ? 'failed' : everyAgentDone ? 'running' : 'idle'
  const webSources = steps.reduce((sum, step) => sum + step.webSources.length, 0)
  return [
    { id: 'start', kind: 'start', label: t('readiness.process.start'), state: running || report ? 'success' : 'idle', detail: `${country.toUpperCase()} · ${steps.length} ${t('readiness.dimensionsWord')}` },
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
    { id: 'synthesis', kind: 'synthesis', label: t('readiness.process.synthesis'), state: synthesisState, detail: report ? `${report.scenario?.composite ?? 'n/a'}/5` : undefined, from: steps.map((step) => `agent:${step.dimension}`) },
    { id: 'saved', kind: 'saved', label: t('readiness.process.saved'), state: meta ? 'success' : 'idle', detail: meta ? formatDate(meta.createdAt) : undefined, from: ['synthesis'] },
  ]
}

/** The views a process graph can frame: the whole process, the search, the dimensions, the synthesis. */
function graphViewsOf(graph: ProcessGraphStep[], t: Translate): ProcessGraphView[] {
  const agentIds = graph.filter((node) => node.kind === 'agent').map((node) => node.id)
  return [
    { id: 'all', label: t('readiness.graph.view.all') },
    { id: 'web', label: t('readiness.graph.view.web'), nodes: ['start', 'web'] },
    { id: 'dimensions', label: t('readiness.graph.view.dimensions'), nodes: ['web', ...agentIds] },
    { id: 'synthesis', label: t('readiness.graph.view.synthesis'), nodes: [...agentIds, 'synthesis', 'saved'] },
  ]
}

function nodeInfoOf(graph: ProcessGraphStep[], steps: Step[], id: string | null): NodeInfo | null {
  if (!id) return null
  const node = graph.find((entry) => entry.id === id)
  if (!node) return null
  const step = node.kind === 'agent' ? steps.find((entry) => `agent:${entry.dimension}` === id) : undefined
  return { id, kind: node.kind, label: node.label, state: node.state, detail: node.detail, duration: node.duration, step }
}

/** Several sectors at once: one process graph per sector, all moving together. */
function LaneGraphs({ onOpenSteps }: { onOpenSteps: () => void }) {
  const { t, locale } = useI18n()
  const r = useReadiness()
  const { country } = useWorkspace()
  const formatDate = (iso: string) => new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="space-y-5">
      {r.lanes.map((lane) => {
        const graph = processGraphOf({
          steps: lane.steps,
          report: lane.report,
          meta: null,
          running: r.running && !lane.report,
          now: r.now,
          country,
          t,
          formatDate,
        })
        return (
          <CollapsiblePanel
            key={lane.domain}
            title={t(`domain.${lane.domain}` as 'domain.health')}
            meta={lane.report ? t('readiness.process.finished') : t('readiness.process.running')}
          >
            <ProcessGraph
              steps={graph}
              views={graphViewsOf(graph, t)}
              viewLabel={t('readiness.graph.view.label')}
              onSelect={(id) => r.setSelectedNode(id)}
              renderPopover={(id, close) => (
                <NodeCard info={nodeInfoOf(graph, lane.steps, id)} close={close} onOpenSteps={() => { close(); onOpenSteps() }} />
              )}
              className="h-[420px] rounded-none"
            />
          </CollapsiblePanel>
        )
      })}
    </div>
  )
}

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
      control: <Select ariaLabel={t('readiness.settings.task.corpus')} value="agentic" onValueChange={() => {}} options={[{ value: 'agentic', label: 'Agentic search · same model as evaluation' }]} disabled size="md" className="w-full" />,
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
  const locked = r.running
  return (
    <fieldset
      disabled={locked}
      aria-describedby={locked ? 'readiness-settings-locked' : undefined}
      className={cn('min-w-0 space-y-4', locked && 'pointer-events-none opacity-60')}
    >
      {locked && (
        <p id="readiness-settings-locked" className="rounded-xl bg-secondary/60 px-3 py-2 text-[11px] text-muted-foreground">
          {t('readiness.settings.locked')}
        </p>
      )}
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
            <label className="space-y-1 text-[11px] sm:col-span-2">
              <span className="text-muted-foreground">{t('readiness.settings.concurrency')}</span>
              <Select
                ariaLabel={t('readiness.settings.concurrency')}
                value={r.settings.concurrency}
                onValueChange={(value) => r.setSettings({ concurrency: value as 'parallel' | 'sequential' | 'orchestrated' })}
                options={[
                  { value: 'parallel', label: t('readiness.settings.concurrency.parallel') },
                  { value: 'sequential', label: t('readiness.settings.concurrency.sequential') },
                  { value: 'orchestrated', label: t('readiness.settings.concurrency.orchestrated') },
                ]}
                size="md"
                className="w-full"
              />
            </label>
            {r.settings.concurrency === 'orchestrated' && (
              <label className="space-y-1 text-[11px]">
                <span className="text-muted-foreground">{t('readiness.settings.maxDecisions')}</span>
                <Select
                  ariaLabel={t('readiness.settings.maxDecisions')}
                  value={String(r.settings.maxDecisions)}
                  onValueChange={(value) => r.setSettings({ maxDecisions: Number(value) })}
                  options={[5, 10, 20, 30, 50].map((value) => ({ value: String(value), label: String(value) }))}
                  size="md"
                  className="w-full"
                />
              </label>
            )}
            <label className="space-y-1 text-[11px]">
              <span className="text-muted-foreground">{t('readiness.settings.maxDomains')}</span>
              <Select
                ariaLabel={t('readiness.settings.maxDomains')}
                value={String(r.settings.maxDomains)}
                onValueChange={(value) => r.setSettings({ maxDomains: Number(value) })}
                options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }))}
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
    </fieldset>
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
          {step.decision && (
            <p>
              <span className="font-semibold text-foreground">{t('readiness.process.lead')}:</span> {step.decision}
            </p>
          )}
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
