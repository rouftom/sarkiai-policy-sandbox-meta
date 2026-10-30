
'use client'

import * as React from 'react'
import { Check, ChevronDown, GraduationCap, HeartPulse, History, ImagePlus, Landmark, ListChecks, Plus, RadioTower, Route, Scale, Shield, Sprout, X } from 'lucide-react'
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
  TooltipContent,
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  cn,
} from '@sps/ui'
import { institutionsForDomains, type Domain } from '@sps/shared'
import { api, type AssessmentDto, type MetaModelDto } from '@/lib/api'
import type { ActionRecord, ActionStatus, AgentUiRequest } from '@/lib/agent-ui'
import { decideAction, listActions } from '@/lib/actions-client'
import { ActionCenter } from '@/components/ai/tools/action-center'
import { McpAppView } from '@/components/ai/mcp/mcp-app-wrapper'
import { ChatHistory } from '@/components/ai/display/chat-history'
import {
  deleteChatSession,
  getChatSession,
  listChatSessions,
  saveChatSession,
  type ChatSessionSummary,
} from '@/lib/chat-sessions-client'
import { AskUserPanel } from '@/components/ai/tools/ask-user-panel'
import { RequestInputCard } from '@/components/ai/tools/request-input-card'
import { ApprovalCard } from '@/components/ai/tools/approval-card'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { institutionAccent, institutionInk } from '@/lib/institutions'
import { BrandMark } from '@/components/layout/brand-mark'
import { ChatInput } from '@/components/ai/inputs/chat-input'
import { ChatMessage, type ChatTurn } from '@/components/ai/display/chat-message'
import { LoaderGlyph, STREAM_LOADERS, useStreamLoader, type StreamLoaderVariant } from '@/components/ai/display/stream-loaders'
import type { TrailStepView } from '@/components/ai/tools/agent-activity-trail'

interface Attachment {
  mime: string
  dataBase64: string
  /** Preview for images; documents have none. */
  url: string
  name: string
}

const DOCUMENT_TYPES = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json']
const ACCEPTED_FILES = ['image/*', '.pdf', '.txt', '.md', '.csv', '.json'].join(',')
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

const STAGES = ['retrieving', 'generating', 'validating', 'retry', 'persisting'] as const

/** The icon and the tint of each sector, so the menu reads at a glance. */
const SECTOR_STYLE: Record<Domain, { icon: typeof HeartPulse; color: string; soft: string }> = {
  health: { icon: HeartPulse, color: 'text-rose-500', soft: 'bg-rose-500/10' },
  education: { icon: GraduationCap, color: 'text-sky-500', soft: 'bg-sky-500/10' },
  telecom: { icon: RadioTower, color: 'text-violet-500', soft: 'bg-violet-500/10' },
  public_services: { icon: Landmark, color: 'text-amber-500', soft: 'bg-amber-500/10' },
  agriculture: { icon: Sprout, color: 'text-emerald-500', soft: 'bg-emerald-500/10' },
}

/**
 * Policy assistant in the left panel of the console. Turns are rendered by the
 * organization chat components (composer, message, activity trail, animated
 * answer). The stream drives them: stage events open and close trail steps with
 * their durations, reasoning and answer deltas are written as they arrive, and
 * the final assessment replaces the draft with its citations and validation.
 */
