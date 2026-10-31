'use client'

/**
 * Observability: what the engine spent, per operator and (for an admin) across
 * the whole institution. Totals, a daily chart, four breakdowns and the latest
 * calls all come from the token ledger.
 *
 * Scope is enforced by the API: an operator always sees their own rows, an
 * admin sees everyone and can narrow to one operator. A model with no published
 * tariff is never shown as free: its calls are counted apart.
 */

import * as React from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  Coins,
  Cpu,
  Gauge,
  Layers,
  Loader,
  RefreshCw,
  Route as RouteIcon,
  TrendingUp,
  Users,
} from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AnimatedTabsList,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTablePagination,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  type TabItem,
} from '@sps/ui'
import {
  observabilityApi,
  type ObservabilityForecastDto,
  type ObservabilitySummaryDto,
  type UsageKindDto,
  type UsageRequestDto,
  type UsageRowDto,
  type UsageStatusDto,
  type UsageUnitDto,
} from '@/lib/api'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import { PageIntro } from '@/components/page-intro'

/** The API caps a page at 500 records; the table pages through them locally. */
const FETCH_SIZE = 500
/** The forecast fits its trend on two weeks of history, whatever the KPI window. */
const FORECAST_DAYS = 14

const AXIS = { fontSize: 10, fill: 'var(--muted-foreground)' }
const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }

const KIND_LABEL: Record<UsageKindDto, MessageKey> = {
  chat: 'observability.kind.chat',
  retrieval: 'observability.kind.retrieval',
  image: 'observability.kind.image',
  voice: 'observability.kind.voice',
  sam: 'observability.kind.sam',
}

/** Each capability counts in one unit: a kind row can label its volume directly. */
const KIND_UNIT: Record<UsageKindDto, UsageUnitDto> = {
  chat: 'token',
  retrieval: 'token',
  image: 'image',
  voice: 'second',
  sam: 'call',
}

const UNIT_LABEL: Record<'image' | 'second' | 'call', MessageKey> = {
  image: 'observability.unit.image',
  second: 'observability.unit.second',
  call: 'observability.unit.call',
}

type Bucket = 'model' | 'route' | 'kind' | 'agent' | 'operator'

