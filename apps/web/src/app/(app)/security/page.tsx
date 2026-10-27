'use client'

import * as React from 'react'
import Link from 'next/link'
import { BadgeCheck, Clock, KeyRound, LogOut, ScrollText, ShieldCheck, ShieldX, UserRound } from 'lucide-react'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Separator } from '@sps/ui'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'
import { readSession } from '@/lib/session'

function formatDate(value: string | undefined, locale: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function SecurityPage() {
  const { operator, signOut } = useAuth()
  const { t, locale } = useI18n()
  const [expiresAt, setExpiresAt] = React.useState<string | null>(null)

  React.useEffect(() => {
    setExpiresAt(readSession()?.expiresAt ?? null)
  }, [])

  if (!operator) return null

  return (
    <>
      <PageIntro title={t('security.title')} subtitle={t('security.subtitle')} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <UserRound className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('security.account')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary text-lg font-semibold text-white">
                {(operator.name || operator.email).charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{operator.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{operator.email}</p>
              </div>
            </div>
            <Separator />
            <dl className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t('security.role')}</dt>
                <dd>
                  <Badge tone="brand">{operator.role}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">{t('security.lastLogin')}</dt>
                <dd className="text-right font-medium">
                  {operator.lastLoginAt ? formatDate(operator.lastLoginAt, locale) : t('security.firstSession')}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            {operator.mfaEnrolled ? (
              <BadgeCheck className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            ) : (
              <ShieldX className="h-4 w-4 text-destructive" />
            )}
            <CardTitle>{t('security.mfa')}</CardTitle>
            <Badge tone={operator.mfaEnrolled ? 'success' : 'danger'} className="ml-auto">
              {operator.mfaEnrolled ? t('security.mfaOn') : t('security.mfaOff')}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-xs leading-relaxed text-muted-foreground">{t('security.mfaHint')}</p>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-brand-primary dark:text-brand-primary-light" />
              <div>
                <p className="text-xs font-semibold text-foreground">{t('security.recovery')}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t('security.recoveryHint')}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand-accent" />
              <div>
                <p className="text-xs font-semibold text-foreground">{t('security.session')}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('security.expires')} {expiresAt ? formatDate(expiresAt, locale) : '—'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/audit"
                className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-medium transition-colors hover:bg-secondary"
              >
                <ScrollText className="h-3.5 w-3.5" />
                {t('security.audit')}
              </Link>
              <Button variant="destructive" size="sm" onClick={() => void signOut()}>
                <LogOut className="h-3.5 w-3.5" />
                {t('security.signOut')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2 text-[11px] text-brand-primary-dark dark:border-brand-primary-light/20 dark:text-brand-primary-light">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        {t('security.mfaHint')}
      </div>
    </>
  )
}
