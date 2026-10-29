'use client'

import * as React from 'react'
import { ScenarioConsole } from '@/components/scenario-console'
import { AuditPanel } from '@/components/audit-panel'
import { PageIntro } from '@/components/page-intro'
import { WorkspaceControls } from '@/components/workspace-bar'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

export default function ScenariosPage() {
  const { t } = useI18n()
  const { country, domains } = useWorkspace()
  const [runId, setRunId] = React.useState<string | null>(null)

  return (
    <>
      <PageIntro title={t('scenarios.pageTitle')} subtitle={t('scenarios.pageSubtitle')}>
        <WorkspaceControls />
      </PageIntro>

      <ScenarioConsole country={country} domains={domains} onRunId={setRunId} />

      {runId && (
        <div className="mt-4">
          <AuditPanel runId={runId} />
        </div>
      )}
    </>
  )
}
