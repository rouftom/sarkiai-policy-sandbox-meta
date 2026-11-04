
'use client'

import * as React from 'react'
import { AlertTriangle, Check, ChevronDown, GraduationCap, HeartPulse, History, ImagePlus, Landmark, ListChecks, Loader2, Plus, RadioTower, Route, Scale, Shield, Sprout, X } from 'lucide-react'
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
import { ASSISTANT_FINISHED, api, type AssessmentDto, type AttachmentRefDto, type MetaModelDto } from '@/lib/api'
import type { ActionRecord, ActionStatus, AgentUiRequest } from '@/lib/agent-ui'
import { decideAction, listActions } from '@/lib/actions-client'
import { ActionCenter } from '@/components/ai/tools/action-center'
import { McpAppView } from '@/components/ai/mcp/mcp-app-wrapper'
import { ChatHistory } from '@/components/ai/display/chat-history'
import { ConversationShimmer } from '@/components/ai/display/conversation-shimmer'
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
import { failureMessage } from '@/lib/failure'
import {
  DEFAULT_ATTACHMENT_LIMITS,
  formatBytes,
  pickImages,
  type AttachmentLimits,
} from '@/lib/attachment-limits'
import { resolveAttachmentUrl } from '@/lib/attachment-url'
import { galleryRefs } from '@/lib/attachment-gallery'
import { useI18n } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { institutionAccent, institutionInk } from '@/lib/institutions'
import { BrandMark } from '@/components/layout/brand-mark'
import { BrandBackdrop } from '@/components/brand-backdrop'
import { ChatInput } from '@/components/ai/inputs/chat-input'
import { MediaPickerDialog } from '@/components/ai/inputs/media-picker-dialog'
import { ChatMessage, type ChatTurn, type TurnAttachment } from '@/components/ai/display/chat-message'
import { LoaderGlyph, STREAM_LOADERS, useStreamLoader, type StreamLoaderVariant } from '@/components/ai/display/stream-loaders'
import { EFFORTS, useAssistantEffort, type AssistantEffort } from '@/lib/assistant-effort'
import type { TrailStepView } from '@/components/ai/tools/agent-activity-trail'

interface Attachment {
  /** Local identity of the pending upload, so the right item can be updated. */
  key: string
  mime: string
  name: string
  /** Blob URL shown while the upload runs; revoked when the item leaves the composer. */
  previewUrl: string
  status: 'uploading' | 'ready' | 'error'
  /** The stored reference, once the API has the image. */
  ref?: AttachmentRefDto
}