function formatTime(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/** Costs are small here: never round a real spend down to $0.00. */
function formatCost(value: number, locale: string): string {
  if (value > 0 && value < 0.01) return `$${value.toFixed(5)}`
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatTokens(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  warning,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
  warning?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary-dark dark:text-brand-primary-light">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="truncate font-display text-lg font-bold tabular-nums">{value}</p>
          {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
          {warning && (
            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="truncate">{warning}</span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ObservabilityPage() {
  const { t, locale } = useI18n()
  const { operator } = useAuth()
  const isAdmin = operator?.role === 'admin'

  const [days, setDays] = React.useState<7 | 30>(7)
  const [scope, setScope] = React.useState('')
  const [status, setStatus] = React.useState<'' | UsageStatusDto>('')
  const [summary, setSummary] = React.useState<ObservabilitySummaryDto | null>(null)
  const [forecast, setForecast] = React.useState<ObservabilityForecastDto | null>(null)
  const [requests, setRequests] = React.useState<UsageRequestDto[]>([])
  const [total, setTotal] = React.useState(0)
  const [operatorNames, setOperatorNames] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [unreachable, setUnreachable] = React.useState(false)
  const [bucket, setBucket] = React.useState<Bucket>('model')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  const load = React.useCallback(async () => {
    setLoading(true)
    setUnreachable(false)
    const to = new Date()
    const from = new Date(to.getTime() - days * 86_400_000)
    const history = new Date(to.getTime() - FORECAST_DAYS * 86_400_000)
    try {
      const [next, pageOfCalls, prediction] = await Promise.all([
        observabilityApi.summary({ from, to, ...(scope ? { operator: scope } : {}) }),
        observabilityApi.requests({
          from,
          to,
          ...(scope ? { operator: scope } : {}),
          ...(status ? { status } : {}),
          limit: FETCH_SIZE,
        }),
        observabilityApi.forecast({ from: history, to, ...(scope ? { operator: scope } : {}) }),
      ])
      setSummary(next)
      setForecast(prediction)
      setRequests(pageOfCalls.requests)
      setTotal(pageOfCalls.total)
      // Keep the last known names: a single-operator view no longer lists them.
      if (next.operators.length > 0) setOperatorNames(next.operators.map((row) => row.key))
    } catch {
      setUnreachable(true)
    } finally {
      setLoading(false)
    }
  }, [days, scope, status])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    setPage(1)
  }, [days, scope, status, pageSize])

  const tabs: TabItem[] = React.useMemo(() => {
    const items: TabItem[] = [
      { id: 'model', label: t('observability.byModel'), icon: Cpu },
      { id: 'route', label: t('observability.byRoute'), icon: RouteIcon },
      { id: 'kind', label: t('observability.byKind'), icon: Layers },
      { id: 'agent', label: t('observability.byAgent'), icon: Bot },
    ]
    if (isAdmin) items.push({ id: 'operator', label: t('observability.byOperator'), icon: Users })
    return items
  }, [isAdmin, t])

  const rows: UsageRowDto[] = !summary
    ? []
    : bucket === 'model'
      ? summary.byModel
      : bucket === 'route'
        ? summary.byRoute
        : bucket === 'kind'
          ? summary.byKind
          : bucket === 'agent'
            ? summary.byAgent
            : summary.operators

  const totals = summary?.totals
  const allUnpriced = Boolean(totals && totals.requests > 0 && totals.unpriced === totals.requests)
  const errorRate = totals && totals.requests > 0 ? (totals.errors / totals.requests) * 100 : 0
  const totalPages = Math.max(1, Math.ceil(requests.length / pageSize))
  const current = Math.min(page, totalPages)
  const visible = requests.slice((current - 1) * pageSize, current * pageSize)

  const series = (summary?.series ?? []).map((point) => ({
    date: point.date.slice(5),
    calls: point.requests,
    errors: point.errors,
    cost: Number(point.costUsd.toFixed(6)),
  }))

  const operatorOptions = React.useMemo(() => {
    const names = scope && !operatorNames.includes(scope) ? [...operatorNames, scope] : operatorNames
    return [
      { value: '', label: t('observability.allOperators') },
      ...names.map((name) => ({ value: name, label: name })),
    ]
  }, [operatorNames, scope, t])

  return (
    <>
      <PageIntro title={t('observability.title')} subtitle={t('observability.pageSubtitle')}>
        <div className="flex items-center rounded-lg border border-border p-0.5" role="group" aria-label={t('observability.range')}>
          {([7, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] transition-colors',
                days === value
                  ? 'bg-brand-primary/10 font-medium text-brand-primary-dark dark:text-brand-primary-light'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t(value === 7 ? 'observability.range7' : 'observability.range30')}
            </button>
          ))}
        </div>
        {isAdmin && (
          <Select
            value={scope}
            onValueChange={setScope}
            options={operatorOptions}
            ariaLabel={t('observability.operator')}
            size="sm"
            className="w-48"
          />
        )}
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as '' | UsageStatusDto)}
          options={[
            { value: '', label: t('observability.allStatuses') },
            { value: 'ok', label: t('observability.status.ok') },
            { value: 'error', label: t('observability.status.error') },
          ]}
          ariaLabel={t('observability.status')}
          size="sm"
          className="w-40"
        />
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{t('observability.refresh')}</span>
        </Button>
      </PageIntro>

      {unreachable && (
        <Card>
          <CardContent className="flex items-center gap-2 p-4 text-xs text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t('observability.unavailable')}
          </CardContent>
        </Card>
      )}

      {!unreachable && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={summary?.scope === 'all' ? 'brand' : 'neutral'}>
              {summary?.scope === 'all' ? t('observability.scopeAll') : scope || t('observability.scopeSelf')}
            </Badge>
            <span className="ml-auto text-[10px] text-muted-foreground">{t('observability.retention')}</span>
          </div>

          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {loading && !summary ? (
              Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[76px] w-full" />)
            ) : (
              <>
                <Kpi
                  icon={Coins}
                  label={t('observability.cost')}
                  value={allUnpriced ? '—' : formatCost(totals?.costUsd ?? 0, locale)}
                  hint={allUnpriced ? t('observability.costPartial') : t('observability.costHint')}
                  warning={
                    totals && totals.unpriced > 0
                      ? t('observability.unpriced', { count: totals.unpriced })
                      : undefined
                  }
                />
                <Kpi
                  icon={Layers}
                  label={t('observability.tokens')}
                  value={formatTokens((totals?.inputTokens ?? 0) + (totals?.outputTokens ?? 0), locale)}
                  hint={t('observability.tokensBreakdown', {
                    input: formatTokens(totals?.inputTokens ?? 0, locale),
                    output: formatTokens(totals?.outputTokens ?? 0, locale),
                  })}
                />
                <Kpi
                  icon={Activity}
                  label={t('observability.requests')}
                  value={String(totals?.requests ?? 0)}
                  hint={
                    totals && totals.requests > 0
                      ? `${errorRate.toFixed(1)}% · ${
                          totals.errors > 0 ? t('observability.errors', { count: totals.errors }) : t('observability.noError')
                        }`
                      : t('observability.empty')
                  }
                />
                <Kpi
                  icon={Gauge}
                  label={t('observability.latency')}
                  value={
                    summary?.latency.p95Ms === null || summary?.latency.p95Ms === undefined
                      ? t('observability.noLatency')
                      : `${summary.latency.p95Ms} ms`
                  }
                  hint={
                    summary?.latency.p50Ms !== null && summary?.latency.p50Ms !== undefined
                      ? t('observability.p50', { ms: summary.latency.p50Ms })
                      : t('observability.noLatency')
                  }
                />
              </>
            )}
          </section>

          {summary && summary.totals.requests === 0 && (
            <Card>
              <CardContent className="flex flex-col gap-1 p-4">
                <p className="text-xs font-medium">{t('observability.empty')}</p>
                <p className="text-[11px] text-muted-foreground">{t('observability.emptyHint')}</p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="flex flex-wrap items-center gap-4 p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary-dark dark:text-brand-primary-light">
                <TrendingUp className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t('observability.forecast.title', { days: forecast?.horizonDays ?? 7 })}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {!forecast || !forecast.enoughData
                    ? t('observability.forecast.insufficient')
                    : t('observability.forecast.basis', { days: forecast.days })}
                </p>
                {forecast?.enoughData && forecast.unpriced > 0 && (
                  <p className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">{t('observability.forecast.unpriced', { count: forecast.unpriced })}</span>
                  </p>
                )}
              </div>
              <div className="ml-auto flex items-end gap-6">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('observability.forecast.calls')}</p>
                  <p className="font-display text-lg font-bold tabular-nums">
                    {typeof forecast?.projectedCalls === 'number' ? forecast.projectedCalls : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{t('observability.forecast.cost')}</p>
                  <p className="font-display text-lg font-bold tabular-nums">
                    {typeof forecast?.projectedCostUsd === 'number' ? (
                      formatCost(forecast.projectedCostUsd, locale)
                    ) : forecast?.enoughData ? (
                      <span className="text-[10px] font-normal text-muted-foreground">{t('observability.unknownTariff')}</span>
                    ) : (
                      '—'
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="h-auto flex-row items-center gap-2 py-2">
              <Activity className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
              <CardTitle>{t('observability.chart')}</CardTitle>
            </CardHeader>
            <CardContent className="h-[220px] p-2 pt-0">
              {loading && !summary ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="date" tick={AXIS} stroke="var(--muted-foreground)" interval="preserveStartEnd" />
                    <YAxis yAxisId="calls" allowDecimals={false} tick={AXIS} stroke="var(--muted-foreground)" />
                    <YAxis yAxisId="cost" orientation="right" tick={AXIS} stroke="var(--muted-foreground)" width={44} />
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar yAxisId="calls" dataKey="calls" name={t('observability.chartCalls')} fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                    <Line
                      yAxisId="cost"
                      type="monotone"
                      dataKey="cost"
                      name={t('observability.chartCost')}
                      stroke="var(--chart-3)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="h-auto flex-wrap gap-2 py-2">
              <CardTitle>{t('observability.breakdown')}</CardTitle>
              <AnimatedTabsList
                items={tabs}
                value={bucket}
                onValueChange={(value) => setBucket(value as Bucket)}
                dense
                maxWidth="max-w-xl"
                className="ml-auto"
              />
            </CardHeader>
            <CardContent className="p-0">
              {rows.length === 0 ? (
                <p className="px-4 py-8 text-xs text-muted-foreground">{t('observability.empty')}</p>
              ) : (
                <div className="custom-scrollbar overflow-x-auto">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow className="border-b border-slate-200 hover:bg-transparent dark:border-brand-primary-dark/30">
                        <TableHead>{t('observability.key')}</TableHead>
                        <TableHead className="text-right">{t('observability.chartCalls')}</TableHead>
                        <TableHead className="text-right">{t('observability.volume')}</TableHead>
                        <TableHead className="text-right">{t('observability.costColumn')}</TableHead>
                        <TableHead className="text-right">{t('observability.share')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const share = totals && totals.requests > 0 ? (row.requests / totals.requests) * 100 : 0
                        const unit = bucket === 'kind' ? KIND_UNIT[row.key as UsageKindDto] : 'token'
                        return (
                          <TableRow key={row.key}>
                            <TableCell className="max-w-[260px] truncate font-medium">
                              {bucket === 'kind' ? t(KIND_LABEL[row.key as UsageKindDto] ?? 'observability.byKind') : row.key}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.requests}
                              {row.errors > 0 && (
                                <span className="ml-1 text-[10px] text-destructive">({row.errors})</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {unit === 'token' ? (
                                formatTokens(row.inputTokens + row.outputTokens, locale)
                              ) : (
                                <>
                                  {formatTokens(row.units, locale)}{' '}
                                  <span className="text-[10px] text-muted-foreground">{t(UNIT_LABEL[unit])}</span>
                                </>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.requests > 0 && row.unpriced === row.requests ? (
                                <span className="text-[10px] text-muted-foreground">{t('observability.unknownTariff')}</span>
                              ) : (
                                formatCost(row.costUsd, locale)
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="ml-auto flex w-24 items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full rounded-full bg-brand-primary" style={{ width: `${Math.min(100, share)}%` }} />
                                </div>
                                <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">
                                  {share.toFixed(0)}%
                                </span>
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

          <Card>
            <CardHeader className="h-auto flex-row items-center gap-2 py-2">
              <CardTitle>{t('observability.recent')}</CardTitle>
              <span className="ml-auto text-[10px] text-muted-foreground">
                {t('observability.showing', { shown: requests.length, total })}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              {requests.length === 0 ? (
                <p className="px-4 py-8 text-xs text-muted-foreground">
                  {loading ? t('observability.loading') : t('observability.empty')}
                </p>
              ) : (
                <>
                  <div className="custom-scrollbar overflow-x-auto">
                    <Table className="min-w-[920px]">
                      <TableHeader>
                        <TableRow className="border-b border-slate-200 hover:bg-transparent dark:border-brand-primary-dark/30">
                          <TableHead>{t('observability.time')}</TableHead>
                          {isAdmin && <TableHead>{t('observability.operator')}</TableHead>}
                          <TableHead>{t('observability.byModel')}</TableHead>
                          <TableHead>{t('observability.byKind')}</TableHead>
                          <TableHead>{t('observability.byAgent')}</TableHead>
                          <TableHead>{t('observability.status')}</TableHead>
                          <TableHead className="text-right">{t('observability.latencyColumn')}</TableHead>
                          <TableHead className="text-right">{t('observability.volume')}</TableHead>
                          <TableHead className="text-right">{t('observability.costColumn')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((row, index) => (
                          <TableRow key={`${row.ts}-${row.runId ?? ''}-${index}`}>
                            <TableCell className="whitespace-nowrap text-muted-foreground">
                              {formatTime(row.ts, locale)}
                            </TableCell>
                            {isAdmin && (
                              <TableCell className="max-w-[180px] truncate">{row.operator ?? 'n/a'}</TableCell>
                            )}
                            <TableCell className="max-w-[180px] truncate font-medium">{row.model}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {t(KIND_LABEL[row.kind] ?? 'observability.byKind')}
                            </TableCell>
                            <TableCell className="max-w-[160px] truncate text-muted-foreground">
                              {row.agentId ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge tone={row.status === 'error' ? 'danger' : 'success'}>
                                {t(row.status === 'error' ? 'observability.status.error' : 'observability.status.ok')}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {typeof row.latencyMs === 'number' ? `${row.latencyMs} ms` : t('observability.noLatency')}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.unit && row.unit !== 'token' && typeof row.units === 'number' ? (
                                <>
                                  {formatTokens(row.units, locale)}{' '}
                                  <span className="text-[10px] text-muted-foreground">{t(UNIT_LABEL[row.unit])}</span>
                                </>
                              ) : (
                                formatTokens(row.inputTokens + row.outputTokens, locale)
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.costUsd === null ? (
                                <span className="text-[10px] text-muted-foreground">{t('observability.unknownTariff')}</span>
                              ) : row.costUsd === 0 ? (
                                <span className="text-[10px] text-muted-foreground">{t('observability.localFree')}</span>
                              ) : (
                                formatCost(row.costUsd, locale)
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <DataTablePagination
                    currentPage={current}
                    totalPages={totalPages}
                    totalItems={requests.length}
                    itemsPerPage={pageSize}
                    onPageChange={setPage}
                    onItemsPerPageChange={setPageSize}
                    labels={{
                      rowsPerPage: t('table.rowsPerPage'),
                      range: (from, to, count) => t('table.range', { from, to, total: count }),
                      page: (currentPage, totalPageCount) =>
                        t('table.page', { current: currentPage, total: totalPageCount }),
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
