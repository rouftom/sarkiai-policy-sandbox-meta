'use client'

/**
 * Opens a cited provision: the document it comes from, the passage itself with
 * the cited wording highlighted, the figures attached to the document, and the
 * neighbouring passages. The passage is loaded from the API, so the console
 * shows the whole text, not the excerpt the answer carried.
 */

import * as React from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Loader } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, cn } from '@sps/ui'
import { assetUrl, knowledgeApi, type KbImageDto, type KbPreviewDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

export interface CitationView {
  filename: string
  articleNumber?: string
  headingPath?: string
  quote?: string
  sourceUrl?: string
  country?: string
  chunkIndex?: number
  images?: KbImageDto[]
}

/** The cited wording, found inside the passage: exact first, then its opening words. */
export function highlightRanges(passage: string, quote: string): Array<{ text: string; hit: boolean }> {
  const cleaned = quote.replace(/…$/, '').trim()
  const attempts = [cleaned, cleaned.slice(0, 80)].filter((value) => value.length >= 12)
  for (const needle of attempts) {
    const index = passage.toLowerCase().indexOf(needle.toLowerCase())
    if (index >= 0) {
      return [
        { text: passage.slice(0, index), hit: false },
        { text: passage.slice(index, index + needle.length), hit: true },
        { text: passage.slice(index + needle.length), hit: false },
      ]
    }
  }
  return [{ text: passage, hit: false }]
}

export function CitationDialog({ citation, onClose }: { citation: CitationView | null; onClose: () => void }) {
  const { t } = useI18n()
  const [index, setIndex] = React.useState<number | undefined>(citation?.chunkIndex)
  const [preview, setPreview] = React.useState<KbPreviewDto | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [figure, setFigure] = React.useState<KbImageDto | null>(null)

  React.useEffect(() => {
    setIndex(citation?.chunkIndex)
    setFigure(null)
  }, [citation])

  React.useEffect(() => {
    if (!citation) return
    let cancelled = false
    setLoading(true)
    setFailure(null)
    knowledgeApi
      .preview(citation.filename, index)
      .then((result) => {
        if (!cancelled) setPreview(result)
      })
      .catch((caught) => {
        if (!cancelled) setFailure(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [citation, index])

  const passage = preview?.chunks[preview.selected] ?? null
  const passageText = passage?.text ?? citation?.quote ?? ''
  const parts = highlightRanges(passageText, citation?.quote ?? '')
  const figures = React.useMemo(() => {
    const seen = new Map<string, KbImageDto>()
    for (const image of [...(citation?.images ?? []), ...(preview?.images ?? [])]) seen.set(image.id, image)
    return [...seen.values()]
  }, [citation, preview])

  const position = preview && passage ? preview.selected : -1
  const neighbour = (delta: number) => {
    const next = preview?.chunks[position + delta]
    if (next) setIndex(next.chunkIndex)
  }

  return (
    <Dialog open={citation !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[88vh] max-w-3xl flex-col gap-0 overflow-hidden rounded-3xl p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="truncate text-sm font-semibold">{citation?.filename}</DialogTitle>
          <p className="truncate text-[11px] text-muted-foreground">
            {[citation?.country?.toUpperCase(), citation?.articleNumber && `Article ${citation.articleNumber}`, citation?.headingPath]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </DialogHeader>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {loading && (
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader className="h-3.5 w-3.5 animate-spin" /> {t('citation.loading')}
            </p>
          )}
          {failure && <p className="text-[11px] text-destructive">{failure}</p>}

          {citation && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('citation.passage')}</p>
              <p className="whitespace-pre-wrap rounded-xl border border-border bg-card p-4 text-[12px] leading-relaxed text-foreground">
                {parts.map((part, i) =>
                  part.hit ? (
                    <mark key={i} className="rounded bg-brand-primary/20 px-0.5 text-foreground dark:bg-brand-primary-light/25">
                      {part.text}
                    </mark>
                  ) : (
                    <React.Fragment key={i}>{part.text}</React.Fragment>
                  ),
                )}
              </p>
              {preview && preview.chunks.length > 1 && (
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" disabled={position <= 0} onClick={() => neighbour(-1)} aria-label={t('citation.previous')}>
                    <ChevronLeft className="h-3.5 w-3.5" /> {t('citation.previous')}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    {position + 1} / {preview.chunks.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={position < 0 || position >= preview.chunks.length - 1}
                    onClick={() => neighbour(1)}
                    aria-label={t('citation.next')}
                  >
                    {t('citation.next')} <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {figures.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t('citation.figures')}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {figures.map((image) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setFigure(image)}
                    className={cn(
                      'overflow-hidden rounded-xl border border-border bg-white text-left transition-colors hover:border-brand-primary/50',
                      figure?.id === image.id && 'ring-2 ring-brand-primary/50',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assetUrl(image.url)} alt={image.alt ?? image.caption} className="h-24 w-full object-cover" loading="lazy" />
                    <span className="block truncate px-2 py-1 text-[10px] text-muted-foreground">{image.caption}</span>
                  </button>
                ))}
              </div>
              {figure && (
                <figure className="rounded-xl border border-border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(figure.url)} alt={figure.alt ?? figure.caption} className="mx-auto max-h-80 w-auto" />
                  <figcaption className="mt-1 text-center text-[11px] text-muted-foreground">{figure.caption}</figcaption>
                </figure>
              )}
            </div>
          )}
        </div>

        {citation?.sourceUrl && (
          <div className="flex justify-end border-t border-border px-5 py-3">
            <a href={citation.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-semibold text-brand-primary hover:underline dark:text-brand-primary-light">
              {t('citation.source')} <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
