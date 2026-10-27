'use client'

import * as React from 'react'
import Link from 'next/link'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ArrowRight, Loader, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button, Input, Label } from '@sps/ui'
import { AuthLayout, ErrorNote, StepIntro } from '@/components/auth/auth-frame'
import { ApiError, authApi } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

/**
 * First-run screen. While the operator store is empty, this is the only way in:
 * the root operator gives a first name, a last name and an e-mail, the API
 * creates the account with a random password and mails it through Resend.
 * Nothing secret is ever rendered here.
 */
export default function SetupPage() {
  const { t } = useI18n()
  const [status, setStatus] = React.useState<'checking' | 'ready' | 'initialized'>('checking')
  const [delivered, setDelivered] = React.useState<{ email: string; storage: 'mongo' | 'memory' } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const schema = React.useMemo(
    () =>
      z.object({
        firstName: z.string().trim().min(2, t('setup.fieldTooShort')).max(60, t('setup.fieldTooLong')),
        lastName: z.string().trim().min(2, t('setup.fieldTooShort')).max(60, t('setup.fieldTooLong')),
        email: z.string().trim().min(1, t('setup.emailRequired')).email(t('setup.emailInvalid')),
      }),
    [t],
  )

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '' },
  })

  React.useEffect(() => {
    let active = true
    void authApi
      .setupStatus()
      .then((next) => {
        if (active) setStatus(next.initialized ? 'initialized' : 'ready')
      })
      .catch(() => {
        if (active) setStatus('ready')
      })
    return () => {
      active = false
    }
  }, [])

  const submit = form.handleSubmit(async (values) => {
    setBusy(true)
    setError(null)
    try {
      const result = await authApi.setup({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim().toLowerCase(),
      })
      setDelivered({ email: result.email, storage: result.storage })
      form.reset()
    } catch (cause) {
      if (cause instanceof ApiError) {
        const body = cause.json<{ error?: string }>()
        if (body?.error === 'already_initialized') {
          setStatus('initialized')
          return
        }
        if (body?.error === 'mail_not_configured') {
          setError(t('setup.mailNotConfigured'))
          return
        }
        if (body?.error === 'mail_failed') {
          setError(t('setup.mailFailed'))
          return
        }
        if (cause.status === 429) {
          setError(t('login.rateLimited'))
          return
        }
      }
      setError(t('setup.errorGeneric'))
    } finally {
      setBusy(false)
    }
  })

  if (status === 'checking') {
    return (
      <AuthLayout>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader className="h-4 w-4 animate-spin" />
          {t('setup.checking')}
        </div>
      </AuthLayout>
    )
  }

  if (status === 'initialized' && !delivered) {
    return (
      <AuthLayout>
        <StepIntro kicker={t('setup.kicker')} title={t('setup.doneTitle')} subtitle={t('setup.alreadyBody')} />
        <Link
          href="/login"
          className="mt-8 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          {t('setup.goToLogin')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthLayout>
    )
  }

  if (delivered) {
    return (
      <AuthLayout>
        <StepIntro kicker={t('setup.kicker')} title={t('setup.sentTitle')} subtitle={t('setup.sentBody')} />
        <div className="mt-5 rounded-xl border border-border bg-secondary/40 px-3 py-2.5">
          <p className="text-[10px] font-medium text-muted-foreground">
            {t('setup.sentTo')}
          </p>
          <p className="mt-1 break-all font-mono text-[12px] text-foreground">{delivered.email}</p>
        </div>
        <ol className="mt-5 space-y-2 text-[11px] leading-relaxed text-muted-foreground">
          <li>1. {t('setup.sentStep1')}</li>
          <li>2. {t('setup.sentStep2')}</li>
          <li>3. {t('setup.sentStep3')}</li>
        </ol>
        {delivered.storage === 'memory' && (
          <p className="mt-5 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] leading-relaxed text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t('setup.memoryWarning')}
          </p>
        )}
        <Link
          href="/login"
          className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          {t('setup.goToLogin')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <StepIntro kicker={t('setup.kicker')} title={t('setup.title')} subtitle={t('setup.subtitle')} />

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">{t('setup.firstName')}</Label>
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
            <Label htmlFor="last-name">{t('setup.lastName')}</Label>
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
          <Label htmlFor="setup-email">{t('setup.email')}</Label>
          <Input
            id="setup-email"
            type="email"
            autoComplete="email"
            placeholder="name@institution.org"
            {...form.register('email')}
            aria-invalid={Boolean(form.formState.errors.email)}
            className="h-9"
          />
          {form.formState.errors.email && <FieldNote>{form.formState.errors.email.message}</FieldNote>}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button type="submit" disabled={busy} size="lg" className="mt-1 w-full">
          {busy ? <Loader className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? t('setup.submitting') : t('setup.submit')}
        </Button>
        <p className="text-center text-[10px] leading-relaxed text-muted-foreground">{t('setup.footnote')}</p>
      </form>
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
