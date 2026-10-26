'use client'

import * as React from 'react'
import { ChevronRight, Download, GitMerge, Play, TriangleAlert } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@sps/ui'
import { api, type JointReportDto, type ScenarioAgendaItem } from '@/lib/api'

const SEVERITY: Record<string, string> = {
  low: 'text-muted-foreground',
  medium: 'text-amber-500',
  high: 'text-orange-500',
  critical: 'text-destructive',
}

function TickReport({ tick }: { tick: JointReportDto }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-black tracking-widest text-muted-foreground">TICK {tick.tick}</span>
        <span className="text-xs">{tick.summary}</span>
      </div>

      {tick.agreements.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-black tracking-widest text-primary">ACCORDS</p>
          <ul className="text-xs">
            {tick.agreements.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        </div>
      )}

      {tick.conflicts.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] font-black tracking-widest text-destructive">CONFLITS DE MANDATS</p>
          <ul className="space-y-1">
            {tick.conflicts.map((conflict) => (
              <li key={conflict.id} className="rounded-lg bg-secondary/60 p-2 text-xs">
                <div className="flex items-center gap-1">
                  <TriangleAlert className={cn('h-3.5 w-3.5', SEVERITY[conflict.severity])} />
                  <span className="font-semibold">
                    {conflict.between[0]} ↔ {conflict.between[1]}
                  </span>
                  <span className={cn('ml-auto uppercase', SEVERITY[conflict.severity])}>{conflict.severity}</span>
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
          <p className="text-[10px] font-black tracking-widest text-muted-foreground">QUESTIONS OUVERTES</p>
          <ul className="text-xs text-muted-foreground">
            {tick.openQuestions.map((q, i) => (
              <li key={i}>· {q}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-[10px] font-black tracking-widest text-muted-foreground">
        {tick.assessments.length} ÉVALUATION(S)
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
  domain: string
  onRunId?: (runId: string) => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [runId, setRunId] = React.useState<string | null>(null)
  const [agenda, setAgenda] = React.useState<ScenarioAgendaItem[]>([])
  const [reports, setReports] = React.useState<JointReportDto[]>([])
  const [released, setReleased] = React.useState(0)
  const [total, setTotal] = React.useState(0)
  const [done, setDone] = React.useState(false)

  const reset = () => {
    setRunId(null)
    setAgenda([])
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
      setTotal(result.ticks.length)
      setReleased(result.ticks.length)
      setDone(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Facilitator: start a session and release ticks one at a time (onBeforeRelease).
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

  return (
    <Card>
      <CardHeader>
        <GitMerge className="h-4 w-4 text-primary" />
        <CardTitle>MULTI-AGENT COORDINATION — HEALTH DATA BREACH</CardTitle>
        <div className="ml-auto flex items-center gap-2">
          {runId && done && (
            <>
              <a href={api.dossierUrl(runId, 'markdown')} target="_blank" rel="noreferrer">
                <Button variant="outline" size="md">
                  <Download className="h-3.5 w-3.5" /> Dossier (MD)
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
            Mode facilitateur
          </Button>
          <Button onClick={runAll} disabled={busy} size="md">
            <Play className="h-3.5 w-3.5" /> {busy ? 'Simulation…' : 'Lancer (auto)'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!runId && !busy && (
          <p className="text-sm text-muted-foreground">
            Libère les événements par blocs (information asymétrique), fait produire à chaque institution une
            évaluation indépendante, puis réconcilie le tout en détectant les conflits de mandats. Le mode
            facilitateur libère les blocs un à un (hook <code>onBeforeRelease</code>).
          </p>
        )}

        {runId && !done && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-secondary/60 p-2">
            <span className="text-xs text-muted-foreground">
              Tick {released}/{total}
              {nextAgenda ? ` — prochain : « ${nextAgenda.title} »` : ''}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {nextAgenda ? `vu par : ${nextAgenda.visibleTo.join(', ')}` : ''}
            </span>
            <Button onClick={releaseNext} disabled={busy} size="md" className="ml-auto">
              <ChevronRight className="h-3.5 w-3.5" /> Libérer l'événement suivant
            </Button>
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
