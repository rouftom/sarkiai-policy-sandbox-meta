'use client'

import { CommunicationsPanel } from '@/components/communications-panel'
import { PageIntro } from '@/components/page-intro'
import { WorkspaceBar } from '@/components/workspace-bar'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

export default function CommunicationsPage() {
  const { t } = useI18n()
  const { country } = useWorkspace()
  return (
    <>
      <PageIntro title={t('communication.pageTitle')} subtitle={t('communication.pageSubtitle')} />
      <WorkspaceBar />
      <CommunicationsPanel country={country} />
    </>
  )
}
