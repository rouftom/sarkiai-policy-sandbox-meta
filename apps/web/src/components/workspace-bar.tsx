'use client'

import { Card, CardContent, MultiSelect, Select } from '@sps/ui'
import type { Domain } from '@sps/shared'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

/** Country and domain controls, compact, for a page header. */
export function WorkspaceControls() {
  const { t, locale } = useI18n()
  const { country, setCountry, countries, sectors, domains, setDomains } = useWorkspace()

  const selectable = countries.filter((row) => row.status === 'active')
  const pool = selectable.length > 0 ? selectable : countries
  const countryOptions =
    pool.length > 0
      ? pool.map((row) => ({ value: row.code, label: locale === 'fr' ? row.nameFr : row.name }))
      : [{ value: country, label: country.toUpperCase() }]

  return (
    <>
      <Select
        ariaLabel={t('app.country')}
        value={country}
        onValueChange={setCountry}
        options={countryOptions}
        size="sm"
        className="w-40 max-w-40 truncate"
      />
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
