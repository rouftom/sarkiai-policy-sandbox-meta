'use client'

import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@sps/ui'
import { PageIntro } from '@/components/page-intro'
import { ReadinessActions, ReadinessExport, ReadinessPanel, ReadinessTabs } from '@/components/readiness-panel'
import { ReadinessProvider } from '@/components/readiness-context'
import { RunBudgetBadge } from '@/components/run-budget'
import { useI18n } from '@/lib/i18n'

/** One saved assessment, at its own address: reopened with its process, scores and recommendations. */
export default function ReadinessRunPage() {
  const { t } = useI18n()
  const params = useParams<{ id: string }>()
  const runId = String(params.id)
  return (
    <ReadinessProvider runId={runId}>
      <PageIntro
        title={t('readiness.title')}
        subtitle={t('readiness.subtitle')}
        leading={
          <Button variant="ghost" size="icon-sm" className="h-8 w-8 shrink-0 rounded-lg" aria-label={t('readiness.back')} title={t('readiness.back')} onClick={() => history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      >
        <RunBudgetBadge runId={runId} />
        <ReadinessTabs />
        <ReadinessExport />
        <ReadinessActions />
      </PageIntro>
      <ReadinessPanel />
    </ReadinessProvider>
  )
}
