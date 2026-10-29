'use client'

/**
 * One audit record opened on the right: the fields the engine processed for the
 * action, the hashes that chain it to the previous record, and the raw payload.
 * It is the traceability view of a line of the journal, not an editor.
 */

import * as React from 'react'
import { Check, Copy, ShieldCheck, X } from 'lucide-react'
import { Badge, Button, cn } from '@sps/ui'
import type { AuditEventDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { auditActionLabel, auditActorLabel } from '@/lib/audit-labels'

export function AuditEventDrawer({
  event,
  onClose,
}: {
  event: AuditEventDto | null
  onClose: () => void
}) {
  const { t, locale } = useI18n()
  const [copied, setCopied] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copied])

  React.useEffect(() => {
    if (!event) return
    const onKey = (keyboard: KeyboardEvent) => {
      if (keyboard.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [event, onClose])

  if (!event) return null

  const time = new Date(event.ts).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  })

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(id)
    } catch {
      setCopied(null)
    }
  }

  const rows: Array<{ label: string; value: React.ReactNode }> = [
    { label: t('audit.time'), value: time },
    { label: t('audit.actor'), value: auditActorLabel(event.actor, t) },
    {
      label: t('audit.action'),
      value: (
        <span className="space-y-1">
          <span className="block">{auditActionLabel(event.action, t)}</span>
          <span className="block font-mono text-[10px] text-muted-foreground">{event.action}</span>
        </span>
      ),
    },
    { label: t('audit.target'), value: event.target || 'n/a' },
    { label: t('audit.linkedRun'), value: event.runId ? <span className="font-mono text-[10px]">{event.runId}</span> : 'n/a' },
    { label: t('audit.lens'), value: event.lens },
    {
      label: t('audit.citations'),
      value:
        event.citations.length > 0 ? (
          <ul className="space-y-1">
            {event.citations.map((citation) => (
              <li key={citation.filename} className="truncate font-mono text-[10px]">
                {citation.filename}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground">{t('audit.noCitations')}</span>
        ),
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={t('audit.drawer.title')}>
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 bg-slate-950/30" />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-card shadow-2xl">
        <header className="flex items-start gap-2 border-b border-border px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-muted-foreground">{t('audit.drawer.title')}</p>
            <h2 className="truncate font-mono text-[11px] font-semibold text-foreground">{event.id}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7 shrink-0 rounded-lg"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </header>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('audit.drawer.subtitle')}</p>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-secondary/60 p-3 text-[11px]">
            {rows.map((row) => (
              <React.Fragment key={row.label}>
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="min-w-0 break-words font-medium text-foreground">{row.value}</dd>
              </React.Fragment>
            ))}
          </dl>

          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('audit.drawer.outcome')}</h3>
            <div className="space-y-2 rounded-xl border border-border p-2">
              <HashLine
                label={t('audit.hash')}
                value={event.hash}
                copied={copied === 'hash'}
                onCopy={() => void copy('hash', event.hash)}
                copyLabel={t('audit.copyValue')}
                copiedLabel={t('audit.copied')}
              />
              <HashLine
                label={t('audit.previousHash')}
                value={event.prevHash ?? 'n/a'}
                copied={copied === 'prev'}
                onCopy={() => event.prevHash && void copy('prev', event.prevHash)}
                copyLabel={t('audit.copyValue')}
                copiedLabel={t('audit.copied')}
                muted={!event.prevHash}
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> {t('audit.drawer.event')}
            </h3>
            <pre className="custom-scrollbar max-h-72 overflow-auto rounded-xl bg-secondary/60 p-3 font-mono text-[10px] leading-relaxed text-foreground">
              {JSON.stringify(event, null, 2)}
            </pre>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Badge tone="neutral" className="whitespace-nowrap">
            {event.lens}
          </Badge>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.close')}
          </Button>
        </footer>
      </aside>
    </div>
  )
}

function HashLine({
  label,
  value,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
  muted = false,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  copyLabel: string
  copiedLabel: string
  muted?: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 flex-1 truncate font-mono text-[10px]', muted && 'text-muted-foreground')} title={value}>
        {value}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-6 w-6 shrink-0 rounded-md"
        aria-label={copyLabel}
        title={copyLabel}
        onClick={onCopy}
        disabled={muted}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  )
}
