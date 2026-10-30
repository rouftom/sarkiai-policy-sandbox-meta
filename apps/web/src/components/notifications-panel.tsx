'use client'

/**
 * N4b · operator notifications, two channels and one address book.
 *
 * E-mail goes out through the React Email template rendered by the API; WhatsApp
 * goes out as an approved template. A contact is only reachable on a channel it
 * consented to, and the recipient picker is filtered by that consent: there is no
 * "send to everyone" shortcut. Every send is audited server-side.
 */

import * as React from 'react'
import {
  CheckCircle2,
  Feather,
  Loader,
  Mail,
  Smartphone,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react'
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  MultiSelect,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@sps/ui'
import {
  ApiError,
  api,
  type NewNotificationContactDto,
  type NotificationContactDto,
  type NotificationSendResultDto,
  type NotificationStatusDto,
  type ScenarioRunSummaryDto,
  type WhatsAppNotificationKind,
} from '@/lib/api'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { useToast } from '@/components/shared/toast'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { SearchSelect } from '@/components/shared/search-select'
import { displayPhone, formatPhoneAsYouType, parsePhoneInput, phoneCountries } from '@/lib/phone'

type Channel = 'whatsapp' | 'email'

const KINDS: WhatsAppNotificationKind[] = ['test', 'joint_report', 'deadline_alert', 'approval_request']

function apiErrorCode(cause: unknown): string | null {
  if (!(cause instanceof ApiError)) return null
  const payload = cause.json<{ error?: unknown; reason?: string }>()
  if (typeof payload?.error === 'string') return payload.error
  if (typeof payload?.reason === 'string') return payload.reason
  return null
}

/** Codes the console has a translated sentence for; anything else uses the fallback. */
const NOTIFY_ERROR_CODES = new Set([
  'duplicate',
  'invalid_phone',
  'at_least_one_channel',
  'email_consent_without_email',
  'whatsapp_consent_without_phone',
  'missing_joint_report_fields',
  'missing_deadline_fields',
  'missing_approval_fields',
  'approval_secret_missing',
  'whatsapp_not_configured',
  'mail_not_configured',
  'run_not_found',
  'suggestion_failed',
  'not_found',
])

/**
 * A translated sentence for an API failure. Fastify's own 404 body says
 * `Not Found`, which is not a message key: unknown codes fall back to `fallback`.
 */
function notifyErrorText(
  cause: unknown,
  t: (key: MessageKey) => string,
  fallback: MessageKey,
  /** True when a 404 most likely means the API does not expose the route yet. */
  routeHint = false,
): string {
  // Fastify's own 404 body is `{ "error": "Not Found" }`, not one of our codes.
  if (routeHint && cause instanceof ApiError && cause.status === 404) {
    return t('notify.error.not_found')
  }
  const code = apiErrorCode(cause)
  if (code && NOTIFY_ERROR_CODES.has(code)) return t(`notify.error.${code}` as MessageKey)
  return t(fallback)
}

export function NotificationsPanel({ country }: { country: string }) {
  const { locale, t } = useI18n()
  const toast = useToast()

  const [contacts, setContacts] = React.useState<NotificationContactDto[]>([])
  const [status, setStatus] = React.useState<NotificationStatusDto | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [channel, setChannel] = React.useState<Channel>('whatsapp')
  const [selected, setSelected] = React.useState<string[]>([])
  const [adding, setAdding] = React.useState(false)
  const [editing, setEditing] = React.useState<NotificationContactDto | null>(null)
  const [deleting, setDeleting] = React.useState<NotificationContactDto | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<NotificationSendResultDto | null>(null)
  const [runs, setRuns] = React.useState<ScenarioRunSummaryDto[]>([])
  const [suggesting, setSuggesting] = React.useState(false)

  // WhatsApp composer
  const [kind, setKind] = React.useState<WhatsAppNotificationKind>('test')
  const [runId, setRunId] = React.useState('')
  const [tick, setTick] = React.useState('0')
  const [summary, setSummary] = React.useState('')
  const [waTitle, setWaTitle] = React.useState('')
  const [deadline, setDeadline] = React.useState('')
  const [actionUrl, setActionUrl] = React.useState('')
  const [expires, setExpires] = React.useState('1440')

  // E-mail composer
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState('')

  const refresh = React.useCallback(async () => {
    try {
      const [list, channels] = await Promise.all([api.notificationContacts(), api.notificationStatus()])
      setContacts(list.contacts)
      setStatus(channels)
    } catch (cause) {
      toast.error(t('notify.loadError'), (cause as Error).message)
    } finally {
      setLoading(false)
    }
  }, [toast, t])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  // Runs feed the searchable picker. A failure here must not hide the address book.
  React.useEffect(() => {
    let cancelled = false
    api
      .scenarioRuns()
      .then(({ runs: loaded }) => {
        if (!cancelled) setRuns(loaded)
      })
      .catch(() => {
        if (!cancelled) setRuns([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const reachable = React.useMemo(
    () =>
      contacts.filter((contact) =>
        channel === 'whatsapp'
          ? Boolean(contact.phone) && contact.channels.whatsapp
          : Boolean(contact.email) && contact.channels.email,
      ),
    [contacts, channel],
  )

  // A contact that cannot be reached on the new channel must not stay selected.
  React.useEffect(() => {
    setSelected((current) => {
      const allowed = new Set(reachable.map((contact) => contact.id))
      const next = current.filter((id) => allowed.has(id))
      return next.length === current.length ? current : next
    })
  }, [reachable])

  const whatsappReady = Boolean(status?.whatsapp.configured)
  const emailReady = Boolean(status?.email.configured)
  const channelReady = channel === 'whatsapp' ? whatsappReady : emailReady

  const whatsappValid =
    kind === 'test' ||
    (kind === 'joint_report' && runId.trim() && summary.trim()) ||
    (kind === 'deadline_alert' && waTitle.trim() && deadline.trim()) ||
    (kind === 'approval_request' && runId.trim() && summary.trim())
  const emailValid = subject.trim() && message.trim()
  const canSend =
    selected.length > 0 && channelReady && Boolean(channel === 'whatsapp' ? whatsappValid : emailValid) && !busy

  const send = async () => {
    if (!canSend) return
    setBusy(true)
    setResult(null)
    try {
      let outcome: NotificationSendResultDto
      if (channel === 'whatsapp') {
        outcome = await api.sendWhatsAppNotification({
          contactIds: selected,
          kind,
          ...(kind === 'joint_report' || kind === 'approval_request' ? { runId: runId.trim() } : {}),
          ...(kind === 'joint_report' ? { tick: Number(tick) || 0 } : {}),
          ...(kind === 'joint_report' || kind === 'approval_request' ? { summary: summary.trim() } : {}),
          ...(kind === 'deadline_alert'
            ? {
                title: waTitle.trim(),
                deadline: deadline.trim(),
                ...(actionUrl.trim() ? { actionUrl: actionUrl.trim() } : {}),
              }
            : {}),
          ...(kind === 'approval_request' ? { expiresInMinutes: Number(expires) || 1440 } : {}),
        })
      } else {
        outcome = await api.sendEmailNotification({
          contactIds: selected,
          subject: subject.trim(),
          message: message.trim(),
        })
      }
      setResult(outcome)
      const sentCount = outcome.sent.length
      const failedCount = outcome.failed.length
      if (sentCount > 0) {
        toast.success(
          channel === 'whatsapp' ? t('notify.sentWhatsapp') : t('notify.sentEmail'),
          t('notify.sentDetail', { sent: sentCount, failed: failedCount }),
        )
      } else {
        toast.error(t('notify.nothingSent'), t('notify.nothingSentDetail'))
      }
    } catch (cause) {
      toast.error(t('notify.sendError'), notifyErrorText(cause, t, 'notify.error.generic'))
    } finally {
      setBusy(false)
    }
  }

  const runDate = (iso: string) =>
    new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(iso))

  const runOptions = runs.map((run) => ({
    value: run.id,
    label: run.title,
    hint: `${runDate(run.createdAt)} · ${run.status} · ${run.released}/${run.total}`,
    keywords: `${run.id} ${run.country} ${run.domain}`,
  }))

  const suggestSummary = async (channel: Channel = 'whatsapp') => {
    if (!runId.trim() || suggesting) return
    setSuggesting(true)
    try {
      const suggestion = await api.suggestNotificationSummary({
        runId: runId.trim(),
        kind:
          channel === 'whatsapp' && kind === 'approval_request'
            ? 'approval_request'
            : 'joint_report',
        locale,
      })
      if (channel === 'whatsapp') setSummary(suggestion.summary)
      else setMessage(suggestion.summary)
      toast.success(t('notify.whatsapp.suggested'), suggestion.model)
    } catch (cause) {
      toast.error(
        t('notify.whatsapp.suggestError'),
        notifyErrorText(cause, t, 'notify.error.generic', true),
      )
    } finally {
      setSuggesting(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className="min-w-0 space-y-2 rounded-xl border border-border p-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[11px] font-semibold text-foreground">{t('notify.contacts.title')}</h3>
              <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">
                {contacts.length}
              </span>
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" />
                {t('notify.contacts.add')}
              </Button>
            </div>

            {loading ? (
              <div className="space-y-1.5" aria-hidden>
                {[0, 1, 2].map((row) => (
                  <div key={row} className="h-7 animate-pulse rounded-lg bg-muted/70" />
                ))}
              </div>
            ) : contacts.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-muted-foreground">{t('notify.contacts.empty')}</p>
            ) : (
              <div className="custom-scrollbar max-h-72 overflow-auto">
                <Table className="min-w-0">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('notify.contacts.name')}</TableHead>
                      <TableHead className="min-w-44 whitespace-nowrap">{t('notify.contacts.reach')}</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell className="align-top">
                          <p className="text-[11px] font-medium text-foreground">{contact.name}</p>
                          <p className="text-[10px] text-muted-foreground">{contact.createdBy}</p>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-0.5 text-[10px]">
                            <span className={cn('truncate', contact.channels.email ? 'text-foreground' : 'text-muted-foreground/60')}>
                              {contact.email ?? '—'}
                            </span>
                            <span className={cn('font-mono whitespace-nowrap', contact.channels.whatsapp ? 'text-foreground' : 'text-muted-foreground/60')}>
                              {contact.phoneDisplay ?? (contact.phone ? displayPhone(contact.phone) : '—')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setEditing(contact)}
                              aria-label={t('notify.contacts.edit')}
                              title={t('notify.contacts.edit')}
                              className="rounded-lg border border-border p-1 text-muted-foreground transition-colors hover:border-brand-primary/40 hover:text-foreground"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleting(contact)}
                              aria-label={t('notify.contacts.delete')}
                              title={t('notify.contacts.delete')}
                              className="rounded-lg border border-border p-1 text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          <section className="min-w-0 space-y-2.5 rounded-xl border border-border p-2.5">
            <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
              {(['whatsapp', 'email'] as Channel[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setChannel(value)
                    setResult(null)
                  }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                    channel === value
                      ? 'bg-brand-primary text-white'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {value === 'whatsapp' ? <Smartphone className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                  {t(`notify.channel.${value}` as 'notify.channel.email')}
                </button>
              ))}
            </div>

            {status !== null && !channelReady && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-700 dark:text-amber-300">
                {channel === 'whatsapp' ? t('notify.status.whatsappMissing') : t('notify.status.emailMissing')}
              </p>
            )}

            {channel === 'whatsapp' ? (
              <div className="grid min-w-0 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.whatsapp.kind')}</span>
                  <Select
                    ariaLabel={t('notify.whatsapp.kind')}
                    value={kind}
                    onValueChange={(value) => setKind(value as WhatsAppNotificationKind)}
                    options={KINDS.map((value) => ({
                      value,
                      label: t(`notify.kind.${value}` as 'notify.kind.test'),
                    }))}
                  />
                </label>

                {kind === 'test' && (
                  <p className="text-[10px] text-muted-foreground">{t('notify.kind.testHint')}</p>
                )}

                {(kind === 'joint_report' || kind === 'approval_request') && (
                  <>
                    <div className="min-w-0 space-y-1">
                      <span className="block truncate text-[10px] font-semibold text-muted-foreground">{t('notify.whatsapp.runId')}</span>
                      <SearchSelect
                        ariaLabel={t('notify.whatsapp.runId')}
                        value={runId}
                        onValueChange={setRunId}
                        placeholder={t('notify.whatsapp.runPlaceholder')}
                        searchPlaceholder={t('notify.whatsapp.runSearch')}
                        emptyLabel={t('notify.whatsapp.runEmpty')}
                        options={runOptions}
                        className="min-w-0 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground">
                        {t('notify.whatsapp.summary')}
                        <SuggestButton
                          ready={Boolean(runId.trim())}
                          busy={suggesting}
                          onClick={() => void suggestSummary('whatsapp')}
                        />
                      </span>
                      <textarea
                        value={summary}
                        onChange={(event) => setSummary(event.target.value)}
                        rows={3}
                        maxLength={kind === 'joint_report' ? 900 : 600}
                        placeholder={t('notify.whatsapp.summaryHint')}
                        className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  </>
                )}

                {kind === 'joint_report' && (
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.whatsapp.tick')}</span>
                    <input
                      value={tick}
                      onChange={(event) => setTick(event.target.value.replace(/[^\d]/g, ''))}
                      inputMode="numeric"
                      className="h-7 w-24 rounded-lg border border-border bg-transparent px-2 font-mono text-[11px]"
                    />
                  </label>
                )}

                {kind === 'deadline_alert' && (
                  <>
                    <label className="space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.whatsapp.title')}</span>
                      <input
                        value={waTitle}
                        onChange={(event) => setWaTitle(event.target.value)}
                        maxLength={200}
                        className="h-7 w-full rounded-lg border border-border bg-transparent px-2 text-[11px]"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.whatsapp.deadline')}</span>
                      <input
                        value={deadline}
                        onChange={(event) => setDeadline(event.target.value)}
                        placeholder="2026-10-31T18:00:00Z"
                        maxLength={120}
                        className="h-7 w-full rounded-lg border border-border bg-transparent px-2 font-mono text-[11px]"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.whatsapp.actionUrl')}</span>
                      <input
                        value={actionUrl}
                        onChange={(event) => setActionUrl(event.target.value)}
                        placeholder="https://sps.example/scenarios/…"
                        className="h-7 w-full rounded-lg border border-border bg-transparent px-2 font-mono text-[11px]"
                      />
                    </label>
                  </>
                )}

                {kind === 'approval_request' && (
                  <label className="space-y-1">
                    <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.whatsapp.expires')}</span>
                    <input
                      value={expires}
                      onChange={(event) => setExpires(event.target.value.replace(/[^\d]/g, ''))}
                      inputMode="numeric"
                      className="h-7 w-24 rounded-lg border border-border bg-transparent px-2 font-mono text-[11px]"
                    />
                  </label>
                )}
              </div>
            ) : (
              <div className="grid min-w-0 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.email.subject')}</span>
                  <input
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                    maxLength={160}
                    className="h-7 w-full rounded-lg border border-border bg-transparent px-2 text-[11px]"
                  />
                </label>
                <div className="min-w-0 space-y-1">
                  <span className="block truncate text-[10px] font-semibold text-muted-foreground">{t('notify.whatsapp.runId')}</span>
                  <SearchSelect
                    ariaLabel={t('notify.whatsapp.runId')}
                    value={runId}
                    onValueChange={setRunId}
                    placeholder={t('notify.whatsapp.runPlaceholder')}
                    searchPlaceholder={t('notify.whatsapp.runSearch')}
                    emptyLabel={t('notify.whatsapp.runEmpty')}
                    options={runOptions}
                    className="min-w-0 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <span className="flex items-center justify-between gap-2 text-[10px] font-semibold text-muted-foreground">
                    {t('notify.whatsapp.summary')}
                    <SuggestButton
                      ready={Boolean(runId.trim())}
                      busy={suggesting}
                      onClick={() => void suggestSummary('email')}
                    />
                  </span>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    rows={4}
                    maxLength={5000}
                    placeholder={t('notify.email.messageHint')}
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <span className="text-[10px] font-semibold text-muted-foreground">
                  {t('notify.recipients')}
                </span>
                <MultiSelect
                  ariaLabel={t('notify.recipients')}
                  values={selected}
                  onValuesChange={setSelected}
                  minSelected={0}
                  options={reachable.map((contact) => ({
                    value: contact.id,
                    label:
                      channel === 'whatsapp'
                        ? `${contact.name} · ${contact.phoneDisplay ?? contact.phone}`
                        : `${contact.name} · ${contact.email}`,
                  }))}
                  className="w-full"
                />
              </div>
              <Button size="sm" onClick={() => void send()} disabled={!canSend}>
                {busy ? <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Send className="h-3.5 w-3.5" />}
                {busy ? t('notify.sending') : t('notify.send')}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              {reachable.length === 0
                ? t('notify.recipients.none')
                : t('notify.recipients.hint', { count: selected.length, total: reachable.length })}
            </p>

            {result && <SendResult result={result} />}
          </section>
        </div>
      </CardContent>

      <ContactDialog
        open={adding}
        onOpenChange={setAdding}
        country={country}
        onSaved={async () => {
          await refresh()
        }}
      />

      <ContactDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        country={country}
        contact={editing}
        onSaved={async () => {
          setEditing(null)
          await refresh()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('notify.contacts.deleteTitle')}
        description={t('notify.contacts.deleteBody', { name: deleting?.name ?? '' })}
        confirmText={t('notify.contacts.delete')}
        cancelText={t('common.cancel')}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await api.deleteNotificationContact(deleting.id)
            setDeleting(null)
            await refresh()
            toast.success(t('notify.contacts.deleted'), deleting.name)
          } catch (cause) {
            toast.error(t('notify.contacts.deleteError'), (cause as Error).message)
          }
        }}
      />
    </Card>
  )
}

/** The one feather button: drafts a summary grounded in the chosen run. */
function SuggestButton({
  ready,
  busy,
  onClick,
}: {
  ready: boolean
  busy: boolean
  onClick: () => void
}) {
  const { t } = useI18n()
  const inactive = !ready || busy
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-disabled={inactive}
            aria-label={t('notify.whatsapp.suggest')}
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded-lg bg-brand-primary text-white shadow-sm transition-colors hover:bg-brand-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              inactive && 'cursor-not-allowed bg-brand-primary/40 text-white/70 hover:bg-brand-primary/40',
            )}
          >
            {busy ? (
              <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Feather className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-56 text-[11px]">
          {ready ? t('notify.whatsapp.suggestTooltip') : t('notify.whatsapp.suggestNeedsRun')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function SendResult({ result }: { result: NotificationSendResultDto }) {
  const { t } = useI18n()
  const failed = result.failed.length > 0
  const skipped = result.skipped.length > 0
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold">
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          {t('notify.result.sent', { count: result.sent.length })}
        </span>
        {failed && (
          <span className="inline-flex items-center gap-1 text-destructive">
            <XCircle className="h-3 w-3" />
            {t('notify.result.failed', { count: result.failed.length })}
          </span>
        )}
        {skipped && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <ShieldCheck className="h-3 w-3" />
            {t('notify.result.skipped', { count: result.skipped.length })}
          </span>
        )}
      </div>
      {(failed || skipped) && (
        <ul className="space-y-0.5 text-[10px] text-muted-foreground">
          {result.failed.map((entry) => (
            <li key={`f-${entry.contactId}`} className="break-words">
              <span className="font-medium text-destructive">{entry.name}</span> · {entry.to} · {entry.error}
            </li>
          ))}
          {result.skipped.map((entry) => (
            <li key={`s-${entry.contactId}`} className="break-words">
              <span className="font-medium text-foreground">{entry.name}</span> ·{' '}
              {t(`notify.reason.${entry.reason}` as 'notify.reason.no_phone')}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ContactDialog({
  open,
  onOpenChange,
  country,
  contact,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  country: string
  contact?: NotificationContactDto | null
  onSaved: () => Promise<void>
}) {
  const { locale, t } = useI18n()
  const toast = useToast()
  const editing = Boolean(contact)
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [phoneCountry, setPhoneCountry] = React.useState(country.toUpperCase() || 'CM')
  const [emailConsent, setEmailConsent] = React.useState(true)
  const [whatsappConsent, setWhatsappConsent] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const countries = React.useMemo(() => phoneCountries(locale), [locale])
  const countryOptions = React.useMemo(
    () =>
      countries.map((entry) => ({
        value: entry.code,
        label: entry.name,
        hint: entry.dial,
        keywords: `${entry.code} ${entry.dial}`,
      })),
    [countries],
  )
  const parsedPhone = React.useMemo(
    () => (phone.trim() ? parsePhoneInput(phone, phoneCountry) : null),
    [phone, phoneCountry],
  )

  React.useEffect(() => {
    if (!open) return
    setName(contact?.name ?? '')
    setEmail(contact?.email ?? '')
    setPhone(contact?.phoneDisplay ?? contact?.phone ?? '')
    setPhoneCountry((contact?.country ?? country).toUpperCase() || 'CM')
    setEmailConsent(contact ? contact.channels.email : true)
    setWhatsappConsent(contact ? contact.channels.whatsapp : true)
    setProblem(null)
  }, [open, contact, country])

  const submit = async () => {
    setProblem(null)
    if (!name.trim() || (!email.trim() && !phone.trim())) {
      setProblem(t('notify.contacts.incomplete'))
      return
    }
    let e164: string | undefined
    if (phone.trim()) {
      const parsed = parsePhoneInput(phone, phoneCountry)
      if (!parsed.ok) {
        setProblem(t(`notify.phone.${parsed.reason}` as 'notify.phone.invalid'))
        return
      }
      e164 = parsed.e164
    }
    const emailOk = emailConsent && Boolean(email.trim())
    const whatsappOk = whatsappConsent && Boolean(e164)
    if (!emailOk && !whatsappOk) {
      setProblem(t('notify.contacts.noConsent'))
      return
    }
    const body: NewNotificationContactDto = {
      name: name.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(e164 ? { phone: e164, phoneCountry: phoneCountry.toUpperCase() } : {}),
      channels: { email: emailOk, whatsapp: whatsappOk },
    }
    setBusy(true)
    try {
      if (contact) {
        const updated = await api.updateNotificationContact(contact.id, body)
        await onSaved()
        toast.success(t('notify.contacts.edited'), updated.contact.name)
      } else {
        const created = await api.addNotificationContact(body)
        await onSaved()
        toast.success(t('notify.contacts.added'), created.contact.name)
      }
      onOpenChange(false)
    } catch (cause) {
      setProblem(notifyErrorText(cause, t, 'notify.contacts.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-w-md rounded-3xl p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-sm font-semibold">
            {editing ? t('notify.contacts.editTitle') : t('notify.contacts.addTitle')}
          </DialogTitle>
          <DialogDescription className="text-[11px]">
            {editing ? t('notify.contacts.editHint') : t('notify.contacts.addHint')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5 px-5 py-4">
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.contacts.name')}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-[11px]"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.contacts.email')}</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              maxLength={200}
              placeholder="focal.point@example.org"
              className="h-8 w-full rounded-lg border border-border bg-transparent px-2 text-[11px]"
            />
          </label>
          <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.contacts.country')}</span>
              <SearchSelect
                ariaLabel={t('notify.contacts.country')}
                value={phoneCountry}
                onValueChange={setPhoneCountry}
                options={countryOptions}
                placeholder={t('notify.contacts.country')}
                searchPlaceholder={t('notify.contacts.countrySearch')}
                emptyLabel={t('notify.contacts.countryEmpty')}
                className="h-8"
              />
            </div>
            <label className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground">{t('notify.contacts.phone')}</span>
              <input
                value={phone}
                onChange={(event) => setPhone(formatPhoneAsYouType(event.target.value, phoneCountry))}
                inputMode="tel"
                placeholder="6 12 34 56 78"
                className="h-8 w-full rounded-lg border border-border bg-transparent px-2 font-mono text-[11px]"
              />
            </label>
          </div>
          {parsedPhone && (
            <p
              className={cn(
                'text-[10px]',
                parsedPhone.ok ? 'text-muted-foreground' : 'text-rose-500',
              )}
            >
              {parsedPhone.ok
                ? t('notify.contacts.phoneHint', { e164: parsedPhone.e164 })
                : t(`notify.phone.${parsedPhone.reason}` as 'notify.phone.invalid')}
            </p>
          )}
          <div className="grid gap-1.5 rounded-lg border border-border p-2">
            <label className="flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={emailConsent}
                onChange={(event) => setEmailConsent(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              {t('notify.contacts.consentEmail')}
            </label>
            <label className="flex items-center gap-2 text-[11px]">
              <input
                type="checkbox"
                checked={whatsappConsent}
                onChange={(event) => setWhatsappConsent(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              {t('notify.contacts.consentWhatsapp')}
            </label>
          </div>
          {problem && (
            <p className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2 text-[10px] text-rose-500">
              {problem}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : editing ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {busy
              ? t('notify.contacts.saving')
              : editing
                ? t('notify.contacts.saveEdit')
                : t('notify.contacts.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
