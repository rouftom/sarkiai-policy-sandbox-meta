'use client'

import { useParams } from 'next/navigation'
import { ReadinessPanel } from '@/components/readiness-panel'
import { PageIntro } from '@/components/page-intro'
import { useI18n } from '@/lib/i18n'

/** One saved assessment, at its own address: reopened with its process, scores and recommendations. */
export default function ReadinessRunPage() {
  const { t } = useI18n()
  const params = useParams<{ id: string }>()
  return (
    <>
      <PageIntro title={t('nav.readiness')} subtitle={t('readiness.pageSubtitle')} />
      <ReadinessPanel showStages={false} runId={String(params.id)} />
    </>
  )
}
