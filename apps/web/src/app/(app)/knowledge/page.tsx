'use client'

import * as React from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  CircleDot,
  Database,
  FileText,
  Gauge,
  Layers,
  Loader,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Label,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sps/ui'
import {
  ApiError,
  knowledgeApi,
  type KbDocumentDto,
  type KbExplorationDto,
  type KbIndexStatusDto,
  type KbIngestResultDto,
  type KbStageItemDto,
  type KbStatusDto,
} from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'

const COUNTRY_OPTIONS = [
  { value: 'cm', label: 'Cameroon (CM)' },
  { value: 'ae', label: 'United Arab Emirates (AE)' },
  { value: 'global', label: 'Global' },
]

const DOC_TYPES = ['policy', 'law', 'regulation', 'strategy', 'report', 'guidance']
const JURISDICTIONS = ['national', 'regional', 'international'] as const

function fmt(value: number): string {
  return value.toLocaleString('en-US')
}

function fmtDate(value: string | null, locale: string): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function score(value?: number): string {
  if (value === undefined) return '—'
  return value >= 0.01 ? value.toFixed(4) : value.toFixed(5)
}

/** One of the six pipeline steps, with its live state. */
function PipelineStep({
  index,
  label,
  detail,
  state,
}: {
  index: number
  label: string
  detail: string
  state: 'ok' | 'warning' | 'idle'
}) {
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <span
        className={cn(
          'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] font-semibold',
          state === 'ok' && 'border-brand-primary/40 bg-brand-primary/10 text-brand-primary-dark dark:text-brand-primary-light',
          state === 'warning' && 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
          state === 'idle' && 'border-border bg-muted/50 text-muted-foreground',
        )}
      >
        {state === 'ok' ? <Check className="h-3 w-3" /> : index}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-foreground">{label}</p>
        <p className="truncate text-[10px] text-muted-foreground">{detail}</p>
      </div>
    </div>
  )
}

function StatusTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
  tone?: 'neutral' | 'brand' | 'warning'
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon
          className={cn(
            'h-3.5 w-3.5',
            tone === 'brand' && 'text-brand-primary dark:text-brand-primary-light',
            tone === 'warning' && 'text-amber-500',
          )}
        />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 truncate font-display text-lg font-bold text-foreground">{value}</p>
      {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function StageResult({ item }: { item: KbStageItemDto }) {
  const { t } = useI18n()
  return (
    <div className="rounded-lg border border-border bg-background/60 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-brand-primary/10 text-[10px] font-semibold text-brand-primary-dark dark:text-brand-primary-light">
          {item.rank}
        </span>
        <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">{item.filename}</p>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{score(item.score)}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">{item.text}</p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground">
        <span className="rounded bg-muted px-1 py-0.5">{t('knowledge.retrieval.chunk', { n: item.chunkIndex + 1 })}</span>
        {item.headingPath && <span className="truncate">· {item.headingPath}</span>}
        {item.sourceUrl && (
          <>
            <span>·</span>
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
              {t('knowledge.retrieval.source')}
            </a>
          </>
        )}
      </div>
    </div>
  )
}

export default function KnowledgePage() {
  const { t, locale } = useI18n()
  const [status, setStatus] = React.useState<KbStatusDto | null>(null)
  const [documents, setDocuments] = React.useState<KbDocumentDto[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [repairing, setRepairing] = React.useState(false)
  const [docQuery, setDocQuery] = React.useState('')

  const [tab, setTab] = React.useState('corpus')

  const load = React.useCallback(async (options: { quiet?: boolean } = {}) => {
    if (!options.quiet) setLoading(true)
    setError(null)
    try {
      const [nextStatus, nextDocs] = await Promise.all([
        knowledgeApi.status(),
        knowledgeApi.documents({ limit: 100, includeRetired: true }).catch(() => ({ documents: [] })),
      ])
      setStatus(nextStatus)
      setDocuments(nextDocs.documents)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      if (!options.quiet) setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const repairIndexes = async () => {
    setRepairing(true)
    setError(null)
    setNotice(null)
    try {
      const result = await knowledgeApi.ensureIndexes()
      const created = result.ensured.created.length
      const updated = result.ensured.updated.length
      setNotice(`${t('knowledge.indexes.repaired')} · ${created} created · ${updated} updated`)
      await load({ quiet: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRepairing(false)
    }
  }

  const toggleDocument = async (document: KbDocumentDto, active: boolean) => {
    try {
      await knowledgeApi.setDocumentActive(document.filename, active)
      await load({ quiet: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const filteredDocuments = React.useMemo(() => {
    const needle = docQuery.trim().toLowerCase()
    if (!needle) return documents
    return documents.filter((document) => document.filename.toLowerCase().includes(needle))
  }, [documents, docQuery])

  const indexByName = new Map<string, KbIndexStatusDto>(
    (status?.indexes.indexes ?? []).map((index) => [index.name, index]),
  )
  const expectedIndexes = status?.expectedIndexes ?? []
  const allIndexesReady =
    expectedIndexes.length > 0 &&
    expectedIndexes.every((name) => indexByName.get(name)?.queryable === true)
  const missingIndexes = (status?.expectedIndexes ?? []).filter((name) => !indexByName.has(name))
  const corpus = status?.totals ?? { chunks: 0, activeChunks: 0, documents: 0, characters: 0, lastIngestedAt: null }
  const hasCorpus = corpus.activeChunks > 0

  return (
    <>
      <PageIntro title={t('knowledge.pageTitle')} subtitle={t('knowledge.pageSubtitle')} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone="brand">
          <Database className="h-3 w-3" />
          {t('knowledge.backend')}: {status?.backend ?? '…'}
        </Badge>
        <Badge>
          <Layers className="h-3 w-3" />
          {status?.collection ?? '…'}
        </Badge>
        {status && (
          <Badge tone={allIndexesReady ? 'success' : missingIndexes.length > 0 ? 'danger' : 'warning'}>
            {allIndexesReady
              ? t('knowledge.indexes.ready')
              : missingIndexes.length > 0
                ? `${missingIndexes.length} ${t('knowledge.indexes.missing').toLowerCase()}`
                : t('knowledge.indexes.building')}
          </Badge>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          {t('knowledge.refresh')}
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            {t('knowledge.retry')}
          </Button>
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400">
          <Check className="h-3.5 w-3.5" />
          {notice}
        </div>
      )}

      {loading && !status ? (
        <div className="flex items-center gap-2 py-16 text-xs text-muted-foreground">
          <Loader className="h-4 w-4 animate-spin" />
          {t('knowledge.loading')}
        </div>
      ) : !status ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-10 text-xs text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            {t('knowledge.unavailable')}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatusTile
              icon={FileText}
              label={t('knowledge.documents')}
              value={fmt(corpus.documents)}
              hint={`${fmt(corpus.chunks)} chunks`}
              tone="brand"
            />
            <StatusTile
              icon={Boxes}
              label={t('knowledge.chunks')}
              value={fmt(corpus.activeChunks)}
              hint={`${fmt(corpus.characters)} chars`}
            />
            <StatusTile
              icon={Sparkles}
              label={t('knowledge.dimensions')}
              value={status.embedding.dimensions ? `${status.embedding.dimensions}d` : '—'}
              hint={`${status.embedding.model} · ${status.embedding.rerankModel}`}
            />
            <StatusTile
              icon={Gauge}
              label={t('knowledge.lastIngest')}
              value={corpus.lastIngestedAt ? fmtDate(corpus.lastIngestedAt, locale) : t('knowledge.never')}
              hint={`${status.provider.mode} · ${status.provider.reasoning ?? '—'}`}
            />
          </div>

          {(status.embedding.missingVectors > 0 || status.embedding.mismatchedVectors > 0 || !status.embedding.voyageConfigured) && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {!status.embedding.voyageConfigured && <span>VOYAGE_API_KEY is not configured on the API.</span>}
              {status.embedding.missingVectors > 0 && <span>{status.embedding.missingVectors} active chunk(s) have no vector.</span>}
              {status.embedding.mismatchedVectors > 0 && (
                <span>{status.embedding.mismatchedVectors} chunk(s) have a non-{status.embedding.dimensions}d vector.</span>
              )}
            </div>
          )}

          <div className="mb-4 grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader className="flex-wrap gap-2">
                <Sparkles className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
                <CardTitle>{t('knowledge.pipeline.title')}</CardTitle>
                <span className="text-[10px] text-muted-foreground">{t('knowledge.pipeline.subtitle')}</span>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <PipelineStep
                    index={1}
                    label={t('knowledge.step.validate')}
                    detail={t('knowledge.step.validate.detail')}
                    state={hasCorpus ? 'ok' : 'idle'}
                  />
                  <ArrowRight className="hidden h-3 w-3 shrink-0 text-muted-foreground lg:block" />
                  <PipelineStep
                    index={2}
                    label={t('knowledge.step.chunk')}
                    detail={t('knowledge.step.chunk.detail')}
                    state={hasCorpus ? 'ok' : 'idle'}
                  />
                  <ArrowRight className="hidden h-3 w-3 shrink-0 text-muted-foreground lg:block" />
                  <PipelineStep
                    index={3}
                    label={t('knowledge.step.embed')}
                    detail={t('knowledge.step.embed.detail')}
                    state={status.embedding.dimensions ? 'ok' : 'idle'}
                  />
                  <ArrowRight className="hidden h-3 w-3 shrink-0 text-muted-foreground lg:block" />
                  <PipelineStep
                    index={4}
                    label={t('knowledge.step.write')}
                    detail={t('knowledge.step.write.detail')}
                    state={hasCorpus ? 'ok' : 'idle'}
                  />
                  <ArrowRight className="hidden h-3 w-3 shrink-0 text-muted-foreground lg:block" />
                  <PipelineStep
                    index={5}
                    label={t('knowledge.step.indexes')}
                    detail={t('knowledge.step.indexes.detail')}
                    state={!status.indexes.supported ? 'warning' : allIndexesReady ? 'ok' : 'warning'}
                  />
                  <ArrowRight className="hidden h-3 w-3 shrink-0 text-muted-foreground lg:block" />
                  <PipelineStep
                    index={6}
                    label={t('knowledge.step.verify')}
                    detail={t('knowledge.step.verify.detail')}
                    state={hasCorpus ? 'ok' : 'idle'}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-[10px] text-muted-foreground">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{status.collection}</span>
                  <span>·</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">voyage-4</span>
                  <span>→</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">sps_vector_index</span>
                  <span>+</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">sps_text_index</span>
                  <span>→</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono">rerank-2</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-wrap gap-2">
                <Layers className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
                <CardTitle>{t('knowledge.indexes.title')}</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => void repairIndexes()}
                  disabled={repairing}
                >
                  {repairing ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {repairing ? t('knowledge.indexes.repairing') : t('knowledge.indexes.repair')}
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-[10px] leading-relaxed text-muted-foreground">{t('knowledge.indexes.subtitle')}</p>
                {!status.indexes.supported && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-700 dark:text-amber-400">
                    {t('knowledge.indexes.unsupported')}
                    {status.indexes.error ? ` — ${status.indexes.error}` : ''}
                  </p>
                )}
                {status.expectedIndexes.map((name) => {
                  const index = indexByName.get(name)
                  const good = index?.queryable === true
                  return (
                    <div key={name} className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2">
                      <CircleDot
                        className={cn(
                          'h-3.5 w-3.5 shrink-0',
                          good ? 'text-emerald-500' : index ? 'text-amber-500' : 'text-destructive',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-[11px] text-foreground">{name}</p>
                        <p className="truncate text-[9px] text-muted-foreground">
                          {index?.type ?? '—'} · {index?.queryable ? t('knowledge.indexes.queryable') : t('knowledge.indexes.notQueryable')}
                        </p>
                      </div>
                      <Badge tone={good ? 'success' : index ? 'warning' : 'danger'}>
                        {good
                          ? t('knowledge.indexes.ready')
                          : index
                            ? index.status === 'FAILED'
                              ? t('knowledge.indexes.failed')
                              : t('knowledge.indexes.building')
                            : t('knowledge.indexes.missing')}
                      </Badge>
                    </div>
                  )
                })}
                <p className="pt-1 text-[10px] text-muted-foreground">
                  {t('knowledge.models')}: <span className="font-mono">{status.embedding.model}</span> ·{' '}
                  <span className="font-mono">{status.embedding.rerankModel}</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList ariaLabel={t('knowledge.tabsLabel')}>
              <TabsTrigger value="corpus">{t('knowledge.tab.corpus')}</TabsTrigger>
              <TabsTrigger value="vectorise">{t('knowledge.tab.vectorise')}</TabsTrigger>
              <TabsTrigger value="retrieval">{t('knowledge.tab.retrieval')}</TabsTrigger>
            </TabsList>

            <TabsContent value="corpus" className="pt-3">
              <CorpusPanel
                documents={filteredDocuments}
                query={docQuery}
                onQuery={setDocQuery}
                onToggle={toggleDocument}
                loading={loading}
              />
            </TabsContent>

            <TabsContent value="vectorise" className="pt-3">
              <VectorisePanel
                recentRuns={status.recentRuns}
                onDone={() => void load({ quiet: true })}
              />
            </TabsContent>

            <TabsContent value="retrieval" className="pt-3">
              <RetrievalPanel onEmptyCorpus={() => setTab('vectorise')} hasCorpus={hasCorpus} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </>
  )
}

function CorpusPanel({
  documents,
  query,
  onQuery,
  onToggle,
  loading,
}: {
  documents: KbDocumentDto[]
  query: string
  onQuery: (value: string) => void
  onToggle: (document: KbDocumentDto, active: boolean) => Promise<void>
  loading: boolean
}) {
  const { t, locale } = useI18n()
  return (
    <Card className="flex min-h-[320px] flex-col">
      <CardHeader className="flex-wrap gap-2">
        <FileText className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
        <CardTitle>{t('knowledge.corpus.title')}</CardTitle>
        <span className="hidden text-[10px] text-muted-foreground md:inline">{t('knowledge.corpus.subtitle')}</span>
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={t('knowledge.corpus.filter')}
            aria-label={t('knowledge.corpus.filter')}
            className="h-8 w-40 text-[11px] sm:w-64"
          />
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        {documents.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">{t('knowledge.corpus.empty')}</p>
        ) : (
          <div className="custom-scrollbar overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="border-b border-slate-200 hover:bg-transparent dark:border-brand-primary-dark/30">
                  <TableHead>{t('knowledge.corpus.file')}</TableHead>
                  <TableHead>{t('knowledge.corpus.country')}</TableHead>
                  <TableHead>{t('knowledge.corpus.type')}</TableHead>
                  <TableHead className="text-right">{t('knowledge.corpus.chunks')}</TableHead>
                  <TableHead className="text-right">{t('knowledge.corpus.chars')}</TableHead>
                  <TableHead>{t('knowledge.corpus.updated')}</TableHead>
                  <TableHead className="text-right">{t('knowledge.corpus.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((document) => {
                  const retired = document.activeChunks === 0
                  return (
                    <TableRow key={document.filename}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="max-w-[280px] truncate text-[11px] font-medium text-foreground">
                            {document.filename}
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            {document.namespace ?? 'default'} · {document.version ?? 'v1'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] uppercase">{document.country}</TableCell>
                      <TableCell className="text-[11px]">{document.docType}</TableCell>
                      <TableCell className="text-right font-mono text-[11px]">{document.activeChunks}</TableCell>
                      <TableCell className="text-right font-mono text-[11px]">{fmt(document.characters)}</TableCell>
                      <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">
                        {fmtDate(document.lastIngestedAt, locale)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {retired && <Badge tone="warning">{t('knowledge.corpus.retired')}</Badge>}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={loading}
                            onClick={() => void onToggle(document, retired)}
                          >
                            {retired ? <RotateCcw className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                            {retired ? t('knowledge.corpus.restore') : t('knowledge.corpus.retire')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function VectorisePanel({
  recentRuns,
  onDone,
}: {
  recentRuns: KbIngestResultDto[]
  onDone: () => void
}) {
  const { t } = useI18n()
  const [mode, setMode] = React.useState<'paste' | 'file'>('paste')
  const [text, setText] = React.useState('')
  const [filename, setFilename] = React.useState('')
  const [country, setCountry] = React.useState('cm')
  const [jurisdiction, setJurisdiction] = React.useState<(typeof JURISDICTIONS)[number]>('national')
  const [docType, setDocType] = React.useState('policy')
  const [namespace, setNamespace] = React.useState('')
  const [version, setVersion] = React.useState('')
  const [sourceUrl, setSourceUrl] = React.useState('')
  const [maxChars, setMaxChars] = React.useState('1500')
  const [overlap, setOverlap] = React.useState('180')
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<KbIngestResultDto | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (!/\.(txt|md|markdown|csv|json)$/i.test(file.name)) {
      setFailure(t('knowledge.vectorise.fileHint'))
      return
    }
    const content = await file.text()
    setText(content)
    if (!filename) setFilename(file.name)
    setFailure(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFailure(null)
    if (text.trim().length < 24) {
      setFailure(t('knowledge.vectorise.text'))
      return
    }
    if (!filename.trim()) {
      setFailure(t('knowledge.vectorise.filename'))
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const response = await knowledgeApi.ingestText({
        text,
        filename: filename.trim(),
        country,
        jurisdiction,
        docType,
        ...(namespace.trim() ? { namespace: namespace.trim() } : {}),
        ...(version.trim() ? { version: version.trim() } : {}),
        ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
        maxChars: Number(maxChars) || 1500,
        overlapChars: Number(overlap) || 0,
      })
      setResult(response)
      onDone()
    } catch (caught) {
      if (caught instanceof ApiError) {
        const body = caught.json<KbIngestResultDto>()
        if (body) setResult(body)
        setFailure(body?.error ?? caught.message)
      } else {
        setFailure(caught instanceof Error ? caught.message : String(caught))
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader className="flex-wrap gap-2">
          <Upload className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
          <CardTitle>{t('knowledge.vectorise.title')}</CardTitle>
          <span className="hidden text-[10px] text-muted-foreground md:inline">{t('knowledge.vectorise.subtitle')}</span>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={submit}>
            <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
              {(['paste', 'file'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    'h-7 flex-1 rounded-md text-[11px] transition-colors',
                    mode === value ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {value === 'paste' ? t('knowledge.vectorise.paste') : t('knowledge.vectorise.file')}
                </button>
              ))}
            </div>

            {mode === 'file' && (
              <div className="rounded-lg border border-dashed border-border px-3 py-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".txt,.md,.markdown,.csv,.json"
                  className="hidden"
                  onChange={(event) => void onFile(event.target.files?.[0])}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                    <FileText className="h-3.5 w-3.5" />
                    {t('knowledge.vectorise.chooseFile')}
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    {filename ? `${filename} · ${fmt(text.length)} chars` : t('knowledge.vectorise.fileHint')}
                  </span>
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="kb-filename">{t('knowledge.vectorise.filename')}</Label>
                <Input
                  id="kb-filename"
                  value={filename}
                  onChange={(event) => setFilename(event.target.value)}
                  placeholder={t('knowledge.vectorise.filenamePlaceholder')}
                  className="h-8 text-[11px]"
                />
              </div>
              <div className="space-y-1">
                <Label>{t('knowledge.vectorise.country')}</Label>
                <Select value={country} onValueChange={setCountry} options={COUNTRY_OPTIONS} size="sm" />
              </div>
              <div className="space-y-1">
                <Label>{t('knowledge.vectorise.jurisdiction')}</Label>
                <Select
                  value={jurisdiction}
                  onValueChange={(value) => setJurisdiction(value as (typeof JURISDICTIONS)[number])}
                  options={JURISDICTIONS.map((value) => ({ value, label: value }))}
                  size="sm"
                />
              </div>
              <div className="space-y-1">
                <Label>{t('knowledge.vectorise.docType')}</Label>
                <Select
                  value={docType}
                  onValueChange={setDocType}
                  options={DOC_TYPES.map((value) => ({ value, label: value }))}
                  size="sm"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kb-namespace">{t('knowledge.vectorise.namespace')}</Label>
                <Input
                  id="kb-namespace"
                  value={namespace}
                  onChange={(event) => setNamespace(event.target.value)}
                  placeholder="default"
                  className="h-8 text-[11px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kb-version">{t('knowledge.vectorise.version')}</Label>
                <Input
                  id="kb-version"
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  placeholder="v1"
                  className="h-8 text-[11px]"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="kb-source">{t('knowledge.vectorise.sourceUrl')}</Label>
                <Input
                  id="kb-source"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="https://…"
                  className="h-8 text-[11px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kb-max">{t('knowledge.vectorise.chunkSize')}</Label>
                <Input
                  id="kb-max"
                  inputMode="numeric"
                  value={maxChars}
                  onChange={(event) => setMaxChars(event.target.value)}
                  className="h-8 text-[11px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="kb-overlap">{t('knowledge.vectorise.overlap')}</Label>
                <Input
                  id="kb-overlap"
                  inputMode="numeric"
                  value={overlap}
                  onChange={(event) => setOverlap(event.target.value)}
                  className="h-8 text-[11px]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="kb-text">{t('knowledge.vectorise.text')}</Label>
              <textarea
                id="kb-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t('knowledge.vectorise.textPlaceholder')}
                rows={9}
                className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
              />
              <p className="text-right text-[9px] text-muted-foreground">{fmt(text.length)} chars</p>
            </div>

            {failure && (
              <p className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[10px] text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {failure}
              </p>
            )}

            <Button type="submit" size="sm" disabled={running}>
              {running ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {running ? t('knowledge.vectorise.running') : t('knowledge.vectorise.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Play className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
            <CardTitle>{t('knowledge.vectorise.result')}</CardTitle>
            {result && (
              <Badge tone={result.ok ? 'success' : 'danger'} className="ml-auto">
                {result.ok ? `${result.durationMs} ms` : t('knowledge.vectorise.failed')}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-1.5">
            <ul className="space-y-1.5 text-[10px] text-muted-foreground">
              {[1, 2, 3, 4].map((step) => (
                <li key={step} className="flex gap-2">
                  <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-primary/10 text-[8px] font-semibold text-brand-primary-dark dark:text-brand-primary-light">
                    {step}
                  </span>
                  <span>{t(`knowledge.vectorise.how${step}` as 'knowledge.vectorise.how1')}</span>
                </li>
              ))}
            </ul>

            {!result ? (
              <p className="pt-2 text-[10px] text-muted-foreground">{t('knowledge.vectorise.none')}</p>
            ) : (
              <div className="space-y-2 pt-2">
                <p className="text-[10px] font-medium text-foreground">
                  {result.ok
                    ? t('knowledge.vectorise.done', {
                        chunks: result.chunks,
                        inserted: result.inserted,
                        unchanged: result.unchanged,
                        deactivated: result.deactivated,
                      })
                    : result.error}
                </p>
                <div className="space-y-1">
                  {result.steps.map((step) => (
                    <div key={`${step.id}-${step.label}`} className="flex items-start gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                      <span
                        className={cn(
                          'mt-0.5 h-2 w-2 shrink-0 rounded-full',
                          step.status === 'ok' && 'bg-emerald-500',
                          step.status === 'warning' && 'bg-amber-500',
                          step.status === 'error' && 'bg-destructive',
                          step.status === 'skipped' && 'bg-slate-400',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[10px] font-medium text-foreground">{step.label}</p>
                        <p className="text-[9px] leading-relaxed text-muted-foreground">{step.detail}</p>
                      </div>
                      <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{step.ms} ms</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {recentRuns.length > 0 && (
          <Card>
            <CardHeader>
              <RefreshCw className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
              <CardTitle>{t('knowledge.vectorise.recent')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {recentRuns.map((run) => (
                <div key={`${run.documentId}-${run.durationMs}`} className="flex items-center gap-2 text-[10px]">
                  <Badge tone={run.ok ? 'success' : 'danger'}>{run.ok ? 'ok' : 'error'}</Badge>
                  <span className="min-w-0 flex-1 truncate text-foreground">{run.filename}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {run.chunks} chunks · {run.inserted} new
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function RetrievalPanel({ hasCorpus, onEmptyCorpus }: { hasCorpus: boolean; onEmptyCorpus: () => void }) {
  const { t } = useI18n()
  const [query, setQuery] = React.useState('')
  const [country, setCountry] = React.useState('')
  const [docType, setDocType] = React.useState('')
  const [topK, setTopK] = React.useState('6')
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<KbExplorationDto | null>(null)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [stage, setStage] = React.useState<'final' | 'dense' | 'sparse' | 'fused' | 'reranked'>('final')

  const run = async (event: React.FormEvent) => {
    event.preventDefault()
    if (query.trim().length < 2) return
    setRunning(true)
    setFailure(null)
    try {
      const response = await knowledgeApi.search({
        text: query.trim(),
        ...(country ? { country } : {}),
        ...(docType ? { docType } : {}),
        topK: Number(topK) || 6,
      })
      setResult(response)
      setStage('final')
    } catch (caught) {
      setFailure(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRunning(false)
    }
  }

  const stages = [
    { value: 'final' as const, label: t('knowledge.retrieval.final'), items: result?.stages.final ?? [] },
    { value: 'dense' as const, label: t('knowledge.retrieval.dense'), items: result?.stages.dense ?? [] },
    { value: 'sparse' as const, label: t('knowledge.retrieval.sparse'), items: result?.stages.sparse ?? [] },
    { value: 'fused' as const, label: t('knowledge.retrieval.fused'), items: result?.stages.fused ?? [] },
    { value: 'reranked' as const, label: t('knowledge.retrieval.reranked'), items: result?.stages.reranked ?? [] },
  ]
  const active = stages.find((entry) => entry.value === stage) ?? stages[0]!

  return (
    <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
      <Card>
        <CardHeader className="flex-wrap gap-2">
          <Search className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
          <CardTitle>{t('knowledge.retrieval.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-[10px] leading-relaxed text-muted-foreground">{t('knowledge.retrieval.subtitle')}</p>
          <form className="space-y-3" onSubmit={run}>
            <div className="space-y-1">
              <Label htmlFor="kb-query">{t('knowledge.retrieval.query')}</Label>
              <Input
                id="kb-query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('knowledge.retrieval.queryPlaceholder')}
                className="h-8 text-[11px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>{t('knowledge.corpus.country')}</Label>
                <Select
                  value={country}
                  onValueChange={setCountry}
                  options={[{ value: '', label: t('knowledge.retrieval.allCountries') }, ...COUNTRY_OPTIONS]}
                  size="sm"
                />
              </div>
              <div className="space-y-1">
                <Label>{t('knowledge.vectorise.docType')}</Label>
                <Select
                  value={docType}
                  onValueChange={setDocType}
                  options={[{ value: '', label: '—' }, ...DOC_TYPES.map((value) => ({ value, label: value }))]}
                  size="sm"
                />
              </div>
              <div className="space-y-1">
                <Label>{t('knowledge.retrieval.topK')}</Label>
                <Select
                  value={topK}
                  onValueChange={setTopK}
                  options={['3', '4', '6', '8', '10', '12'].map((value) => ({ value, label: value }))}
                  size="sm"
                />
              </div>
            </div>
            {!hasCorpus && (
              <button
                type="button"
                onClick={onEmptyCorpus}
                className="w-full rounded-lg border border-dashed border-border px-2 py-2 text-left text-[10px] text-muted-foreground hover:bg-muted/40"
              >
                {t('knowledge.corpus.empty')}
              </button>
            )}
            {failure && (
              <p className="flex items-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-[10px] text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {failure}
              </p>
            )}
            <Button type="submit" size="sm" disabled={running || query.trim().length < 2 || !hasCorpus}>
              {running ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {running ? t('knowledge.retrieval.running') : t('knowledge.retrieval.run')}
            </Button>
          </form>

          {result && (
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-1.5 text-[9px] text-muted-foreground">
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{result.models.embedding}</span>
                <ArrowRight className="h-2.5 w-2.5" />
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{result.models.rerank}</span>
                <span>·</span>
                <span>{t('knowledge.retrieval.ms', { ms: result.timings.totalMs })}</span>
              </div>
              <p className="break-all font-mono text-[9px] text-muted-foreground">
                {t('knowledge.retrieval.filter')}: {JSON.stringify(result.filter)}
              </p>
              <div className="flex flex-wrap gap-2 text-[9px] text-muted-foreground">
                <span>embed {result.timings.embedMs} ms</span>
                <span>dense {result.timings.denseMs} ms</span>
                <span>bm25 {result.timings.sparseMs} ms</span>
                <span>rerank {result.timings.rerankMs} ms</span>
              </div>
              {result.warnings.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-[9px] text-amber-700 dark:text-amber-400">
                  {t('knowledge.retrieval.warnings')}: {result.warnings.join(' · ')}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="flex min-h-[380px] flex-col">
        <CardHeader className="flex-wrap gap-1">
          <Boxes className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
          <CardTitle>{t('knowledge.retrieval.final')}</CardTitle>
          {result && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {result.stages.final.length} hits
            </span>
          )}
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {!result ? (
            <p className="px-4 py-12 text-center text-[11px] text-muted-foreground">
              {t('knowledge.retrieval.empty')}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
                {stages.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => setStage(entry.value)}
                    className={cn(
                      'flex h-6 items-center gap-1.5 rounded-md px-2 text-[10px] transition-colors',
                      stage === entry.value
                        ? 'bg-brand-primary/10 font-medium text-brand-primary-dark dark:text-brand-primary-light'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {entry.label}
                    <span className="rounded bg-muted px-1 font-mono text-[9px]">{entry.items.length}</span>
                  </button>
                ))}
              </div>
              <div className="custom-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
                {active.items.length === 0 ? (
                  <p className="py-8 text-center text-[10px] text-muted-foreground">{t('knowledge.retrieval.noHits')}</p>
                ) : (
                  active.items.map((item) => <StageResult key={`${active.value}-${item.id}`} item={item} />)
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
