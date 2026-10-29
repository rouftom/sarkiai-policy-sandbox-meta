'use client'

/**
 * N3 · scanned gazette ingestion.
 *
 * A gazette is a scan: no text layer, two columns, stamps and signatures in the
 * margins. The panel shows the geometry the pipeline actually used (one box per
 * zone, one box per artefact), the transcription of each box, and lets the
 * operator push the page into the jurisdiction-scoped knowledge base.
 *
 * The overlay is the honesty feature: a wrong cut is visible before the text is
 * retrievable.
 */

import * as React from 'react'
import { Check, FileScan, Plus, X } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@sps/ui'
import { api, type GazetteBoxDto, type GazettePageDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { ProcessingBar } from '@/components/processing-bar'

const SAMPLE_URL = '/samples/gazette-p1.png'

interface Source {
  filename: string
  imageBase64: string
  mime: 'image/png' | 'image/jpeg'
  previewUrl: string
}

function percent(value: number, total: number): string {
  return `${total > 0 ? (value / total) * 100 : 0}%`
}

function boxStyle(box: GazetteBoxDto, page: GazettePageDto): React.CSSProperties {
  return {
    left: percent(box.x, page.image.width),
    top: percent(box.y, page.image.height),
    width: percent(box.width, page.image.width),
    height: percent(box.height, page.image.height),
  }
}

async function fileToSource(file: File): Promise<Source> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
  const comma = dataUrl.indexOf(',')
  return {
    filename: file.name,
    imageBase64: comma >= 0 ? dataUrl.slice(comma + 1) : '',
    mime: file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    previewUrl: dataUrl,
  }
}

