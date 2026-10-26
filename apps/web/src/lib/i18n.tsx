'use client'

/**
 * Bilingual demo UI (EN / FR). English is the default: the judges, the README
 * and the submission are in English, while the primary deployment context
 * (Cameroon) operates in French.
 *
 * Messages are a flat key → string map so a missing translation is a type
 * error, not a runtime fallback.
 */

import * as React from 'react'

export type Locale = 'en' | 'fr'

export const LOCALES: readonly Locale[] = ['en', 'fr'] as const

export const LOCALE_STORAGE_KEY = 'sps.locale'

const en = {
  'app.tagline': 'One policy-grounded engine · two lenses · runs on Meta models',
  'app.theme': 'Theme',
  'app.toggleTheme': 'Toggle light / dark',
  'app.language': 'Language',
  'app.country': 'Country',
  'app.domain': 'Domain',

  'provider.title': 'Inference provider',
  'provider.mode.cloud': 'Meta Model API',
  'provider.mode.sovereign': 'Open weights (Muse Glimmer)',
  'provider.mode.local': 'Local (Ollama)',
  'provider.residency.on-premise': 'On-premise · nothing leaves the institution',
  'provider.residency.cloud': 'Cloud API',
  'provider.ready': 'Ready',
  'provider.notReady': 'Not configured',
  'provider.openWeights': 'Open weights',
  'provider.budget': 'Run budget',
  'provider.switchHint': 'Set SANDBOX_MODE=cloud | sovereign | local and restart the API.',

  'citation.verified': 'Every quoted provision was found in the corpus',
  'citation.verifiedAfterRetry': 'Answer rejected once, then verified ({attempts} attempts)',
  'citation.rejected': '{count} quote(s) could not be found in the corpus — reported as a gap',
}

const fr: Record<keyof typeof en, string> = {
  'app.tagline': 'Un moteur policy-grounded · deux lenses · tourne sur les modèles Meta',
  'app.theme': 'Thème',
  'app.toggleTheme': 'Basculer clair / sombre',
  'app.language': 'Langue',
  'app.country': 'Pays',
  'app.domain': 'Domaine',

  'provider.title': 'Fournisseur d’inférence',
  'provider.mode.cloud': 'Meta Model API',
  'provider.mode.sovereign': 'Poids ouverts (Muse Glimmer)',
  'provider.mode.local': 'Local (Ollama)',
  'provider.residency.on-premise': 'Sur site · aucune donnée ne quitte l’institution',
  'provider.residency.cloud': 'API cloud',
  'provider.ready': 'Prêt',
  'provider.notReady': 'Non configuré',
  'provider.openWeights': 'Poids ouverts',
  'provider.budget': 'Budget par exécution',
  'provider.switchHint': 'Régler SANDBOX_MODE=cloud | sovereign | local puis redémarrer l’API.',

  'citation.verified': 'Chaque disposition citée a été retrouvée dans le corpus',
  'citation.verifiedAfterRetry': 'Réponse rejetée une fois, puis vérifiée ({attempts} tentatives)',
  'citation.rejected': '{count} citation(s) introuvable(s) dans le corpus — signalée(s) comme lacune',
}

const DICTIONARIES: Record<Locale, Record<keyof typeof en, string>> = { en, fr }

export type MessageKey = keyof typeof en

/** Locale from the build-time default (`NEXT_PUBLIC_DEFAULT_LOCALE`, English). */
export function defaultLocale(): Locale {
  const value = (process.env.NEXT_PUBLIC_DEFAULT_LOCALE ?? 'en').toLowerCase()
  return (LOCALES as readonly string[]).includes(value) ? (value as Locale) : 'en'
}

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const template = DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`))
}

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
}

const I18nContext = React.createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(defaultLocale)

  // Restore the visitor's choice (the first render stays server-consistent).
  React.useEffect(() => {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && (LOCALES as readonly string[]).includes(stored)) setLocaleState(stored as Locale)
  }, [])

  React.useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next)
    localStorage.setItem(LOCALE_STORAGE_KEY, next)
  }, [])

  const value = React.useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = React.useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside <I18nProvider>.')
  return context
}
