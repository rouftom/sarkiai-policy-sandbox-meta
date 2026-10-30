'use client'

import * as React from 'react'
import { Check, Globe2, Loader } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Select,
  cn,
} from '@sps/ui'
import type { Domain } from '@sps/shared'
import {
  countriesApi,
  ApiError,
  type CountryDto,
  type CountryJurisdictionDto,
  type CountryStatusDto,
  type CountryInputDto,
} from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const SECTORS: Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

type FormState = {
  code: string
  name: string
  nameFr: string
  jurisdiction: CountryJurisdictionDto
  region: string
  authority: string
  currency: string
  languages: string
  timezone: string
  status: CountryStatusDto
  sectors: Domain[]
  notes: string
}

const EMPTY: FormState = {
  code: '',
  name: '',
  nameFr: '',
  jurisdiction: 'national',
  region: '',
  authority: '',
  currency: '',
  languages: '',
  timezone: '',
  status: 'active',
  sectors: ['health'],
  notes: '',
}

function fromCountry(country: CountryDto | null): FormState {
  if (!country) return EMPTY
  return {
    code: country.code,
    name: country.name,
    nameFr: country.nameFr,
    jurisdiction: country.jurisdiction,
    region: country.region,
    authority: country.authority,
    currency: country.currency,
    languages: country.languages.join(', '),
    timezone: country.timezone,
    status: country.status,
    sectors: country.sectors,
    notes: country.notes ?? '',
  }
}

/**
 * Create or edit one country of the registry. The code is chosen at creation and
 * never changes: it is the key every run, chunk and assessment carries.
 */
