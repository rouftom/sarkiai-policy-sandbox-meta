'use client'

import { Card, CardContent, Select } from '@sps/ui'
import { LensSelector } from '@/components/lens-selector'
import type { Domain } from '@sps/shared'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

const DOMAINS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

/** Country / domain / lens bar, shared by every working page. */
export function WorkspaceBar({ lens: withLens = false }: { lens?: boolean }) {
  const { t } = useI18n()
  const { country, setCountry, domain, setDomain, lens, setLens } = useWorkspace()

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        {withLens && <LensSelector value={lens} onChange={setLens} />}
        {withLens && <span className="hidden h-5 w-px bg-border sm:block" />}
        <label className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
          {t('app.country')}
          <Select
            ariaLabel={t('app.country')}
            value={country}
            onValueChange={setCountry}
            options={[
              { value: 'cm', label: t('country.cm') },
              { value: 'ae', label: t('country.ae') },
            ]}
            className="w-36"
          />
        </label>
        <label className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground">
          {t('app.domain')}
          <Select
            ariaLabel={t('app.domain')}
            value={domain}
            onValueChange={(value) => setDomain(value as Domain)}
            options={DOMAINS.map((value) => ({ value, label: t(`domain.${value}` as 'domain.health') }))}
            className="w-40"
          />
        </label>
        <p className="w-full text-[11px] leading-relaxed text-muted-foreground lg:w-auto lg:flex-1 lg:text-right">
          {t(`lens.${lens}.description` as 'lens.hybrid.description')}
        </p>
      </CardContent>
    </Card>
  )
}
