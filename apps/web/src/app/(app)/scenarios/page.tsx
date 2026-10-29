'use client'

import * as React from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@sps/ui'
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
      <PageIntro
        title={t('scenarios.pageTitle')}
        subtitle={t('scenarios.pageSubtitle')}
        leading={
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 shrink-0 rounded-lg"
            aria-label={t('scenario.backPage')}
            title={t('scenario.backPage')}
            onClick={() => history.back()}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      >
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
