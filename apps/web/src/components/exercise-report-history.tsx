'use client'

/**
 * Every saved version of the exercise's report, newest first. Each version is a
 * folding block; its report is fetched when it is opened, so the list stays light.
 */

import * as React from 'react'
import { api, type AfterActionDto, type ExerciseReportSummaryDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { CollapsiblePanel } from '@/components/shared/collapsible-panel'
import { ExerciseReport } from '@/components/exercise-report'

export function ExerciseReportHistory({ reports }: { reports: ExerciseReportSummaryDto[] }) {
  const { t, locale } = useI18n()

  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('exercise.report.empty')}</p>
  }

  return (
    <div className="space-y-2">
      {reports.map((item, index) => (
        <CollapsiblePanel
          key={item.id}
          defaultOpen={index === 0}
          title={`${t('exercise.report.version', { version: item.version })} · ${item.title}`}
          meta={`${new Date(item.createdAt).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB')} · T+${item.evaluatedAtMinute} · ${t('exercise.report.actions', { count: item.actionCount })}`}
          contentClassName="p-3"
        >
          <SavedReport id={item.id} />
        </CollapsiblePanel>
      ))}
    </div>
  )
}

function SavedReport({ id }: { id: string }) {
  const { t } = useI18n()
  const [state, setState] = React.useState<{ report: AfterActionDto | null; error: string | null }>({
    report: null,
    error: null,
  })

  React.useEffect(() => {
    let cancelled = false
    api
      .exerciseReport(id)
      .then((record) => {
        if (!cancelled) setState({ report: record.report, error: null })
      })
      .catch((cause: unknown) => {
        if (!cancelled) setState({ report: null, error: (cause as Error).message })
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (state.error) {
    return <p className="text-xs text-rose-500">{t('exercise.error')} {state.error}</p>
  }
  if (!state.report) {
    return <p className="text-xs text-muted-foreground">{t('exercise.report.loading')}</p>
  }
  return <ExerciseReport report={state.report} />
}
