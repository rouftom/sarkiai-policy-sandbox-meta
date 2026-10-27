'use client'

import { Card, CardContent } from '@sps/ui'
import { LensSelector } from '@/components/lens-selector'
import type { Domain } from '@sps/shared'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

const DOMAINS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-[11px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25'

/** Country / domain / lens bar, shared by every working page. */
export function WorkspaceBar({ lens: withLens = false }: { lens?: boolean }) {
  const { t } = useI18n()
  const { country, setCountry, domain, setDomain, lens, setLens } = useWorkspace()

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-wrap items-center gap-3 py-3">
        {withLens && <LensSelector value={lens} onChange={setLens} />}
        {withLens && <span className="hidden h-5 w-px bg-border sm:block" />}
        <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t('app.country')}
          <select
            aria-label={t('app.country')}
            value={country}
            onChange={(event) => setCountry(event.target.value)}
            className={selectClass}
          >
            <option value="cm">{t('country.cm')}</option>
            <option value="ae">{t('country.ae')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {t('app.domain')}
          <select
            aria-label={t('app.domain')}
            value={domain}
            onChange={(event) => setDomain(event.target.value as Domain)}
            className={selectClass}
          >
            {DOMAINS.map((value) => (
              <option key={value} value={value}>
                {t(`domain.${value}` as 'domain.health')}
              </option>
            ))}
          </select>
        </label>
        <p className="w-full text-[11px] leading-relaxed text-muted-foreground lg:w-auto lg:flex-1 lg:text-right">
          {t(`lens.${lens}.description` as 'lens.hybrid.description')}
        </p>
      </CardContent>
    </Card>
  )
}
