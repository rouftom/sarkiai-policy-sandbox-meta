'use client'

/**
 * A web source opened from an answer or an assessment: a right-hand drawer with
 * its excerpt, what is known about it, and a link to the page itself. Many sites
 * refuse to be framed, so the drawer shows the excerpt the model read rather than
 * an embedded page; the link opens the real page in a new tab.
 */

import * as React from 'react'
import { ExternalLink, X } from 'lucide-react'
import { Button } from '@sps/ui'
import { useI18n } from '@/lib/i18n'

export interface WebSourceView {
  title: string
  url: string
  snippet?: string
  /** Whether the answer cites this source (as opposed to having read it). */
  cited?: boolean
  searchedAt?: string
  publishedAt?: string
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function SourceDrawer({ source, onClose }: { source: WebSourceView | null; onClose: () => void }) {
  const { t, locale } = useI18n()

  React.useEffect(() => {
    if (!source) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [source, onClose])

  if (!source) return null
  const date = (value?: string) => (value ? new Date(value).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={source.title}>
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 bg-slate-950/30" />
      <aside className="relative flex h-full w-full max-w-md flex-col bg-card shadow-2xl">
        <header className="flex items-start gap-2 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium text-muted-foreground">{hostOf(source.url)}</p>
            <h2 className="line-clamp-2 text-sm font-semibold text-foreground">{source.title}</h2>
          </div>
          <Button variant="ghost" size="icon-sm" className="h-7 w-7 shrink-0 rounded-lg" aria-label={t('common.close')} onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </header>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-secondary/60 p-3 text-[11px]">
            <dt className="text-muted-foreground">{t('source.domain')}</dt>
            <dd className="truncate font-medium">{hostOf(source.url)}</dd>
            <dt className="text-muted-foreground">{t('source.url')}</dt>
            <dd className="truncate font-mono text-[10px]">{source.url}</dd>
            <dt className="text-muted-foreground">{t('source.published')}</dt>
            <dd>{date(source.publishedAt)}</dd>
            <dt className="text-muted-foreground">{t('source.searched')}</dt>
            <dd>{date(source.searchedAt)}</dd>
            <dt className="text-muted-foreground">{t('source.use')}</dt>
            <dd>{source.cited ? t('source.cited') : t('source.read')}</dd>
          </dl>

          <section className="space-y-2">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('source.excerpt')}</h3>
            {source.snippet ? (
              <p className="whitespace-pre-wrap rounded-xl bg-card text-[12px] leading-relaxed text-foreground shadow-sm">{source.snippet}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">{t('source.noExcerpt')}</p>
            )}
          </section>

          <p className="text-[10px] leading-relaxed text-muted-foreground">{t('source.previewNote')}</p>
        </div>

        <footer className="px-5 py-4">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-brand-primary text-xs font-semibold text-white transition-colors hover:bg-brand-primary/90"
          >
            {t('source.visit')} <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </footer>
      </aside>
    </div>
  )
}
