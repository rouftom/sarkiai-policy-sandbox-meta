'use client'

import * as React from 'react'
import Link from 'next/link'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowLeft, Loader, MailCheck, Send } from 'lucide-react'
import { Button, Input, Label } from '@sps/ui'
import { ApiError, authApi } from '@/lib/api'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { AuthLayout, ErrorNote, StepIntro } from '@/components/auth/auth-frame'
import { TurnstileWidget, useTurnstileCheck } from '@/components/auth/turnstile-check'

/**
 * Request a password-reset link.
 *
 * The API answers `200` whether or not the address exists, so this screen has
 * the same success state for both: it never reveals which e-mails are
 * registered. The link is signed, single-use and expires after 30 minutes.
 */
export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const [sent, setSent] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)
  // Human check, decided by the API: cloud deployments require it, local and
  // sovereign installs (or a deployment without keys) get `required: false`.
  const turnstile = useTurnstileCheck()

  const schema = React.useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t('login.emailRequired')).email(t('login.emailInvalid')),
      }),
    [t],
  )

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  const submit = form.handleSubmit(async (values) => {
    if (turnstile.required && !turnstile.token) {
      setFailure(t('reset.captchaRequired'))
      return
    }

    setBusy(true)
    setFailure(null)
    try {
      await authApi.forgotPassword(
        values.email.trim().toLowerCase(),
        turnstile.required ? (turnstile.token ?? undefined) : undefined,
      )
      setSent(values.email.trim().toLowerCase())
    } catch (cause) {
      if (cause instanceof ApiError && cause.json<{ error?: string }>()?.error === 'captcha_failed') {
        setFailure(t('reset.captchaFailed'))
        turnstile.reset()
      } else {
        setFailure(resetMessage(cause, t('reset.forgotFailed'), t))
      }
    } finally {
      setBusy(false)
    }
  })

  return (
    <AuthLayout>
      {sent ? (
        <>
          <StepIntro title={t('reset.sentTitle')} subtitle={t('reset.sentBody')} />
          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-3">
            <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light" />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-primary-dark dark:text-brand-primary-light">
                {t('reset.sentTo')}
              </p>
              <p className="mt-0.5 truncate text-xs text-foreground">{sent}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{t('reset.sentHint')}</p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-6 w-full"
            onClick={() => {
              setSent(null)
              form.reset()
            }}
          >
            {t('reset.tryAnother')}
          </Button>
          <Link
            href="/login"
            className="mt-4 flex items-center justify-center gap-1 text-center text-[11px] font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3 w-3" />
            {t('reset.backToLogin')}
          </Link>
        </>
      ) : (
        <>
          <StepIntro title={t('reset.forgotTitle')} subtitle={t('reset.forgotSubtitle')} />
          <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="forgot-email">{t('login.email')}</Label>
              <Input
                id="forgot-email"
                type="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
                autoFocus
                {...form.register('email')}
                aria-invalid={Boolean(form.formState.errors.email)}
                className="h-9"
              />
              {form.formState.errors.email && <FieldNote>{form.formState.errors.email.message}</FieldNote>}
            </div>
            {failure && <ErrorNote>{failure}</ErrorNote>}
            <TurnstileWidget check={turnstile} action="password_reset" />
            <Button
              type="submit"
              disabled={busy || turnstile.loading || (turnstile.required && !turnstile.token)}
              size="lg"
              className="mt-1 w-full"
            >
              {busy ? <Loader className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {busy ? t('reset.sending') : t('reset.send')}
            </Button>
          </form>
          <Link
            href="/login"
            className="mt-6 flex items-center justify-center gap-1 text-center text-[11px] font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            <ArrowLeft className="h-3 w-3" />
            {t('reset.backToLogin')}
          </Link>
        </>
      )}
    </AuthLayout>
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
  fallback: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  if (!(cause instanceof ApiError)) return fallback
  if (cause.status === 429) return t('login.rateLimited')
  const code = cause.json<{ error?: string }>()?.error
  if (code === 'mail_not_configured' || code === 'mail_failed') return t('reset.mailFailed')
  if (code === 'storage_unavailable') return t('reset.unavailable')
  return fallback
}
