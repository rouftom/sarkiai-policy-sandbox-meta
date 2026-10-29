'use client'

import { Card, CardContent, MultiSelect, Select } from '@sps/ui'
import type { Domain } from '@sps/shared'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

const DOMAIN_OPTIONS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

/** Country and domain controls, compact, for a page header. */
export function WorkspaceControls() {
  const { t } = useI18n()
  const { country, setCountry, domains, setDomains } = useWorkspace()

  return (
    <>
      <Select
        ariaLabel={t('app.country')}
        value={country}
        onValueChange={setCountry}
        options={[{ value: 'cm', label: t('country.cm') }]}
        size="sm"
        className="w-20"
      />
      <MultiSelect
        ariaLabel={t('app.domains')}
        values={domains}
        onValuesChange={(values) => setDomains(values as Domain[])}
        options={DOMAIN_OPTIONS.map((value) => ({ value, label: t(`domain.${value}` as 'domain.health') }))}
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
