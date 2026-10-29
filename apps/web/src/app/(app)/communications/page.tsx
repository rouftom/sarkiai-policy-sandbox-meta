'use client'

import { NotificationsPanel } from '@/components/notifications-panel'
import { PageIntro } from '@/components/page-intro'
import { WorkspaceControls } from '@/components/workspace-bar'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

/**
 * One job: reach the people who must act (e-mail / WhatsApp), with per-channel
 * consent and every send written to the audit trail.
 */
export default function CommunicationsPage() {
  const { t } = useI18n()
  const { country } = useWorkspace()
  return (
    <>
      <PageIntro title={t('communication.pageTitle')} subtitle={t('communication.pageSubtitle')}>
        <WorkspaceControls />
      </PageIntro>
      <div className="space-y-3">
        <NotificationsPanel country={country} />
      </div>
    </>
  )
}
