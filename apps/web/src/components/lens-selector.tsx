'use client'

import { Button, cn } from '@sps/ui'
import { WORKFLOW_PROFILES, type WorkflowLens } from '@sps/shared'

const LENSES: WorkflowLens[] = ['simulation', 'readiness', 'hybrid']

export function LensSelector({ value, onChange }: { value: WorkflowLens; onChange: (lens: WorkflowLens) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl bg-secondary p-1" role="tablist" aria-label="Workflow lens">
      {LENSES.map((lens) => (
        <Button
          key={lens}
          role="tab"
          aria-selected={value === lens}
          variant={value === lens ? 'primary' : 'ghost'}
          size="md"
          title={WORKFLOW_PROFILES[lens].description}
          onClick={() => onChange(lens)}
          className={cn('border-none', value === lens && 'shadow-sm')}
        >
          {WORKFLOW_PROFILES[lens].label}
        </Button>
      ))}
    </div>
  )
}
