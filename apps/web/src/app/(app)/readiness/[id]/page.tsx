'use client'

import { useParams } from 'next/navigation'
import { PageIntro } from '@/components/page-intro'
import { ReadinessActions, ReadinessPanel } from '@/components/readiness-panel'
import { ReadinessProvider } from '@/components/readiness-context'
import { useI18n } from '@/lib/i18n'

/** One saved assessment, at its own address: reopened with its process, scores and recommendations. */
export default function ReadinessRunPage() {
  const { t } = useI18n()
  const params = useParams<{ id: string }>()
  return (
    <ReadinessProvider runId={String(params.id)}>
      <PageIntro title={t('readiness.title')} subtitle={t('readiness.subtitle')}>
        <ReadinessActions />
      </PageIntro>
      <ReadinessPanel showStages={false} />
    </ReadinessProvider>
  )
}
