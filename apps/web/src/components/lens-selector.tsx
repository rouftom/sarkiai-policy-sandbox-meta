'use client'

import { Button, cn } from '@sps/ui'
import type { WorkflowLens } from '@sps/shared'
import { useI18n } from '@/lib/i18n'

const LENSES: WorkflowLens[] = ['simulation', 'readiness', 'hybrid']

export function LensSelector({ value, onChange }: { value: WorkflowLens; onChange: (lens: WorkflowLens) => void }) {
  const { t } = useI18n()
  return (
    <div
      className="inline-flex items-center gap-1 rounded-xl bg-secondary p-1"
      role="tablist"
      aria-label={t('lens.aria')}
    >
      {LENSES.map((lens) => (
        <Button
          key={lens}
          role="tab"
          aria-selected={value === lens}
          variant={value === lens ? 'primary' : 'ghost'}
          size="md"
          title={t(`lens.${lens}.description` as 'lens.hybrid.description')}
          onClick={() => onChange(lens)}
          className={cn('border-none', value === lens && 'shadow-sm')}
        >
          {t(`lens.${lens}.label` as 'lens.hybrid.label')}
        </Button>
      ))}
    </div>
  )
}
