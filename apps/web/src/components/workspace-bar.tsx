'use client'

import { Card, CardContent, MultiSelect } from '@sps/ui'
import type { Domain } from '@sps/shared'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { CountrySelect } from '@/components/country-select'

/** Country and domain controls, compact, for a page header. */
export function WorkspaceControls() {
  const { t } = useI18n()
  const { sectors, domains, setDomains } = useWorkspace()

  return (
    <>
      <CountrySelect className="w-40 shrink-0" />
      <MultiSelect
        ariaLabel={t('app.domains')}
        values={domains}
        onValuesChange={(values) => setDomains(values as Domain[])}
        options={sectors.map((value) => ({ value, label: t(`domain.${value}` as 'domain.health') }))}
        className="w-36"
      />
    </>
  )
}

/** Full-width bar for pages that have no header row of their own. */
export function WorkspaceBar() {
  return (
    <Card className="mb-3">
      <CardContent className="flex flex-wrap items-center gap-2 py-2">
        <WorkspaceControls />
      </CardContent>
    </Card>
  )
}
