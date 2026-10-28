'use client'

import { PageIntro } from '@/components/page-intro'
import { ReadinessActions, ReadinessPanel } from '@/components/readiness-panel'
import { ReadinessProvider } from '@/components/readiness-context'
import { useI18n } from '@/lib/i18n'

export default function ReadinessPage() {
  const { t } = useI18n()
  return (
    <ReadinessProvider>
      <PageIntro title={t('readiness.title')} subtitle={t('readiness.subtitle')}>
        <ReadinessActions />
      </PageIntro>
      <ReadinessPanel showStages={false} />
    </ReadinessProvider>
  )
}
