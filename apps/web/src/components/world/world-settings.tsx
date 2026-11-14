'use client'

/**
 * World settings: the display rules every World view applies.
 *
 * Thresholds are deployment-wide — they change how each operator reads the same
 * runs — so only an administrator may save them. Everyone else reads them;
 * percentage fields show whole percents and are stored as fractions.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Lock, RotateCcw, Save, Settings2, TriangleAlert } from 'lucide-react'
import { Badge, Button, Input, Skeleton } from '@sps/ui'
import { worldApi, type WorldSettingsDto, type WorldSettingsResponseDto } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n, type MessageKey } from '@/lib/i18n'

type PercentKey = 'minCoverage' | 'minConfidence' | 'rankMinCoverage' | 'rankMinConfidence'
type IntegerKey = 'staleAfterDays' | 'minCountryChunks' | 'compareMaxCountries'

const PERCENT_FIELDS: ReadonlyArray<{ key: PercentKey; label: MessageKey; hint: MessageKey }> = [
  { key: 'minCoverage', label: 'world.settings.minCoverage', hint: 'world.settings.minCoverage.hint' },
  { key: 'minConfidence', label: 'world.settings.minConfidence', hint: 'world.settings.minConfidence.hint' },
  { key: 'rankMinCoverage', label: 'world.settings.rankMinCoverage', hint: 'world.settings.rankMinCoverage.hint' },
  {
    key: 'rankMinConfidence',
    label: 'world.settings.rankMinConfidence',
    hint: 'world.settings.rankMinConfidence.hint',
  },
]

const INTEGER_FIELDS: ReadonlyArray<{
  key: IntegerKey
  label: MessageKey
  hint: MessageKey
  min: number
  max: number
}> = [
  {
    key: 'staleAfterDays',
    label: 'world.settings.staleAfterDays',
    hint: 'world.settings.staleAfterDays.hint',
    min: 1,
    max: 3650,
  },
  {
    key: 'minCountryChunks',
    label: 'world.settings.minCountryChunks',
    hint: 'world.settings.minCountryChunks.hint',
    min: 0,
    max: 1000,
  },
  {
    key: 'compareMaxCountries',
    label: 'world.settings.compareMaxCountries',
    hint: 'world.settings.compareMaxCountries.hint',
    min: 2,
    max: 12,
  },
]

export function WorldSettingsView({ onSaved }: { onSaved: (settings: WorldSettingsDto) => void }) {
  const { t, locale } = useI18n()
  const { operator } = useAuth()
  const router = useRouter()
  const canEdit = operator?.role === 'admin'

  const [data, setData] = React.useState<WorldSettingsResponseDto | null>(null)
  const [draft, setDraft] = React.useState<WorldSettingsDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState<'idle' | 'saved'>('idle')

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const result = await worldApi.settings()
      setData(result)
      setDraft(result.settings)
      setProblem(null)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const dateFormat = React.useMemo(
    () =>
      new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  )

  if (loading && !draft) {
    return (
      <div className="space-y-2 border border-border p-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-full" />
        ))}
      </div>
    )
  }

  if (!draft || !data) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          {t('world.settings.error')} {problem}
        </span>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          {t('world.retry')}
        </Button>
      </div>
    )
  }

  const setPercent = (key: PercentKey, raw: string) => {
    const percent = Math.max(0, Math.min(100, Number(raw) || 0))
    setDraft((current) => (current ? { ...current, [key]: percent / 100 } : current))
    setStatus('idle')
  }

  const setInteger = (key: IntegerKey, raw: string, min: number, max: number) => {
    const value = Math.max(min, Math.min(max, Math.round(Number(raw) || min)))
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setStatus('idle')
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(data.settings)

  const save = async () => {
    setSaving(true)
    setProblem(null)
    try {
      const result = await worldApi.updateSettings(draft)
      setData(result)
      setDraft(result.settings)
      setStatus('saved')
      onSaved(result.settings)
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary">
          <Settings2 className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-foreground">{t('world.settings.title')}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t('world.settings.subtitle')}</p>
        </div>
        {canEdit ? (
          <Badge tone="brand" className="text-[9px]">
            {t('world.settings.admin')}
          </Badge>
        ) : (
          <Badge tone="neutral" className="text-[9px]">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {t('world.settings.readOnly')}
          </Badge>
        )}
      </div>

      {problem && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {t('world.settings.saveError')} {problem}
          </span>
        </div>
      )}

      <fieldset disabled={!canEdit || saving} className="space-y-4">
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 className="text-[12px] font-semibold text-foreground">{t('world.settings.display')}</h3>
          <p className="text-[11px] text-muted-foreground">{t('world.settings.displayHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PERCENT_FIELDS.slice(0, 2).map((field) => (
              <label key={field.key} className="space-y-1 text-[11px]">
                <span className="font-medium text-foreground">{t(field.label)}</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(draft[field.key] * 100)}
                    onChange={(event) => setPercent(field.key, event.target.value)}
                    aria-label={t(field.label)}
                    className="h-7 w-24 text-[12px] tabular-nums"
                  />
                  <span className="text-[11px] text-muted-foreground">%</span>
                </div>
                <span className="block text-[10px] text-muted-foreground">{t(field.hint)}</span>
              </label>
            ))}
            <label className="space-y-1 text-[11px]">
              <span className="font-medium text-foreground">{t('world.settings.staleAfterDays')}</span>
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={1}
                  max={3650}
                  step={1}
                  value={draft.staleAfterDays}
                  onChange={(event) => setInteger('staleAfterDays', event.target.value, 1, 3650)}
                  aria-label={t('world.settings.staleAfterDays')}
                  className="h-7 w-24 text-[12px] tabular-nums"
                />
                <span className="text-[11px] text-muted-foreground">{t('world.settings.days')}</span>
              </div>
              <span className="block text-[10px] text-muted-foreground">
                {t('world.settings.staleAfterDays.hint')}
              </span>
            </label>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h3 className="text-[12px] font-semibold text-foreground">{t('world.settings.ranking')}</h3>
          <p className="text-[11px] text-muted-foreground">{t('world.settings.rankingHint')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PERCENT_FIELDS.slice(2).map((field) => (
              <label key={field.key} className="space-y-1 text-[11px]">
                <span className="font-medium text-foreground">{t(field.label)}</span>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(draft[field.key] * 100)}
                    onChange={(event) => setPercent(field.key, event.target.value)}
                    aria-label={t(field.label)}
                    className="h-7 w-24 text-[12px] tabular-nums"
                  />
                  <span className="text-[11px] text-muted-foreground">%</span>
                </div>
                <span className="block text-[10px] text-muted-foreground">{t(field.hint)}</span>
              </label>
            ))}
            {INTEGER_FIELDS.slice(1).map((field) => (
              <label key={field.key} className="space-y-1 text-[11px]">
                <span className="font-medium text-foreground">{t(field.label)}</span>
                <Input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={1}
                  value={draft[field.key]}
                  onChange={(event) => setInteger(field.key, event.target.value, field.min, field.max)}
                  aria-label={t(field.label)}
                  className="h-7 w-24 text-[12px] tabular-nums"
                />
                <span className="block text-[10px] text-muted-foreground">{t(field.hint)}</span>
              </label>
            ))}
          </div>
        </section>
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <div className="min-w-0 flex-1 text-[10px] text-muted-foreground">
          {data.updatedAt ? (
            <p>
              {t('world.settings.updated', {
                date: dateFormat.format(new Date(data.updatedAt)),
                by: data.updatedBy || '—',
              })}
            </p>
          ) : (
            <p>{t('world.settings.neverUpdated')}</p>
          )}
          <p>{t('world.settings.defaultsNote')}</p>
          {status === 'saved' && <p className="text-brand-primary">{t('world.settings.saved')}</p>}
        </div>
        {canEdit ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(data.defaults)
                setStatus('idle')
              }}
              disabled={saving || JSON.stringify(draft) === JSON.stringify(data.defaults)}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('world.settings.reset')}
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || !dirty}>
              <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {saving ? t('world.settings.saving') : t('world.settings.save')}
            </Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => router.push('/security')}>
            <Lock className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('world.settings.askAdmin')}
          </Button>
        )}
      </div>
    </div>
  )
}
