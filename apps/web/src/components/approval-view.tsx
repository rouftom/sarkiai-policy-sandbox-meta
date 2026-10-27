'use client'

/**
 * N4 — human approval page.
 *
 * The WhatsApp message only carries a link with a signed, expiring token; the
 * decision is taken here, in the console, and recorded once in
 * `whatsapp_approvals`. Nothing is decided by a WhatsApp quick-reply, and the
 * notification gateway is never involved.
 */

import * as React from 'react'
import { Check, Clock, FileText, Loader2, ShieldCheck, X } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@sps/ui'
import { api, type ApprovalDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

type LoadState =
  | { status: 'loading' }
  | { status: 'invalid' }
  | { status: 'error' }
  | { status: 'ready'; approval: ApprovalDto }

function formatDate(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const STATUS_TONE: Record<'pending' | 'approved' | 'rejected', string> = {
  pending: 'bg-secondary text-secondary-foreground',
  approved: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  rejected: 'bg-destructive/15 text-destructive',
}

export function ApprovalView({ token }: { token: string }) {
  const { locale, t } = useI18n()
  const [state, setState] = React.useState<LoadState>({ status: 'loading' })
  const [note, setNote] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setState({ status: 'loading' })
    api
      .approval(token)
      .then((approval) => setState({ status: 'ready', approval }))
      .catch((cause: unknown) => {
        const message = String((cause as Error)?.message ?? cause)
        setState({ status: message.startsWith('400') || message.startsWith('410') ? 'invalid' : 'error' })
      })
  }, [token])

  React.useEffect(() => {
    load()
  }, [load])

  const decide = async (decision: 'approved' | 'rejected') => {
    setSubmitting(true)
    setError(null)
    try {
      await api.decideApproval(token, decision, note.trim() || undefined)
      load()
    } catch (cause) {
      const message = String((cause as Error).message ?? cause)
      setError(message.startsWith('409') ? t('approval.already') : t('approval.error'))
      load()
    } finally {
      setSubmitting(false)
    }
  }

  if (state.status === 'loading') {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t('approval.loading')}
        </p>
      </main>
    )
  }

  if (state.status === 'invalid' || state.status === 'error') {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl items-center justify-center p-6">
        <Card className="w-full">
          <CardContent className="flex items-center gap-3">
            <X className="h-5 w-5 text-destructive" aria-hidden />
            <p className="text-sm">
              {state.status === 'invalid' ? t('approval.invalid') : t('approval.error')}
            </p>
          </CardContent>
        </Card>
      </main>
    )
  }

  const approval = state.approval
  const decided = approval.decision !== null
  const status = approval.decision ?? 'pending'

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-3 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <h1 className="text-base font-semibold">{t('approval.title')}</h1>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_TONE[status]}`}>
          {t(`approval.${status}` as 'approval.pending')}
        </span>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('approval.summary')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {approval.subject ? (
            <p className="text-sm leading-relaxed">{approval.subject}</p>
          ) : (
            <p className="text-sm text-muted-foreground">-</p>
          )}
          <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">{t('approval.run')}:</span>
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px]">{approval.runId}</code>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <span className="text-muted-foreground">{t('approval.expires')}:</span>
              <span>{formatDate(approval.expiresAt, locale)}</span>
            </div>
            {approval.decidedAt ? (
              <div className="flex items-center gap-1.5 sm:col-span-2">
                <span className="text-muted-foreground">{t('approval.decidedAt')}:</span>
                <span>{formatDate(approval.decidedAt, locale)}</span>
              </div>
            ) : null}
          </dl>
          {approval.note ? (
            <p className="rounded-lg bg-secondary px-2 py-1.5 text-xs leading-relaxed">{approval.note}</p>
          ) : null}
        </CardContent>
      </Card>

      {approval.reports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('approval.reports')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {approval.reports.map((report, index) => (
              <div key={`${report.tick}-${index}`} className="rounded-lg border border-border p-2.5">
                <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    T{report.tick}
                  </span>
                  <span>
                    {report.conflicts} {t('approval.conflicts')} · {report.citations} {t('approval.citations')}
                  </span>
                </div>
                <p className="text-xs leading-relaxed">{report.summary}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {decided ? (
        <p className="text-xs text-muted-foreground">{t('approval.already')}</p>
      ) : (
        <Card>
          <CardContent className="space-y-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground">{t('approval.note')}</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('approval.notePlaceholder')}
                maxLength={1000}
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button size="lg" onClick={() => void decide('approved')} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                {submitting ? t('approval.submitting') : t('approval.approve')}
              </Button>
              <Button
                size="lg"
                variant="destructive"
                onClick={() => void decide('rejected')}
                disabled={submitting}
              >
                <X className="h-4 w-4" aria-hidden />
                {t('approval.reject')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
