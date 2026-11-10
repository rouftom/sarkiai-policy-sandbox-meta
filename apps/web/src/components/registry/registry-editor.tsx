'use client'

import * as React from 'react'
import { Loader } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, cn } from '@sps/ui'
import { ApiError, registryApi, type RegistryRecordDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { ENTITY, type FieldSpec } from './config'
import type { RegistryEntityPath } from '@/lib/api'

type Values = Record<string, unknown>

/** `file.txt#41 · note` per line ⇄ `{ filename, article, note }`. */
function basisToText(value: unknown): string {
  return ((value as Array<{ filename: string; article?: string; note?: string }>) ?? [])
    .map((b) => `${b.filename}${b.article ? `#${b.article}` : ''}${b.note ? ` · ${b.note}` : ''}`)
    .join('\n')
}
function textToBasis(text: string) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ref, ...note] = line.split(' · ')
      const [filename, article] = (ref ?? '').split('#')
      return { filename: (filename ?? '').trim(), ...(article?.trim() ? { article: article.trim() } : {}), ...(note.join(' · ').trim() ? { note: note.join(' · ').trim() } : {}) }
    })
}

export function RegistryEditor({
  path,
  open,
  onOpenChange,
  record,
  onSaved,
}: {
  path: RegistryEntityPath
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Absent: create. */
  record?: RegistryRecordDto | null
  onSaved: (record: RegistryRecordDto) => void
}) {
  const { t } = useI18n()
  const config = ENTITY[path]
  const [values, setValues] = React.useState<Values>({})
  const [options, setOptions] = React.useState<Record<string, Array<{ id: string; name: string }>>>({})
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    const initial: Values = {}
    for (const field of config.fields) {
      const value = record ? (record as unknown as Values)[field.key] : undefined
      if (field.kind === 'legalBasis') initial[field.key] = basisToText(value)
      else if (field.kind === 'lines') initial[field.key] = ((value as string[]) ?? []).join('\n')
      else if (field.kind === 'chips') initial[field.key] = (value as string[]) ?? []
      else if (field.kind === 'boolean') initial[field.key] = value === true
      else initial[field.key] = value ?? ''
    }
    setValues(initial)
    setProblem(null)
    for (const field of config.fields) {
      if (field.options === 'roles' || field.options === 'institutions') {
        const list = field.options
        void registryApi.list(list).then((result) =>
          setOptions((current) => ({ ...current, [list]: result.items.filter((item) => item.status !== 'retired').map((item) => ({ id: item.id, name: item.name })) })),
        )
      }
    }
  }, [open, record, config.fields])

  const set = (key: string, value: unknown) => setValues((current) => ({ ...current, [key]: value }))

  const payload = () => {
    const body: Values = {}
    for (const field of config.fields) {
      if (record && field.createOnly) continue
      const value = values[field.key]
      if (field.kind === 'legalBasis') body[field.key] = textToBasis(String(value ?? ''))
      else if (field.kind === 'lines') body[field.key] = String(value ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
      else if (field.kind === 'boolean' || field.kind === 'chips') body[field.key] = value
      else if (typeof value === 'string' && value.trim() === '' && !field.required) continue
      else body[field.key] = typeof value === 'string' ? value.trim() : value
    }
    return body
  }

  const save = async () => {
    setBusy(true)
    setProblem(null)
    try {
      const saved = record ? await registryApi.update(path, record.id, payload()) : await registryApi.create(path, payload())
      onSaved(saved)
      onOpenChange(false)
    } catch (cause) {
      setProblem(cause instanceof ApiError ? cause.message : (cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const renderField = (field: FieldSpec) => {
    const value = values[field.key]
    const disabled = busy || Boolean(record && field.createOnly) || Boolean(record?.builtIn && path === 'roles' && field.key === 'capabilities')
    const label = (
      <label className="text-[11px] font-medium text-foreground">
        {t(field.labelKey)}
        {field.required && <span className="text-destructive"> *</span>}
      </label>
    )
    const hint = field.hintKey && <p className="text-[10px] text-muted-foreground">{t(field.hintKey)}</p>
    let control: React.ReactNode
    if (field.kind === 'textarea' || field.kind === 'lines' || field.kind === 'legalBasis') {
      control = (
        <textarea
          value={String(value ?? '')}
          disabled={disabled}
          onChange={(event) => set(field.key, event.target.value)}
          rows={field.kind === 'textarea' ? 4 : 3}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none focus:border-brand-primary"
        />
      )
    } else if (field.kind === 'chips') {
      const selected = (value as string[]) ?? []
      control = (
        <div className="flex flex-wrap gap-1.5">
          {(field.options as readonly string[]).map((option) => {
            const on = selected.includes(option)
            return (
              <button
                key={option}
                type="button"
                disabled={disabled}
                onClick={() => set(field.key, on ? selected.filter((item) => item !== option) : [...selected, option])}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] transition-colors disabled:opacity-60',
                  on ? 'border-brand-primary bg-brand-primary/10 text-brand-primary' : 'border-border text-muted-foreground hover:border-brand-primary/50',
                )}
              >
                {option}
              </button>
            )
          })}
        </div>
      )
    } else if (field.kind === 'select') {
      const list = typeof field.options === 'string' ? (options[field.options] ?? []) : (field.options ?? []).map((id) => ({ id, name: id }))
      control = (
        <select
          value={String(value ?? '')}
          disabled={disabled}
          onChange={(event) => set(field.key, event.target.value)}
          className="h-9 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-brand-primary"
        >
          {!field.required && <option value="">{t('registry.none')}</option>}
          {list.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      )
    } else if (field.kind === 'boolean') {
      control = (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => set(field.key, event.target.checked)} />
          {t('registry.yes')}
        </label>
      )
    } else {
      control = <Input value={String(value ?? '')} disabled={disabled} onChange={(event) => set(field.key, event.target.value)} className="h-9 rounded-xl text-xs" maxLength={field.kind === 'country' ? 2 : undefined} />
    }
    return (
      <div key={field.key} className="space-y-1">
        {label}
        {control}
        {hint}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <config.icon className="h-4 w-4 text-brand-primary" />
            {record ? t('registry.edit', { name: record.name }) : t(config.newKey)}
          </DialogTitle>
          <DialogDescription className="text-[11px]">{t('registry.editor.note')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-5 py-4">
          {config.fields.map(renderField)}
          {problem && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[11px] text-destructive">{problem}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('registry.cancel')}
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy && <Loader className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t('registry.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
