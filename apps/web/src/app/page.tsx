'use client'

import * as React from 'react'
import { Activity, FileCheck2, Moon, Sun, Waypoints } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@sps/ui'
import { WORKFLOW_PROFILES, type Domain, type WorkflowLens } from '@sps/shared'
import { LensSelector } from '@/components/lens-selector'
import { ScenarioConsole } from '@/components/scenario-console'
import { AuditPanel } from '@/components/audit-panel'
import { FloatingAssistant } from '@/components/floating-assistant'
import { GazettePanel } from '@/components/gazette-panel'
import { LocaleSwitcher } from '@/components/locale-switcher'
import { ProviderBadge } from '@/components/provider-badge'
import { useTheme } from '@/components/theme-provider'
import { useI18n } from '@/lib/i18n'
import { api, type ReadinessReportDto, type WhatIfResultDto } from '@/lib/api'

const DOMAINS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

export default function HomePage() {
  const { mode, toggleMode, packId, packs, setPack } = useTheme()
  const { locale, t } = useI18n()
  const [lens, setLens] = React.useState<WorkflowLens>('hybrid')
  const [country, setCountry] = React.useState('cm')
  const [domain, setDomain] = React.useState<Domain>('health')
  const [report, setReport] = React.useState<ReadinessReportDto | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [runId, setRunId] = React.useState<string | null>(null)

  const [wChange, setWChange] = React.useState<{ dimension: string; delta: number }>({ dimension: 'digital_infrastructure', delta: 1 })
  const [whatIf, setWhatIf] = React.useState<WhatIfResultDto | null>(null)

  const profile = WORKFLOW_PROFILES[lens]

  const runReadiness = async () => {
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
          changes: { [wChange.dimension]: wChange.delta },
          scores: report.scores,
        }),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="container py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-gradient-brand text-2xl font-black tracking-tight">SarkiAI Policy Sandbox</h1>
          <p className="text-xs text-muted-foreground">{t('app.tagline')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProviderBadge />
          <select
            aria-label={t('app.theme')}
            value={packId}
            onChange={(e) => setPack(e.target.value)}
            className="h-8 rounded-xl border border-border bg-transparent px-2 text-[11px]"
          >
            {packs.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name[locale]}
              </option>
            ))}
          </select>
          <LocaleSwitcher />
          <Button variant="ghost" size="icon" aria-label={t('app.toggleTheme')} onClick={toggleMode}>
            {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <section className="mb-6 flex flex-wrap items-center gap-3">
        <LensSelector value={lens} onChange={setLens} />
        <select
          aria-label={t('app.country')}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="h-8 rounded-xl border border-border bg-transparent px-2 text-[11px]"
        >
          <option value="cm">{t('country.cm')}</option>
          <option value="ae">{t('country.ae')}</option>
        </select>
        <select
          aria-label={t('app.domain')}
          value={domain}
          onChange={(e) => setDomain(e.target.value as Domain)}
          className="h-8 rounded-xl border border-border bg-transparent px-2 text-[11px]"
        >
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {t(`domain.${d}` as 'domain.health')}
            </option>
          ))}
        </select>
      </section>

      <p className="mb-6 max-w-3xl text-sm text-muted-foreground">
        {t(`lens.${lens}.description` as 'lens.hybrid.description')}
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <Activity className="h-4 w-4 text-primary" />
            <CardTitle>{t('workflow.stages')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {Object.entries(profile.stages).map(([stage, enabled]) => (
              <div key={stage} className="flex items-center justify-between">
                <span className="text-muted-foreground">{stage}</span>
                <span className={enabled ? 'text-primary' : 'text-muted-foreground/50'}>
                  {enabled ? t('workflow.on') : t('workflow.off')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <FileCheck2 className="h-4 w-4 text-primary" />
            <CardTitle>{t('readiness.title')}</CardTitle>
            <Button onClick={runReadiness} disabled={busy} size="md" className="ml-auto">
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
                <p className="text-sm">{report.summary}</p>
                <div className="flex gap-4 text-xs">
                  <span>
                    {t('readiness.composite')}: <strong>{report.scenario?.composite ?? '—'}/5</strong>
                  </span>
                  <span>
                    {t('readiness.average')}: <strong>{report.scenario?.overall ?? '—'}/5</strong>
                  </span>
                </div>

                <div className="space-y-1">
                  {report.scores?.map((score) => (
                    <div key={score.dimension} className="flex items-center gap-2 text-xs">
                      <span className="w-8 shrink-0 text-muted-foreground">D{score.dimensionId}</span>
                      <span className="min-w-0 flex-1 truncate">{score.dimensionName}</span>
                      <span className="shrink-0 font-semibold">{score.score}/5</span>
                      <span className="w-32 shrink-0 text-right text-muted-foreground">{score.maturity}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-border p-2">
                  <p className="mb-2 flex items-center gap-1 text-[10px] font-black tracking-widest text-muted-foreground">
                    <Waypoints className="h-3.5 w-3.5" /> {t('readiness.whatIf')}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={t('readiness.dimension')}
                      value={wChange.dimension}
                      onChange={(e) => setWChange((s) => ({ ...s, dimension: e.target.value }))}
                      className="h-7 rounded-xl border border-border bg-transparent px-2 text-[11px]"
                    >
                      {report.scores?.map((score) => (
                        <option key={score.dimension} value={score.dimension}>
                          {score.dimensionName}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.5"
                      value={wChange.delta}
                      onChange={(e) => setWChange((s) => ({ ...s, delta: Number(e.target.value) }))}
                      className="h-7 w-20 rounded-xl border border-border bg-transparent px-2 text-[11px]"
                      aria-label={t('readiness.delta')}
                    />
                    <Button onClick={simulate} disabled={busy} size="sm">
                      {t('readiness.simulate')}
                    </Button>
                  </div>

                  {whatIf && (
                    <div className="mt-2 space-y-1 text-xs">
                      <pre className="whitespace-pre-wrap text-muted-foreground">{whatIf.narrative}</pre>
                      <ul className="space-y-0.5">
                        {whatIf.projected
                          .filter((p) => p.causalEffect)
                          .map((p) => (
                            <li key={p.dimension} className="text-muted-foreground">
                              → {p.dimensionName} : {p.causalEffect! >= 0 ? '+' : ''}
                              {p.causalEffect} → {p.score}/5
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!report && !busy && (
              <p className="text-sm text-muted-foreground">{t('readiness.empty')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4">
        <GazettePanel country={country} />
      </div>

      {profile.stages.scenario && (
        <div className="mt-4">
          <ScenarioConsole country={country} domain={domain} onRunId={setRunId} />
        </div>
      )}

      {runId && (
        <div className="mt-4">
          <AuditPanel runId={runId} />
        </div>
      )}

      <footer className="container mt-10 border-t border-border py-6 text-center text-xs text-muted-foreground">
        <p>
          {t('app.madeBy')} <span aria-label="love">♥️</span> by{' '}
          <a
            href="https://djotta.com"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary hover:underline"
          >
            Djotta
          </a>
        </p>
      </footer>

      <FloatingAssistant lens={lens} country={country} domain={domain} />
    </main>
  )
}
