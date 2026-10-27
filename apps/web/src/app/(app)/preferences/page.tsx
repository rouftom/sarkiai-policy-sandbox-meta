'use client'

import * as React from 'react'
import { Check, Loader, Monitor, Moon, Palette, Save, Sun } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Label, Switch, cn } from '@sps/ui'
import { useAuth } from '@/lib/auth'
import { useI18n, type Locale } from '@/lib/i18n'
import { useTheme } from '@/components/theme-provider'
import { PageIntro } from '@/components/page-intro'
import type { PreferencesDto } from '@/lib/api'

const MODES: Array<{ value: PreferencesDto['theme']; icon: React.ComponentType<{ className?: string }>; key: 'theme.light' | 'theme.dark' | 'theme.system' }> = [
  { value: 'light', icon: Sun, key: 'theme.light' },
  { value: 'dark', icon: Moon, key: 'theme.dark' },
  { value: 'system', icon: Monitor, key: 'theme.system' },
]

export default function PreferencesPage() {
  const { t, locale, setLocale } = useI18n()
  const { operator, savePreferences } = useAuth()
  const { packId, packs, setPack, setMode, setRadius } = useTheme()

  const initial = operator?.preferences
  const [draft, setDraft] = React.useState<PreferencesDto | null>(initial ?? null)
  const [saving, setSaving] = React.useState(false)
  const [status, setStatus] = React.useState<'idle' | 'saved' | 'error'>('idle')

  React.useEffect(() => {
    if (operator?.preferences) setDraft(operator.preferences)
  }, [operator?.preferences])

  if (!draft) return null

  const patch = <K extends keyof PreferencesDto>(key: K, value: PreferencesDto[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setStatus('idle')
  }

  const patchNotification = (key: keyof PreferencesDto['notifications'], value: boolean) => {
    setDraft((current) =>
      current ? { ...current, notifications: { ...current.notifications, [key]: value } } : current,
    )
    setStatus('idle')
  }

  const choosePack = (id: string) => {
    patch('pack', id)
    setPack(id)
  }

  const chooseMode = (mode: PreferencesDto['theme']) => {
    patch('theme', mode)
    if (mode === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setMode(prefersDark ? 'dark' : 'light')
    } else {
      setMode(mode)
    }
  }

  const chooseLocale = (next: Locale) => {
    patch('locale', next)
    setLocale(next)
  }

  const chooseRadius = (next: PreferencesDto['radius']) => {
    patch('radius', next)
    setRadius(next)
  }

  const save = async () => {
    setSaving(true)
    try {
      await savePreferences(draft)
      document.documentElement.dataset.density = draft.density === 'compact' ? 'dense' : 'comfortable'
      setRadius(draft.radius)
      setStatus('saved')
    } catch {
      setStatus('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageIntro title={t('prefs.title')} subtitle={t('prefs.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <Palette className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('prefs.appearance')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>{t('prefs.theme')}</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {MODES.map(({ value, icon: Icon, key }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => chooseMode(value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-[11px] transition-colors',
                      draft.theme === value
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary-dark dark:border-brand-primary-light/50 dark:text-brand-primary-light'
                        : 'border-border text-muted-foreground hover:bg-secondary',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('prefs.pack')}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {packs.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    onClick={() => choosePack(pack.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-2 py-2 text-[11px] transition-colors',
                      draft.pack === pack.id
                        ? 'border-brand-primary bg-brand-primary/10 dark:border-brand-primary-light/50'
                        : 'border-border hover:bg-secondary',
                    )}
                  >
                    <span className="flex gap-0.5">
                      <span className="h-3 w-3 rounded-sm" style={{ background: pack.preview.primary }} />
                      <span className="h-3 w-3 rounded-sm" style={{ background: pack.preview.secondary }} />
                      <span className="h-3 w-3 rounded-sm" style={{ background: pack.preview.accent }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-left">{pack.name[locale]}</span>
                    {draft.pack === pack.id && <Check className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-brand-primary-light" />}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {packId !== draft.pack ? '…' : packs.find((pack) => pack.id === draft.pack)?.description?.[locale]}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="locale">{t('prefs.locale')}</Label>
                <select
                  id="locale"
                  value={draft.locale}
                  onChange={(event) => chooseLocale(event.target.value as Locale)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                >
                  <option value="en">English</option>
                  <option value="fr">Français</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="density">{t('prefs.density')}</Label>
                <select
                  id="density"
                  value={draft.density}
                  onChange={(event) => patch('density', event.target.value as PreferencesDto['density'])}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                >
                  <option value="comfortable">{t('prefs.comfortable')}</option>
                  <option value="compact">{t('prefs.compact')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="radius">{t('prefs.radius')}</Label>
                <select
                  id="radius"
                  value={draft.radius}
                  onChange={(event) => chooseRadius(event.target.value as PreferencesDto['radius'])}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
                >
                  <option value="square">{t('prefs.square')}</option>
                  <option value="rounded">{t('prefs.rounded')}</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Save className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('prefs.notifications')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(
              [
                { key: 'whatsapp', label: t('prefs.whatsapp') },
                { key: 'email', label: t('prefs.email') },
                { key: 'digest', label: t('prefs.digest') },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-4">
                <Label htmlFor={`notify-${key}`} className="text-xs text-foreground">
                  {label}
                </Label>
                <Switch
                  id={`notify-${key}`}
                  checked={draft.notifications[key]}
                  onCheckedChange={(value) => patchNotification(key, value)}
                />
              </div>
            ))}
            <p className="border-t border-border pt-3 text-[10px] leading-relaxed text-muted-foreground">
              {t('prefs.readOnly')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? t('prefs.saving') : t('prefs.save')}
        </Button>
        {status === 'saved' && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-brand-primary dark:text-brand-primary-light">
            <Check className="h-3.5 w-3.5" /> {t('prefs.saved')}
          </span>
        )}
        {status === 'error' && <span className="text-[11px] text-destructive">{t('prefs.error')}</span>}
      </div>
    </>
  )
}
