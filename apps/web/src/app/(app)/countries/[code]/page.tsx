'use client'

import * as React from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Database,
  Gauge,
  Globe2,
  Loader,
  Megaphone,
  Network,
  Pencil,
  Trash2,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@sps/ui'
import type { Domain } from '@sps/shared'
import {
  ApiError,
  api,
  countriesApi,
  type CountryDto,
  type CountryInsightsDto,
  type ReadinessRunSummaryDto,
} from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'
import { CountryDialog } from '@/components/country-dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/shared/toast'

type Tab = 'overview' | 'sectors' | 'syntheses' | 'insights'

const TABS: Tab[] = ['overview', 'sectors', 'syntheses', 'insights']

function sectorLabel(t: ReturnType<typeof useI18n>['t'], sector: Domain): string {
  return t(`domain.${sector}` as 'domain.health')
}

function score(value: number | null, empty = '—'): string {
  return typeof value === 'number' ? value.toFixed(1) : empty
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 py-3">
        <p className="text-[9px] font-medium text-muted-foreground">{label}</p>
        <p className="truncate font-display text-base font-bold text-foreground">{value}</p>
        {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function ChartFrame({
  title,
  hint,
  empty,
  emptyLabel,
  children,
}: {
  title: string
  hint?: string
  empty: boolean
  emptyLabel: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-[12px]">{title}</CardTitle>
        {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent className="pt-2">
        {empty ? (
          <p className="flex h-[180px] items-center justify-center text-center text-[10px] text-muted-foreground">
            {emptyLabel}
          </p>
        ) : (
          <div className="h-[180px] w-full">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

const AXIS = { fontSize: 10, fill: 'var(--muted-foreground)' }
const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }

export default function CountryPage() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const params = useParams<{ code: string }>()
  const code = String(params.code)

  const [country, setCountry] = React.useState<CountryDto | null>(null)
  const [insights, setInsights] = React.useState<CountryInsightsDto | null>(null)
  const [runs, setRuns] = React.useState<ReadinessRunSummaryDto[] | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<Tab>('overview')
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleteProblem, setDeleteProblem] = React.useState<string | null>(null)
  const [selectedSectors, setSelectedSectors] = React.useState<Domain[]>([])
  const [savingSectors, setSavingSectors] = React.useState(false)

  React.useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    if (requested && (TABS as string[]).includes(requested)) setTab(requested as Tab)
  }, [])

  const load = React.useCallback(async () => {
    try {
      const result = await countriesApi.get(code)
      setCountry(result.country)
      setSelectedSectors(result.country.sectors)
      setProblem(null)
      void countriesApi.insights(code).then(setInsights).catch(() => setInsights(null))
      void api
        .readinessRuns({ q: code, limit: 20 })
        .then((page) => setRuns(page.runs))
        .catch(() => setRuns([]))
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0
      setProblem(status === 404 ? t('country.notFound') : (cause as Error).message)
    }
  }, [code, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const name = country ? (locale === 'fr' ? country.nameFr : country.name) : code.toUpperCase()

  const confirmDelete = async () => {
    if (!country) return
    setDeleteProblem(null)
    try {
      await countriesApi.remove(country.code)
      toast.success(t('countries.removed'), name)
      router.push('/countries')
    } catch (cause) {
      const body =
        cause instanceof ApiError
          ? cause.json<{ error?: string; readinessRuns?: number; scenarioRuns?: number }>()
          : null
      const message =
        body?.error === 'last_active_country'
          ? t('countries.deleteBlockedLast')
          : body?.error === 'country_in_use'
            ? t('countries.deleteBlockedInUse', { count: (body.readinessRuns ?? 0) + (body.scenarioRuns ?? 0) })
            : t('countries.deleteError')
      setDeleteProblem(message)
      throw cause
    }
  }

  const sectorsDirty =
    country !== null &&
    [...selectedSectors].sort().join(',') !== [...country.sectors].sort().join(',')

  const toggleSector = (sector: Domain) => {
    setSelectedSectors((current) => {
      if (current.includes(sector)) {
        if (current.length === 1) return current
        return current.filter((value) => value !== sector)
      }
      return [...current, sector]
    })
  }

  const saveSectors = async () => {
    if (!country) return
    setSavingSectors(true)
    try {
      const result = await countriesApi.setSectors(country.code, selectedSectors)
      setCountry(result.country)
      setSelectedSectors(result.country.sectors)
      toast.success(t('country.sectors.saved'), name)
    } catch (cause) {
      toast.error(t('country.sectors.error'), (cause as Error).message)
    } finally {
      setSavingSectors(false)
    }
  }

  if (problem === t('country.notFound')) {
    return (
      <>
        <PageIntro title={t('country.notFound')} subtitle={code}>
          <Button variant="ghost" size="sm" onClick={() => router.push('/countries')} className="gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {t('country.back')}
          </Button>
        </PageIntro>
        <Card>
          <CardContent className="py-10 text-center text-[11px] text-muted-foreground">{problem}</CardContent>
        </Card>
      </>
    )
  }

  if (!country) {
    return (
      <>
        <div className="space-y-2 pb-3 pt-1">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3 w-80" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      </>
    )
  }

  const totals = insights?.insights.totals
  const sectorRows = (insights?.insights.sectors ?? []).filter((row) => country.sectors.includes(row.sector))
  const sectorData = sectorRows.map((row) => ({
    name: sectorLabel(t, row.sector),
    runs: row.readinessRuns,
    score: row.averageComposite ?? 0,
    scenarios: row.scenarioRuns,
  }))
  const trendData = (insights?.insights.trend ?? []).map((point) => ({
    name: new Date(`${point.date}T00:00:00Z`).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit',
      month: '2-digit',
    }),
    runs: point.readinessRuns,
    score: point.averageComposite,
  }))
  const noData = (totals?.readinessRuns ?? 0) === 0 && (totals?.scenarioRuns ?? 0) === 0

  return (
    <>
      <PageIntro
        title={name}
        subtitle={`${country.code.toUpperCase()} · ${country.region || t('countries.col.region')} · ${country.authority || t('countries.field.authority')}`}
        leading={
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg"
            aria-label={t('country.back')}
            title={t('country.back')}
            onClick={() => router.push('/countries')}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        }
      >
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)} className="gap-1.5">
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {t('country.edit')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setDeleteProblem(null)
            setDeleteOpen(true)
          }}
          className="gap-1.5 text-rose-500 hover:text-rose-600"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t('country.delete')}
        </Button>
      </PageIntro>

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab)
          window.history.replaceState(null, '', `/countries/${country.code}?tab=${value}`)
        }}
      >
        <TabsList className="mb-3">
          {TABS.map((entry) => (
            <TabsTrigger key={entry} value={entry}>
              {t(`country.tab.${entry}` as 'country.tab.overview')}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-3">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              label={t('country.kpi.assessments')}
              value={totals ? String(totals.readinessRuns) : '—'}
              hint={
                totals
                  ? `${totals.readinessComplete} ${t('country.syntheses.status.complete').toLowerCase()} · ${totals.readinessFailed} ${t('country.syntheses.status.failed').toLowerCase()}`
                  : undefined
              }
            />
            <Kpi
              label={t('country.kpi.average')}
              value={totals ? score(totals.readinessAverage, t('country.kpi.noScore')) : '—'}
              hint={t('country.syntheses.score')}
            />
            <Kpi
              label={t('country.kpi.scenarios')}
              value={totals ? String(totals.scenarioRuns) : '—'}
              hint={
                totals
                  ? `${totals.scenarioComplete} ${t('country.syntheses.status.complete').toLowerCase()} · ${totals.scenarioRunning} ${t('country.kpi.running')}`
                  : undefined
              }
            />
            <Kpi
              label={t('country.kpi.corpus')}
              value={totals ? totals.knowledgeChunks.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB') : '—'}
              hint={
                totals?.lastRunAt
                  ? `${t('country.overview.lastRun')}: ${new Date(totals.lastRunAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')}`
                  : t('country.overview.never')
              }
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-[12px]">
                  <Globe2 className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
                  {t('country.overview.identity')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-3">
                  {[
                    [t('country.meta.jurisdiction'), t(`countries.jurisdiction.${country.jurisdiction}` as 'countries.jurisdiction.national')],
                    [t('country.meta.region'), country.region || '—'],
                    [t('country.meta.authority'), country.authority || '—'],
                    [t('country.meta.currency'), country.currency || '—'],
                    [t('country.meta.timezone'), country.timezone || '—'],
                    [t('country.meta.languages'), country.languages.length ? country.languages.join(', ') : '—'],
                    [t('country.meta.created'), new Date(country.createdAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')],
                    [t('country.meta.updated'), new Date(country.updatedAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')],
                    [t('countries.field.status'), country.status === 'active' ? t('countries.status.active') : t('countries.status.planned')],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                      <dd className="truncate text-foreground">{value}</dd>
                    </div>
                  ))}
                </dl>
                {country.notes && (
                  <p className="mt-3 rounded-lg border border-border bg-secondary/40 p-2 text-[10px] text-muted-foreground">
                    {country.notes}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[12px]">{t('country.overview.sectors')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {country.sectors.map((sector) => (
                  <span
                    key={sector}
                    className="rounded-full border border-brand-primary/30 bg-brand-primary/10 px-2 py-0.5 text-[10px] text-brand-primary-dark dark:text-brand-primary-light"
                  >
                    {sectorLabel(t, sector)}
                  </span>
                ))}
                <Link
                  href={`/countries/${country.code}?tab=sectors`}
                  className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary"
                >
                  {t('country.tab.sectors')}
                </Link>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[12px]">{t('country.overview.shortcuts')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { href: '/readiness', icon: Gauge, label: t('country.shortcut.readiness') },
                { href: '/scenarios', icon: Network, label: t('country.shortcut.scenarios') },
                { href: '/knowledge', icon: Database, label: t('country.shortcut.knowledge') },
                { href: '/communications', icon: Megaphone, label: t('country.shortcut.notify') },
              ].map(({ href, icon: Icon, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-2 rounded-lg border border-border p-2 text-[11px] text-foreground transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 text-brand-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sectors ──────────────────────────────────────────────────────── */}
        <TabsContent value="sectors" className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[12px]">{t('country.sectors.title')}</CardTitle>
              <p className="text-[10px] text-muted-foreground">{t('country.sectors.hint')}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {sectorRows.map((row) => {
                  const checked = selectedSectors.includes(row.sector)
                  return (
                    <button
                      key={row.sector}
                      type="button"
                      onClick={() => toggleSector(row.sector)}
                      className={cn(
                        'flex min-w-0 items-start gap-2 rounded-lg border p-2 text-left transition-colors',
                        checked
                          ? 'border-brand-primary/40 bg-brand-primary/5'
                          : 'border-border hover:bg-secondary/50',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                          checked ? 'border-brand-primary bg-brand-primary text-white' : 'border-border',
                        )}
                      >
                        {checked && <Check className="h-3 w-3" aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] font-medium text-foreground">{sectorLabel(t, row.sector)}</span>
                          <span className="shrink-0 text-[9px] text-muted-foreground">
                            {checked ? t('country.sectors.enabled') : t('country.sectors.disabled')}
                          </span>
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
                          <span>{t('country.sectors.assessments', { count: row.readinessRuns })}</span>
                          <span>{t('country.sectors.scenarios', { count: row.scenarioRuns })}</span>
                          {row.averageComposite !== null && (
                            <span>{t('country.sectors.average', { score: score(row.averageComposite) })}</span>
                          )}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border pt-2">
                <p className="text-[10px] text-muted-foreground">{t('country.sectors.min')}</p>
                <Button size="sm" onClick={() => void saveSectors()} disabled={!sectorsDirty || savingSectors} className="gap-1.5">
                  {savingSectors ? (
                    <Loader className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {t('country.sectors.save')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Syntheses ────────────────────────────────────────────────────── */}
        <TabsContent value="syntheses" className="space-y-3">
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-2 pb-2">
              <div className="min-w-0">
                <CardTitle className="text-[12px]">{t('country.syntheses.title')}</CardTitle>
                <p className="text-[10px] text-muted-foreground">{t('country.syntheses.hint')}</p>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => router.push('/readiness')}>
                <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
                {t('country.syntheses.runNew')}
              </Button>
            </CardHeader>
            <CardContent>
              {runs === null ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-9 w-full" />
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-muted-foreground">{t('country.syntheses.empty')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {runs.map((run) => (
                    <li key={run.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-foreground">
                          {sectorLabel(t, run.domain as Domain)}
                        </span>
                        <span className="block text-[9px] text-muted-foreground">
                          {new Date(run.createdAt).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[12px] text-foreground">{score(run.composite)}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[9px]',
                          run.status === 'failed'
                            ? 'bg-rose-500/10 text-rose-500'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {run.status === 'failed'
                          ? t('country.syntheses.status.failed')
                          : t('country.syntheses.status.complete')}
                      </span>
                      <Link
                        href={`/readiness/${run.id}`}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-brand-primary hover:bg-brand-primary/10"
                      >
                        {t('country.syntheses.open')}
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Insights ─────────────────────────────────────────────────────── */}
        <TabsContent value="insights" className="space-y-3">
          {noData && (
            <Card>
              <CardContent className="py-3 text-[10px] text-muted-foreground">{t('country.insights.empty')}</CardContent>
            </Card>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <ChartFrame
              title={t('country.insights.readinessBySector')}
              hint={t('country.insights.hint')}
              empty={sectorData.length === 0}
              emptyLabel={t('country.insights.empty')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={AXIS} stroke="var(--muted-foreground)" interval={0} />
                  <YAxis allowDecimals={false} tick={AXIS} stroke="var(--muted-foreground)" />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="runs" name={t('country.insights.runs')} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>

            <ChartFrame
              title={t('country.insights.scoreBySector')}
              empty={sectorData.length === 0}
              emptyLabel={t('country.insights.empty')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={AXIS} stroke="var(--muted-foreground)" interval={0} />
                  <YAxis domain={[0, 5]} tick={AXIS} stroke="var(--muted-foreground)" />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="score" name={t('country.insights.average')} fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>

            <ChartFrame
              title={t('country.insights.trend')}
              empty={trendData.length === 0}
              emptyLabel={t('country.insights.empty')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={AXIS} stroke="var(--muted-foreground)" interval={2} />
                  <YAxis yAxisId="runs" allowDecimals={false} tick={AXIS} stroke="var(--muted-foreground)" />
                  <YAxis yAxisId="score" orientation="right" domain={[0, 5]} tick={AXIS} stroke="var(--muted-foreground)" width={28} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar yAxisId="runs" dataKey="runs" name={t('country.insights.runs')} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                  <Line
                    yAxisId="score"
                    type="monotone"
                    dataKey="score"
                    name={t('country.insights.score')}
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartFrame>

            <ChartFrame
              title={t('country.insights.scenariosBySector')}
              empty={sectorData.length === 0}
              emptyLabel={t('country.insights.empty')}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={AXIS} stroke="var(--muted-foreground)" interval={0} />
                  <YAxis allowDecimals={false} tick={AXIS} stroke="var(--muted-foreground)" />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="scenarios" name={t('country.insights.scenarios')} fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </div>
        </TabsContent>
      </Tabs>

      <CountryDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        country={country}
        onSaved={(next) => {
          setCountry(next)
          setSelectedSectors(next.sectors)
          toast.success(t('countries.updated'), locale === 'fr' ? next.nameFr : next.name)
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(next) => !next && setDeleteOpen(false)}
        onConfirm={confirmDelete}
        title={t('countries.deleteTitle')}
        description={deleteProblem ?? t('countries.deleteBody', { name })}
        confirmText={t('country.delete')}
      />
    </>
  )
}
