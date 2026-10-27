'use client'

/**
 * Shared chrome for the two unauthenticated screens (`/login`, `/setup`):
 * the brand panel, the narrow form column, the step heading and the error note.
 * Keeping them in one place means the first-run screen and the sign-in screen
 * cannot drift apart.
 */

import * as React from 'react'
import { Check, Copy, FileCheck2, Radio, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/lib/api'
import type { MessageKey } from '@/lib/i18n'
import { BrandMark } from '@/components/layout/brand-mark'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      <BrandPanel />
      <main className="flex min-h-dvh flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
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
          Policy decisions, <span className="text-gradient-gold">under human control.</span>
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          A multi-agent engine that runs error scenarios, scores AI readiness and drafts public
          communication — with a hash-chained audit trail behind every step.
        </p>

        <ul className="mt-8 space-y-4">
          {[
            { icon: ShieldCheck, title: 'Mandated agents, shared facts', body: 'Information is released in batches so each institution reasons from its own mandate.' },
            { icon: FileCheck2, title: 'Citation validator', body: 'Quotes are checked against the corpus before an answer reaches the operator.' },
            { icon: Radio, title: 'WhatsApp approvals', body: 'Meta Cloud API pushes the alert; the decision stays inside this console.' },
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

      <p className="relative text-[10px] text-white/40">
        Meta Global AI Developer Hackathon · Startup track
      </p>
    </section>
  )
}
