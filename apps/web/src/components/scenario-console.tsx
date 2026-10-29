'use client'

import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@sps/ui'
import type { Domain } from '@sps/shared'
import {
  api,
  type JointReportDto,
  type ScenarioAgendaItem,
  type ScenarioEventDto,
  type ScenarioRunSummaryDto,
} from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { ProcessingBar } from '@/components/processing-bar'
import { ScenarioHistory } from '@/components/scenario-history'
import { ScenarioCarousel, type ScenarioBlock } from '@/components/scenario-processes'

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
 * the first sector's batches one at a time (facilitator). Each sector is a process
 * in the carousel. The page shows the saved runs while nothing is played, and the
 * run as soon as one starts · opening a saved one hides the table too. A process
 * that finished is read-only, a failed one resumes from its last released tick.
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

  /** Releases the ticks of one process until the scenario ends (or stops on an error). */
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

  /** Opens a saved run as a process: finished runs read-only, others can go on. */
  const openRun = async (summary: ScenarioRunSummaryDto) => {
    setBusy(true)
    setError(null)
    try {
      const run = await api.scenarioRun(summary.id)
      const agenda = run.events.map((event) => ({
        sequence: event.sequence,
        releaseChunk: event.releaseChunk,
        title: event.title,
        visibleTo: event.visibleTo,
      }))
      const events: ScenarioEventDto[] = run.events
        .filter((event) => event.releaseChunk < run.released)
        .map((event) => ({
          id: `${run.id}-${event.sequence}`,
          sequence: event.sequence,
          releaseChunk: event.releaseChunk,
          title: event.title,
          payload: event.payload,
          visibleTo: event.visibleTo,
          createdAt: run.updatedAt,
        }))
      setShowHistory(false)
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
      setBlocks((previous) =>
        previous.map((block) => (block.runId === summary.id ? { ...block, done: false, failure: undefined } : block)),
      )
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
          <ScenarioCarousel blocks={blocks} busy={busy} onReleaseNext={(index) => void releaseNext(index)} />
        </>
      )}
    </section>
  )
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
