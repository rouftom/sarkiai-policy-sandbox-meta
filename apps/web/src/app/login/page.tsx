'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowRight, Check, Copy, Download, KeyRound, Loader, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Button, Input, Label } from '@sps/ui'
import { BrandMark } from '@/components/layout/brand-mark'
import { AuthLayout, AuthProgress, ErrorNote, StepIntro, messageFor, type ProgressStage } from '@/components/auth/auth-frame'
import { OtpField, formatBackupCode } from '@/components/auth/otp-field'
import { PasswordInput } from '@/components/auth/password-input'
import { authApi } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'

type Step = 'credentials' | 'verify' | 'password' | 'enroll' | 'mfa' | 'recovery'

/** Same floor as the API (`assertPassword`). */
const MIN_PASSWORD = 12

/**
 * Operator sign-in: e-mail and password, then the second factor.
 *
 * An invited account arrives with a one-time password and `mustChangePassword`
 * set, so the console first asks for a new password, then walks straight into
 * TOTP enrolment. Recovery codes are shown once, right after activation, and
 * stay on screen until the operator downloads or copies them.
 */
export default function LoginPage() {
  const router = useRouter()
  const { t } = useI18n()
  const {
    operator,
    loading,
    pending,
    verificationEmail,
    enrollment,
    backupCodes,
    signIn,
    changePassword,
    startEnrollment,
    confirmEnrollment,
    verifyCode,
    dismissBackupCodes,
    resetFlow,
  } = useAuth()

  const [step, setStep] = React.useState<Step>('credentials')
  const [factor, setFactor] = React.useState<'totp' | 'backup'>('totp')
  const [busy, setBusy] = React.useState(false)
  const [copied, setCopied] = React.useState<string | null>(null)
  const [code, setCode] = React.useState('')
  const [codeError, setCodeError] = React.useState<string | null>(null)
  const [signupOpen, setSignupOpen] = React.useState(
    () => process.env.NEXT_PUBLIC_SIGNUP !== 'false',
  )
  const [resent, setResent] = React.useState(false)
  const enrollmentStarted = React.useRef(false)
  const setupChecked = React.useRef(false)

  const credentialsSchema = React.useMemo(
    () =>
      z.object({
        email: z.string().trim().min(1, t('login.emailRequired')).email(t('login.emailInvalid')),
        password: z.string().min(1, t('login.passwordRequired')),
      }),
    [t],
  )

  const passwordSchema = React.useMemo(
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

  const credentialsForm = useForm<z.infer<typeof credentialsSchema>>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: '', password: '' },
  })
  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  React.useEffect(() => {
    if (!loading && operator && step !== 'recovery' && !backupCodes) router.replace('/')
  }, [loading, operator, router, step, backupCodes])

  // No operator in the store yet: the first visit belongs to the setup screen.
  React.useEffect(() => {
    if (setupChecked.current) return
    setupChecked.current = true
    void authApi
      .setupStatus()
      .then((status) => {
        setSignupOpen(status.signup)
        if (!status.initialized) router.replace('/setup')
      })
      .catch(() => {
        /*
         * The API may still be asleep (free Render instance) when the page
         * loads. Do not hide the Sign-up entry point on a transient failure:
         * it starts visible and only the API can close it.
         */
      })
  }, [router])

  // The address has to be confirmed before any challenge: show that step.
  React.useEffect(() => {
    if (verificationEmail) setStep('verify')
  }, [verificationEmail])

  // Password step returned `enrollment_required`: fetch the otpauth URI once.
  React.useEffect(() => {
    if (pending?.status === 'password_change_required') {
      setStep('password')
      passwordForm.reset()
    }
    if (pending?.status === 'enrollment_required' && !enrollment && !enrollmentStarted.current) {
      enrollmentStarted.current = true
      setStep('enroll')
      void startEnrollment().catch((cause) => {
        enrollmentStarted.current = false
        setCodeError(messageFor(cause, t('login.expired'), t))
      })
    }
    if (pending?.status === 'mfa_required') setStep('mfa')
    if (backupCodes) setStep('recovery')
  }, [pending, enrollment, backupCodes, startEnrollment, t, passwordForm])

  const submitCredentials = credentialsForm.handleSubmit(async (values) => {
    setBusy(true)
    try {
      await signIn(values.email.trim().toLowerCase(), values.password)
    } catch (cause) {
      credentialsForm.setError('root', { message: messageFor(cause, t('login.failed'), t) })
    } finally {
      setBusy(false)
    }
  })

  const submitPassword = passwordForm.handleSubmit(async (values) => {
    setBusy(true)
    try {
      await changePassword(values.password)
      passwordForm.reset()
    } catch (cause) {
      passwordForm.setError('root', { message: messageFor(cause, t('login.passwordFailed'), t) })
    } finally {
      setBusy(false)
    }
  })

  const submitCode = React.useCallback(
    async (candidate: string) => {
      if (busy) return
      const value = step === 'mfa' && factor === 'backup' ? formatBackupCode(candidate) : candidate.trim()
      if (!value) return
      setBusy(true)
      setCodeError(null)
      try {
        if (step === 'enroll') await confirmEnrollment(value)
        else await verifyCode(value)
        setCode('')
      } catch (cause) {
        setCode('')
        setCodeError(messageFor(cause, factor === 'backup' ? t('login.badBackup') : t('login.badCode'), t))
      } finally {
        setBusy(false)
      }
    },
    [busy, confirmEnrollment, factor, step, t, verifyCode],
  )

  function restart() {
    resetFlow()
    setStep('credentials')
    credentialsForm.clearErrors()
    passwordForm.reset()
    setCode('')
    setCodeError(null)
    setFactor('totp')
    enrollmentStarted.current = false
  }

  /** Back to the sign-in form with the confirmed address already filled in. */
  function continueAfterVerification() {
    const email = verificationEmail
    resetFlow()
    setResent(false)
    setStep('credentials')
    if (email) credentialsForm.setValue('email', email)
  }

  async function resendLink() {
    if (!verificationEmail) return
    setBusy(true)
    try {
      await authApi.resendVerification(verificationEmail)
      setResent(true)
    } catch {
      setResent(true)
    } finally {
      setBusy(false)
    }
  }

  function copy(value: string, id: string) {
    void navigator.clipboard?.writeText(value).then(() => {
      setCopied(id)
      window.setTimeout(() => setCopied(null), 1600)
    })
  }

  function downloadCodes(codes: string[]) {
    const header = [
      'SarkiAI Policy Sandbox, recovery codes / codes de secours',
      `Account: ${operator?.email ?? pending?.operator.email ?? ''}`,
      `Generated: ${new Date().toISOString()}`,
      'Each code is single use. Keep them offline. / Chaque code sert une seule fois.',
      '',
    ].join('\n')
    const blob = new Blob([`${header}${codes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'sps-recovery-codes.txt'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <BrandMark className="h-10 w-10 animate-pulse" />
      </div>
    )
  }

  const progress: ProgressStage | null =
    step === 'verify'
      ? 'email'
      : step === 'password'
        ? 'password'
        : step === 'enroll' || step === 'mfa'
          ? 'mfa'
          : step === 'recovery'
            ? 'access'
            : null

  const rootError =
    credentialsForm.formState.errors.root?.message ??
    passwordForm.formState.errors.root?.message ??
    codeError

  return (
    <AuthLayout>
      {progress && <AuthProgress current={progress} />}

      {step === 'verify' && verificationEmail && (
        <>
          <StepIntro title={t('verify.title')} subtitle={t('verify.subtitle', { email: verificationEmail })} />
          <div className="mt-8 flex flex-col gap-3">
            {resent && (
              <p className="rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
                {t('verify.resent')}
              </p>
            )}
            <Button variant="outline" size="lg" className="w-full" onClick={() => void resendLink()} disabled={busy}>
              {busy ? <Loader className="h-4 w-4 animate-spin" /> : null}
              {t('verify.resend')}
            </Button>
            <Button size="lg" className="w-full" onClick={continueAfterVerification}>
              <ArrowRight className="h-4 w-4" />
              {t('verify.continue')}
            </Button>
          </div>
        </>
      )}

      {step === 'credentials' && (
        <>
          <StepIntro title={t('login.title')} subtitle={t('login.subtitle')} />
          <form onSubmit={submitCredentials} className="mt-8 flex flex-col gap-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('login.email')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                {...credentialsForm.register('email')}
                aria-invalid={Boolean(credentialsForm.formState.errors.email)}
                className="h-9"
              />
              {credentialsForm.formState.errors.email && (
                <FieldNote>{credentialsForm.formState.errors.email.message}</FieldNote>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('login.password')}</Label>
                <Link
                  href="/forgot-password"
                  className="text-[10px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {t('login.forgotPassword')}
                </Link>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                showLabel={t('login.showPassword')}
                hideLabel={t('login.hidePassword')}
                {...credentialsForm.register('password')}
                aria-invalid={Boolean(credentialsForm.formState.errors.password)}
                className="h-9"
              />
              {credentialsForm.formState.errors.password && (
                <FieldNote>{credentialsForm.formState.errors.password.message}</FieldNote>
              )}
            </div>
            {rootError && <ErrorNote>{rootError}</ErrorNote>}
            <Button type="submit" disabled={busy} size="lg" className="mt-1 w-full">
              {busy ? <Loader className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              {busy ? t('login.signingIn') : t('login.signIn')}
            </Button>
          </form>

          {signupOpen && (
            <div className="mt-6 border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
              {t('login.noAccount')}{' '}
              <Link
                href="/signup"
                className="font-semibold text-brand-primary-dark underline-offset-4 hover:underline dark:text-brand-primary-light"
              >
                {t('login.createAccount')}
              </Link>
            </div>
          )}
        </>
      )}

      {step === 'password' && (
        <>
          <StepIntro
            title={t('login.newPasswordTitle')}
            subtitle={t('login.newPasswordSubtitle')}
          />
          <form onSubmit={submitPassword} className="mt-8 flex flex-col gap-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">{t('login.newPassword')}</Label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                autoFocus
                showLabel={t('login.showPassword')}
                hideLabel={t('login.hidePassword')}
                {...passwordForm.register('password')}
                aria-invalid={Boolean(passwordForm.formState.errors.password)}
                className="h-9"
              />
              {passwordForm.formState.errors.password ? (
                <FieldNote>{passwordForm.formState.errors.password.message}</FieldNote>
              ) : (
                <p className="text-[10px] text-muted-foreground">{t('login.passwordHint', { count: MIN_PASSWORD })}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">{t('login.confirmPassword')}</Label>
              <PasswordInput
                id="confirm-password"
                autoComplete="new-password"
                showLabel={t('login.showPassword')}
                hideLabel={t('login.hidePassword')}
                {...passwordForm.register('confirm')}
                aria-invalid={Boolean(passwordForm.formState.errors.confirm)}
                className="h-9"
              />
              {passwordForm.formState.errors.confirm && (
                <FieldNote>{passwordForm.formState.errors.confirm.message}</FieldNote>
              )}
            </div>
            {rootError && <ErrorNote>{rootError}</ErrorNote>}
            <Button type="submit" disabled={busy} size="lg" className="mt-1 w-full">
              {busy ? <Loader className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {busy ? t('login.saving') : t('login.savePassword')}
            </Button>
          </form>
        </>
      )}

      {step === 'enroll' && (
        <>
          <StepIntro title={t('login.enrollTitle')} subtitle={t('login.enrollSubtitle')} />
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
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitCode(code)
                }}
                className="space-y-3"
                noValidate
              >
                <div className="space-y-2">
                  <Label htmlFor="otp-totp">{t('login.code')}</Label>
                  <OtpField
                    value={code}
                    onChange={setCode}
                    onComplete={(next) => void submitCode(next)}
                    label={t('login.code')}
                    disabled={busy}
                    autoFocus
                    invalid={Boolean(codeError)}
                  />
                </div>
                {rootError && <ErrorNote>{rootError}</ErrorNote>}
                <Button type="submit" disabled={busy || code.length < 6} size="lg" className="w-full">
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
            title={factor === 'totp' ? t('login.mfaTitle') : t('login.backupTitle')}
            subtitle={factor === 'totp' ? t('login.mfaSubtitle') : t('login.backupSubtitle')}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void submitCode(code)
            }}
            className="mt-8 space-y-4"
            noValidate
          >
            <div className="space-y-2">
              <Label htmlFor={factor === 'totp' ? 'otp-totp' : 'otp-backup'}>
                {factor === 'totp' ? t('login.code') : t('login.backupCode')}
              </Label>
              <OtpField
                key={factor}
                variant={factor}
                value={code}
                onChange={(next) => setCode(factor === 'backup' ? formatBackupCode(next) : next)}
                onComplete={(next) => void submitCode(factor === 'backup' ? formatBackupCode(next) : next)}
                label={factor === 'totp' ? t('login.code') : t('login.backupCode')}
                disabled={busy}
                autoFocus
                invalid={Boolean(codeError)}
              />
            </div>
            {rootError && <ErrorNote>{rootError}</ErrorNote>}
            <Button
              type="submit"
              disabled={busy || (factor === 'totp' ? code.length < 6 : code.length < 11)}
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
                  setCodeError(null)
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
          <StepIntro title={t('login.recoveryTitle')} subtitle={t('login.recoverySubtitle')} />
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
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(backupCodes.join('\n'), 'codes')} className="flex-1">
              {copied === 'codes' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === 'codes' ? t('login.copied') : t('login.copy')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCodes(backupCodes)} className="flex-1">
              <Download className="h-3.5 w-3.5" />
              {t('login.downloadCodes')}
            </Button>
          </div>
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('login.recoveryWarning')}
          </p>
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
