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
import { api, type GazetteBoxDto, type GazettePageDto, type ImpactAnalysisDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { ProcessingBar } from '@/components/processing-bar'

const SAMPLE_URL = '/samples/gazette-p1.png'

/** The impact route accepts at most 20 run ids. */
const MAX_IMPACT_RUNS = 20

interface IngestedProvision {
  title: string
  text: string
  articleNumber?: string
}

const SEVERITY_STYLE: Record<ImpactAnalysisDto['findings'][number]['severity'], string> = {
  low: 'border-border bg-muted/40',
  medium: 'border-amber-500/40 bg-amber-500/10',
  high: 'border-orange-500/50 bg-orange-500/10',
  critical: 'border-rose-500/50 bg-rose-500/10',
}

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
  // N7: the provision just added to the corpus, and its impact on open runs.
  const [ingested, setIngested] = React.useState<IngestedProvision | null>(null)
  const [impact, setImpact] = React.useState<ImpactAnalysisDto | null>(null)
  const [impactBusy, setImpactBusy] = React.useState(false)
  const [impactNote, setImpactNote] = React.useState<string | null>(null)

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
      // Keep the provision so its impact on open incidents can be analysed (N7).
      const regions = page.regions.filter((region) => !region.blank && !region.skipped && region.text.trim())
      setIngested({
        title: `${page.filename} · p. ${page.page}`,
        text: regions.map((region) => region.text.trim()).join('\n\n').slice(0, 20_000),
        // No article number: the page's own article (often « 1er ») is not the
        // provision it amends, and would hide every open incident from the
        // analysis. Every open run is a candidate; Muse Spark decides.
      })
      setImpact(null)
      setImpactNote(null)
      // Done: the next page starts from an empty panel.
      setSource(null)
      reset()
    } catch (cause) {
      setError((cause as Error).message)
    } finally {
      setIngesting(false)
    }
  }

  const analyzeImpact = async () => {
    if (!ingested) return
    setImpactBusy(true)
    setImpactNote(null)
    setImpact(null)
    try {
      const { runs } = await api.scenarioRuns()
      const runIds = runs
        .filter((run) => run.status !== 'failed' && run.released > 0)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_IMPACT_RUNS)
        .map((run) => run.id)
      if (runIds.length === 0) {
        setImpactNote(t('impact.noRuns'))
        return
      }
      const result = await api.analyzeImpact({
        provision: { ...ingested, docType: 'regulation' },
        runIds,
      })
      setImpact(result)
      if (result.findings.length === 0) setImpactNote(t('impact.none'))
    } catch (cause) {
      const message = (cause as Error).message
      setImpactNote(/no persisted reports/i.test(message) ? t('impact.noRuns') : message)
    } finally {
      setImpactBusy(false)
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

        {ingested && (
          <section className="space-y-2 rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xs font-semibold">{t('impact.title')}</h3>
              <span className="max-w-[18rem] truncate text-[11px] text-muted-foreground" title={ingested.title}>
                {ingested.title}
              </span>
              <Button size="sm" className="ml-auto" onClick={() => void analyzeImpact()} disabled={impactBusy}>
                {impactBusy ? t('impact.analyzing') : t('impact.analyze')}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">{t('impact.hint')}</p>
            {impactBusy && <ProcessingBar label={t('impact.analyzing')} />}
            {impactNote && <p className="text-xs text-muted-foreground">{impactNote}</p>}
            {impact && (
              <div className="space-y-2">
                <p className="text-xs">{impact.summary}</p>
                {impact.findings.length > 0 && (
                  <ul className="space-y-1.5">
                    {impact.findings.map((finding) => (
                      <li key={finding.runId} className={cn('rounded-xl border p-2 text-[11px]', SEVERITY_STYLE[finding.severity])}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px]">{finding.runId}</span>
                          <span className="rounded bg-background/60 px-1 text-[10px] font-semibold">
                            {t(`impact.severity.${finding.severity}` as 'impact.severity.low')}
                          </span>
                          {finding.affectedArticles.length > 0 && (
                            <span className="text-[10px] text-muted-foreground">{finding.affectedArticles.join(', ')}</span>
                          )}
                        </div>
                        <p className="mt-1">{finding.reason}</p>
                        <p className="mt-1">
                          <strong>{t('impact.action')}</strong> · {finding.action}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {impact.deadlineChanges.length > 0 && (
                  <div className="text-[11px]">
                    <strong>{t('impact.deadlines')}</strong>
                    <ul className="mt-0.5 list-disc pl-4">
                      {impact.deadlineChanges.map((change, index) => (
                        <li key={index}>{change}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  {t('impact.unaffected', { count: impact.unaffectedRunIds.length })} ·{' '}
                  {t('impact.model', { model: impact.model })}
                </p>
              </div>
            )}
          </section>
        )}
      </CardContent>
    </Card>
  )
}
