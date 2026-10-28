'use client'

import { Card, CardContent, Select } from '@sps/ui'
import { LensSelector } from '@/components/lens-selector'
import type { Domain } from '@sps/shared'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

const DOMAINS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

/** Country, domain and (optionally) lens controls, compact, for a page header. */
export function WorkspaceControls({ lens: withLens = false }: { lens?: boolean }) {
  const { t } = useI18n()
  const { country, setCountry, domain, setDomain, lens, setLens } = useWorkspace()

  return (
    <>
      {withLens && <LensSelector value={lens} onChange={setLens} />}
      <Select
        ariaLabel={t('app.country')}
        value={country}
        onValueChange={setCountry}
        options={[{ value: 'cm', label: t('country.cm') }]}
        size="sm"
        className="w-20"
      />
      <Select
        ariaLabel={t('app.domain')}
        value={domain}
        onValueChange={(value) => setDomain(value as Domain)}
        options={DOMAINS.map((value) => ({ value, label: t(`domain.${value}` as 'domain.health') }))}
        size="sm"
        className="w-32"
      />
    </>
  )
}

/** Full-width bar for pages that have no header row of their own. */
export function WorkspaceBar({ lens: withLens = false }: { lens?: boolean }) {
  return (
    <Card className="mb-3">
      <CardContent className="flex flex-wrap items-center gap-2 py-2">
        <WorkspaceControls lens={withLens} />
      </CardContent>
    </Card>
  )
}
