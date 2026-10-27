'use client'

import * as React from 'react'
import { Network } from 'lucide-react'
import { ScenarioConsole } from '@/components/scenario-console'
import { AuditPanel } from '@/components/audit-panel'
import { PageIntro } from '@/components/page-intro'
import { WorkspaceBar } from '@/components/workspace-bar'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

export default function ScenariosPage() {
  const { t } = useI18n()
  const { country, domain } = useWorkspace()
  const [runId, setRunId] = React.useState<string | null>(null)

  return (
    <>
      <PageIntro title={t('scenarios.pageTitle')} subtitle={t('scenarios.pageSubtitle')} />
      <WorkspaceBar lens />

      <ScenarioConsole country={country} domain={domain} onRunId={setRunId} />

      {runId ? (
        <div className="mt-4">
          <AuditPanel runId={runId} />
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
          <Network className="h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light" />
          {t('scenario.intro')}
        </div>
      )}
    </>
  )
}
