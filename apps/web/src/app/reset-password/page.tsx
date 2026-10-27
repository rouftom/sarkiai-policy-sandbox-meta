'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowLeft, ArrowRight, CheckCircle2, KeyRound, Loader, ShieldAlert } from 'lucide-react'
import { Button, Label } from '@sps/ui'
import { ApiError, authApi } from '@/lib/api'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { AuthLayout, ErrorNote, StepIntro } from '@/components/auth/auth-frame'
import { PasswordInput } from '@/components/auth/password-input'

/** Same floor as the API (`assertPassword`). */
const MIN_PASSWORD = 12

/**
 * Consume a signed reset link and set a new password.
 *
 * The token travels in `?token=` and is claimed once by the API; MFA stays
 * enrolled, so the next sign-in still asks for the authenticator code.
 */
export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<ResetFallback />}>
      <ResetForm />
    </React.Suspense>
  )
}

function ResetFallback() {
  const { t } = useI18n()
  return (
    <AuthLayout>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader className="h-4 w-4 animate-spin" />
        {t('reset.checking')}
      </div>
    </AuthLayout>
  )
}

function ResetForm() {
  const { t } = useI18n()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)

  const schema = React.useMemo(
    () =>
      z
        .object({
          password: z
            .string()
            .min(MIN_PASSWORD, t('login.passwordTooShort', { count: MIN_PASSWORD }))
            .regex(/[A-Za-z]/, t('login.passwordLetters'))
            .regex(/\d/, t('login.passwordDigits')),
          confirm: z.string().min(1, t('login.passwordConfirmRequired')),
        })
        .refine((values) => values.password === values.confirm, {
          path: ['confirm'],
          message: t('login.passwordMismatch'),
        }),
    [t],
  )

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: '', confirm: '' },
  })

  const submit = form.handleSubmit(async (values) => {
    setBusy(true)
    setFailure(null)
    try {
      await authApi.resetPassword(token, values.password)
      setDone(true)
    } catch (cause) {
      setFailure(resetMessage(cause, t))
    } finally {
      setBusy(false)
    }
  })

  if (!token) {
    return (
      <AuthLayout>
        <StepIntro kicker={t('reset.kicker')} title={t('reset.missingTitle')} subtitle={t('reset.missingBody')} />
        <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">{t('reset.missingHint')}</p>
        </div>
        <Link href="/forgot-password" className="mt-6 block">
          <Button type="button" size="lg" className="w-full">
            {t('reset.requestNew')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <BackToLogin label={t('reset.backToLogin')} />
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout>
        <StepIntro kicker={t('reset.kicker')} title={t('reset.successTitle')} subtitle={t('reset.successBody')} />
        <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light" />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('reset.successHint')}</p>
        </div>
        <Link href="/login" className="mt-6 block">
          <Button type="button" size="lg" className="w-full">
            {t('reset.goToLogin')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <StepIntro kicker={t('reset.kicker')} title={t('reset.title')} subtitle={t('reset.subtitle')} />
      <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="reset-password">{t('reset.newPassword')}</Label>
          <PasswordInput
            id="reset-password"
            autoComplete="new-password"
            autoFocus
            showLabel={t('login.showPassword')}
            hideLabel={t('login.hidePassword')}
            {...form.register('password')}
            aria-invalid={Boolean(form.formState.errors.password)}
            className="h-9"
          />
          {form.formState.errors.password ? (
            <FieldNote>{form.formState.errors.password.message}</FieldNote>
          ) : (
            <p className="text-[10px] text-muted-foreground">{t('login.passwordHint', { count: MIN_PASSWORD })}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reset-confirm">{t('reset.confirm')}</Label>
          <PasswordInput
            id="reset-confirm"
            autoComplete="new-password"
            showLabel={t('login.showPassword')}
            hideLabel={t('login.hidePassword')}
            {...form.register('confirm')}
            aria-invalid={Boolean(form.formState.errors.confirm)}
            className="h-9"
          />
          {form.formState.errors.confirm && <FieldNote>{form.formState.errors.confirm.message}</FieldNote>}
        </div>
        {failure && <ErrorNote>{failure}</ErrorNote>}
        <Button type="submit" disabled={busy} size="lg" className="mt-1 w-full">
          {busy ? <Loader className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {busy ? t('reset.submitting') : t('reset.submit')}
        </Button>
      </form>
      <BackToLogin label={t('reset.backToLogin')} />
    </AuthLayout>
  )
}

function BackToLogin({ label }: { label: string }) {
  return (
    <Link
      href="/login"
      className="mt-6 flex items-center justify-center gap-1 text-center text-[11px] font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeft className="h-3 w-3" />
      {label}
    </Link>
  )
}

function FieldNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-[10px] text-destructive">
      {children}
    </p>
  )
}

function resetMessage(
  cause: unknown,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  if (!(cause instanceof ApiError)) return t('reset.failed')
  if (cause.status === 429) return t('login.rateLimited')
  const code = cause.json<{ error?: string }>()?.error
  if (code === 'challenge_invalid') return t('reset.invalidToken')
  if (code === 'weak_password') return t('login.passwordTooShort', { count: MIN_PASSWORD })
  if (code === 'storage_unavailable') return t('reset.unavailable')
  return t('reset.failed')
}
