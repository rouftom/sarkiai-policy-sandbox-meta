'use client'

import * as React from 'react'
import { Activity, FileCheck2, Gauge, Waypoints } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Select } from '@sps/ui'
import { WORKFLOW_PROFILES } from '@sps/shared'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { api, type ReadinessReportDto, type WhatIfResultDto } from '@/lib/api'

/** AI-readiness scoring + what-if, shared by the console and its dedicated page. */
export function ReadinessPanel({ showStages = true }: { showStages?: boolean }) {
  const { t } = useI18n()
  const { country, domain, lens } = useWorkspace()
  const [report, setReport] = React.useState<ReadinessReportDto | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [whatIf, setWhatIf] = React.useState<WhatIfResultDto | null>(null)
  const [change, setChange] = React.useState<{ dimension: string; delta: number }>({
    dimension: 'digital_infrastructure',
    delta: 1,
  })

  const profile = WORKFLOW_PROFILES[lens]

  const run = async () => {
    setBusy(true)
    setWhatIf(null)
    try {
      setReport(await api.readiness({ country, domain, globalCountry: 'global' }))
    } finally {
      setBusy(false)
    }
  }

  const simulate = async () => {
    if (!report) return
    setBusy(true)
    try {
      setWhatIf(
        await api.whatIf({
          country,
          domain,
          changes: { [change.dimension]: change.delta },
          scores: report.scores,
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
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
                <span
                  className={
                    enabled
                      ? 'font-medium text-brand-primary dark:text-brand-primary-light'
                      : 'text-muted-foreground/50'
                  }
                >
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
          <Button onClick={run} disabled={busy} size="sm" className="ml-auto">
            {busy
              ? t('readiness.running')
              : t('readiness.run', {
                  country: country.toUpperCase(),
                  domain: t(`domain.${domain}` as 'domain.health'),
                })}
          </Button>
        </CardHeader>
        <CardContent>
          {report && (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-foreground/90">{report.summary}</p>
              <div className="flex gap-4 text-[11px]">
                <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 dark:bg-brand-primary-dark/30">
                  {t('readiness.composite')}: <strong>{report.scenario?.composite ?? '—'}/5</strong>
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5">
                  {t('readiness.average')}: <strong>{report.scenario?.overall ?? '—'}/5</strong>
                </span>
              </div>

              <div className="space-y-1">
                {report.scores?.map((score) => (
                  <div key={score.dimension} className="flex items-center gap-2 text-[11px]">
                    <span className="w-8 shrink-0 text-muted-foreground">D{score.dimensionId}</span>
                    <span className="min-w-0 flex-1 truncate">{score.dimensionName}</span>
                    <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-secondary">
                      <span
                        className="block h-full rounded-full bg-brand-primary dark:bg-brand-primary-light"
                        style={{ width: `${(score.score / 5) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right font-semibold">{score.score}/5</span>
                    <span className="hidden w-28 shrink-0 text-right text-muted-foreground sm:block">
                      {score.maturity}
                    </span>
                  </div>
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
                    options={(report.scores ?? []).map((score) => ({
                      value: score.dimension,
                      label: score.dimensionName,
                    }))}
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
                  <Button onClick={simulate} disabled={busy} size="sm" variant="secondary">
                    {t('readiness.simulate')}
                  </Button>
                </div>

                {whatIf && (
                  <div className="mt-2 space-y-1 text-[11px]">
                    <pre className="whitespace-pre-wrap font-sans text-muted-foreground">{whatIf.narrative}</pre>
                    <ul className="space-y-0.5">
                      {whatIf.projected
                        .filter((projection) => projection.causalEffect)
                        .map((projection) => (
                          <li key={projection.dimension} className="text-muted-foreground">
                            → {projection.dimensionName} : {projection.causalEffect! >= 0 ? '+' : ''}
                            {projection.causalEffect} → {projection.score}/5
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
          {!report && !busy && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Gauge className="h-6 w-6 text-muted-foreground/50" />
              <p className="max-w-md text-xs text-muted-foreground">{t('readiness.empty')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
