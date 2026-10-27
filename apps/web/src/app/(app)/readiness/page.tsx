'use client'

import { ReadinessPanel } from '@/components/readiness-panel'
import { PageIntro } from '@/components/page-intro'
import { useI18n } from '@/lib/i18n'

export default function ReadinessPage() {
  const { t } = useI18n()
  return (
    <>
      <PageIntro title={t('nav.readiness')} subtitle={t('readiness.pageSubtitle')} />
      <ReadinessPanel showStages={false} />
    </>
  )
}
