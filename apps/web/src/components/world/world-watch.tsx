'use client'

/**
 * Legal watch: the usable legal texts of the corpus, newest ingestion first.
 *
 * The page is a read-only lens over `/v1/kb/documents`: no proposal queue, no
 * scheduled crawl — those would need a writer this slice does not add. It shows
 * what the country's corpus actually holds, with the rights bucket that allows
 * the full text to be stored and cited.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BookOpen, ExternalLink, RefreshCw, Scale, Search, TriangleAlert } from 'lucide-react'
import {
  Badge,
  Button,
  Input,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sps/ui'
import { knowledgeApi, type KbDocumentDto } from '@/lib/api'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { documentHref } from '@/lib/kb-links'
import { CountryFlag } from '@/components/country-flag'

/** Rights that allow full-text storage, hence citation: the watch never lists the rest. */
const PUBLISHABLE = ['official-text', 'open-licence'] as const

const TYPE_KEYS: Record<string, MessageKey> = {
  law: 'world.watch.type.law',
  policy: 'world.watch.type.policy',
  regulation: 'world.watch.type.regulation',
  strategy: 'world.watch.type.strategy',
  report: 'world.watch.type.report',
  guidance: 'world.watch.type.guidance',
}

export function WorldWatch({ country, nameOf }: { country: string; nameOf: (code: string) => string }) {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [scope, setScope] = React.useState<'country' | 'all'>('country')
  const [documents, setDocuments] = React.useState<KbDocumentDto[] | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [query, setQuery] = React.useState('')
  const requestId = React.useRef(0)

  const load = React.useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const result = await knowledgeApi.documents({
        limit: 200,
        country: scope === 'country' ? country : undefined,
        rights: [...PUBLISHABLE],
      })
      if (id !== requestId.current) return
      setDocuments(result.documents)
      setProblem(null)
    } catch (cause) {
      if (id !== requestId.current) return
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [country, scope])

  React.useEffect(() => {
    void load()
  }, [load])

  const dateFormat = React.useMemo(
    () => new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium' }),
    [locale],
  )

  const all = documents ?? []
  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return all
    return all.filter((document) =>
      `${document.title ?? ''} ${document.filename} ${document.summary ?? ''}`.toLowerCase().includes(needle),
    )
  }, [all, query])

  const lastAdded = React.useMemo(
    () =>
      all
        .map((document) => document.lastIngestedAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
    [all],
  )
  const countries = React.useMemo(
    () => new Set(all.map((document) => document.country).filter(Boolean)),
    [all],
  )
  const types = React.useMemo(() => new Set(all.map((document) => document.docType).filter(Boolean)), [all])

  const countryLabel = (code: string) => {
    if (!code) return '—'
    return code === 'global' ? t('world.watch.global') : nameOf(code)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          ariaLabel={t('world.watch.scope')}
          value={scope}
          onValueChange={(value) => setScope(value as 'country' | 'all')}
          options={[
            { value: 'country', label: t('world.watch.scope.country', { country: countryLabel(country) }) },
            { value: 'all', label: t('world.watch.scope.all') },
          ]}
          size="md"
        />
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('world.watch.search')}
            aria-label={t('world.watch.search')}
            className="h-8 pl-8 text-[11px]"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'mr-1.5 h-3.5 w-3.5 animate-spin' : 'mr-1.5 h-3.5 w-3.5'} aria-hidden="true" />
          {t('world.refresh')}
        </Button>
      </div>

      {problem && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {t('world.watch.error')} {problem}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            {t('world.retry')}
          </Button>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <Stat label={t('world.watch.stat.texts')} value={String(all.length)} hint={t('world.watch.stat.textsHint')} />
        <Stat
          label={t('world.watch.stat.last')}
          value={lastAdded ? dateFormat.format(new Date(lastAdded)) : t('knowledge.never')}
          hint={t('world.watch.stat.lastHint')}
        />
        <Stat
          label={t('world.watch.stat.coverage')}
          value={
            scope === 'all'
              ? t('world.watch.stat.countries', { count: countries.size })
              : t('world.watch.stat.types', { count: types.size })
          }
          hint={t('world.watch.stat.coverageHint')}
        />
      </div>

      {loading && !documents ? (
        <div className="space-y-2 border border-border p-4" aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-dashed border-border px-4 py-6">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary/70 text-muted-foreground">
            <Scale className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-foreground">
              {query ? t('world.watch.noMatch.title') : t('world.watch.empty.title')}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {query ? t('world.watch.noMatch.body') : t('world.watch.empty.body')}
            </p>
          </div>
          {!query && (
            <Button variant="outline" size="sm" onClick={() => router.push('/knowledge')}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('world.watch.openKnowledge')}
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto border border-border" aria-busy={loading || undefined}>
          <Table className="min-w-[46rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('world.watch.column.text')}</TableHead>
                <TableHead>{t('world.watch.column.type')}</TableHead>
                <TableHead>{t('world.watch.column.rights')}</TableHead>
                <TableHead>{t('world.watch.column.country')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('world.watch.column.added')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('world.watch.column.passages')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((document) => (
                <TableRow key={document.filename}>
                  <TableCell>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={documentHref(document.filename, 'details', 'view')}
                          className="group min-w-0 text-[12px] font-medium text-foreground hover:text-brand-primary"
                          title={document.filename}
                        >
                          <span className="block truncate">{document.title || document.filename}</span>
                        </a>
                        {document.sourceUrl && (
                          <a
                            href={document.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={t('world.watch.source')}
                            className="shrink-0 text-muted-foreground hover:text-brand-primary"
                          >
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                      <a
                        href={documentHref(document.filename, 'details', 'view')}
                        className="block truncate font-mono text-[9px] text-muted-foreground hover:text-brand-primary"
                      >
                        {document.filename}
                      </a>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone="neutral" className="text-[9px]">
                      {TYPE_KEYS[document.docType] ? t(TYPE_KEYS[document.docType]!) : document.docType || '—'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      tone={document.rights === 'official-text' ? 'brand' : 'success'}
                      className="text-[9px]"
                    >
                      {t(`knowledge.rights.${document.rights}` as MessageKey)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-[11px]">
                      {document.country && document.country !== 'global' && <CountryFlag code={document.country} />}
                      <span className="truncate">{countryLabel(document.country)}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-[11px] text-muted-foreground sm:table-cell">
                    {document.lastIngestedAt ? dateFormat.format(new Date(document.lastIngestedAt)) : '—'}
                  </TableCell>
                  <TableCell className="hidden text-[11px] tabular-nums text-muted-foreground lg:table-cell">
                    {document.activeChunks}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">{t('world.watch.note')}</p>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="text-[10px] font-black tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  )
}
