'use client'

import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@sps/ui'
import { AuditPanel } from '@/components/audit-panel'
import { PageIntro } from '@/components/page-intro'
import { ScenarioConsole } from '@/components/scenario-console'
import { useI18n } from '@/lib/i18n'

/** One saved run, at its own address: reopened with its process, reports and CoT trail. */
export default function ScenarioRunPage() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const runId = String(params.id)

  return (
    <>
      <PageIntro
        title={t('scenarios.pageTitle')}
        subtitle={t('scenarios.pageSubtitle')}
        leading={
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8 shrink-0 rounded-lg"
            aria-label={t('scenario.back')}
            title={t('scenario.back')}
            onClick={() => router.push('/scenarios')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        }
      />

      <ScenarioConsole runId={runId} />

      <div className="mt-4">
        <AuditPanel runId={runId} />
      </div>
    </>
  )
}
