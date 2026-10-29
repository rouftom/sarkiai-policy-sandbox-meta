'use client'

import { PageIntro } from '@/components/page-intro'
import { ReadinessActions, ReadinessExport, ReadinessPanel, ReadinessTabs } from '@/components/readiness-panel'
import { ReadinessProvider } from '@/components/readiness-context'
import { useI18n } from '@/lib/i18n'

export default function ReadinessPage() {
  const { t } = useI18n()
  return (
    <ReadinessProvider>
      <PageIntro title={t('readiness.title')} subtitle={t('readiness.subtitle')}>
        <ReadinessTabs />
        <ReadinessExport />
        <ReadinessActions />
      </PageIntro>
      <ReadinessPanel />
    </ReadinessProvider>
  )
}
