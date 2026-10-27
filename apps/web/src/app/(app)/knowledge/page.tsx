'use client'

import * as React from 'react'
import { AlertTriangle, Check, Loader, Play, RotateCcw, Search } from 'lucide-react'
import { Button, Input, Select, Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@sps/ui'
import { knowledgeApi, type KbDocumentDto, type KbExplorationDto, type KbStageItemDto, type KbStatusDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'
import { MediaManager } from '@/components/media-manager'

const COUNTRY_OPTIONS = [
  { value: '', label: 'All countries' },
  { value: 'cm', label: 'Cameroon (CM)' },
  { value: 'ae', label: 'United Arab Emirates (AE)' },
  { value: 'global', label: 'Global' },
]

function fmt(value: number): string {
  return value.toLocaleString('en-US')
}

function score(value?: number): string {
  if (value === undefined) return '—'
  return value >= 0.01 ? value.toFixed(4) : value.toFixed(5)
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="truncate text-[15px] font-semibold text-foreground">{value}</p>
      {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default function KnowledgePage() {
  const { t, locale } = useI18n()
  const [status, setStatus] = React.useState<KbStatusDto | null>(null)
  const [documents, setDocuments] = React.useState<KbDocumentDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [repairing, setRepairing] = React.useState(false)
  const [tab, setTab] = React.useState('documents')

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const [nextStatus, nextDocs] = await Promise.all([
        knowledgeApi.status(),
        knowledgeApi.documents({ limit: 200, includeRetired: true }).catch(() => ({ documents: [] })),
      ])
      setStatus(nextStatus)
      setDocuments(nextDocs.documents)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const repairIndexes = async () => {
    setRepairing(true)
    try {
      await knowledgeApi.ensureIndexes()
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRepairing(false)
    }
  }

  const toggleDocument = async (document: KbDocumentDto, active: boolean) => {
    try {
      await knowledgeApi.setDocumentActive(document.filename, active)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const expected = status?.expectedIndexes ?? []
  const indexByName = new Map((status?.indexes.indexes ?? []).map((index) => [index.name, index]))
  const pending = expected.filter((name) => indexByName.get(name)?.queryable !== true)
  const corpus = status?.totals

  return (
    <>
      <PageIntro title={t('knowledge.pageTitle')} subtitle={t('knowledge.pageSubtitle')} />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            {t('knowledge.retry')}
          </Button>
        </div>
      )}

      {!status ? (
        <p className="py-16 text-center text-[12px] text-muted-foreground">
          {loading ? t('knowledge.loading') : t('knowledge.unavailable')}
        </p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-xl border border-border bg-card px-4 py-3">
            <Stat label={t('knowledge.documents')} value={fmt(corpus?.documents ?? 0)} hint={`${fmt(corpus?.activeChunks ?? 0)} ${t('knowledge.chunks').toLowerCase()}`} />
            <Stat
              label={t('knowledge.dimensions')}
              value={status.embedding.dimensions ? `${status.embedding.dimensions}` : '—'}
              hint={status.embedding.model}
            />
            <Stat
              label={t('knowledge.lastIngest')}
              value={corpus?.lastIngestedAt ? new Date(corpus.lastIngestedAt).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }) : t('knowledge.never')}
            />
            <div className="ml-auto flex items-center gap-2 text-[12px]">
              {pending.length === 0 ? (
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  {t('knowledge.indexes.allReady')}
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">{t('knowledge.indexes.pending', { count: pending.length })}</span>
              )}
              {pending.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => void repairIndexes()} disabled={repairing}>
                  {repairing ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {t('knowledge.indexes.repair')}
                </Button>
              )}
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList ariaLabel={t('knowledge.tabsLabel')}>
              <TabsTrigger value="documents">{t('knowledge.tab.documents')}</TabsTrigger>
              <TabsTrigger value="retrieval">{t('knowledge.tab.retrieval')}</TabsTrigger>
            </TabsList>
            <TabsContent value="documents" className="pt-4">
              <MediaManager
                documents={documents}
                loading={loading}
                onChanged={load}
                onToggle={toggleDocument}
              />
            </TabsContent>
            <TabsContent value="retrieval" className="pt-4">
              <RetrievalPanel hasCorpus={(corpus?.activeChunks ?? 0) > 0} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </>
  )
}

type StageKey = 'final' | 'dense' | 'sparse' | 'fused' | 'reranked'

function RetrievalPanel({ hasCorpus }: { hasCorpus: boolean }) {
  const { t } = useI18n()
  const [query, setQuery] = React.useState('')
  const [country, setCountry] = React.useState('')
  const [topK, setTopK] = React.useState('6')
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<KbExplorationDto | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [stage, setStage] = React.useState<StageKey>('final')

  const run = async (event: React.FormEvent) => {
    event.preventDefault()
    if (query.trim().length < 2) return
    setRunning(true)
    setFailure(null)
    try {
      setResult(
        await knowledgeApi.search({
          text: query.trim(),
          ...(country ? { country } : {}),
          topK: Number(topK) || 6,
        }),
      )
      setStage('final')
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
    }
  }

  const stages: Array<{ key: StageKey; label: string; items: KbStageItemDto[] }> = [
    { key: 'final', label: t('knowledge.retrieval.final'), items: result?.stages.final ?? [] },
    { key: 'dense', label: t('knowledge.retrieval.dense'), items: result?.stages.dense ?? [] },
    { key: 'sparse', label: t('knowledge.retrieval.sparse'), items: result?.stages.sparse ?? [] },
    { key: 'fused', label: t('knowledge.retrieval.fused'), items: result?.stages.fused ?? [] },
    { key: 'reranked', label: t('knowledge.retrieval.reranked'), items: result?.stages.reranked ?? [] },
  ]
  const active = stages.find((entry) => entry.key === stage) ?? stages[0]!

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1 space-y-1">
          <label htmlFor="kb-query" className="text-[11px] text-muted-foreground">
            {t('knowledge.retrieval.query')}
          </label>
          <Input
            id="kb-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('knowledge.retrieval.queryPlaceholder')}
            className="h-9 text-[12px]"
          />
        </div>
        <Select value={country} onValueChange={setCountry} options={COUNTRY_OPTIONS} ariaLabel={t('knowledge.corpus.country')} size="md" className="w-48" />
        <Select
          value={topK}
          onValueChange={setTopK}
          options={['3', '6', '9', '12'].map((value) => ({ value, label: `Top ${value}` }))}
          ariaLabel={t('knowledge.retrieval.topK')}
          size="md"
          className="w-24"
        />
        <Button type="submit" disabled={running || query.trim().length < 2 || !hasCorpus}>
          {running ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          {running ? t('knowledge.retrieval.running') : t('knowledge.retrieval.run')}
        </Button>
      </form>

      {failure && <p className="text-[12px] text-destructive">{failure}</p>}

      {!result ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-[12px] text-muted-foreground">
          <Search className="mx-auto mb-2 h-4 w-4" />
          {hasCorpus ? t('knowledge.retrieval.empty') : t('knowledge.corpus.empty')}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {stages.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setStage(entry.key)}
                className={cn(
                  'flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] transition-colors',
                  stage === entry.key
                    ? 'bg-brand-primary/10 font-medium text-brand-primary-dark dark:text-brand-primary-light'
                    : 'text-muted-foreground hover:bg-secondary',
                )}
              >
                {entry.label}
                <span className="rounded bg-muted px-1 font-mono text-[10px]">{entry.items.length}</span>
              </button>
            ))}
          </div>

          <p className="text-[11px] text-muted-foreground">
            {result.models.embedding} → {result.models.rerank} · {t('knowledge.retrieval.ms', { ms: result.timings.totalMs })} ·
            embed {result.timings.embedMs} ms · dense {result.timings.denseMs} ms · bm25 {result.timings.sparseMs} ms · rerank {result.timings.rerankMs} ms
          </p>
          {result.warnings.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              {t('knowledge.retrieval.warnings')}: {result.warnings.join(' · ')}
            </p>
          )}

          <div className="space-y-2">
            {active.items.length === 0 ? (
              <p className="py-8 text-center text-[12px] text-muted-foreground">{t('knowledge.retrieval.noHits')}</p>
            ) : (
              active.items.map((item) => <StageResult key={`${active.key}-${item.id}`} item={item} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function StageResult({ item }: { item: KbStageItemDto }) {
  const { t } = useI18n()
  return (
    <article className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-brand-primary/10 text-[10px] font-semibold text-brand-primary-dark dark:text-brand-primary-light">
          {item.rank}
        </span>
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">{item.filename}</p>
        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{score(item.score)}</span>
      </div>
      <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{item.text}</p>
      <p className="mt-1 truncate text-[10px] text-muted-foreground">
        {t('knowledge.retrieval.chunk', { n: item.chunkIndex + 1 })}
        {item.headingPath ? ` · ${item.headingPath}` : ''}
        {item.sourceUrl ? (
          <>
            {' · '}
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              {t('knowledge.retrieval.source')}
            </a>
          </>
        ) : null}
      </p>
    </article>
  )
}
