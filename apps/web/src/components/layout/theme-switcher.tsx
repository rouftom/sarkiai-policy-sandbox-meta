'use client'

import * as React from 'react'
import { Check, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { cn } from '@sps/ui'
import { useTheme } from '@/components/theme-provider'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import type { PreferencesDto } from '@/lib/api'

/**
 * Pack gallery plus light/dark/system mode, as in the FSM header. The choice is
 * applied locally immediately and mirrored onto the operator profile when a
 * session is open.
 */
export function ThemeSwitcher() {
  const { t, locale } = useI18n()
  const { packId, mode, packs, setPack, setMode } = useTheme()
  const { operator, savePreferences } = useAuth()
  const [open, setOpen] = React.useState(false)
  const container = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const persist = (patch: Partial<PreferencesDto>) => {
    if (!operator) return
    void savePreferences(patch).catch(() => {})
  }

  const pickPack = (id: string) => {
    setPack(id)
    if (operator) void savePreferences({ pack: id }).catch(() => {})
  }

  const pickMode = (next: 'light' | 'dark' | 'system') => {
    if (next === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setMode(prefersDark ? 'dark' : 'light')
      persist({ theme: 'system' })
      return
    }
    setMode(next)
    persist({ theme: next })
  }

  const modes = [
    { value: 'light' as const, icon: Sun, label: t('theme.light') },
    { value: 'dark' as const, icon: Moon, label: t('theme.dark') },
    { value: 'system' as const, icon: Monitor, label: t('theme.system') },
  ]

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={t('theme.open')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 w-8 items-center justify-center rounded-3xl border-none bg-brand-primary/10 text-brand-primary-dark transition-colors hover:bg-brand-primary/20 dark:bg-brand-primary-dark/30 dark:text-brand-primary-light dark:hover:bg-brand-primary-dark/50"
      >
        <Palette className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-popover p-2 shadow-xl"
        >
          <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('theme.pack')}
          </p>
          {packs.map((pack) => (
            <button
              key={pack.id}
              type="button"
              onClick={() => pickPack(pack.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-secondary"
            >
              <span className="flex gap-0.5">
                <span className="h-3 w-3 rounded-sm" style={{ background: pack.preview.primary }} />
                <span className="h-3 w-3 rounded-sm" style={{ background: pack.preview.secondary }} />
                <span className="h-3 w-3 rounded-sm" style={{ background: pack.preview.accent }} />
              </span>
              <span className="flex-1 truncate text-left">{pack.name[locale]}</span>
              {packId === pack.id && <Check className="h-3.5 w-3.5 text-brand-primary dark:text-brand-primary-light" />}
            </button>
          ))}

          <div className="my-1 h-px bg-border" />
          <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('theme.mode')}
          </p>
          <div className="grid grid-cols-3 gap-1">
            {modes.map(({ value, icon: Icon, label }) => {
              const active = value === 'system' ? operator?.preferences.theme === 'system' : mode === value && operator?.preferences.theme !== 'system'
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => pickMode(value)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-[10px] transition-colors',
                    active ? 'bg-brand-primary/10 text-brand-primary-dark dark:text-brand-primary-light' : 'hover:bg-secondary',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
