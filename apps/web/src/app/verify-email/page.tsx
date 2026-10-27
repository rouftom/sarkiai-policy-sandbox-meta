'use client'

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowRight, CheckCircle2, Loader, ShieldAlert } from 'lucide-react'
import { Button } from '@sps/ui'
import { authApi } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { AuthLayout, StepIntro } from '@/components/auth/auth-frame'

/**
 * Consume the confirmation link sent after sign-up. The token is single-purpose
 * and expires after 24 hours; once the address is confirmed, the operator signs
 * in and only then reaches the two-factor enrolment.
 */
export default function VerifyEmailPage() {
  return (
    <React.Suspense fallback={<VerifyFallback />}>
      <VerifyForm />
    </React.Suspense>
  )
}

function VerifyFallback() {
  const { t } = useI18n()
  return (
    <AuthLayout>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader className="h-4 w-4 animate-spin" />
        {t('verify.checking')}
      </div>
    </AuthLayout>
  )
}

function VerifyForm() {
  const { t } = useI18n()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = React.useState<'checking' | 'done' | 'invalid'>('checking')
  const started = React.useRef(false)

  React.useEffect(() => {
    if (started.current) return
    started.current = true
    if (!token) {
      setState('invalid')
      return
    }
    void authApi
      .verifyEmail(token)
      .then(() => setState('done'))
      .catch(() => setState('invalid'))
  }, [token])

  if (state === 'checking') {
    return (
      <AuthLayout>
        <VerifyFallback />
      </AuthLayout>
    )
  }

  if (state === 'invalid') {
    return (
      <AuthLayout>
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <StepIntro title={t('verify.invalidTitle')} subtitle={t('verify.invalidBody')} />
        <Link
          href="/login"
          className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          {t('verify.goToLogin')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary dark:text-brand-primary-light">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <StepIntro title={t('verify.doneTitle')} subtitle={t('verify.doneBody')} />
      <Link href="/login" className="mt-8 block">
        <Button size="lg" className="w-full">
          <ArrowRight className="h-4 w-4" />
          {t('verify.goToLogin')}
        </Button>
      </Link>
    </AuthLayout>
  )
}