export function GazettePanel({ country }: { country: string }) {
  const { t } = useI18n()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [source, setSource] = React.useState<Source | null>(null)
  const [page, setPage] = React.useState<GazettePageDto | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [ingesting, setIngesting] = React.useState(false)
  const [toast, setToast] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4500)
    return () => window.clearTimeout(timer)
  }, [toast])

  const reset = () => {
    setPage(null)
    setError(null)
  }

  const choose = async (file: File | undefined) => {
    if (!file) return
    reset()
    setSource(await fileToSource(file))
  }

  const loadSample = async () => {
    reset()
    setBusy(true)
    try {
      const response = await fetch(SAMPLE_URL)
      if (!response.ok) throw new Error(`Sample unavailable (${response.status}).`)
      const blob = await response.blob()
      setSource(await fileToSource(new File([blob], 'gazette-p1.png', { type: 'image/png' })))
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const analyze = async () => {
    if (!source) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.analyzeGazette({
        filename: source.filename,
        imageBase64: source.imageBase64,
        mime: source.mime,
        page: 1,
      })
      setPage(result)
    } catch (cause) {
      setPage(null)
      setError((cause as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const ingest = async () => {
    if (!page) return
    setIngesting(true)
    setError(null)
    try {
      const result = await api.ingestGazette({
        page,
        country,
        jurisdiction: 'national',
        docType: 'regulation',
        namespace: 'gazette',
      })
      setToast(t('gazette.ingested', { zones: result.zones, chunks: result.chunksInserted, page: result.page }))
      // Done: the next page starts from an empty panel.
      setSource(null)
      reset()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setIngesting(false)
    }
  }

  const readable = page?.regions.filter((region) => !region.blank && !region.skipped && region.text.trim()) ?? []

  return (
    <Card>
      <CardHeader>
        <FileScan className="h-4 w-4 text-primary" />
        <CardTitle>{t('gazette.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">{t('gazette.hint')}</p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(event) => void choose(event.target.files?.[0])}
          />
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy || ingesting}>
            {t('gazette.choose')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void loadSample()} disabled={busy || ingesting}>
            {t('gazette.sample')}
          </Button>
          <Button size="sm" onClick={() => void analyze()} disabled={!source || busy || ingesting}>
            {busy ? t('gazette.analyzing') : t('gazette.analyze')}
          </Button>
          {source && (
            <span className="max-w-[16rem] truncate text-[11px] text-muted-foreground" title={source.filename}>
              {source.filename}
            </span>
          )}
          {page && (
            <Button size="sm" variant="outline" onClick={() => void ingest()} disabled={ingesting || readable.length === 0}>
              {ingesting ? t('gazette.ingesting') : t('gazette.addToCorpus')}
            </Button>
          )}
        </div>

        {busy && <ProcessingBar label={t('gazette.analyzing')} />}

        {error && <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-2 text-xs text-rose-500">{error}</p>}

        {toast && (
          <div
            role="status"
            className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-2 rounded-xl border border-emerald-500/40 bg-card px-4 py-3 text-xs shadow-lg"
          >
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <span className="min-w-0 flex-1">{toast}</span>
            <button type="button" onClick={() => setToast(null)} className="text-muted-foreground hover:text-foreground" aria-label={t('common.close')}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {(source || page) && (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="relative overflow-hidden rounded-xl border border-border bg-white">
              {page ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={source?.previewUrl ?? SAMPLE_URL} alt={page.filename} className="block w-full" />
                  {page.regions.map((region) => (
                    <div
                      key={region.id}
                      title={`${region.id}${region.articleNumber ? ` · ${region.articleNumber}` : ''}`}
                      className={cn(
                        'absolute border',
                        region.skipped
                          ? 'border-rose-500 bg-rose-500/10 border-dashed'
                          : region.kind === 'table'
                            ? 'border-amber-500 bg-amber-500/10'
                            : 'border-primary/60 bg-primary/5',
                      )}
                      style={boxStyle(region.bbox, page)}
                    />
                  ))}
                  {page.artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      title={`${artifact.label}${artifact.confidence !== undefined ? ` · ${artifact.confidence.toFixed(3)}` : ''}`}
                      className="pointer-events-none absolute rounded-full border-2 border-emerald-500/80"
                      style={boxStyle(artifact.bbox, page)}
                    />
                  ))}
                </>
              ) : (
                source && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={source.previewUrl} alt={source.filename} className="block w-full opacity-80" />
                )
              )}
            </div>

            <div className="min-w-0 space-y-2">
              {page && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    {t('gazette.page')} <strong className="text-foreground">{page.page}</strong>
                  </span>
                  <span>
                    {t('gazette.columns')} <strong className="text-foreground">{page.layout.columns.length}</strong>
                  </span>
                  <span>
                    {t('gazette.zones')} <strong className="text-foreground">{page.regions.length}</strong>
                  </span>
                  <span>
                    {t('gazette.artifacts')} <strong className="text-foreground">{page.artifacts.length}</strong>
                  </span>
                  <span>
                    {t('gazette.cost')} <strong className="text-foreground">${page.usage.costUsd.toFixed(4)}</strong>
                  </span>
                  <span>
                    {t('gazette.duration')}{' '}
                    <strong className="text-foreground">{(page.durationMs / 1000).toFixed(1)} s</strong>
                  </span>
                </div>
              )}

              {page && page.artifacts.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {page.artifacts.map((artifact) => (
                    <li
                      key={artifact.id}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px]"
                    >
                      {t(`gazette.artifact.${artifact.label}` as 'gazette.artifact.stamp')}
                      {artifact.confidence !== undefined ? ` · ${artifact.confidence.toFixed(3)}` : ''}
                    </li>
                  ))}
                </ul>
              )}

              {page && page.warnings.length > 0 && (
                <details className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-2 text-[11px]">
                  <summary className="cursor-pointer font-semibold">{t('gazette.warnings')}</summary>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {page.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </details>
              )}

              {page && (
                <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {page.regions.map((region) => (
                    <details
                      key={region.id}
                      className={cn(
                        'rounded-xl border p-2 text-[11px]',
                        region.skipped
                          ? 'border-rose-500/40 bg-rose-500/5'
                          : region.blank
                            ? 'border-border bg-muted/30'
                            : 'border-border',
                      )}
                    >
                      <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="font-mono text-[10px] text-muted-foreground">{region.id}</span>
                        {region.articleNumber && <span className="font-semibold">{region.articleNumber}</span>}
                        {region.kind === 'table' && (
                          <span className="rounded bg-amber-500/15 px-1 text-[9px]">
                            {t('gazette.artifact.table')}
                          </span>
                        )}
                        {region.skipped && (
                          <span className="rounded bg-rose-500/15 px-1 text-[9px]">{t('gazette.skipped')}</span>
                        )}
                        {region.blank && !region.skipped && (
                          <span className="rounded bg-muted px-1 text-[9px]">{t('gazette.noText')}</span>
                        )}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {t('gazette.column')} {region.column} · {region.characters} {t('gazette.characters')}
                        </span>
                      </summary>
                      {region.text && (
                        <p className={cn('mt-1 whitespace-pre-wrap', region.kind === 'table' && 'font-mono text-[10px]')}>
                          {region.text}
                        </p>
                      )}
                    </details>
                  ))}
                </div>
              )}

              {page && readable.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('gazette.noTextOnPage')}</p>
              )}

              {page && <p className="text-[10px] text-muted-foreground">{t('gazette.corpusHint')}</p>}
            </div>
          </div>
        )}

        {!source && !page && !busy && <p className="text-xs text-muted-foreground">{t('gazette.empty')}</p>}
      </CardContent>
    </Card>
  )
}
