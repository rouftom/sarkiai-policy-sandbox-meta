'use client'

import * as React from 'react'
import { Loader, MessageSquare, Trash2 } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import type { ChatSessionSummary } from '@/lib/chat-sessions-client'

/** Start of today and of the last seven days, used to group sessions by recency. */
function bucketOf(updatedAt: string, now: number): 'today' | 'week' | 'older' {
  const delta = now - Date.parse(updatedAt)
  const day = 24 * 60 * 60 * 1000
  if (delta < day) return 'today'
  if (delta < 7 * day) return 'week'
  return 'older'
}

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
  onDelete: (id: string) => void
}) {
  const { t } = useI18n()
  const [confirming, setConfirming] = React.useState<string | null>(null)
  const now = Date.now()
  const groups: Array<{ key: 'today' | 'week' | 'older'; label: string; items: ChatSessionSummary[] }> = [
    { key: 'today', label: t('history.today'), items: [] },
    { key: 'week', label: t('history.week'), items: [] },
    { key: 'older', label: t('history.older'), items: [] },
  ]
  for (const session of sessions) groups.find((group) => group.key === bucketOf(session.updatedAt, now))?.items.push(session)

  if (loading && sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader className="h-4 w-4 animate-spin" /> {t('history.loading')}
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <MessageSquare className="h-6 w-6 opacity-60" />
        {t('history.empty')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <section key={group.key}>
            <p className="px-2 pb-1 text-[10px] font-medium text-muted-foreground">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((session) => {
                const active = session.id === activeId
                return (
                  <li
                    key={session.id}
                    className={`group/row flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors ${
                      active ? 'bg-brand-primary/10 dark:bg-brand-primary-dark/20' : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <button type="button" onClick={() => onOpen(session.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[11px] text-foreground">{session.title || t('assistant.newChat')}</span>
                      <span className="block text-[9px] text-muted-foreground">
                        {new Date(session.updatedAt).toLocaleDateString()} · {session.turnCount}
                      </span>
                    </button>
                    {confirming === session.id ? (
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(null)
                          onDelete(session.id)
                        }}
                        className="shrink-0 rounded-lg bg-destructive px-2 py-1 text-[10px] font-semibold text-white"
                      >
                        {t('history.confirmDelete')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(session.id)}
                        aria-label={t('history.delete')}
                        className="shrink-0 rounded-lg p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/row:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
    </div>
  )
}
