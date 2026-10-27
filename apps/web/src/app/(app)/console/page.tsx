'use client'

import * as React from 'react'
import { Card, CardContent } from '@sps/ui'
import { WORKFLOW_PROFILES, type Domain } from '@sps/shared'
import { LensSelector } from '@/components/lens-selector'
import { ScenarioConsole } from '@/components/scenario-console'
import { AuditPanel } from '@/components/audit-panel'
import { CommunicationsPanel } from '@/components/communications-panel'
import { ExercisePanel } from '@/components/exercise-panel'
import { FloatingAssistant } from '@/components/floating-assistant'
import { GazettePanel } from '@/components/gazette-panel'
import { ProviderBadge } from '@/components/provider-badge'
import { useI18n } from '@/lib/i18n'
import { ReadinessPanel } from '@/components/readiness-panel'
import { useWorkspace } from '@/lib/workspace'

const DOMAINS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-[11px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25'

export default function ConsolePage() {
  const { t } = useI18n()
  const { country, setCountry, domain, setDomain, lens, setLens } = useWorkspace()
  const [runId, setRunId] = React.useState<string | null>(null)
  const profile = WORKFLOW_PROFILES[lens]

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4 pb-5 pt-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-primary dark:text-brand-primary-light">
            SarkiAI · Meta hackathon
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {t('app.name')}
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">{t('app.tagline')}</p>
        </div>
        <ProviderBadge />
      </section>

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <LensSelector value={lens} onChange={setLens} />
          <span className="hidden h-5 w-px bg-border sm:block" />
          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t('app.country')}
            <select
              aria-label={t('app.country')}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              className={selectClass}
            >
              <option value="cm">{t('country.cm')}</option>
              <option value="ae">{t('country.ae')}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {t('app.domain')}
            <select
              aria-label={t('app.domain')}
              value={domain}
              onChange={(event) => setDomain(event.target.value as Domain)}
              className={selectClass}
            >
              {DOMAINS.map((value) => (
                <option key={value} value={value}>
                  {t(`domain.${value}` as 'domain.health')}
                </option>
              ))}
            </select>
          </label>
          <p className="w-full text-[11px] leading-relaxed text-muted-foreground lg:w-auto lg:flex-1 lg:text-right">
            {t(`lens.${lens}.description` as 'lens.hybrid.description')}
          </p>
        </CardContent>
      </Card>

      <ReadinessPanel />

      <div className="mt-4">
        <GazettePanel country={country} />
      </div>

      {profile.stages.scenario && (
        <div className="mt-4">
          <ScenarioConsole country={country} domain={domain} onRunId={setRunId} />
        </div>
      )}

      <div className="mt-4">
        <ExercisePanel country={country} domain={domain} />
      </div>

      <div className="mt-4">
        <CommunicationsPanel country={country} />
      </div>

      {runId && (
        <div className="mt-4">
          <AuditPanel runId={runId} />
        </div>
      )}

      <footer className="mt-10 border-t border-border py-6 text-center text-[11px] text-muted-foreground">
        <p>
          {t('app.madeBy')} <span aria-label="love">♥️</span> by{' '}
          <a
            href="https://sarki.ai"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand-primary hover:underline dark:text-brand-primary-light"
          >
            SarkiAI
          </a>{' '}
          · Djotta
        </p>
      </footer>

      <FloatingAssistant lens={lens} country={country} domain={domain} />
    </>
  )
}
