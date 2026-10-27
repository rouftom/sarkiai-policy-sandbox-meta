'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowRight, Check, Copy, FileCheck2, KeyRound, Loader, LockKeyhole, Radio, ShieldCheck } from 'lucide-react'
import { Button, Input, Label } from '@sps/ui'
import { BrandMark } from '@/components/layout/brand-mark'
import { useAuth } from '@/lib/auth'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { ApiError } from '@/lib/api'

type Step = 'credentials' | 'enroll' | 'mfa' | 'recovery'

function formatBackupCode(value: string): string {
  const characters = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
  return characters.length > 5 ? `${characters.slice(0, 5)}-${characters.slice(5)}` : characters
}

/**
 * Operator sign-in, ported from the FSM screen: e-mail and password, then the
 * second factor. The first sign-in of an operator is also the TOTP enrolment;
 * the recovery codes are shown once, right after activation.
 */
export default function LoginPage() {
  const router = useRouter()
  const { t } = useI18n()
  const {
    operator,
    loading,
    pending,
    enrollment,
    backupCodes,
    signIn,
    startEnrollment,
    confirmEnrollment,
    verifyCode,
    dismissBackupCodes,
    resetFlow,
  } = useAuth()

  const [step, setStep] = React.useState<Step>('credentials')
  const [email, setEmail] = React.useState('operator@sarkai.demo')
  const [password, setPassword] = React.useState('')
  const [code, setCode] = React.useState('')
  const [factor, setFactor] = React.useState<'totp' | 'backup'>('totp')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState<string | null>(null)
  const enrollmentStarted = React.useRef(false)

  React.useEffect(() => {
    if (!loading && operator && step !== 'recovery') router.replace('/')
  }, [loading, operator, router, step])

  // The password step returned `enrollment_required`: fetch the otpauth URI once.
  React.useEffect(() => {
    if (pending?.status === 'enrollment_required' && !enrollment && !enrollmentStarted.current) {
      enrollmentStarted.current = true
      setStep('enroll')
      void startEnrollment().catch((cause) => {
        enrollmentStarted.current = false
        setError(messageFor(cause, t('login.expired')))
      })
    }
    if (pending?.status === 'mfa_required') setStep('mfa')
    if (backupCodes) setStep('recovery')
  }, [pending, enrollment, backupCodes, startEnrollment, t])

  const describeError = (cause: unknown, fallback: string) => messageFor(cause, fallback, t)

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email.trim().toLowerCase(), password)
    } catch (cause) {
      setError(describeError(cause, t('login.invalid')))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault()
    const candidate = code.trim()
    if (!candidate) return
    setError(null)
    setBusy(true)
    try {
      if (step === 'enroll') await confirmEnrollment(candidate)
      else await verifyCode(candidate)
    } catch (cause) {
      setError(describeError(cause, factor === 'backup' ? t('login.badBackup') : t('login.badCode')))
    } finally {
      setBusy(false)
    }
  }

  function restart() {
    resetFlow()
    setStep('credentials')
    setPassword('')
    setCode('')
    setError(null)
    setFactor('totp')
    enrollmentStarted.current = false
  }

  function copy(value: string, id: string) {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(id)
      window.setTimeout(() => setCopied(null), 1600)
    })
  }

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <BrandMark className="h-10 w-10 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      <BrandPanel />

      <main className="flex min-h-dvh flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <BrandMark className="h-9 w-9" />
            <span className="font-display text-sm font-bold tracking-tight">SarkiAI Policy Sandbox</span>
          </div>

          {step === 'credentials' && (
            <>
              <StepIntro
                kicker={t('login.kicker')}
                title={t('login.title')}
                subtitle={t('login.subtitle')}
              />
              <form onSubmit={submitPassword} className="mt-8 flex flex-col gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t('login.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    autoFocus
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t('login.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-9"
                  />
                </div>
                {error && <ErrorNote>{error}</ErrorNote>}
                <Button type="submit" disabled={busy} size="lg" className="mt-1 w-full">
                  {busy ? <Loader className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                  {busy ? t('login.signingIn') : t('login.signIn')}
                </Button>
              </form>
              <p className="mt-6 text-[11px] text-muted-foreground">{t('login.demoHint')}</p>
            </>
          )}

          {step === 'enroll' && (
            <>
              <StepIntro
                kicker={t('login.kicker')}
                title={t('login.enrollTitle')}
                subtitle={t('login.enrollSubtitle')}
              />
              {!enrollment ? (
                <div className="mt-10 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader className="h-4 w-4 animate-spin" />
                  {t('login.verifying')}
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-5">
                    <QRCodeSVG value={enrollment.otpauthUrl} size={168} level="M" bgColor="#ffffff" fgColor="#06140E" />
                    <p className="text-center text-[10px] text-slate-500">{t('login.enrollScan')}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('login.enrollSecret')}</Label>
                    <div className="flex items-center gap-2 rounded-lg border border-input px-2 py-1.5">
                      <code className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-wider text-foreground">
                        {enrollment.secret}
                      </code>
                      <button
                        type="button"
                        onClick={() => copy(enrollment.secret, 'secret')}
                        className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-secondary"
                      >
                        {copied === 'secret' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {copied === 'secret' ? t('login.copied') : t('login.copy')}
                      </button>
                    </div>
                  </div>
                  <form onSubmit={submitCode} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="enroll-code">{t('login.code')}</Label>
                      <Input
                        id="enroll-code"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        autoFocus
                        value={code}
                        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="h-10 text-center font-mono text-lg tracking-[0.4em]"
                      />
                    </div>
                    {error && <ErrorNote>{error}</ErrorNote>}
                    <Button type="submit" disabled={busy || code.length !== 6} size="lg" className="w-full">
                      {busy ? <Loader className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {t('login.enrollConfirm')}
                    </Button>
                  </form>
                </div>
              )}
            </>
          )}

          {step === 'mfa' && (
            <>
              <StepIntro
                kicker={t('login.kicker')}
                title={factor === 'totp' ? t('login.mfaTitle') : t('login.backupTitle')}
                subtitle={factor === 'totp' ? t('login.mfaSubtitle') : t('login.backupSubtitle')}
              />
              <form onSubmit={submitCode} className="mt-8 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mfa-code">{factor === 'totp' ? t('login.code') : t('login.backupCode')}</Label>
                  {factor === 'totp' ? (
                    <Input
                      id="mfa-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      autoFocus
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="h-11 text-center font-mono text-xl tracking-[0.4em]"
                    />
                  ) : (
                    <Input
                      id="mfa-code"
                      autoComplete="off"
                      maxLength={11}
                      autoFocus
                      value={code}
                      onChange={(event) => setCode(formatBackupCode(event.target.value))}
                      className="h-10 text-center font-mono text-sm tracking-[0.25em]"
                    />
                  )}
                </div>
                {error && <ErrorNote>{error}</ErrorNote>}
                <Button
                  type="submit"
                  disabled={busy || code.length < (factor === 'totp' ? 6 : 11)}
                  size="lg"
                  className="w-full"
                >
                  {busy ? <Loader className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {busy ? t('login.verifying') : t('login.verify')}
                </Button>
                <div className="flex items-center justify-between text-[10px]">
                  <button
                    type="button"
                    onClick={() => {
                      setFactor(factor === 'totp' ? 'backup' : 'totp')
                      setCode('')
                      setError(null)
                    }}
                    className="font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {factor === 'totp' ? t('login.useBackup') : t('login.useTotp')}
                  </button>
                  <button
                    type="button"
                    onClick={restart}
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {t('login.expired')}
                  </button>
                </div>
              </form>
            </>
          )}

          {step === 'recovery' && backupCodes && (
            <>
              <StepIntro
                kicker={t('login.kicker')}
                title={t('login.recoveryTitle')}
                subtitle={t('login.recoverySubtitle')}
              />
              <div className="mt-6 grid grid-cols-2 gap-2">
                {backupCodes.map((recovery) => (
                  <code
                    key={recovery}
                    className="rounded-lg border border-border bg-secondary/50 px-2 py-1.5 text-center font-mono text-[11px] tracking-wider"
                  >
                    {recovery}
                  </code>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copy(backupCodes.join('\n'), 'codes')}
                  className="flex-1"
                >
                  {copied === 'codes' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === 'codes' ? t('login.copied') : t('login.copy')}
                </Button>
              </div>
              <Button
                size="lg"
                className="mt-4 w-full"
                onClick={() => {
                  dismissBackupCodes()
                  router.replace('/')
                }}
              >
                {t('login.recoveryContinue')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function StepIntro({ kicker, title, subtitle }: { kicker: string; title: string; subtitle: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-primary dark:text-brand-primary-light">
        {kicker}
      </p>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive"
    >
      {children}
    </p>
  )
}

function messageFor(
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

function BrandPanel() {
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
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-primary-light">SarkiAI</span>
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

      <p className="relative text-[10px] uppercase tracking-[0.18em] text-white/40">
        Meta Global AI Developer Hackathon · Startup track
      </p>
    </section>
  )
}