export function CountryDialog({
  open,
  onOpenChange,
  country,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The row to edit, or `null` to create one. */
  country: CountryDto | null
  onSaved: (country: CountryDto) => void
}) {
  const { t } = useI18n()
  const [form, setForm] = React.useState<FormState>(EMPTY)
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setForm(fromCountry(country))
    setProblem(null)
  }, [open, country])

  const editing = Boolean(country)

  const patch = (values: Partial<FormState>) => setForm((current) => ({ ...current, ...values }))

  const toggleSector = (sector: Domain) => {
    setForm((current) => {
      const has = current.sectors.includes(sector)
      if (has && current.sectors.length === 1) return current
      return {
        ...current,
        sectors: has ? current.sectors.filter((value) => value !== sector) : [...current.sectors, sector],
      }
    })
  }

  const submit = async () => {
    const code = form.code.trim().toLowerCase()
    if (!/^[a-z]{2}$/.test(code) || form.name.trim().length < 2) {
      setProblem(t('countries.required'))
      return
    }

    const body: CountryInputDto = {
      name: form.name.trim(),
      nameFr: form.nameFr.trim() || form.name.trim(),
      jurisdiction: form.jurisdiction,
      region: form.region.trim(),
      authority: form.authority.trim(),
      currency: form.currency.trim(),
      languages: form.languages
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
      timezone: form.timezone.trim(),
      status: form.status,
      sectors: form.sectors,
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    }

    setBusy(true)
    setProblem(null)
    try {
      const result = editing
        ? await countriesApi.update(country!.code, body)
        : await countriesApi.create({ ...body, code })
      onSaved(result.country)
      onOpenChange(false)
    } catch (cause) {
      const code = cause instanceof ApiError ? cause.json<{ error?: string }>()?.error : undefined
      setProblem(code === 'duplicate_code' ? t('countries.duplicateCode') : (cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-lg rounded-3xl p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Globe2 className="h-4 w-4 text-brand-primary" aria-hidden="true" />
            {editing ? t('countries.editTitle') : t('countries.createTitle')}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {editing ? t('countries.editHint') : t('countries.createHint')}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] gap-2.5 overflow-auto px-5 py-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.code')}</span>
            <input
              value={form.code}
              onChange={(event) => patch({ code: event.target.value.toLowerCase().slice(0, 2) })}
              disabled={editing}
              maxLength={2}
              placeholder="cm"
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 font-mono text-[11px] uppercase disabled:opacity-60"
            />
            <span className="text-[9px] text-muted-foreground">{t('countries.codeHint')}</span>
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.status')}</span>
            <Select
              ariaLabel={t('countries.field.status')}
              value={form.status}
              onValueChange={(value) => patch({ status: value as CountryStatusDto })}
              options={[
                { value: 'active', label: t('countries.status.active') },
                { value: 'planned', label: t('countries.status.planned') },
              ]}
              size="sm"
              className="w-full"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.name')}</span>
            <input
              value={form.name}
              onChange={(event) => patch({ name: event.target.value })}
              maxLength={80}
              placeholder="Cameroon"
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-[11px]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.nameFr')}</span>
            <input
              value={form.nameFr}
              onChange={(event) => patch({ nameFr: event.target.value })}
              maxLength={80}
              placeholder="Cameroun"
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-[11px]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.jurisdiction')}</span>
            <Select
              ariaLabel={t('countries.field.jurisdiction')}
              value={form.jurisdiction}
              onValueChange={(value) => patch({ jurisdiction: value as CountryJurisdictionDto })}
              options={[
                { value: 'national', label: t('countries.jurisdiction.national') },
                { value: 'regional', label: t('countries.jurisdiction.regional') },
                { value: 'international', label: t('countries.jurisdiction.international') },
              ]}
              size="sm"
              className="w-full"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.region')}</span>
            <input
              value={form.region}
              onChange={(event) => patch({ region: event.target.value })}
              maxLength={80}
              placeholder="Central Africa"
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-[11px]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.authority')}</span>
            <input
              value={form.authority}
              onChange={(event) => patch({ authority: event.target.value })}
              maxLength={120}
              placeholder="MINPOSTEL"
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-[11px]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.currency')}</span>
            <input
              value={form.currency}
              onChange={(event) => patch({ currency: event.target.value.toUpperCase().slice(0, 8) })}
              maxLength={8}
              placeholder="XAF"
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 font-mono text-[11px]"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.languages')}</span>
            <input
              value={form.languages}
              onChange={(event) => patch({ languages: event.target.value })}
              placeholder="fr, en"
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-[11px]"
            />
            <span className="text-[9px] text-muted-foreground">{t('countries.languagesHint')}</span>
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.timezone')}</span>
            <input
              value={form.timezone}
              onChange={(event) => patch({ timezone: event.target.value })}
              maxLength={60}
              placeholder="Africa/Douala"
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 font-mono text-[11px]"
            />
          </label>

          <div className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.sectors')}</span>
            <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border p-2 sm:grid-cols-3">
              {SECTORS.map((sector) => {
                const checked = form.sectors.includes(sector)
                return (
                  <button
                    key={sector}
                    type="button"
                    onClick={() => toggleSector(sector)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] transition-colors',
                      checked
                        ? 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary-dark dark:text-brand-primary-light'
                        : 'border-transparent text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-3 w-3 items-center justify-center rounded-sm border',
                        checked ? 'border-brand-primary bg-brand-primary text-white' : 'border-border',
                      )}
                    >
                      {checked && <Check className="h-2.5 w-2.5" aria-hidden="true" />}
                    </span>
                    {t(`domain.${sector}` as 'domain.health')}
                  </button>
                )
              })}
            </div>
          </div>

          <label className="block space-y-1 sm:col-span-2">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('countries.field.notes')}</span>
            <textarea
              value={form.notes}
              onChange={(event) => patch({ notes: event.target.value })}
              maxLength={600}
              rows={2}
              className="w-full rounded-lg border border-border bg-transparent px-2 py-1 text-[11px]"
            />
          </label>

          {problem && (
            <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-[10px] text-rose-500 sm:col-span-2">
              {problem}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? (
              <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {busy ? t('countries.saving') : editing ? t('countries.saveEdit') : t('countries.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
