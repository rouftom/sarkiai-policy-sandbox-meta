'use client'

/**
 * State of an AI-readiness assessment, shared by the page title (actions), the
 * history panel and the content. One run at a time; a saved run can be opened
 * at its own address (`runId`), and the history is a list of saved runs.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspace } from '@/lib/workspace'
import { READINESS_DIMENSIONS, type Domain } from '@sps/shared'
import {
  api,
  type DimensionScoreDto,
  type ReadinessEventDto,
  type ReadinessLangDto,
  type ReadinessReportDto,
  type ReadinessReportFileDto,
  type ReadinessRunSummaryDto,
  type ReadinessSettingsDto,
  type WhatIfResultDto,
} from '@/lib/api'
import type { WebSourceView } from '@/components/ai/display/source-drawer'
import { useI18n } from '@/lib/i18n'

export type ReportFormat = 'markdown' | 'html' | 'docx'

/** Whether every dimension already has its text in `lang`. */
function hasLanguage(scores: DimensionScoreDto[], lang: ReadinessLangDto): boolean {
  return scores.every((score) => Boolean(score.localized?.[lang]))
}

/** What the operator chose for the next assessment (kept on this device). */
export interface ReadinessSettings {
  dimensions: string[]
  perDimensionK: number
  useWeb: boolean
  reasoningEffort: 'low' | 'medium' | 'high'
  /** The chat model per task; an empty value means the operator's default model. */
  models: { webSearch?: string; evaluate?: string; synthesis?: string; report?: string }
  /** The dimensions are evaluated at the same time (default) or one after another. */
  concurrency: 'parallel' | 'sequential' | 'orchestrated'
  /** Orchestrated mode: the most decisions the lead agent may take. */
  maxDecisions: number
  /** The most sectors one assessment may cover (one assessment per sector). */
  maxDomains: number
}

const SETTINGS_KEY = 'sps.readiness.settings'
const ALL_DIMENSIONS = READINESS_DIMENSIONS.map((dimension) => dimension.shortName)
const DEFAULT_SETTINGS: ReadinessSettings = { dimensions: ALL_DIMENSIONS, perDimensionK: 5, useWeb: true, reasoningEffort: 'low', models: {}, concurrency: 'parallel', maxDecisions: 20, maxDomains: 5 }