export function PolicyAssistant({ onClose }: { onClose: () => void }) {
  const { t, locale } = useI18n()
  const { country, domain, domains, sectors, setDomains } = useWorkspace()
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [turns, setTurns] = React.useState<ChatTurn[]>([])
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [menuOpen, setMenuOpen] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [actionStatus, setActionStatus] = React.useState<Record<string, ActionStatus>>({})
  const [actionBusy, setActionBusy] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = React.useState(false)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [sessions, setSessions] = React.useState<ChatSessionSummary[]>([])
  const [sessionsLoading, setSessionsLoading] = React.useState(false)
  /** Set when a saved conversation is loaded, so loading it is not saved back as a change. */
  const skipSave = React.useRef(false)
  const [actionRecords, setActionRecords] = React.useState<ActionRecord[]>([])
  const [actionsLoading, setActionsLoading] = React.useState(false)
  /**
   * Base text and last dictation of the current voice recording (the recorder
   * sends the whole dictation each time). `stale` is set when the operator sends
   * or empties the field: the last correction of the transcription is still in
   * flight at that point and must not write the discarded words back.
   */
  const dictation = React.useRef({ base: null as string | null, last: '', stale: false })
  const inputRef = React.useRef(input)
  inputRef.current = input
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  // The institutions of every sector the operator works on (one list for the whole workspace).
  const institutions = React.useMemo(() => institutionsForDomains(domains), [domains])
  /** The institutions the operator chose. None: the router picks per question among all of them; one: it answers directly; several: the router picks among those. */
  const [institutionIds, setInstitutionIds] = React.useState<string[]>([])
  const pinned = institutionIds.length === 1 ? institutions.find((institution) => institution.id === institutionIds[0]) : undefined
  const toggleInstitution = (id: string) =>
    setInstitutionIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))

  const [models, setModels] = React.useState<MetaModelDto[]>([])
  const [modelState, setModelState] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const [model, setModel] = React.useState('')
  const [modelError, setModelError] = React.useState<string | null>(null)

  // A sector change can remove a chosen institution: it is dropped from the choice.
  React.useEffect(() => {
    const kept = institutionIds.filter((id) => institutions.some((institution) => institution.id === id))
    if (kept.length !== institutionIds.length) setInstitutionIds(kept)
  }, [institutions, institutionIds])

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
  }, [turns])

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
      .filter((file) => file.type.startsWith('image/') || DOCUMENT_TYPES.includes(file.type) || /\.(pdf|txt|md|csv|json)$/i.test(file.name))
      .filter((file) => file.size <= MAX_ATTACHMENT_BYTES)
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
      const header = dataUrl.slice(0, commaIndex)
      const mime = file.type || header.slice(header.indexOf(':') + 1, header.indexOf(';'))
      next.push({
        mime,
        dataBase64: dataUrl.slice(commaIndex + 1),
        url: mime.startsWith('image/') ? dataUrl : '',
        name: file.name,
      })
    }
    setAttachments((previous) => [...previous, ...next].slice(0, 3))
  }

  /** Patch the assistant turn being written (always the last one). */
  const patchLast = (patch: (turn: ChatTurn) => ChatTurn) =>
    setTurns((previous) => {
      const copy = previous.slice()
      const last = copy[copy.length - 1]
      if (last) copy[copy.length - 1] = patch(last)
      return copy
    })

  const send = async (override?: string) => {
    const question = (override ?? input).trim()
    if (!question || busy || institutions.length === 0) return
    const now = Date.now()
    setInput('')
    // Whatever the recorder is still correcting belongs to the question just sent.
    dictation.current = { base: null, last: '', stale: true }
    setBusy(true)
    const payload = attachments.map((attachment) => ({ mime: attachment.mime, dataBase64: attachment.dataBase64, name: attachment.name }))
    // The files belong to this message: the next question starts without them.
    setAttachments([])

    // The question and the agent's turn are shown before any network call: the
    // conversation appears the moment the operator sends, then the trail fills in.
    let target = pinned ?? institutions[0]!
    setTurns((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: 'user', content: question },
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        agentName: target.name,
        steps: [],
        startedAt: now,
        active: true,
      },
    ])

    // Auto: the router picks the institution(s) first; the first one answers.
    let routedTo: string[] | undefined
    if (!pinned) {
      const routed = await api.routeQuestion({ question, domains, institutionIds }).catch(() => null)
      const primary = institutions.find((institution) => institution.id === routed?.primary) ?? institutions[0]!
      target = primary
      const others = (routed?.others ?? [])
        .map((id) => institutions.find((institution) => institution.id === id)?.name)
        .filter((name): name is string => Boolean(name))
      routedTo = [primary.name, ...others]
      patchLast((turn) => ({
        ...turn,
        agentName: primary.name,
        ...(routedTo ? { routedTo } : {}),
      }))
    }
    const activeInstitution = target

    // Tool calls get their own trail steps, closed by their own `end` event.
    const toolSteps = new Map<string, { key: string; startedAt: number }>()
    /** The answer is written here and shown only once it is validated: the user watches the reasoning, then reads the result. */
    let answer = ''

    // Trail bookkeeping: one open step at a time, closed with its duration.
    let openStep: { key: string; label: string; startedAt: number } | null = null
    let counter = 0
    const stageLabel = (stage: string, attempt?: number) => {
      const base = STAGES.includes(stage as (typeof STAGES)[number]) ? t(`assistant.stage.${stage}` as 'assistant.stage.retrieving') : stage
      return attempt && attempt > 1 ? `${base} · ${attempt}` : base
    }
    const closeOpen = (at: number) => {
      if (!openStep) return
      const closing = openStep
      patchLast((turn) => ({
        ...turn,
        steps: (turn.steps ?? []).map((step) =>
          step.key === closing.key ? { ...step, status: 'complete', durationMs: at - closing.startedAt } : step,
        ),
      }))
      openStep = null
    }

    // Each agent reasons with a sector it belongs to, among the sectors the operator chose.
    const sectorOf = activeInstitution.domains.find((entry) => domains.includes(entry)) ?? domain
    const body = {
      institutionId: activeInstitution.id,
      question,
      country,
      domain: sectorOf,
      language: locale === 'fr' ? ('fr' as const) : ('en' as const),
      attachments: payload.length ? payload : undefined,
    }
    try {
      const result = await api.askStream(body, {
        onStage: (stage, detail) => {
          const at = Date.now()
          closeOpen(at)
          counter += 1
          openStep = { key: `${stage}-${counter}`, label: stageLabel(stage, detail.attempt), startedAt: at }
          const step: TrailStepView = { key: openStep.key, label: openStep.label, count: 1, status: 'active' }
          // A rejected attempt is discarded; its reasoning and trail stay visible.
          if (stage === 'retry') answer = ''
          patchLast((turn) => ({ ...turn, steps: [...(turn.steps ?? []), step] }))
        },
        onReasoning: (text) => patchLast((turn) => ({ ...turn, reasoning: `${turn.reasoning ?? ''}${text}` })),
        onDelta: (text) => {
          answer += text
        },
        onTool: (event) => {
          const at = Date.now()
          if (event.phase === 'start') {
            const key = `tool-${event.id}`
            toolSteps.set(event.id, { key, startedAt: at })
            const label = event.summary ? `${event.name} · ${event.summary}` : event.name
            patchLast((turn) => ({ ...turn, steps: [...(turn.steps ?? []), { key, label, count: 1, status: 'active' }] }))
            return
          }
          const started = toolSteps.get(event.id)
          if (!started) return
          toolSteps.delete(event.id)
          patchLast((turn) => ({
            ...turn,
            steps: (turn.steps ?? []).map((step) =>
              step.key === started.key
                ? { ...step, status: event.ok ? 'complete' : 'error', durationMs: at - started.startedAt }
                : step,
            ),
          }))
        },
        onUi: (ui) => patchLast((turn) => ({ ...turn, cards: [...(turn.cards ?? []), ui] })),
      })
      closeOpen(Date.now())
      patchLast((turn) => ({
        ...turn,
        content: result.findings.join('\n\n'),
        citations: result.citations,
        validation: result.validation,
        webSources: result.webSources,
        active: false,
        endedAt: Date.now(),
        steps: (turn.steps ?? []).map((step) => (step.status === 'active' ? { ...step, status: 'complete' } : step)),
      }))
    } catch (error) {
      closeOpen(Date.now())
      const message = (error as Error).message
      patchLast((turn) => ({
        ...turn,
        content: turn.content ? turn.content : `⚠️ ${message}`,
        active: false,
        endedAt: Date.now(),
        steps: (turn.steps ?? []).map((step) => (step.status === 'active' ? { ...step, status: 'error' } : step)),
      }))
    } finally {
      setBusy(false)
    }
  }

  /** Sends the operator's answer to a question or input request as the next turn. */
  const answerCard = (turnId: string, cardId: string, answer: string) => {
    setTurns((previous) =>
      previous.map((turn) =>
        turn.id === turnId ? { ...turn, cards: (turn.cards ?? []).filter((card) => card.id !== cardId) } : turn,
      ),
    )
    void send(answer)
  }

  const submitFile = async (turnId: string, card: Extract<AgentUiRequest, { kind: 'request_input' }>, file: File) => {
    if (file.type.startsWith('image/')) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const commaIndex = dataUrl.indexOf(',')
      setAttachments((previous) =>
        [...previous, { mime: file.type, dataBase64: dataUrl.slice(commaIndex + 1), url: dataUrl, name: file.name }].slice(0, 3),
      )
      answerCard(turnId, card.id, `${card.label}: ${file.name}`)
      return
    }
    const text = (await file.text()).slice(0, 20_000)
    answerCard(turnId, card.id, `${card.label} (${file.name}):\n${text}`)
  }

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setActionBusy(id)
    setActionError(null)
    try {
      const record = await decideAction(id, decision)
      setActionStatus((previous) => ({ ...previous, [id]: record.status }))
    } catch (error) {
      setActionError((error as Error).message)
    } finally {
      setActionBusy(null)
    }
  }

  const loadActions = async () => {
    setActionsLoading(true)
    try {
      setActionRecords(await listActions())
    } catch (error) {
      setActionError((error as Error).message)
    } finally {
      setActionsLoading(false)
    }
  }

  React.useEffect(() => {
    if (actionsOpen) void loadActions()
  }, [actionsOpen])

  const decideFromCenter = async (id: string, decision: 'approve' | 'reject') => {
    try {
      await decideAction(id, decision)
    } catch (error) {
      setActionError((error as Error).message)
    }
    await loadActions()
  }

  const renderCard = (turnId: string, card: AgentUiRequest) => {
    if (card.kind === 'ask_user') {
      return <AskUserPanel key={card.id} request={card} disabled={busy} onAnswer={(answer) => answerCard(turnId, card.id, answer)} />
    }
    if (card.kind === 'request_input') {
      return (
        <RequestInputCard
          key={card.id}
          request={card}
          disabled={busy}
          onSubmit={(value) =>
            typeof value === 'string' ? answerCard(turnId, card.id, value) : void submitFile(turnId, card, value)
          }
        />
      )
    }
    if (card.kind === 'mcp_app') {
      return (
        <McpAppView
          key={card.id}
          server={card.server}
          resourceUri={card.resourceUri}
          toolName={card.toolName}
          toolInput={card.toolInput}
          toolResult={card.toolResult}
        />
      )
    }
    return (
      <ApprovalCard
        key={card.id}
        request={card}
        status={actionStatus[card.id]}
        busy={actionBusy === card.id}
        onDecision={(decision) => void decide(card.id, decision)}
      />
    )
  }

  const loadSessions = async () => {
    setSessionsLoading(true)
    try {
      setSessions(await listChatSessions())
    } catch (error) {
      setActionError((error as Error).message)
    } finally {
      setSessionsLoading(false)
    }
  }

  React.useEffect(() => {
    if (historyOpen) void loadSessions()
  }, [historyOpen])

  // Each finished exchange is saved as the conversation's current state.
  React.useEffect(() => {
    if (busy || turns.length === 0) return
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    const id = sessionId ?? crypto.randomUUID()
    if (!sessionId) setSessionId(id)
    const title = turns.find((turn) => turn.role === 'user')?.content ?? ''
    const payload = turns.map(({ active: _active, ...turn }) => ({ ...turn }) as unknown as Record<string, unknown>)
    void saveChatSession(id, { title, turns: payload })
      .then(() => undefined)
      .catch(() => undefined)
  }, [turns, busy])

  const openSession = async (id: string) => {
    if (busy) return
    try {
      const detail = await getChatSession(id)
      skipSave.current = true
      setSessionId(id)
      setTurns(detail.turns as unknown as ChatTurn[])
      setHistoryOpen(false)
    } catch (error) {
      setActionError((error as Error).message)
    }
  }

  const removeSession = async (id: string) => {
    try {
      await deleteChatSession(id)
      if (id === sessionId) newConversation()
      await loadSessions()
    } catch (error) {
      setActionError((error as Error).message)
    }
  }

  const newConversation = () => {
    setSessionId(null)
    setHistoryOpen(false)
    setTurns([])
    setAttachments([])
    textareaRef.current?.focus()
  }

  const toggleSector = (value: Domain) => {
    const on = domains.includes(value)
    if (on) {
      if (domains.length > 1) setDomains(domains.filter((entry) => entry !== value))
      return
    }
    setDomains([...domains, value])
  }

  const suggestions = [t('assistant.suggest1'), t('assistant.suggest2'), t('assistant.suggest3')]
  const [loader, setLoader] = useStreamLoader()

  const optionsMenu = (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" className="rounded-lg" aria-label={t('assistant.options')}>
          <Plus className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="min-w-0 flex-1 truncate">{t('assistant.model')}</span>
            <span className="max-w-[6rem] truncate font-mono text-[10px] text-muted-foreground">{model || 'n/a'}</span>
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="min-w-0 flex-1 truncate">{t('assistant.institution')}</span>
            <span className="max-w-[6rem] truncate text-[10px] text-muted-foreground">
              {pinned ? pinned.name : institutionIds.length > 1 ? String(institutionIds.length) : t('assistant.institution.auto')}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>{t('assistant.institution')}</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                setInstitutionIds([])
              }}
            >
              <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded border', institutionIds.length === 0 ? 'border-brand-primary bg-brand-primary text-white' : 'border-border')}>
                {institutionIds.length === 0 && <Check className="h-2.5 w-2.5" />}
              </span>
              <Route className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
              <span className="truncate">{t('assistant.institution.auto')}</span>
            </DropdownMenuItem>
            {institutions.map((institution) => {
              const Icon = institution.role === 'legal_advisor' ? Scale : Shield
              const on = institutionIds.includes(institution.id)
              return (
                <DropdownMenuItem
                  key={institution.id}
                  onSelect={(event) => {
                    event.preventDefault()
                    toggleInstitution(institution.id)
                  }}
                >
                  <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded border', on ? 'border-brand-primary bg-brand-primary text-white' : 'border-border')}>
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <Icon className={cn('h-3.5 w-3.5 shrink-0', institution.color)} />
                  <span className="truncate">{institution.name}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="min-w-0 flex-1 truncate">{t('app.domains')}</span>
            <span className="rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground">{domains.length}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>{t('app.domains')}</DropdownMenuLabel>
            {sectors.map((value) => {
              const on = domains.includes(value)
              const sector = SECTOR_STYLE[value]
              const Icon = sector.icon
              return (
                <DropdownMenuItem
                  key={value}
                  onSelect={(event) => {
                    event.preventDefault()
                    toggleSector(value)
                  }}
                >
                  <span className={cn('flex h-3.5 w-3.5 items-center justify-center rounded border', on ? 'border-brand-primary bg-brand-primary text-white' : 'border-border')}>
                    {on && <Check className="h-2.5 w-2.5" />}
                  </span>
                  <span className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md', sector.soft)}>
                    <Icon className={cn('h-3.5 w-3.5', sector.color)} />
                  </span>
                  <span className="truncate">{t(`domain.${value}` as 'domain.health')}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="min-w-0 flex-1 truncate">{t('assistant.loader')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>{t('assistant.loader')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={loader} onValueChange={(value) => setLoader(value as StreamLoaderVariant)}>
              {STREAM_LOADERS.map((variant) => (
                <DropdownMenuRadioItem key={variant} value={variant} className="gap-2">
                  <LoaderGlyph variant={variant} className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(`assistant.loader.${variant}` as 'assistant.loader.blocks')}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
          <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
          {t('assistant.attach')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setActionsOpen((open) => !open)}>
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
          {t('assistant.actions')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )


  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_FILES}
        multiple
        hidden
        onChange={(event) => {
          void addFiles(event.target.files)
          event.target.value = ''
        }}
      />

      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="shrink-0 text-[12px] font-semibold text-foreground">{t('assistant.title')}</p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t('assistant.history')}
                aria-pressed={historyOpen}
                onClick={() => setHistoryOpen((open) => !open)}
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('assistant.history')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t('assistant.close')} onClick={onClose}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('assistant.close')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </header>

      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
        {historyOpen ? (
          <ChatHistory
            sessions={sessions}
            loading={sessionsLoading}
            activeId={sessionId}
            onOpen={(id) => void openSession(id)}
            onDelete={(id) => void removeSession(id)}
          />
        ) : turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <BrandMark className="h-12 w-12" />
            <div>
              <p className="text-[14px] font-semibold text-foreground">{t('assistant.greeting')}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{t('assistant.emptyBody')}</p>
            </div>
            <div className="grid w-full gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void send(suggestion)}
                  disabled={busy}
                  className="rounded-lg bg-card px-3 py-2 text-left text-[11px] text-foreground transition-colors hover:bg-secondary disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          turns.map((turn, index) => (
            <React.Fragment key={turn.id}>
              <ChatMessage
                turn={turn}
                isLast={index === turns.length - 1}
                onRegenerate={
                  turn.role === 'assistant' && !turn.active && index === turns.length - 1
                    ? () => {
                        const question = turns[index - 1]?.content
                        if (question) {
                          setTurns((previous) => previous.slice(0, index - 1))
                          void send(question)
                        }
                      }
                    : undefined
                }
              />
              {turn.cards?.map((card) => renderCard(turn.id, card))}
            </React.Fragment>
          ))
        )}
      </div>

      <div className="shrink-0 space-y-1 px-3 pb-2 pt-3">
        {actionsOpen && (
          <div className="custom-scrollbar max-h-72 overflow-y-auto rounded-2xl bg-card p-2 shadow-lg">
            <ActionCenter
              actions={actionRecords}
              loading={actionsLoading}
              onDecide={(id, decision) => void decideFromCenter(id, decision)}
              onRefresh={() => void loadActions()}
              onClose={() => setActionsOpen(false)}
            />
          </div>
        )}
        {actionError && <p className="px-2 text-[11px] text-destructive">{actionError}</p>}
        {attachments.length > 0 && (
          <div className="flex gap-1.5">
            {attachments.map((attachment, index) => (
              <div key={index} className="relative">
                {attachment.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={attachment.url} alt="" className="h-11 w-11 rounded-lg border border-border object-cover" />
                ) : (
                  <span className="flex h-11 max-w-[9rem] items-center truncate rounded-lg border border-border bg-card px-2 text-[10px] font-medium" title={attachment.name}>
                    <span className="truncate">{attachment.name}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAttachments((previous) => previous.filter((_, i) => i !== index))}
                  className="absolute -right-1 -top-1 rounded-lg bg-destructive p-0.5 text-white"
                  aria-label={t('assistant.removeImage')}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <ChatInput
          ref={textareaRef}
          accent={pinned ? institutionAccent(pinned.color) : undefined}
          input={input}
          handleInputChange={(event) => {
            const value = event.target.value
            // Emptying the field ends the dictation: its correction must not bring the words back.
            if (!value.trim()) {
              dictation.current = { base: null, last: '', stale: true }
            } else if (!dictation.current.stale && value !== `${dictation.current.base ?? ''}${dictation.current.last}`) {
              // Typed over the dictation: what is in the field becomes the new base.
              dictation.current = { base: value, last: '', stale: false }
            }
            setInput(value)
          }}
          handleSubmit={(event) => {
            event?.preventDefault()
            void send()
          }}
          isStreaming={busy}
          placeholder={t('assistant.placeholder')}
          optionsMenu={optionsMenu}
          onRecordingStart={() => {
            // A new dictation starts empty, even after the previous one was sent or discarded.
            dictation.current = { base: null, last: '', stale: false }
          }}
          onTranscript={(text) => {
            const current = dictation.current
            // The last correction arrives after the field was sent or emptied: it is stale.
            if (current.stale) return
            // A recording that does not extend the last dictation starts a new base: the text typed so far.
            if (current.base === null || !text.startsWith(current.last)) {
              const typed = inputRef.current
              current.base = typed && !typed.endsWith(' ') ? `${typed} ` : typed
            }
            current.last = text
            setInput(`${current.base}${text}`)
          }}
        />

        <p className="px-2 text-center text-[8px] leading-relaxed text-muted-foreground/70">
          {t('assistant.disclaimer')}
        </p>
      </div>
    </div>
  )
}
