'use client'

import * as React from 'react'
import { ArrowUp, ImagePlus, Plus, RotateCcw, Scale, Shield, X } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Tooltip,
  cn,
} from '@sps/ui'
import { institutionsForDomain } from '@sps/shared'
import { api, type AssessmentDto, type MetaModelDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { BrandMark } from '@/components/layout/brand-mark'

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
 * Policy assistant in the left panel of the console. Same composer as the FSM
 * assistant: one rounded pill, a `+` icon button that holds every option (the
 * mandated institution and the Meta model as sub-menus, image attachment, new
 * conversation), and the send button on the right. No selects, no toolbars.
 */
export function PolicyAssistant({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { country, domain, lens } = useWorkspace()
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [menuOpen, setMenuOpen] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const institutions = React.useMemo(() => institutionsForDomain(domain), [domain])
  const [institutionId, setInstitutionId] = React.useState(institutions[0]?.id ?? 'legal_advisor')
  const activeInstitution = institutions.find((institution) => institution.id === institutionId) ?? institutions[0]

  const [models, setModels] = React.useState<MetaModelDto[]>([])
  const [modelState, setModelState] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const [model, setModel] = React.useState('')
  const [modelError, setModelError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!institutions.some((institution) => institution.id === institutionId)) {
      setInstitutionId(institutions[0]?.id ?? 'legal_advisor')
    }
  }, [institutions, institutionId])

  React.useEffect(() => {
    let cancelled = false
    api
      .models()
      .then((result) => {
        if (cancelled) return
        setModels(result.models)
        setModel(result.selected)
        setModelState('ready')
      })
      .catch(() => {
        if (!cancelled) setModelState('error')
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  const chooseModel = async (id: string) => {
    const previous = model
    setModel(id)
    setModelError(null)
    try {
      await api.selectModel(id)
    } catch (error) {
      setModel(previous)
      setModelError((error as Error).message)
    }
  }

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
      next.push({
        mime: meta.slice(meta.indexOf(':') + 1, meta.indexOf(';')),
        dataBase64: dataUrl.slice(commaIndex + 1),
        url: dataUrl,
      })
    }
    setAttachments((previous) => [...previous, ...next].slice(0, 3))
  }

  const send = async (override?: string) => {
    const question = (override ?? input).trim()
    if (!question || busy || !activeInstitution) return
    setInput('')
    setMessages((previous) => [...previous, { id: crypto.randomUUID(), role: 'user', content: question }])
    setBusy(true)
    const payload = attachments.map((attachment) => ({ mime: attachment.mime, dataBase64: attachment.dataBase64 }))
    try {
      const result = await api.ask({
        institutionId: activeInstitution.id,
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

  const newConversation = () => {
    setMessages([])
    setAttachments([])
    textareaRef.current?.focus()
  }

  const suggestions = [t('assistant.suggest1'), t('assistant.suggest2'), t('assistant.suggest3')]

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

      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-foreground">{t('assistant.title')}</p>
        <Tooltip label={t('assistant.close')}>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('assistant.close')} onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      </header>

      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <BrandMark className="h-12 w-12" />
            <div>
              <p className="text-[14px] font-semibold text-foreground">{t('assistant.greeting')}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t('assistant.emptyBody')}
              </p>
            </div>
            <div className="grid w-full gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  disabled={busy}
                  className="rounded-2xl border border-border bg-card px-3 py-2 text-left text-[11px] text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
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
                  <p className="mb-1 text-[10px] font-medium text-muted-foreground">
                    {institutions.find((institution) => institution.id === message.agentId)?.name ?? message.agentId}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.validation && (
                  <p
                    className={cn(
                      'mt-1.5 text-[10px]',
                      message.validation.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
                    )}
                  >
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
                        citation.articleNumber ? `Article ${citation.articleNumber}` : '',
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
            {busy && <p className="px-1 text-[10px] text-muted-foreground">{t('assistant.searching')}</p>}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 p-3">
        {attachments.length > 0 && (
          <div className="flex gap-1.5">
            {attachments.map((attachment, index) => (
              <div key={index} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachment.url} alt="" className="h-11 w-11 rounded-lg border border-border object-cover" />
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

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void send()
          }}
          className="flex items-end gap-1 rounded-3xl border border-input bg-card p-1.5 shadow-sm focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25"
        >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" aria-label={t('assistant.options')}>
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-56">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{t('assistant.institution')}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel>{t('assistant.institution')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={institutionId} onValueChange={setInstitutionId}>
                    {institutions.map((institution) => {
                      const Icon = institution.role === 'legal_advisor' ? Scale : Shield
                      return (
                        <DropdownMenuRadioItem key={institution.id} value={institution.id}>
                          <Icon className={cn('h-3.5 w-3.5 shrink-0', institution.color)} />
                          <span className="truncate">{institution.name}</span>
                        </DropdownMenuRadioItem>
                      )
                    })}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <span className="min-w-0 flex-1 truncate">{t('assistant.model')}</span>
                  <span className="max-w-[6rem] truncate font-mono text-[10px] text-muted-foreground">{model || '—'}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuLabel>{t('assistant.modelMeta')}</DropdownMenuLabel>
                  {modelState === 'loading' && <DropdownMenuItem disabled>{t('assistant.modelLoading')}</DropdownMenuItem>}
                  {modelState === 'error' && <DropdownMenuItem disabled>{t('assistant.modelUnavailable')}</DropdownMenuItem>}
                  {modelState === 'ready' && models.length === 0 && (
                    <DropdownMenuItem disabled>{t('assistant.modelNone')}</DropdownMenuItem>
                  )}
                  {modelState === 'ready' && (
                    <DropdownMenuRadioGroup value={model} onValueChange={(value) => void chooseModel(value)}>
                      {models.map((entry) => (
                        <DropdownMenuRadioItem key={entry.id} value={entry.id} className="font-mono text-[11px]">
                          {entry.id}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  )}
                  {modelError && <p className="px-2.5 py-1 text-[10px] text-destructive">{modelError}</p>}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                {t('assistant.attach')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={newConversation}>
                <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                {t('assistant.newChat')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder={t('assistant.placeholder')}
            aria-label={t('assistant.placeholder')}
            className="custom-scrollbar max-h-28 min-h-[28px] flex-1 resize-none bg-transparent px-1.5 py-1 text-[12px] text-foreground outline-none placeholder:text-muted-foreground"
          />

          <Button
            type="submit"
            size="icon-sm"
            className="rounded-full"
            aria-label={t('assistant.send')}
            disabled={busy || !input.trim()}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        </form>

        <p className="text-center text-[10px] text-muted-foreground">
          {t('assistant.footer', { agent: activeInstitution?.name ?? '—' })}
          {model ? ` · ${model}` : ''}
        </p>
      </div>
    </div>
  )
}
