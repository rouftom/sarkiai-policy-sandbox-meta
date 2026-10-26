'use client'

import * as React from 'react'
import { BadgeCheck, Bot, ImagePlus, Scale, Send, Shield, ShieldAlert, X } from 'lucide-react'
import { Button, cn } from '@sps/ui'
import { institutionsForDomain, type Domain, type WorkflowLens } from '@sps/shared'
import { api, type AssessmentDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

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
 * Floating policy assistant — admin `apps/organization` charter:
 * SarkiAI Compact density, `--assistant-panel-bg`, backdrop `z-[105]`,
 * panel `z-[110]`, bottom-center avatar when minimised.
 */
export function FloatingAssistant({
  lens,
  country,
  domain,
}: {
  lens: WorkflowLens
  country: string
  domain: Domain
}) {
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [minimized, setMinimized] = React.useState(true)
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const fileRef = React.useRef<HTMLInputElement>(null)

  const addFiles = async (files: FileList | null) => {
    if (!files) return
    const room = 3 - attachments.length
    const picked = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
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
    setAttachments((prev) => [...prev, ...next].slice(0, 3))
  }

  const institutions = React.useMemo(() => institutionsForDomain(domain), [domain])
  const [institutionId, setInstitutionId] = React.useState(institutions[0]?.id ?? 'legal_advisor')

  React.useEffect(() => {
    if (!institutions.some((i) => i.id === institutionId)) setInstitutionId(institutions[0]?.id ?? 'legal_advisor')
  }, [institutions, institutionId])

  const send = async (event?: React.FormEvent) => {
    event?.preventDefault()
    const question = input.trim()
    if (!question || busy) return
    setInput('')
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: question }])
    setBusy(true)
    const payload = attachments.map((a) => ({ mime: a.mime, dataBase64: a.dataBase64 }))
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
      setMessages((prev) => [
        ...prev,
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
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: `⚠️ ${(error as Error).message}` },
      ])
    } finally {
      setBusy(false)
    }
  }

  const activeAgent = institutions.find((i) => i.id === institutionId)

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => addFiles(e.target.files)}
      />

      {/* Backdrop */}
      {open && !minimized && (
        <div
          className="fixed inset-0 z-[105] bg-foreground/30 dark:bg-black/40"
          onClick={() => setMinimized(true)}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      {open && !minimized && (
        <div className="assistant-panel fixed top-2 bottom-14 left-2 right-2 z-[110] mx-auto flex max-w-3xl flex-col overflow-hidden rounded-3xl border border-border shadow-2xl lg:top-4">
          <header className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15">
                <Bot className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              </div>
              <span className="text-[10px] font-black tracking-widest text-muted-foreground">POLICY ASSISTANT</span>
              {activeAgent && (
                <span className="text-[10px] tracking-widest text-muted-foreground/70">· {activeAgent.name}</span>
              )}
            </div>
            <Button variant="ghost" size="icon" aria-label="Réduire" onClick={() => setMinimized(true)}>
              <X className="h-4 w-4" />
            </Button>
          </header>

          <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto bg-background/60 p-3">
            {messages.length === 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {institutions.slice(0, 4).map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => setInstitutionId(inst.id)}
                    className={cn(
                      'rounded-xl border border-border bg-card p-3 text-left transition-colors hover:bg-secondary',
                      institutionId === inst.id && 'border-primary bg-primary/5',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {inst.role === 'legal_advisor' ? (
                        <Scale className={cn('h-4 w-4', inst.color)} />
                      ) : (
                        <Shield className={cn('h-4 w-4', inst.color)} />
                      )}
                      <span className="text-xs font-semibold">{inst.name}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{inst.mandate}</p>
                  </button>
                ))}
              </div>
            )}

            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'max-w-[85%] rounded-2xl px-3 py-2 text-sm',
                  message.role === 'user'
                    ? 'ml-auto bg-primary text-primary-foreground'
                    : 'border border-border bg-card text-card-foreground',
                )}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.validation && (
                  <p
                    className={cn(
                      'mt-1.5 flex items-center gap-1 text-[10px]',
                      message.validation.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
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
                  <ul className="mt-2 space-y-1 border-t border-border/60 pt-2 text-[11px]">
                    {message.citations.slice(0, 4).map((citation, i) => (
                      <li key={i} className="text-muted-foreground">
                        {citation.filename}
                        {citation.articleNumber ? ` · ARTICLE ${citation.articleNumber}` : ''}
                        {citation.headingPath ? ` · ${citation.headingPath}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}

            {busy && <div className="text-xs text-muted-foreground">Recherche de la disposition applicable…</div>}
          </div>

          <p className="shrink-0 border-t border-border px-3 py-1.5 text-center text-[10px] text-muted-foreground">
            Made with <span aria-label="love">♥️</span> by{' '}
            <a href="https://djotta.com" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
              Djotta
            </a>
          </p>

          <form onSubmit={send} className="shrink-0 border-t border-border p-2">
            {attachments.length > 0 && (
              <div className="mb-2 flex gap-2">
                {attachments.map((attachment, index) => (
                  <div key={index} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={attachment.url}
                      alt=""
                      className="h-12 w-12 rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                      className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-white"
                      aria-label="Retirer l'image"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <select
                value={institutionId}
                onChange={(e) => setInstitutionId(e.target.value)}
                className="h-8 rounded-xl border border-border bg-transparent px-2 text-[11px]"
                aria-label="Agent"
              >
                {institutions.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Posez une question (texte + image)…"
                className="h-8 flex-1 rounded-xl border border-border bg-transparent px-3 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Joindre une image"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Button type="submit" size="icon" aria-label="Envoyer" disabled={busy || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Bottom-center prompt / avatar */}
      {(!open || minimized) && (
        <div className="fixed bottom-1.5 left-0 right-0 z-[110] p-2">
          <div className="mx-auto flex w-[95%] max-w-xl items-center gap-2">
            <Button
              onClick={() => {
                setOpen(true)
                setMinimized(false)
              }}
              aria-label="Ouvrir l'assistant politique"
              className="h-12 w-16 rounded-t-[5rem] rounded-b-none"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <Bot className="h-6 w-6 text-white" aria-hidden="true" />
              </div>
            </Button>
            <form
              onSubmit={send}
              className="assistant-panel flex flex-1 items-center gap-2 rounded-xl border border-border p-1"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Interroger un agent institutionnel…"
                className="h-8 flex-1 bg-transparent px-3 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Joindre une image"
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Button type="submit" size="icon" aria-label="Envoyer" disabled={busy || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
