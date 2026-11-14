'use client'

import { PageIntro } from '@/components/page-intro'
import { CountrySelect } from '@/components/country-select'
import { ReadinessActions, ReadinessExport, ReadinessPanel, ReadinessTabs } from '@/components/readiness-panel'
import { ReadinessProvider } from '@/components/readiness-context'
import { useI18n } from '@/lib/i18n'

export default function ReadinessPage() {
  const { t } = useI18n()
  return (
    <ReadinessProvider>
      <PageIntro title={t('readiness.title')} subtitle={t('readiness.subtitle')}>
        <CountrySelect className="w-40 shrink-0" />
        <ReadinessTabs />
        <ReadinessExport />
        <ReadinessActions />
      </PageIntro>
      <ReadinessPanel />
    </ReadinessProvider>
  )
}