function downloadFile(file: ReadinessReportFileDto) {
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

export type StepStatus = 'pending' | 'running' | 'done' | 'error'

/** One evaluating agent (one dimension) as the process shows it. */
export interface Step {
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
  /** Why the lead agent chose this step (orchestrated mode). */
  decision?: string
}

export interface RunMeta {
  id: string
  createdAt: string
  runBy: string
}

export type ReadinessView = 'assessment' | 'history'

/** The comparison line of one saved assessment of a series. */
function sectorResultOf(run: { id: string; domain: string; report: ReadinessReportDto }): SectorResult {
  return {
    runId: run.id,
    domain: run.domain as Domain,
    scores: run.report.scores,
    composite: run.report.scenario?.composite ?? null,
  }
}

/** One sector of the current series, once its assessment is saved. */
export interface SectorResult {
  runId: string
  domain: Domain
  scores: DimensionScoreDto[]
  composite: number | null
}

/** An interrupted assessment that can be resumed where it stopped. */
export interface Resumable {
  id: string
  completed: number
  total: number
  dimensions: string[]
}

/** One step per selected dimension, all waiting: the process is drawn before the first event. */
function pendingSteps(dimensions: string[]): Step[] {
  return READINESS_DIMENSIONS.filter((dimension) => dimensions.includes(dimension.shortName)).map((dimension) => ({
    dimension: dimension.shortName,
    dimensionId: dimension.id,
    name: dimension.name,
    status: 'pending',
    webSources: [],
    reasoning: '',
  }))
}

/** The steps of an interrupted run: the dimensions already scored are done, the others wait. */
function stepsFromScores(scores: DimensionScoreDto[], dimensions: string[]): Step[] {
  return pendingSteps(dimensions).map((step) => {
    const score = scores.find((entry) => entry.dimension === step.dimension)
    return score ? { ...step, status: 'done' as const, score, webSources: score.webSources ?? [] } : step
  })
}

interface ReadinessState {
  report: ReadinessReportDto | null
  meta: RunMeta | null
  steps: Step[]
  running: boolean
  startedAt: number | null
  totalMs: number | undefined
  now: number
  failure: string | null
  view: ReadinessView
  history: ReadinessRunSummaryDto[] | null
  whatIf: WhatIfResultDto | null
  change: { dimension: string; delta: number }
  source: WebSourceView | null
  openIds: Set<string>
  runId?: string
  setChange: React.Dispatch<React.SetStateAction<{ dimension: string; delta: number }>>
  setSource: (source: WebSourceView | null) => void
  run: () => Promise<void>
  showHistory: () => void
  showAssessment: () => void
  openSaved: (id: string) => void
  simulate: () => Promise<void>
  toggleStep: (id: string) => void
  openAgent: (dimension: string) => void
  settings: ReadinessSettings
  setSettings: (patch: Partial<ReadinessSettings>) => void
  /** The chat model the operator selected: what the agents reason with. */
  model: string
  /** The chat models the operator may choose for a task. */
  chatModels: Array<{ id: string }>
  /** The node whose details are open in the popup. */
  selectedNode: string | null
  setSelectedNode: (id: string | null) => void
  /** The format being generated, so only its button shows the loader. */
  reportBusy: ReportFormat | null
  reportFile: ReadinessReportFileDto | null
  /** The interrupted assessment that can be resumed, if any. */
  resumable: Resumable | null
  resume: () => Promise<void>
  generateReport: (format: ReportFormat) => Promise<void>
  /** A saved assessment is being opened. */
  loading: boolean
  /** The saved assessment being deleted, while the request runs. */
  deletingId: string | null
  /** The dialog for the settings of a new assessment is open. */
  creating: boolean
  setCreating: (open: boolean) => void
  /** Opens the dialog with the sectors of the workspace selected. */
  openCreate: () => void
  /** The sectors the next assessment covers: one assessment per sector, run one after another. */
  startDomains: Domain[]
  setStartDomains: (domains: Domain[]) => void
  /** The sector being assessed while several are run. */
  sectorProgress: { index: number; total: number; domain: Domain } | null
  /** The sectors of the current series, finished so far (for the comparison). */
  batch: SectorResult[]
  deleteRun: (id: string) => Promise<void>
  /** A language is being added to a saved assessment. */
  localizing: boolean
}

const ReadinessContext = React.createContext<ReadinessState | null>(null)

/** Seconds since mount, refreshed while a run is live. */
function useNow(active: boolean): number {
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

/** The steps of a finished run, rebuilt from its report (per-step timings are not stored). */
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

export function ReadinessProvider({ runId, children }: { runId?: string; children: React.ReactNode }) {
  const router = useRouter()
  const { country, domain, domains: workspaceDomains } = useWorkspace()
  const [report, setReport] = React.useState<ReadinessReportDto | null>(null)
  const [meta, setMeta] = React.useState<RunMeta | null>(null)
  const [steps, setSteps] = React.useState<Step[]>([])
  const [running, setRunning] = React.useState(false)
  const [startedAt, setStartedAt] = React.useState<number | null>(null)
  const [totalMs, setTotalMs] = React.useState<number | undefined>(undefined)
  const now = useNow(running)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [view, setView] = React.useState<ReadinessView>('assessment')
  const [history, setHistory] = React.useState<ReadinessRunSummaryDto[] | null>(null)
  const [whatIf, setWhatIf] = React.useState<WhatIfResultDto | null>(null)
  const [change, setChange] = React.useState<{ dimension: string; delta: number }>({ dimension: 'digital_infrastructure', delta: 1 })
  const [source, setSource] = React.useState<WebSourceView | null>(null)
  const [openIds, setOpenIds] = React.useState<Set<string>>(new Set())
  const [settings, setSettingsState] = React.useState<ReadinessSettings>(DEFAULT_SETTINGS)
  const [model, setModel] = React.useState('')
  const [chatModels, setChatModels] = React.useState<Array<{ id: string }>>([])
  const [selectedNode, setSelectedNode] = React.useState<string | null>(null)
  const [reportBusy, setReportBusy] = React.useState<ReportFormat | null>(null)
  const [reportFile, setReportFile] = React.useState<ReadinessReportFileDto | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [localizing, setLocalizing] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [startDomains, setStartDomains] = React.useState<Domain[]>([])
  const [sectorProgress, setSectorProgress] = React.useState<{ index: number; total: number; domain: Domain } | null>(null)
  const [batch, setBatch] = React.useState<SectorResult[]>([])
  /** The report the last `done` event carried, read when the sector is saved. */
  const doneReport = React.useRef<ReadinessReportDto | null>(null)
  const [resumable, setResumable] = React.useState<Resumable | null>(null)
  const { locale } = useI18n()
  const lang: ReadinessLangDto = locale === 'fr' ? 'fr' : 'en'
  const attempted = React.useRef(new Set<string>())

  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SETTINGS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<ReadinessSettings>
        setSettingsState({ ...DEFAULT_SETTINGS, ...parsed, models: { ...DEFAULT_SETTINGS.models, ...(parsed.models ?? {}) } })
      }
    } catch {
      /* malformed: keep the defaults */
    }
    api
      .models()
      .then((result) => {
        setModel(result.selected)
        setChatModels(result.models.map((entry) => ({ id: entry.id })))
      })
      .catch(() => {})
  }, [])

  const setSettings = (patch: Partial<ReadinessSettings>) =>
    setSettingsState((current) => {
      const next = { ...current, ...patch }
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
      return next
    })

  const generateReport = async (format: ReportFormat) => {
    const id = meta?.id ?? runId
    if (!id || reportBusy) return
    setReportBusy(format)
    setFailure(null)
    try {
      const file = await api.readinessReport(id, format, lang)
      setReportFile(file)
      downloadFile(file)
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setReportBusy(null)
    }
  }

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
    } else if (event.type === 'restored') {
      patchStep(event.dimension, { status: 'done', score: event.score, webSources: event.score.webSources ?? [], reasoning: '' })
    } else if (event.type === 'decision') {
      if (event.dimension) patchStep(event.dimension, { decision: event.hint ? `${event.reason} — ${event.hint}` : event.reason })
    } else if (event.type === 'failed') {
      if (event.runId) {
        setResumable({
          id: event.runId,
          completed: event.completed ?? 0,
          total: event.total ?? ALL_DIMENSIONS.length,
          dimensions: settings.dimensions,
        })
      }
      setFailure(event.message)
    } else if (event.type === 'done') {
      doneReport.current = event.report as ReadinessReportDto
      setReport(event.report as ReadinessReportDto)
    }
  }

  /** The dialog opens with the workspace sectors, within the maximum the settings allow. */
  const openCreate = () => {
    setStartDomains(workspaceDomains.slice(0, Math.max(1, settings.maxDomains)))
    setCreating(true)
  }

  /**
   * One assessment per chosen sector, one after another: each is saved on its own
   * and listed in the history. A failure stops the list; the run that failed can be resumed.
   */
  const run = async () => {
    const sectors = startDomains.slice(0, Math.max(1, settings.maxDomains))
    if (sectors.length === 0) return
    setRunning(true)
    setView('assessment')
    setWhatIf(null)
    setFailure(null)
    setReport(null)
    setMeta(null)
    setResumable(null)
    setOpenIds(new Set())
    setBatch([])
    // One series id for the sectors run together: their assessments are compared later.
    const batchId = sectors.length > 1 ? crypto.randomUUID() : undefined
    const saved: ReadinessRunSummaryDto[] = []
    try {
      for (const [index, sector] of sectors.entries()) {
        setSectorProgress({ index, total: sectors.length, domain: sector })
        setReport(null)
        setSteps(pendingSteps(settings.dimensions))
        const started = Date.now()
        setStartedAt(started)
        doneReport.current = null
        const finished = await api.readinessStream(
          {
            country,
            domain: sector,
            globalCountry: 'global',
            dimensions: settings.dimensions.length === ALL_DIMENSIONS.length ? undefined : settings.dimensions,
            perDimensionK: settings.perDimensionK,
            useWeb: settings.useWeb,
            reasoningEffort: settings.reasoningEffort,
            concurrency: settings.concurrency,
            ...(settings.concurrency === 'orchestrated' ? { maxDecisions: settings.maxDecisions, language: lang } : {}),
            ...(batchId ? { batchId } : {}),
            models: {
              ...(settings.models.webSearch ? { webSearch: settings.models.webSearch } : {}),
              ...(settings.models.evaluate ? { evaluate: settings.models.evaluate } : {}),
            },
          } satisfies { country: string; domain: string; globalCountry: string } & ReadinessSettingsDto,
          onEvent,
        )
        setTotalMs(Date.now() - started)
        if (!finished) break
        saved.push(finished)
        // Written by the stream callback, so read with its declared type.
        const result = doneReport.current as ReadinessReportDto | null
        if (result) {
          setBatch((current) => [
            ...current,
            { runId: finished.id, domain: sector, scores: result.scores, composite: result.scenario?.composite ?? null },
          ])
        }
        setMeta({ id: finished.id, createdAt: finished.createdAt, runBy: finished.runBy })
      }
      setHistory(null)
      const last = saved[saved.length - 1]
      if (last) router.replace(`/readiness/${last.id}`)
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSectorProgress(null)
      setRunning(false)
    }
  }

  /** Continues an interrupted assessment: the dimensions already scored are kept. */
  const resume = async () => {
    if (!resumable || running) return
    const { id, dimensions } = resumable
    const kept = report?.scores ?? []
    setRunning(true)
    setView('assessment')
    setWhatIf(null)
    setFailure(null)
    setReport(null)
    setMeta(null)
    setBatch([])
    setSteps(stepsFromScores(kept, dimensions))
    setOpenIds(new Set())
    const started = Date.now()
    setStartedAt(started)
    try {
      const saved = await api.readinessResume(id, onEvent)
      setTotalMs(Date.now() - started)
      if (saved) {
        setMeta({ id: saved.id, createdAt: saved.createdAt, runBy: saved.runBy })
        setResumable(null)
        router.replace(`/readiness/${saved.id}`)
      }
      setHistory(null)
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
    }
  }

  // A saved assessment, opened at its own address.
  React.useEffect(() => {
    if (!runId) return
    let cancelled = false
    setLoading(true)
    api
      .readinessRun(runId)
      .then((saved) => {
        if (cancelled) return
        setReport(saved.report)
        setBatch([])
        // A run of a series brings the whole series, so its sectors can be compared.
        if (saved.batchId) {
          api
            .readinessBatch(saved.batchId)
            .then((series) => {
              if (!cancelled) setBatch(series.runs.map(sectorResultOf))
            })
            .catch(() => {
              /* the run stays on screen without the comparison */
            })
        }
        setMeta({ id: saved.id, createdAt: saved.createdAt, runBy: saved.runBy })
        setTotalMs(undefined)
        setWhatIf(null)
        setView('assessment')
        if (saved.status === 'failed') {
          const dimensions = saved.input?.dimensions ?? ALL_DIMENSIONS
          setSteps(stepsFromScores(saved.report.scores, dimensions))
          setResumable({ id: saved.id, completed: saved.report.scores.length, total: dimensions.length, dimensions })
          setFailure(saved.failure ?? null)
        } else {
          setSteps(stepsFromReport(saved.report))
          setResumable(null)
        }
      })
      .catch((caught) => {
        if (!cancelled) setFailure(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => setLoading(false))
    return () => {
      cancelled = true
    }
  }, [runId])

  // An assessment saved before this language existed gets it once, then keeps it.
  const savedId = meta?.id
  React.useEffect(() => {
    if (!savedId || !report || running || hasLanguage(report.scores, lang)) return
    const key = `${savedId}:${lang}`
    if (attempted.current.has(key)) return
    attempted.current.add(key)
    let cancelled = false
    setLocalizing(true)
    api
      .readinessLocalize(savedId, lang)
      .then((saved) => {
        if (!cancelled) setReport(saved.report)
      })
      .catch(() => {
        /* the saved language stays on screen */
      })
      .finally(() => setLocalizing(false))
    return () => {
      cancelled = true
    }
  }, [savedId, lang, report, running])

  const loadHistory = React.useCallback(async () => {
    try {
      setHistory((await api.readinessRuns()).runs)
    } catch {
      setHistory([])
    }
  }, [])

  const showHistory = () => {
    setView('history')
    void loadHistory()
  }

  const showAssessment = () => setView('assessment')

  const deleteRun = async (id: string) => {
    setDeletingId(id)
    setFailure(null)
    try {
      await api.readinessDelete(id)
      setHistory((current) => current?.filter((entry) => entry.id !== id) ?? null)
      setResumable((current) => (current?.id === id ? null : current))
      if ((meta?.id ?? runId) === id) {
        setReport(null)
        setMeta(null)
        setSteps([])
        router.replace('/readiness')
      }
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setDeletingId(null)
    }
  }

  const openSaved = (id: string) => {
    setView('assessment')
    router.push(`/readiness/${id}`)
  }

  const simulate = async () => {
    if (!report) return
    try {
      setWhatIf(await api.whatIf({ country, domain: report.domain || domain, changes: { [change.dimension]: change.delta }, scores: report.scores }))
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

  const openAgent = (dimension: string) => {
    setOpenIds((previous) => new Set(previous).add(dimension))
    document.getElementById(`step-${dimension}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const value: ReadinessState = {
    report,
    meta,
    steps,
    running,
    startedAt,
    totalMs,
    now,
    failure,
    view,
    history,
    whatIf,
    change,
    source,
    openIds,
    runId,
    setChange,
    setSource,
    run,
    showHistory,
    showAssessment,
    openSaved,
    simulate,
    toggleStep,
    openAgent,
    settings,
    setSettings,
    model,
    chatModels,
    selectedNode,
    setSelectedNode,
    reportBusy,
    reportFile,
    generateReport,
    resumable,
    resume,
    loading,
    localizing,
    deletingId,
    deleteRun,
    creating,
    setCreating,
    openCreate,
    startDomains,
    setStartDomains,
    sectorProgress,
    batch,
  }
  return <ReadinessContext.Provider value={value}>{children}</ReadinessContext.Provider>
}

export function useReadiness(): ReadinessState {
  const context = React.useContext(ReadinessContext)
  if (!context) throw new Error('useReadiness must be used inside <ReadinessProvider>.')
  return context
}
