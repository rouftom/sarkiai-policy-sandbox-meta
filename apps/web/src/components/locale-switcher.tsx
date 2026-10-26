'use client'

import { useI18n, LOCALES, type Locale } from '@/lib/i18n'

const LABELS: Record<Locale, string> = { en: 'EN', fr: 'FR' }

/** Two-state toggle: the UI is bilingual by design, English by default. */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div
      role="group"
      aria-label={t('app.language')}
      className="inline-flex overflow-hidden rounded-xl border border-border text-[11px]"
    >
      {LOCALES.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setLocale(value)}
          aria-pressed={locale === value}
          className={
            locale === value
              ? 'bg-primary px-2 py-1 font-bold text-primary-foreground'
              : 'px-2 py-1 text-muted-foreground hover:text-foreground'
          }
        >
          {LABELS[value]}
        </button>
      ))}
    </div>
  )
}
