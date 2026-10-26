'use client'

import * as React from 'react'
import { ChevronRight, Download, GitMerge, Play, TriangleAlert } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@sps/ui'
import type { Domain } from '@sps/shared'
import {
  api,
  type JointReportDto,
  type ScenarioAgendaItem,
  type ScenarioEventDto,
} from '@/lib/api'
import { IncidentTimeline, type TimelineItem } from '@/components/incident-timeline'
import { useI18n } from '@/lib/i18n'

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
        <span className="text-[10px] font-black tracking-widest text-muted-foreground">
          {t('scenario.batch', { n: tick.tick + 1 })}
        </span>
        <span className="text-xs">{tick.summary}</span>
      </div>

      {tick.agreements.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-black tracking-widest text-primary">{t('scenario.agreements')}</p>
          <ul className="text-xs">
            {tick.agreements.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </div>
      )}

      {tick.conflicts.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-black tracking-widest text-destructive">{t('scenario.conflicts')}</p>
          <ul className="space-y-1">
            {tick.conflicts.map((conflict) => (
              <li key={conflict.id} className="rounded-lg bg-secondary/60 p-2 text-xs">
                <div className="flex items-center gap-1">
                  <TriangleAlert className={cn('h-3.5 w-3.5', SEVERITY[conflict.severity])} />
                  <span className="font-semibold">
                    {conflict.between[0]} ↔ {conflict.between[1]}
                  </span>
                  <span className={cn('ml-auto uppercase', SEVERITY[conflict.severity])}>
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
          <p className="text-[10px] font-black tracking-widest text-muted-foreground">
            {t('scenario.openQuestions')}
          </p>
          <ul className="text-xs text-muted-foreground">
            {tick.openQuestions.map((q, i) => (
              <li key={i}>· {q}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-[10px] font-black tracking-widest text-muted-foreground">
        {t('scenario.assessments', { count: tick.assessments.length })}
      </p>
    </div>
  )
}

export function ScenarioConsole({
  country,
  domain,
  onRunId,
}: {
  country: string
  domain: Domain
  onRunId?: (runId: string) => void
}) {
  const { t } = useI18n()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [runId, setRunId] = React.useState<string | null>(null)
  const [agenda, setAgenda] = React.useState<ScenarioAgendaItem[]>([])
  const [events, setEvents] = React.useState<ScenarioEventDto[]>([])
  const [reports, setReports] = React.useState<JointReportDto[]>([])
  const [released, setReleased] = React.useState(0)
  const [total, setTotal] = React.useState(0)
  const [done, setDone] = React.useState(false)

  const reset = () => {
    setRunId(null)
    setAgenda([])
    setEvents([])
    setReports([])
    setReleased(0)
    setTotal(0)
    setDone(false)
    setError(null)
  }

  const runAll = async () => {
    setBusy(true)
    setError(null)
    reset()
    try {
      const result = await api.runScenario({ id: 'health-data-breach', country, domain })
      setRunId(result.runId)
      onRunId?.(result.runId)
      setReports(result.ticks)
      setEvents(result.events)
      setTotal(result.ticks.length)
      setReleased(result.ticks.length)
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Facilitator: start a session and release batches one at a time (onBeforeRelease).
  const startFacilitated = async () => {
    setBusy(true)
    setError(null)
    reset()
    try {
      const start = await api.startScenario({ id: 'health-data-breach', country, domain })
      setRunId(start.runId)
      onRunId?.(start.runId)
      setAgenda(start.agenda)
      setTotal(start.totalTicks)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const releaseNext = async () => {
    if (!runId) return
    setBusy(true)
    setError(null)
    try {
      const tick = await api.nextTick(runId)
      if (tick.events.length) setEvents((prev) => [...prev, ...tick.events])
      if (tick.report) setReports((prev) => [...prev, tick.report as JointReportDto])
      setReleased(tick.releasedTicks)
      setDone(tick.done)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const nextAgenda = agenda.find((a) => a.releaseChunk === released)

  // Released payloads, indexed by sequence; the agenda provides the structure.
  const items: TimelineItem[] = React.useMemo(() => {
    const payloads = new Map(events.map((e) => [e.sequence, e.payload]))
    if (agenda.length > 0) {
      return agenda.map((a) => ({
        sequence: a.sequence,
        releaseChunk: a.releaseChunk,
        title: a.title,
        visibleTo: a.visibleTo,
        payload: payloads.get(a.sequence),
      }))
    }
    return events.map((e) => ({
      sequence: e.sequence,
      releaseChunk: e.releaseChunk,
      title: e.title,
      visibleTo: e.visibleTo,
      payload: e.payload,
    }))
  }, [agenda, events])

  return (
    <Card>
      <CardHeader>
        <GitMerge className="h-4 w-4 text-primary" />
        <CardTitle>{t('scenario.title')}</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          {runId && done && (
            <>
              <a href={api.dossierUrl(runId, 'markdown')} target="_blank" rel="noreferrer">
                <Button variant="outline" size="md">
                  <Download className="h-3.5 w-3.5" /> {t('scenario.dossier')}
                </Button>
              </a>
              <a href={api.dossierUrl(runId, 'json')} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="md">
                  JSON
                </Button>
              </a>
            </>
          )}
          <Button variant="outline" onClick={startFacilitated} disabled={busy} size="md">
            {t('scenario.facilitated')}
          </Button>
          <Button onClick={runAll} disabled={busy} size="md">
            <Play className="h-3.5 w-3.5" /> {busy ? t('scenario.running') : t('scenario.auto')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!runId && !busy && <p className="text-sm text-muted-foreground">{t('scenario.intro')}</p>}

        {runId && !done && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-secondary/60 p-2">
            <span className="text-xs text-muted-foreground">
              {t('scenario.progress', { released, total })}
              {nextAgenda ? ` — ${t('scenario.upNext', { title: nextAgenda.title })}` : ''}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {nextAgenda ? t('scenario.seenBy', { agents: nextAgenda.visibleTo.join(', ') }) : ''}
            </span>
            <Button onClick={releaseNext} disabled={busy} size="md" className="ml-auto">
              <ChevronRight className="h-3.5 w-3.5" /> {t('scenario.next')}
            </Button>
          </div>
        )}

        {items.length > 0 && (
          <div className="mb-3 rounded-xl border border-border p-3">
            <p className="mb-2 text-[10px] font-black tracking-widest text-primary">{t('scenario.timeline')}</p>
            <IncidentTimeline items={items} releasedChunks={released} totalTicks={total} domain={domain} />
          </div>
        )}

        <div className="space-y-3">
          {reports.map((tick) => (
            <TickReport key={tick.tick} tick={tick} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
