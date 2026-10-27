'use client'

import * as React from 'react'
import {
  BadgeCheck,
  Bot,
  ImagePlus,
  Plus,
  Scale,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Button, Select, Tooltip, cn } from '@sps/ui'
import { institutionsForDomain, type Domain, type WorkflowLens } from '@sps/shared'
import { api, type AssessmentDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: AssessmentDto['citations']
  validation?: AssessmentDto['validation']
  agentId?: string
}

interface Attachment {
  mime: string
  dataBase64: string
  url: string
}

/**
 * Policy assistant, embedded in the left panel of the console shell — the same
 * geometry as the FSM admin assistant (`--assistant-panel-bg`, rounded-3xl,
 * header with close/new actions, scrollable transcript, composer at the bottom).
 * It is a panel, not an overlay: the operator reads the policy answer next to
 * the workspace it applies to.
 */
export function PolicyAssistant({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { country, domain, lens } = useWorkspace()
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const fileRef = React.useRef<HTMLInputElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const institutions = React.useMemo(() => institutionsForDomain(domain), [domain])
  const [institutionId, setInstitutionId] = React.useState(institutions[0]?.id ?? 'legal_advisor')

  React.useEffect(() => {
    if (!institutions.some((institution) => institution.id === institutionId)) {
      setInstitutionId(institutions[0]?.id ?? 'legal_advisor')
    }
  }, [institutions, institutionId])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    const room = 3 - attachments.length
    const picked = Array.from(files)
      .filter((file) => file.type.startsWith('image/'))
      .slice(0, Math.max(0, room))
    const next: Attachment[] = []
    for (const file of picked) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const commaIndex = dataUrl.indexOf(',')
      if (commaIndex < 0) continue
      const meta = dataUrl.slice(0, commaIndex)
      const base64 = dataUrl.slice(commaIndex + 1)
      const mime = meta.slice(meta.indexOf(':') + 1, meta.indexOf(';'))
      next.push({ mime, dataBase64: base64, url: dataUrl })
    }
    setAttachments((previous) => [...previous, ...next].slice(0, 3))
  }

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const question = input.trim()
    if (!question || busy) return
    setInput('')
    setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: 'user', content: question }])
    setBusy(true)
    const payload = attachments.map((attachment) => ({ mime: attachment.mime, dataBase64: attachment.dataBase64 }))
    try {
      const result = await api.ask({
        institutionId,
        question,
        country,
        domain,
        lens,
        attachments: payload.length ? payload : undefined,
      })
      setAttachments([])
      setMessages((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          agentId: result.agentId,
          content: result.findings.join('\n\n'),
          citations: result.citations,
          validation: result.validation,
        },
      ])
    } catch (error) {
      setMessages((previous) => [
        ...previous,
        { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${(error as Error).message}` },
      ])
    } finally {
      setBusy(false)
    }
  }

  const activeAgent = institutions.find((institution) => institution.id === institutionId)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          void addFiles(event.target.files)
          event.target.value = ''
        }}
      />

      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-brand-primary/10 px-3 dark:border-brand-primary-dark/25">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 dark:bg-brand-primary-dark/40">
          <Bot className="h-4 w-4 text-brand-primary-dark dark:text-brand-primary-light" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-medium text-foreground">
            {t('assistant.title')}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {country.toUpperCase()} · {t(`domain.${domain}` as 'domain.health')} ·{' '}
            {t(`lens.${lens}.label` as 'lens.hybrid.label')}
          </p>
        </div>
        <Tooltip label={t('assistant.newChat')}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('assistant.newChat')}
            onClick={() => {
              setMessages([])
              setAttachments([])
            }}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
        <Tooltip label={t('assistant.close')}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t('assistant.close')}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </header>

      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-brand-primary/15 bg-background/50 px-3 py-2.5 dark:border-brand-primary-dark/30">
              <p className="flex items-center gap-1.5 text-[10px] font-medium text-brand-primary-dark dark:text-brand-primary-light">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                {t('assistant.emptyTitle')}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t('assistant.emptyBody')}</p>
            </div>

            <p className="px-1 text-[9px] font-medium text-muted-foreground">
              {t('assistant.mandates')}
            </p>
            <div className="grid gap-1.5">
              {institutions.map((institution) => {
                const Icon = institution.role === 'legal_advisor' ? Scale : Shield
                const selected = institution.id === institutionId
                return (
                  <button
                    key={institution.id}
                    type="button"
                    onClick={() => setInstitutionId(institution.id)}
                    className={cn(
                      'flex items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors',
                      selected
                        ? 'border-brand-primary/40 bg-brand-primary/10 dark:border-brand-primary-light/30 dark:bg-brand-primary-dark/30'
                        : 'border-border bg-card/60 hover:bg-secondary',
                    )}
                  >
                    <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', institution.color)} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-[11px] font-semibold text-foreground">{institution.name}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[10px] leading-relaxed text-muted-foreground">
                        {institution.mandate}
                      </span>
                    </span>
                    {selected && <BadgeCheck className="ml-auto h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-brand-primary-light" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              'rounded-2xl px-3 py-2 text-[11px] leading-relaxed',
              message.role === 'user'
                ? 'ml-6 bg-brand-primary text-white'
                : 'border border-border bg-card text-card-foreground',
            )}
          >
            {message.role === 'assistant' && message.agentId && (
              <p className="mb-1 text-[9px] font-medium text-muted-foreground">
                {institutions.find((institution) => institution.id === message.agentId)?.name ?? message.agentId}
              </p>
            )}
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.validation && (
              <p
                className={cn(
                  'mt-1.5 flex items-center gap-1 text-[10px]',
                  message.validation.ok
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400',
                )}
              >
                {message.validation.ok ? (
                  <BadgeCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                {message.validation.ok
                  ? message.validation.attempts > 1
                    ? t('citation.verifiedAfterRetry', { attempts: message.validation.attempts })
                    : t('citation.verified')
                  : t('citation.rejected', { count: message.validation.rejected.length })}
              </p>
            )}
            {message.citations && message.citations.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[10px]">
                {message.citations.slice(0, 4).map((citation, index) => {
                  const label = [
                    citation.filename,
                    citation.articleNumber ? `ARTICLE ${citation.articleNumber}` : '',
                    citation.headingPath ?? '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  return (
                    <li key={index} className="text-muted-foreground">
                      {citation.sourceUrl ? (
                        <a
                          href={citation.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-brand-primary-dark hover:underline dark:text-brand-primary-light"
                        >
                          {label}
                        </a>
                      ) : (
                        <span className="font-semibold">{label}</span>
                      )}
                      {citation.quote && <p className="mt-0.5 line-clamp-2 italic opacity-80">“{citation.quote}”</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}

        {busy && (
          <p className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-primary dark:bg-brand-primary-light" />
            {t('assistant.searching')}
          </p>
        )}
      </div>

      <form
        onSubmit={send}
        className="shrink-0 space-y-2 border-t border-brand-primary/10 p-2.5 dark:border-brand-primary-dark/25"
      >
        <div className="flex items-center gap-1.5">
          <Select
            value={institutionId}
            onValueChange={setInstitutionId}
            ariaLabel={t('assistant.agent')}
            options={institutions.map((institution) => ({ value: institution.id, label: institution.name }))}
            className="min-w-0 flex-1"
          />
          <Tooltip label={t('assistant.attach')} side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('assistant.attach')}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>

        {attachments.length > 0 && (
          <div className="flex gap-1.5">
            {attachments.map((attachment, index) => (
              <div key={index} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.url}
                  alt=""
                  className="h-11 w-11 rounded-lg border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => setAttachments((previous) => previous.filter((_, i) => i !== index))}
                  className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
                  aria-label={t('assistant.removeImage')}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="relative">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            rows={2}
            placeholder={t('assistant.placeholder')}
            aria-label={t('assistant.placeholder')}
            className="custom-scrollbar w-full resize-none rounded-xl border border-input bg-background/70 px-2.5 py-2 pr-10 text-[11px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          <Button
            type="submit"
            size="icon-sm"
            aria-label={t('assistant.send')}
            disabled={busy || !input.trim()}
            className="absolute bottom-1.5 right-1.5"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>

        <p className="text-center text-[9px] tracking-wide text-muted-foreground">
          {t('assistant.footer', { agent: activeAgent?.name ?? '—' })}
        </p>
      </form>
    </div>
  )
}
