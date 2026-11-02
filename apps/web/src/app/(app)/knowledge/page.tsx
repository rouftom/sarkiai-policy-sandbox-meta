'use client'

import * as React from 'react'
import { AlertTriangle, Check, Database, Loader, Newspaper, Play, RotateCcw, Search } from 'lucide-react'
import { AnimatedTabsList, Button, Input, Select, Skeleton, Tabs, TabsContent, cn, type TabItem } from '@sps/ui'
import { knowledgeApi, type KbDocumentDto, type KbExplorationDto, type KbStageItemDto, type KbStatusDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { countryOptions } from '@/lib/country-options'
import { PageIntro } from '@/components/page-intro'
import { KbDocuments } from '@/components/kb-documents'
import { GazettePanel } from '@/components/gazette-panel'
import { useToast } from '@/components/shared/toast'
import { useWorkspace } from '@/lib/workspace'

const KB_TABS: TabItem[] = [
  { id: 'documents', label: 'Documents', icon: Database },
  { id: 'gazette', label: 'Scanned gazette', icon: Newspaper },
  { id: 'retrieval', label: 'Retrieval', icon: Search },
]

function fmt(value: number): string {
  return value.toLocaleString('en-US')
}

function score(value?: number): string {
  if (value === undefined) return 'n/a'
  return value >= 0.01 ? value.toFixed(4) : value.toFixed(5)
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] leading-tight text-muted-foreground">{label}</p>
      <p className="truncate text-[13px] font-semibold leading-tight text-foreground">{value}</p>
      {hint && <p className="truncate text-[10px] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  )
}

export default function KnowledgePage() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [status, setStatus] = React.useState<KbStatusDto | null>(null)
  const [documents, setDocuments] = React.useState<KbDocumentDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState('documents')
  const { country } = useWorkspace()

  // `?tab=gazette` (from the overview) opens that panel.
  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    if (requested && KB_TABS.some((entry) => entry.id === requested)) setTab(requested)
  }, [])

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

  const toggleDocument = async (document: KbDocumentDto, active: boolean) => {
    try {
      await knowledgeApi.setDocumentActive(document.filename, active)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  /** Deletes one document for good; the dialog stays open if the API refuses. */
  const deleteDocument = async (document: KbDocumentDto) => {
    try {
      await knowledgeApi.deleteDocument(document.filename)
      await load()
      toast.success(t('knowledge.corpus.deleted'), document.filename)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      toast.error(t('toast.failed'), message)
      throw caught
    }
  }

  const corpus = status?.totals

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <PageIntro title={t('knowledge.pageTitle')} subtitle={t('knowledge.pageSubtitle')}>
        <AnimatedTabsList
          items={KB_TABS.map((entry) => ({
            ...entry,
            label:
              entry.id === 'documents'
                ? t('knowledge.tab.documents')
                : entry.id === 'retrieval'
                  ? t('knowledge.tab.retrieval')
                  : t('nav.gazette'),
          }))}
          value={tab}
          onValueChange={setTab}
          dense
        />
      </PageIntro>

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
        loading ? (
          <div className="space-y-3" aria-label={t('knowledge.loading')}>
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <p className="py-16 text-center text-[12px] text-muted-foreground">{t('knowledge.unavailable')}</p>
        )
      ) : (
        <>
          <TabsContent value="documents" className="pt-2">
            <KbDocuments
              documents={documents}
              loading={loading}
              onChanged={load}
              onToggle={toggleDocument}
              onDelete={deleteDocument}
              summary={{
                documents: corpus?.documents ?? 0,
                chunks: corpus?.activeChunks ?? 0,
                characters: corpus?.characters,
                lastIngestedAt: corpus?.lastIngestedAt,
              }}
            />
          </TabsContent>
          <TabsContent value="retrieval" className="pt-2">
            <RetrievalPanel hasCorpus={(corpus?.activeChunks ?? 0) > 0} />
          </TabsContent>
          <TabsContent value="gazette" className="pt-2">
            <GazettePanel country={country} />
          </TabsContent>
        </>
      )}
    </Tabs>
  )
}

type StageKey = 'final' | 'lexical' | 'fused' | 'reranked'

function RetrievalPanel({ hasCorpus }: { hasCorpus: boolean }) {
  const { t, locale } = useI18n()
  const { countries } = useWorkspace()
  const [query, setQuery] = React.useState('')
  const [country, setCountry] = React.useState('')
  const [topK, setTopK] = React.useState('6')
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<KbExplorationDto | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [stage, setStage] = React.useState<StageKey>('final')

  const countryFilterOptions = React.useMemo(
    () => [
      { value: '', label: t('knowledge.retrieval.allCountries') },
      ...countryOptions(countries, locale, country),
    ],
    [countries, country, locale, t],
  )

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
    { key: 'lexical', label: t('knowledge.retrieval.lexical'), items: result?.stages.lexical ?? [] },
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
        <Select value={country} onValueChange={setCountry} options={countryFilterOptions} ariaLabel={t('knowledge.corpus.country')} size="md" className="w-48" />
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

      {running ? (
        <div className="space-y-2" aria-busy="true" aria-label={t('knowledge.retrieval.running')}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="shimmer h-16 rounded-xl bg-secondary" style={{ opacity: 1 - index * 0.15 }} />
          ))}
        </div>
      ) : !result ? (
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
            {result.model} · {result.depth} · {t('knowledge.retrieval.ms', { ms: result.timings.totalMs })} · plan {result.timings.planMs} ms ·
            search {result.timings.searchMs} ms · judge {result.timings.judgeMs} ms · rerank {result.timings.rerankMs} ms
          </p>
          {result.subAgents.length > 0 && (
            <div className="space-y-1 rounded-xl border border-border p-2.5 text-[11px]">
              <p className="font-medium text-foreground">{t('knowledge.retrieval.agents', { count: result.subAgents.length })}</p>
              {result.subAgents.map((agent, index) => (
                <div key={index} className="text-muted-foreground">
                  <span className="text-foreground">{agent.question}</span>
                  {agent.rounds.map((round, roundIndex) => (
                    <span key={roundIndex} className="block pl-3">
                      {t('knowledge.retrieval.round', { n: roundIndex + 1, hits: round.hits })} · {round.queries.join(' · ')}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          )}
          {result.fallbacks.length > 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              {t('knowledge.retrieval.warnings')}: {result.fallbacks.join(' · ')}
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
        {item.sourceUrl && /^https?:\/\//.test(item.sourceUrl) ? (
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
