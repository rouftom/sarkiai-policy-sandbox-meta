'use client'

import { GazettePanel } from '@/components/gazette-panel'
import { PageIntro } from '@/components/page-intro'
import { WorkspaceControls } from '@/components/workspace-bar'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

export default function GazettePage() {
  const { t } = useI18n()
  const { country } = useWorkspace()
  return (
    <>
      <PageIntro title={t('gazette.pageTitle')} subtitle={t('gazette.pageSubtitle')}>
        <WorkspaceControls />
      </PageIntro>
      <GazettePanel country={country} />
    </>
  )
}
