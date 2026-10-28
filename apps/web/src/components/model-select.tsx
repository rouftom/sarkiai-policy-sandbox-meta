'use client'

import * as React from 'react'
import { Select } from '@sps/ui'
import { api, type MetaModelDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

/** The chat model, chosen from Meta's list. Saved to the operator's preference. */
export function ModelSelect() {
  const { t } = useI18n()
  const [models, setModels] = React.useState<MetaModelDto[]>([])
  const [model, setModel] = React.useState('')
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    api
      .models()
      .then((result) => {
        if (cancelled) return
        setModels(result.models)
        setModel(result.selected)
        setReady(true)
      })
      .catch(() => {
        if (!cancelled) setReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const choose = async (id: string) => {
    const previous = model
    setModel(id)
    try {
      await api.selectModel(id)
    } catch {
      setModel(previous)
    }
  }

  return (
    <Select
      ariaLabel={t('assistant.model')}
      value={model}
      onValueChange={(id) => void choose(id)}
      options={models.map((entry) => ({ value: entry.id, label: entry.id }))}
      disabled={!ready || models.length === 0}
      size="sm"
      className="w-48"
      triggerClassName="h-7 rounded-xl border-primary/40 bg-primary/5 px-2.5 text-[11px] font-semibold text-foreground hover:border-primary"
    />
  )
}
