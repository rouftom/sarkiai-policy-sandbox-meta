'use client'

import { ExercisePanel } from '@/components/exercise-panel'
import { PageIntro } from '@/components/page-intro'
import { WorkspaceControls } from '@/components/workspace-bar'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

export default function ExercisePage() {
  const { t } = useI18n()
  const { country, domain } = useWorkspace()
  return (
    <>
      <PageIntro title={t('exercise.pageTitle')} subtitle={t('exercise.pageSubtitle')}>
        <WorkspaceControls />
      </PageIntro>
      <ExercisePanel country={country} domain={domain} />
    </>
  )
}
