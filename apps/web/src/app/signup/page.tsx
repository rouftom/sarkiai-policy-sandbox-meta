'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowLeft, Loader, ShieldCheck, UserPlus } from 'lucide-react'
import { Button, Input, Label } from '@sps/ui'
import { ApiError, authApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { AuthLayout, ErrorNote, StepIntro } from '@/components/auth/auth-frame'
import { PasswordInput } from '@/components/auth/password-input'

/** Same floor as the API (`assertPassword`). */
const MIN_PASSWORD = 12

type Gate = 'checking' | 'open' | 'closed'

/**
 * Public self-service sign-up, opened by the API in cloud mode only.
 *
 * The judge creates an account with their own password and is immediately
 * pushed into the mandatory TOTP enrolment: `signUp` stores the
 * `enrollment_required` challenge in the auth provider, then this page hands
 * over to `/login`, whose enrolment effect takes the operator to the QR code.
 * The notice about Meta model training is part of the form, not a footnote.
 */
export default function SignupPage() {
  const router = useRouter()
  const { t } = useI18n()
  const { operator, loading, signUp } = useAuth()
  const [gate, setGate] = React.useState<Gate>('checking')
  const [busy, setBusy] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)
  const checked = React.useRef(false)

  const schema = React.useMemo(
    () =>
      z
        .object({
          firstName: z.string().trim().min(2, t('setup.fieldTooShort')).max(60, t('setup.fieldTooLong')),
          lastName: z.string().trim().min(2, t('setup.fieldTooShort')).max(60, t('setup.fieldTooLong')),
          email: z.string().trim().min(1, t('login.emailRequired')).email(t('login.emailInvalid')),
          password: z
            .string()
            .min(MIN_PASSWORD, t('login.passwordTooShort', { count: MIN_PASSWORD }))
            .regex(/[A-Za-z]/, t('login.passwordLetters'))
            .regex(/\d/, t('login.passwordDigits')),
          confirm: z.string().min(1, t('login.passwordConfirmRequired')),
          accept: z.boolean(),
        })
        .refine((values) => values.password === values.confirm, {
          path: ['confirm'],
          message: t('login.passwordMismatch'),
        })
        .refine((values) => values.accept, {
          path: ['accept'],
          message: t('signup.acceptRequired'),
        }),
    [t],
  )

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirm: '',
      accept: false,
    },
  })

  React.useEffect(() => {
    if (checked.current) return
    checked.current = true
    void authApi
      .setupStatus()
      .then((status) => setGate(status.signup ? 'open' : 'closed'))
      .catch(() => setGate('closed'))
  }, [])

  React.useEffect(() => {
    if (!loading && operator) router.replace('/')
  }, [loading, operator, router])

  const submit = form.handleSubmit(async (values) => {
    setBusy(true)
    setFailure(null)
    try {
      await signUp({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      })
      // The auth provider keeps the enrollment challenge: the sign-in page
      // picks it up and shows the QR code straight away.
      router.replace('/login')
    } catch (cause) {
      setFailure(signupMessage(cause, t))
    } finally {
      setBusy(false)
    }
  })

  return (
    <AuthLayout>
      <StepIntro kicker={t('signup.kicker')} title={t('signup.title')} subtitle={t('signup.subtitle')} />

      {gate === 'checking' && (
        <div className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader className="h-4 w-4 animate-spin" />
          {t('setup.checking')}
        </div>
      )}

      {gate === 'closed' && (
        <div className="mt-8 space-y-4">
          <div className="rounded-lg border border-border bg-card px-3 py-3">
            <p className="text-xs font-semibold text-foreground">{t('signup.closedTitle')}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t('signup.closedBody')}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => router.replace('/login')}
          >
            <ArrowLeft className="h-4 w-4" />
            {t('signup.back')}
          </Button>
        </div>
      )}

      {gate === 'open' && (
        <>
          <div className="mt-6 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-primary-dark dark:text-brand-primary-light">
              {t('signup.pitchTitle')}
            </p>
            <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
              <li>{t('signup.pitch1')}</li>
              <li>{t('signup.pitch2')}</li>
              <li>{t('signup.pitch3')}</li>
            </ul>
          </div>

          <div className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('signup.noticeTitle')}
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-100/90">
              {t('signup.notice')}
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-3.5" noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first-name">{t('signup.firstName')}</Label>
                <Input
                  id="first-name"
                  autoComplete="given-name"
                  autoFocus
                  {...form.register('firstName')}
                  aria-invalid={Boolean(form.formState.errors.firstName)}
                  className="h-9"
                />
                {form.formState.errors.firstName && <FieldNote>{form.formState.errors.firstName.message}</FieldNote>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last-name">{t('signup.lastName')}</Label>
                <Input
                  id="last-name"
                  autoComplete="family-name"
                  {...form.register('lastName')}
                  aria-invalid={Boolean(form.formState.errors.lastName)}
                  className="h-9"
                />
                {form.formState.errors.lastName && <FieldNote>{form.formState.errors.lastName.message}</FieldNote>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signup-email">{t('signup.email')}</Label>
              <Input
                id="signup-email"
                type="email"
                autoComplete="username"
                {...form.register('email')}
                aria-invalid={Boolean(form.formState.errors.email)}
                className="h-9"
              />
              {form.formState.errors.email && <FieldNote>{form.formState.errors.email.message}</FieldNote>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="signup-password">{t('signup.password')}</Label>
              <PasswordInput
                id="signup-password"
                autoComplete="new-password"
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
              <Label htmlFor="signup-confirm">{t('signup.confirm')}</Label>
              <PasswordInput
                id="signup-confirm"
                autoComplete="new-password"
                showLabel={t('login.showPassword')}
                hideLabel={t('login.hidePassword')}
                {...form.register('confirm')}
                aria-invalid={Boolean(form.formState.errors.confirm)}
                className="h-9"
              />
              {form.formState.errors.confirm && <FieldNote>{form.formState.errors.confirm.message}</FieldNote>}
            </div>

            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card px-3 py-2.5">
              <input
                type="checkbox"
                {...form.register('accept')}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--charte-primary)]"
              />
              <span className="text-[11px] leading-relaxed text-foreground">{t('signup.accept')}</span>
            </label>
            {form.formState.errors.accept && <FieldNote>{form.formState.errors.accept.message}</FieldNote>}

            {failure && <ErrorNote>{failure}</ErrorNote>}

            <Button type="submit" disabled={busy} size="lg" className="mt-1 w-full">
              {busy ? <Loader className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {busy ? t('signup.submitting') : t('signup.submit')}
            </Button>

            <p className="text-center text-[10px] leading-relaxed text-muted-foreground">{t('signup.next')}</p>

            <Link
              href="/login"
              className="flex items-center justify-center gap-1 text-center text-[11px] font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('signup.back')}
            </Link>
          </form>
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

/** Map the API codes onto the few sentences the form can actually say. */
function signupMessage(
  cause: unknown,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
): string {
  if (!(cause instanceof ApiError)) return t('signup.failed')
  if (cause.status === 429) return t('signup.limit')
  const code = cause.json<{ error?: string }>()?.error
  if (code === 'email_taken') return t('signup.emailTaken')
  if (code === 'operator_limit') return t('signup.limit')
  if (code === 'signup_closed') return t('signup.closedBody')
  if (code === 'storage_unavailable') return t('signup.unavailable')
  if (code === 'weak_password') return t('login.passwordTooShort', { count: MIN_PASSWORD })
  return t('signup.failed')
}
