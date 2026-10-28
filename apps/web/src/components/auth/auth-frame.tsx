'use client'

/**
 * Shared chrome for the unauthenticated screens (`/login`, `/setup`, `/signup`,
 * the reset pages): the brand panel on the left, the narrow form column on the
 * right, the step heading and the error note. Keeping them in one place means
 * the screens cannot drift apart.
 *
 * The brand panel follows the active pack and mode through theme tokens, like
 * the organization and web sign-in screens. It never carries its own palette.
 */

import * as React from 'react'
import {
  Check,
  Copy,
  FileCheck2,
  FileText,
  Gavel,
  Landmark,
  Languages,
  Moon,
  Network,
  Scale,
  ScrollText,
  Send,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { cn } from '@sps/ui'
import { ApiError, NetworkError } from '@/lib/api'
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
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  )
}

/**
 * Left column. Defaults to the product pitch; a screen can hand over its own
 * content (the sign-up page puts the demo-account block there).
 */
export function AuthLayout({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-brand-primary/10 px-12 py-14 text-foreground dark:bg-brand-primary-dark/20 lg:flex lg:flex-col lg:justify-between">
        <Backdrop />
        {aside ?? <BrandContent />}
      </section>
      <main className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-background px-6 py-12 sm:px-10 lg:px-16">
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

export function StepIntro({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle: string }) {
  return (
    <div>
      {kicker && <p className="text-[10px] font-medium text-brand-primary dark:text-brand-primary-light">{kicker}</p>}
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
  // Never report a network failure as a wrong password.
  if (cause instanceof NetworkError) return t ? t('login.unreachable', { url: cause.url }) : fallback
  if (!(cause instanceof ApiError)) return fallback
  const body = cause.json<{ error?: string }>()
  if (cause.status === 503) return t ? t('login.unavailable') : fallback
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

/** Default left column: what the console is. */
export function BrandContent() {
  const { t } = useI18n()
  return (
    <>
      <div className="relative flex items-center gap-2.5">
        <BrandMark className="h-10 w-10" />
        <span className="font-display text-base font-bold tracking-tight">SarkiAI Policy Sandbox</span>
      </div>

      <div className="relative max-w-md">
        <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">
          {t('auth.heroTitle')} {t('auth.heroAccent')}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t('auth.heroBody')}</p>

        <ul className="mt-8 space-y-4">
          {[
            { icon: Scale, title: t('auth.point1Title'), body: t('auth.point1Body') },
            { icon: FileCheck2, title: t('auth.point2Title'), body: t('auth.point2Body') },
            { icon: Send, title: t('auth.point3Title'), body: t('auth.point3Body') },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/15 text-brand-primary dark:text-brand-primary-light">
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <span className="block text-xs font-semibold">{title}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative text-[10px] text-muted-foreground">{t('auth.madeBy')}</p>
    </>
  )
}

/** Sign-up left column: the demo account block and its disclaimers. */
export function DemoAccessContent() {
  const { t } = useI18n()
  return (
    <>
      <div className="relative flex items-center gap-2.5">
        <BrandMark className="h-10 w-10" />
        <span className="font-display text-base font-bold tracking-tight">SarkiAI Policy Sandbox</span>
      </div>

      <div className="relative max-w-md space-y-6">
        <div>
          <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">{t('signup.title')}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t('signup.subtitle')}</p>
        </div>

        <div className="rounded-lg border border-brand-primary/20 bg-background/60 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-primary-dark dark:text-brand-primary-light">
            {t('signup.pitchTitle')}
          </p>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <li>{t('signup.pitch1')}</li>
            <li>{t('signup.pitch2')}</li>
            <li>{t('signup.pitch3')}</li>
          </ul>
        </div>

        <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t('signup.noticeTitle')}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">{t('signup.notice')}</p>
        </div>
      </div>

      <p className="relative text-[10px] text-muted-foreground">{t('auth.madeBy')}</p>
    </>
  )
}

/** Policy-themed backdrop: the same quiet layout as the org screens, with governance icons. */
function Backdrop() {
  const icon = 'pointer-events-none absolute text-brand-primary/25 dark:text-brand-primary-light/20'
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-primary/25 blur-3xl" />
      <div className="absolute -right-16 bottom-16 h-64 w-64 rounded-full bg-brand-accent/15 blur-3xl" />
      <div className="absolute right-16 top-24 h-40 w-40 rotate-12 rounded-[2rem] border border-brand-primary/15" />
      <div className="absolute bottom-28 left-16 h-24 w-24 -rotate-12 rounded-3xl border border-brand-primary/20" />
      <Scale className={`${icon} left-12 top-28 h-7 w-7 -rotate-12`} />
      <Landmark className={`${icon} right-24 top-44 h-8 w-8 rotate-12`} />
      <Gavel className={`${icon} bottom-44 right-1/3 h-6 w-6 rotate-12`} />
      <FileText className={`${icon} bottom-28 left-1/3 h-7 w-7 -rotate-6`} />
      <Network className={`${icon} right-10 top-1/2 h-8 w-8 -rotate-12`} />
      <ScrollText className={`${icon} bottom-16 right-28 h-7 w-7 rotate-6`} />
      <ShieldCheck className={`${icon} right-1/3 top-16 h-6 w-6 rotate-12`} />
      <Languages className={`${icon} bottom-24 left-12 h-7 w-7 -rotate-12`} />
    </div>
  )
}
