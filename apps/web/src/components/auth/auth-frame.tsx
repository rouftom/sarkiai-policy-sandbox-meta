'use client'

/**
 * Shared chrome for the two unauthenticated screens (`/login`, `/setup`):
 * the brand panel, the narrow form column, the step heading and the error note.
 * Keeping them in one place means the first-run screen and the sign-in screen
 * cannot drift apart.
 */

import * as React from 'react'
import { Check, Copy, FileCheck2, Moon, Radio, ShieldCheck, Sun } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { useTheme } from '@/components/theme-provider'
import { BrandMark } from '@/components/layout/brand-mark'

/**
 * Compact light/dark switch for the unauthenticated screens. It writes the same
 * keys as the console switcher, so the choice follows the operator into the app
 * (and the pre-paint script picks it up on the next visit).
 */
function AuthThemeToggle() {
  const { mode, toggleMode } = useTheme()
  const { t } = useI18n()
  const dark = mode === 'dark'
  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={t('app.toggleTheme')}
      title={t('app.toggleTheme')}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  )
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
      <BrandPanel />
      {/*
        The form column is the same themed panel surface as the signed-in
        console (`--app-panel-bg` + the pack corner radius), not a plain white
        card: switching pack or mode changes the sign-in screen too.
      */}
      <main className="relative flex min-h-dvh flex-col justify-center overflow-hidden border-border/70 bg-[var(--app-panel-bg)] px-6 py-12 sm:px-10 lg:m-3 lg:ml-0 lg:min-h-[calc(100dvh-1.5rem)] lg:rounded-3xl lg:border lg:px-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-brand-primary/[0.07] to-transparent dark:from-brand-primary-light/[0.06]"
        />
        <div className="absolute right-6 top-6 z-10 sm:right-10 lg:right-8 lg:top-8">
          <AuthThemeToggle />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <BrandMark className="h-9 w-9" />
            <span className="font-display text-sm font-bold tracking-tight">SarkiAI Policy Sandbox</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

export function StepIntro({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-brand-primary dark:text-brand-primary-light">
        {kicker}
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  )
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive"
    >
      {children}
    </p>
  )
}

export function messageFor(
  cause: unknown,
  fallback: string,
  t?: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  if (!(cause instanceof ApiError)) return fallback
  const body = cause.json<{ error?: string }>()
  if (cause.status === 429) return t ? t('login.rateLimited') : fallback
  if (body?.error === 'challenge_invalid') return t ? t('login.expired') : fallback
  if (cause.status === 401) return t ? t('login.invalid') : fallback
  return fallback
}

export function CopyButton({ value, label }: { value: string; label: { copy: string; copied: string } }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1600)
        })
      }}
      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-secondary"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? label.copied : label.copy}
    </button>
  )
}

export function BrandPanel() {
  const { t } = useI18n()
  return (
    <section className="relative hidden overflow-hidden bg-brand-ink px-12 py-14 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-primary/30 blur-3xl" />
        <div className="absolute -right-16 bottom-16 h-64 w-64 rounded-full bg-brand-accent/15 blur-3xl" />
        <div className="absolute right-16 top-24 h-40 w-40 rotate-12 rounded-[2rem] border border-white/10" />
        <div className="absolute bottom-28 left-16 h-24 w-24 -rotate-12 rounded-3xl border border-brand-accent/25" />
      </div>

      <div className="relative flex items-center gap-2.5">
        <BrandMark className="h-10 w-10" />
        <span className="flex items-baseline gap-2">
          <span className="font-display text-base font-bold tracking-tight">SPS</span>
          <span className="text-[10px] font-medium text-brand-primary-light">SarkiAI</span>
        </span>
      </div>

      <div className="relative max-w-md">
        <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">
          {t('auth.heroTitle')} <span className="text-gradient-accent">{t('auth.heroAccent')}</span>
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/70">{t('auth.heroBody')}</p>

        <ul className="mt-8 space-y-4">
          {[
            { icon: ShieldCheck, title: t('auth.point1Title'), body: t('auth.point1Body') },
            { icon: FileCheck2, title: t('auth.point2Title'), body: t('auth.point2Body') },
            { icon: Radio, title: t('auth.point3Title'), body: t('auth.point3Body') },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                <Icon className="h-4 w-4 text-brand-primary-light" />
              </span>
              <span>
                <span className="block text-xs font-semibold">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-white/60">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-[10px] text-white/40">{t('auth.hackathon')}</p>
    </section>
  )
}