/** The stored reference, shaped for a turn: no bytes, no internal object key. */
function toTurnAttachment(ref: AttachmentRefDto): TurnAttachment {
  return {
    id: ref.id,
    provider: ref.provider,
    mime: ref.mime,
    name: ref.name,
    size: ref.size,
    ...(ref.width ? { width: ref.width } : {}),
    ...(ref.height ? { height: ref.height } : {}),
    ...(ref.sha256 ? { sha256: ref.sha256 } : {}),
    url: ref.url,
    thumbnailUrl: ref.thumbnailUrl,
  }
}

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
  const [attachLimits, setAttachLimits] = React.useState<AttachmentLimits>(DEFAULT_ATTACHMENT_LIMITS)
  const [attachError, setAttachError] = React.useState<string | null>(null)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [mediaOpen, setMediaOpen] = React.useState(false)
  /** Blob previews in flight: revoked when the image leaves the composer or the panel closes. */
  const previewUrls = React.useRef<Set<string>>(new Set())
  const [actionStatus, setActionStatus] = React.useState<Record<string, ActionStatus>>({})
  const [actionBusy, setActionBusy] = React.useState<string | null>(null)
  const [actionError, setActionError] = React.useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = React.useState(false)
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [sessionLoading, setSessionLoading] = React.useState(false)
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
  /** The stream in flight: Stop aborts it, so the server stops generating too. */
  const streamRef = React.useRef<AbortController | null>(null)

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

  // Closing the assistant panel unmounts it: the browser must stop reading the
  // stream, or the connection outlives the view that asked for it.
  React.useEffect(() => () => streamRef.current?.abort(), [])

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
    let cancelled = false
    api
      .attachmentLimits()
      .then((limits) => {
        if (cancelled) return
        const mimeTypes = limits.mimeTypes?.length ? limits.mimeTypes : DEFAULT_ATTACHMENT_LIMITS.mimeTypes
        setAttachLimits({
          maxImages: limits.maxImages > 0 ? limits.maxImages : DEFAULT_ATTACHMENT_LIMITS.maxImages,
          maxBytes: limits.maxBytes > 0 ? limits.maxBytes : DEFAULT_ATTACHMENT_LIMITS.maxBytes,
          mimeTypes,
        })
      })
      .catch(() => undefined)
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

  /** Shows a blob preview for each file and starts its upload in the background. */
  const stageFiles = (files: File[]): Attachment[] => {
    const staged: Attachment[] = files.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      previewUrls.current.add(previewUrl)
      return {
        key: crypto.randomUUID(),
        mime: file.type,
        name: file.name,
        previewUrl,
        status: 'uploading' as const,
      }
    })
    setAttachments((previous) => [...previous, ...staged].slice(0, attachLimits.maxImages))
    return staged
  }

  /** Stores one staged file; the composer item carries the upload's state. */
  const uploadStaged = async (item: Attachment, file: File): Promise<AttachmentRefDto | null> => {
    try {
      const ref = await api.uploadAttachment(file)
      setAttachments((previous) =>
        previous.map((entry) => (entry.key === item.key ? { ...entry, status: 'ready', ref } : entry)),
      )
      return ref
    } catch {
      setAttachments((previous) =>
        previous.map((entry) => (entry.key === item.key ? { ...entry, status: 'error' } : entry)),
      )
      return null
    }
  }

  /**
   * Stores the picked images as soon as they are chosen: the composer shows a
   * blob preview (never base64), the API returns the reference, and the message
   * only names it. The bytes are read back server-side for the vision model.
   */
  const addFiles = (files: File[]) => {
    if (files.length === 0) return
    const room = Math.max(0, attachLimits.maxImages - attachments.length)
    const { picked, error } = pickImages(files, attachLimits, room)
    setAttachError(
      error === null
        ? null
        : error === 'type'
          ? t('assistant.imageOnly')
          : error === 'size'
            ? t('assistant.imageTooLarge', { size: formatBytes(attachLimits.maxBytes) })
            : t('assistant.imageMax', { count: attachLimits.maxImages }),
    )
    const staged = stageFiles(picked)
    void Promise.all(staged.map((item, index) => uploadStaged(item, picked[index]!)))
  }

  const releasePreview = React.useCallback((attachment: Attachment) => {
    // A stored image has no blob to revoke: only a local preview owns an object URL.
    if (attachment.previewUrl.startsWith('blob:')) URL.revokeObjectURL(attachment.previewUrl)
    previewUrls.current.delete(attachment.previewUrl)
  }, [])

  /**
   * Re-attaches an image this conversation already stores. The reference is
   * reused as-is: no upload, no second copy, and the send only names the id.
   */
  const attachFromGallery = (ref: AttachmentRefDto) => {
    if (attachments.some((entry) => entry.ref?.id === ref.id)) return
    if (attachments.length >= attachLimits.maxImages) {
      setAttachError(t('assistant.imageMax', { count: attachLimits.maxImages }))
      return
    }
    setAttachError(null)
    setAttachments((previous) => [
      ...previous,
      {
        key: crypto.randomUUID(),
        mime: ref.mime,
        name: ref.name,
        // The stored thumbnail is already served; nothing to revoke.
        previewUrl: resolveAttachmentUrl(ref.thumbnailUrl),
        status: 'ready',
        ref,
      },
    ])
  }

  /** The conversation's stored images, plus what the composer holds right now. */
  const gallery = React.useMemo(
    () => galleryRefs(turns, attachments.flatMap((entry) => (entry.ref ? [entry.ref] : []))),
    [turns, attachments],
  )

  React.useEffect(
    () => () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url)
      previewUrls.current.clear()
    },
    [],
  )

  const removeAttachment = (key: string) => {
    const target = attachments.find((entry) => entry.key === key)
    if (target) releasePreview(target)
    setAttachments((previous) => previous.filter((entry) => entry.key !== key))
  }

  /** Patch the assistant turn being written (always the last one). */
  const patchLast = (patch: (turn: ChatTurn) => ChatTurn) =>
    setTurns((previous) => {
      const copy = previous.slice()
      const last = copy[copy.length - 1]
      if (last) copy[copy.length - 1] = patch(last)
      return copy
    })

  /** An image still uploading (or one that failed) must not be dropped by a send. */
  const attachmentPending = attachments.some((attachment) => attachment.status !== 'ready')

  const send = async (override?: string, extraRefs: AttachmentRefDto[] = []) => {
    const question = (override ?? input).trim()
    // An image still uploading (or one that failed) is not sent silently: the
    // operator either waits or removes it.
    if (!question || busy || institutions.length === 0 || attachmentPending) return
    const ready = attachments.filter(
      (attachment): attachment is Attachment & { ref: AttachmentRefDto } =>
        attachment.status === 'ready' && Boolean(attachment.ref),
    )
    const now = Date.now()
    setInput('')
    // Whatever the recorder is still correcting belongs to the question just sent.
    dictation.current = { base: null, last: '', stale: true }
    setBusy(true)
    // One controller per turn: Stop aborts the HTTP stream, not just the UI.
    const controller = new AbortController()
    streamRef.current = controller
    // The message names stored references; the bytes never travel again. A card
    // answer may carry a reference of its own (an image uploaded for that card).
    const refs = [...ready.map((attachment) => attachment.ref), ...extraRefs]
    const payload = refs.map((ref) => ({ id: ref.id, mime: ref.mime, name: ref.name }))
    const previews: TurnAttachment[] = refs.map(toTurnAttachment)
    // The images belong to this message: the next question starts without them.
    ready.forEach(releasePreview)
    setAttachments([])
    setAttachError(null)

    // The question and the agent's turn are shown before any network call: the
    // conversation appears the moment the operator sends, then the trail fills in.
    let target = pinned ?? institutions[0]!
    const userTurnId = crypto.randomUUID()
    const assistantTurnId = crypto.randomUUID()
    setTurns((previous) => [
      ...previous,
      { id: userTurnId, role: 'user', content: question, ...(previews.length ? { attachments: previews } : {}) },
      {
        id: assistantTurnId,
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
      ...(effort !== 'auto' ? { effort: effort as Exclude<AssistantEffort, 'auto'> } : {}),
      attachmentRefs: payload.length ? payload : undefined,
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
        signal: controller.signal,
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
      // Stop is a decision, not a failure: the turn ends where it was, the
      // steps close normally, and no error banner is shown.
      const stopped = controller.signal.aborted
      if (!stopped) {
        const message = failureMessage(error, t('common.error'), t)
        patchLast((turn) => ({
          ...turn,
          content: turn.content ? turn.content : `⚠️ ${message}`,
          active: false,
          endedAt: Date.now(),
          steps: (turn.steps ?? []).map((step) => (step.status === 'active' ? { ...step, status: 'error' } : step)),
        }))
      } else {
        patchLast((turn) => ({
          ...turn,
          active: false,
          stopped: true,
          endedAt: Date.now(),
          steps: (turn.steps ?? []).map((step) => (step.status === 'active' ? { ...step, status: 'complete' } : step)),
        }))
      }
    } finally {
      if (streamRef.current === controller) streamRef.current = null
      setBusy(false)
      // Audit pages refresh their blocks from this event; a stopped turn is a
      // finished turn too.
      window.dispatchEvent(new CustomEvent(ASSISTANT_FINISHED))
    }
  }

  /** Sends the operator's answer to a question or input request as the next turn. */
  const answerCard = (turnId: string, cardId: string, answer: string, refs: AttachmentRefDto[] = []) => {
    // The card closes only if the send happens: a pending composer image would
    // otherwise be dropped, so the card stays open and the composer explains.
    if (attachmentPending) {
      setAttachError(
        attachments.some((attachment) => attachment.status === 'error')
          ? t('assistant.imageUploadFailed')
          : t('assistant.imageUploading'),
      )
      return
    }
    setTurns((previous) =>
      previous.map((turn) =>
        turn.id === turnId ? { ...turn, cards: (turn.cards ?? []).filter((card) => card.id !== cardId) } : turn,
      ),
    )
    void send(answer, refs)
  }

  const submitFile = async (turnId: string, card: Extract<AgentUiRequest, { kind: 'request_input' }>, file: File) => {
    if (file.type.startsWith('image/')) {
      // Same contract as a composer image: store it first, then name it in the
      // answer. The blob preview only exists while the upload runs.
      const [staged] = stageFiles([file])
      if (!staged) return
      const ref = await uploadStaged(staged, file)
      if (!ref) return
      // The image belongs to this answer, not to the composer's next question.
      releasePreview(staged)
      removeAttachment(staged.key)
      answerCard(turnId, card.id, `${card.label}: ${file.name}`, [ref])
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
    // Images are references, not conversation state: a saved turn keeps the
    // stored image URL and its thumbnail, never base64. A turn whose upload
    // never completed (a stopped run, a storage outage) keeps its text and
    // sources only.
    const payload = turns.map(({ active: _active, ...turn }) => {
      const attachments = (turn.attachments ?? []).filter(
        (attachment) => Boolean(attachment.provider) && !attachment.url.startsWith('data:'),
      )
      const { attachments: _attachments, ...rest } = turn
      return (attachments.length > 0 ? { ...rest, attachments } : rest) as unknown as Record<string, unknown>
    })
    void saveChatSession(id, { title, turns: payload })
      .then(() => undefined)
      .catch(() => undefined)
  }, [turns, busy])

  const openSession = async (id: string) => {
    if (busy) return
    setHistoryOpen(false)
    setSessionLoading(true)
    try {
      const detail = await getChatSession(id)
      skipSave.current = true
      setSessionId(id)
      setTurns(detail.turns as unknown as ChatTurn[])
    } catch (error) {
      setActionError((error as Error).message)
      setHistoryOpen(true)
    } finally {
      setSessionLoading(false)
    }
  }

  // Rejects on failure: the confirmation dialog stays open and shows the reason.
  const removeSession = async (id: string) => {
    await deleteChatSession(id)
    if (id === sessionId) newConversation()
    await loadSessions()
  }

  const newConversation = () => {
    attachments.forEach(releasePreview)
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
  const [effort, setEffort] = useAssistantEffort()

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
            <span className="min-w-0 flex-1 truncate">{t('assistant.effort')}</span>
            <span className="max-w-[6rem] truncate text-[10px] text-muted-foreground">{t(`assistant.effort.${effort}` as 'assistant.effort.auto')}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>{t('assistant.effort')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={effort} onValueChange={(value) => setEffort(value as AssistantEffort)}>
              {EFFORTS.map((value) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <span className="truncate">{t(`assistant.effort.${value}` as 'assistant.effort.auto')}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
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
        <DropdownMenuItem onSelect={() => setMediaOpen(true)}>
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
    <div className="relative isolate flex min-h-0 flex-1 flex-col overflow-hidden">
      <BrandBackdrop variant="panel" className="-z-10" />

      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <p className="shrink-0 text-[12px] font-semibold text-foreground">{t('assistant.title')}</p>
        </div>
        <TooltipProvider>
          {(turns.length > 0 || historyOpen) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('assistant.newChat')}
                  onClick={newConversation}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('assistant.newChat')}</TooltipContent>
            </Tooltip>
          )}
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

      {historyOpen ? (
        /* The history owns its scroller (Virtuoso): it needs a bounded height,
           not the conversation's overflow container. */
        <div className="min-h-0 flex-1">
          <ChatHistory
            sessions={sessions}
            loading={sessionsLoading}
            activeId={sessionId}
            onOpen={(id) => void openSession(id)}
            onDelete={removeSession}
          />
        </div>
      ) : (
        <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3">
          {sessionLoading ? (
            <ConversationShimmer />
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
                  onRate={
                    turn.role === 'assistant' && !turn.active
                      ? (rating) =>
                          setTurns((previous) => previous.map((entry) => (entry.id === turn.id ? { ...entry, rating } : entry)))
                      : undefined
                  }
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
      )}

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
        {attachError && <p className="px-2 text-[11px] text-destructive">{attachError}</p>}
        {attachments.length > 0 && (
          <div className="flex gap-1.5">
            {attachments.map((attachment) => (
              <div key={attachment.key} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.ref ? resolveAttachmentUrl(attachment.ref.thumbnailUrl) : attachment.previewUrl}
                  alt={attachment.name}
                  className={cn(
                    'h-11 w-11 rounded-lg border object-cover',
                    attachment.status === 'error' ? 'border-destructive' : 'border-border',
                  )}
                />
                {attachment.status === 'uploading' && (
                  <span
                    className="absolute inset-0 grid place-items-center rounded-lg bg-black/55"
                    aria-label={t('assistant.imageUploading')}
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </span>
                )}
                {attachment.status === 'error' && (
                  <span
                    className="absolute inset-0 grid place-items-center rounded-lg bg-destructive/10 text-destructive"
                    title={t('assistant.imageUploadFailed')}
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.key)}
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
          stop={() => streamRef.current?.abort()}
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
          sendDisabled={attachments.some((attachment) => attachment.status !== 'ready')}
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

      <MediaPickerDialog
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        gallery={gallery}
        selectedIds={attachments.flatMap((entry) => (entry.ref ? [entry.ref.id] : []))}
        uploads={attachments}
        limits={attachLimits}
        onFiles={addFiles}
        onPick={attachFromGallery}
        error={attachError}
      />
    </div>
  )
}
