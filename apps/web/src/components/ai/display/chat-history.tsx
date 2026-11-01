'use client'

import * as React from 'react'
import { Virtuoso } from 'react-virtuoso'
import { MessageSquare, Trash2 } from 'lucide-react'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/shared/toast'
import { HistoryShimmer } from '@/components/ai/display/conversation-shimmer'
import { useI18n } from '@/lib/i18n'
import type { ChatSessionSummary } from '@/lib/chat-sessions-client'

type Bucket = 'today' | 'week' | 'older'

/** Start of today and of the last seven days, used to group sessions by recency. */
function bucketOf(updatedAt: string, now: number): Bucket {
  const delta = now - Date.parse(updatedAt)
  const day = 24 * 60 * 60 * 1000
  if (delta < day) return 'today'
  if (delta < 7 * day) return 'week'
  return 'older'
}

/**
 * A flat list for Virtuoso: a group header, then its sessions. Virtualized the
 * same way as the organization and web consoles, so a long history scrolls
 * without mounting every row.
 */
type HistoryEntry =
  | { kind: 'header'; key: string; bucket: Bucket }
  | { kind: 'session'; key: string; session: ChatSessionSummary }

const BUCKETS: Bucket[] = ['today', 'week', 'older']

/**
 * Padding lives on Virtuoso's list, not on its scroller: the scrollbar then sits
 * flush against the panel edge, where the conversation's own scroller puts it.
 */
const HistoryList = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(function HistoryList(
  { className, ...props },
  ref,
) {
  return <div ref={ref} {...props} className={className ? `py-2 ${className}` : 'py-2'} />
})

const HISTORY_COMPONENTS = { List: HistoryList }

export function ChatHistory({
  sessions,
  loading,
  activeId,
  onOpen,
  onDelete,
}: {
  sessions: ChatSessionSummary[]
  loading: boolean
  activeId: string | null
  onOpen: (id: string) => void
  onDelete: (id: string) => Promise<void>
}) {
  const { t } = useI18n()
  const toast = useToast()
  const [pendingDelete, setPendingDelete] = React.useState<ChatSessionSummary | null>(null)

  const entries = React.useMemo<HistoryEntry[]>(() => {
    const now = Date.now()
    const grouped: Record<Bucket, ChatSessionSummary[]> = { today: [], week: [], older: [] }
    for (const session of sessions) grouped[bucketOf(session.updatedAt, now)].push(session)
    return BUCKETS.flatMap((bucket) => {
      const items = grouped[bucket]
      if (items.length === 0) return []
      return [
        { kind: 'header' as const, key: `header:${bucket}`, bucket },
        ...items.map((session) => ({ kind: 'session' as const, key: session.id, session })),
      ]
    })
  }, [sessions])

  if (loading && sessions.length === 0) {
    return (
      <div className="p-3">
        <HistoryShimmer />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs text-muted-foreground">
        <MessageSquare className="h-6 w-6 opacity-60" />
        {t('history.empty')}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Virtuoso
        className="custom-scrollbar min-h-0 flex-1"
        components={HISTORY_COMPONENTS}
        data={entries}
        computeItemKey={(_index, entry) => entry.key}
        itemContent={(_index, entry) => {
          if (entry.kind === 'header') {
            return (
              <p className="mx-3 px-2 pb-1 pt-2 text-[10px] font-medium text-muted-foreground">{t(`history.${entry.bucket}`)}</p>
            )
          }

          const session = entry.session
          const active = session.id === activeId
          return (
            <div
              className={`group/row mx-3 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                active ? 'bg-brand-primary/10 dark:bg-brand-primary-dark/20' : 'hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <button type="button" onClick={() => onOpen(session.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[11px] text-foreground">{session.title || t('assistant.newChat')}</span>
                <span className="block text-[9px] text-muted-foreground">
                  {new Date(session.updatedAt).toLocaleDateString()} · {session.turnCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(session)}
                aria-label={t('history.delete')}
                className="shrink-0 rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/row:opacity-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return
          try {
            await onDelete(pendingDelete.id)
            toast.success(t('history.delete.done'))
          } catch (cause) {
            toast.error(t('history.delete.failed'), (cause as Error).message)
            throw cause
          }
        }}
        title={t('history.delete.title')}
        description={
          pendingDelete
            ? t('history.delete.body', {
                title: pendingDelete.title || t('assistant.newChat'),
                turns: pendingDelete.turnCount,
              })
            : ''
        }
        confirmText={t('history.delete.confirm')}
        cancelText={t('common.cancel')}
      />
    </div>
  )
}
