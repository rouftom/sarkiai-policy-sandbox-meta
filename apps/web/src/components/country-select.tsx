'use client'

import * as React from 'react'
import { Select, cn } from '@sps/ui'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { CountryFlag } from '@/components/country-flag'

/**
 * The country the operator works on. It reads and writes the workspace, so the
 * choice made once reaches the assessment, the scenarios, the exercise, the
 * assistant and the saved-run lists, and survives a reload.
 */
export function CountrySelect({
  className,
  align = 'start',
  size = 'sm',
  id,
}: {
  className?: string
  align?: 'start' | 'end'
  size?: 'sm' | 'md'
  id?: string
}) {
  const { t, locale } = useI18n()
  const { country, setCountry, countries } = useWorkspace()

  const options = React.useMemo(() => {
    const active = countries.filter((row) => row.status === 'active')
    const pool = active.length > 0 ? active : countries
    const rows: Array<{ value: string; label: string; hint?: string }> = pool.map((row) => ({
      value: row.code,
      label: locale === 'fr' ? row.nameFr : row.name,
      hint: row.code.toUpperCase(),
    }))
    // A stored country stays selectable while the registry loads, or after it
    // was retired: the operator never loses the context they were in.
    if (!rows.some((row) => row.value === country)) {
      rows.unshift({ value: country, label: country.toUpperCase() })
    }
    return rows
  }, [countries, country, locale])

  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <CountryFlag code={country} className="h-5 w-5 text-[14px]" />
      <Select
        id={id}
        ariaLabel={t('app.country')}
        value={country}
        onValueChange={setCountry}
        options={options}
        size={size}
        align={align}
        className="min-w-0 flex-1"
      />
    </div>
  )
}
