'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowUpRight, Gauge, Languages, Network, Newspaper, ScrollText, ShieldCheck, Siren, SlidersHorizontal } from 'lucide-react'
import { AnimatedTabsList, Card, CardContent, Tabs, TabsContent, type TabItem } from '@sps/ui'
import { WORKFLOW_PROFILES } from '@sps/shared'
import { AuditPanel } from '@/components/audit-panel'
import { CommunicationsPanel } from '@/components/communications-panel'
import { ExercisePanel } from '@/components/exercise-panel'
import { GazettePanel } from '@/components/gazette-panel'
import { ModelSelect } from '@/components/model-select'
import { ReadinessActions, ReadinessPanel } from '@/components/readiness-panel'
import { ReadinessProvider } from '@/components/readiness-context'
import { ScenarioConsole } from '@/components/scenario-console'
import { WorkspaceControls } from '@/components/workspace-bar'
import { PageIntro } from '@/components/page-intro'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

/**
 * Console = the working surface, not a dump of every panel. Lens, country and
 * domain stay in one bar; the five working panels live behind a tab strip with
 * tooltips, so nothing is stacked twice and each tab is one click from its
 * dedicated page.
 */
export default function ConsolePage() {
  const { t } = useI18n()
  const { country, domain, lens } = useWorkspace()
  const [runId, setRunId] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState('simulation')
  const profile = WORKFLOW_PROFILES[lens]

  const tabs: TabItem[] = [
    {
      id: 'simulation',
      label: t('console.tab.simulation'),
      icon: SlidersHorizontal,
      tooltip: t('console.tab.simulationHint', { lens: t(`lens.${lens}.label` as 'lens.hybrid.label') }),
    },
    {
      id: 'readiness',
      label: t('console.tab.readiness'),
      icon: Gauge,
      tooltip: t('console.tab.readinessHint'),
    },
    {
      id: 'gazette',
      label: t('console.tab.gazette'),
      icon: Newspaper,
      tooltip: t('console.tab.gazetteHint'),
    },
    {
      id: 'exercise',
      label: t('console.tab.exercise'),
      icon: Siren,
      tooltip: t('console.tab.exerciseHint'),
    },
    {
      id: 'communications',
      label: t('console.tab.communications'),
      icon: Languages,
      tooltip: t('console.tab.communicationsHint'),
    },
  ]

  return (
    <>
      <PageIntro title={t('console.title')} subtitle={t('app.tagline')}>
        <WorkspaceControls lens />
        <ModelSelect />
      </PageIntro>

      <Tabs value={tab} onValueChange={setTab} className="gap-3">
        <AnimatedTabsList items={tabs} value={tab} onValueChange={setTab} dense />

        <TabsContent value="simulation" className="mt-3">
          {profile.stages.scenario ? (
            <>
              <ScenarioConsole country={country} domain={domain} onRunId={setRunId} />
              {runId && (
                <div className="mt-4">
                  <AuditPanel runId={runId} />
                </div>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex items-start gap-2 py-6 text-[11px] leading-relaxed text-muted-foreground">
                <Network className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light" />
                {t('console.simulationDisabled')}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="readiness" className="mt-3">
          <ReadinessProvider>
            <div className="mb-4 flex justify-end">
              <ReadinessActions />
            </div>
            <ReadinessPanel />
          </ReadinessProvider>
        </TabsContent>

        <TabsContent value="gazette" className="mt-3">
          <GazettePanel country={country} />
        </TabsContent>

        <TabsContent value="exercise" className="mt-3">
          <ExercisePanel country={country} domain={domain} />
        </TabsContent>

        <TabsContent value="communications" className="mt-3">
          <CommunicationsPanel country={country} />
        </TabsContent>
      </Tabs>

      <Card className="mt-4">
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <ShieldCheck className="h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light" />
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted-foreground">{t('console.auditHint')}</p>
          <Link
            href="/audit"
            className="flex items-center gap-1 text-[10px] font-semibold text-brand-primary hover:underline dark:text-brand-primary-light"
          >
            <ScrollText className="h-3.5 w-3.5" />
            {t('nav.audit')} <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>

    </>
  )
}
