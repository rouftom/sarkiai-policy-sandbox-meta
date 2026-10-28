'use client'

/**
 * State of an AI-readiness assessment, shared by the page title (actions), the
 * history panel and the content. One run at a time; a saved run can be opened
 * at its own address (`runId`), and the history is a list of saved runs.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useWorkspace } from '@/lib/workspace'
import {
  api,
  type DimensionScoreDto,
  type ReadinessEventDto,
  type ReadinessReportDto,
  type ReadinessRunSummaryDto,
  type WhatIfResultDto,
} from '@/lib/api'
import type { WebSourceView } from '@/components/ai/display/source-drawer'

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
}

export interface RunMeta {
  id: string
  createdAt: string
  runBy: string
}

export type ReadinessView = 'assessment' | 'history'

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
  const { country, domain } = useWorkspace()
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
    setView('assessment')
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
    api
      .readinessRun(runId)
      .then((saved) => {
        if (cancelled) return
        setReport(saved.report)
        setMeta({ id: saved.id, createdAt: saved.createdAt, runBy: saved.runBy })
        setSteps(stepsFromReport(saved.report))
        setTotalMs(undefined)
        setWhatIf(null)
        setView('assessment')
      })
      .catch((caught) => {
        if (!cancelled) setFailure(caught instanceof Error ? caught.message : String(caught))
      })
    return () => {
      cancelled = true
    }
  }, [runId])

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

  const openSaved = (id: string) => {
    setView('assessment')
    router.push(`/readiness/${id}`)
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
  }
  return <ReadinessContext.Provider value={value}>{children}</ReadinessContext.Provider>
}

export function useReadiness(): ReadinessState {
  const context = React.useContext(ReadinessContext)
  if (!context) throw new Error('useReadiness must be used inside <ReadinessProvider>.')
  return context
}
