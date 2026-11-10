'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarClock,
  CircleDashed,
  CircleSlash2,
  Map as MapIcon,
  RefreshCw,
  Scale,
  Settings2,
  ShieldCheck,
  Swords,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { Domain } from '@sps/shared'
import { maturityColor } from '@sps/theme'
import {
  Badge,
  Button,
  Select,
  Skeleton,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@sps/ui'
import { worldApi, type WorldScopeDto, type WorldStateDto, type WorldSummaryDto, type WorldSummaryEntryDto } from '@/lib/api'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { useWorkspace } from '@/lib/workspace'
import { PageIntro } from '@/components/page-intro'
import { CountryFlag } from '@/components/country-flag'

/** The defaults of `docs/world-mode/docs/05-readiness-aggregation.md`, §2. */
const DISPLAY_RULES = { dimensions: 13, minCoverage: 0.4, minConfidence: 0.4, staleAfterDays: 90 } as const

const SECTORS: readonly Domain[] = ['health', 'education', 'telecom', 'public_services', 'agriculture']

type WorldTab = 'table' | 'map' | 'battle' | 'watch' | 'settings'

const STATE_META: Record<
  WorldStateDto,
  { icon: LucideIcon; tone: 'neutral' | 'warning' | 'danger' | 'success'; label: MessageKey; hint: MessageKey }
> = {
  'not-assessed': {
    icon: CircleDashed,
    tone: 'neutral',
    label: 'world.state.not-assessed',
    hint: 'world.state.hint.not-assessed',
  },
  'no-grounded-data': {
    icon: CircleSlash2,
    tone: 'warning',
    label: 'world.state.no-grounded-data',
    hint: 'world.state.hint.no-grounded-data',
  },
  'low-confidence': {
    icon: TriangleAlert,
    tone: 'warning',
    label: 'world.state.low-confidence',
    hint: 'world.state.hint.low-confidence',
  },
  ok: {
    icon: ShieldCheck,
    tone: 'success',
    label: 'world.state.ok',
    hint: 'world.state.hint.ok',
  },
}

export function WorldView() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const { countries, domain } = useWorkspace()

  const [tab, setTab] = React.useState<WorldTab>('table')
  const [sector, setSector] = React.useState<Domain | 'all'>(domain)
  const [scope, setScope] = React.useState<WorldScopeDto>('mine')
  const [summary, setSummary] = React.useState<WorldSummaryDto | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const requestId = React.useRef(0)

  const load = React.useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const result = await worldApi.summary({ sector, scope })
      if (id !== requestId.current) return
      setSummary(result)
      setProblem(null)
    } catch (cause) {
      if (id !== requestId.current) return
      setProblem(cause instanceof Error ? cause.message : String(cause))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [sector, scope])

  React.useEffect(() => {
    void load()
  }, [load])

  const dateFormat = React.useMemo(
    () => new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium' }),
    [locale],
  )
  const timeFormat = React.useMemo(
    () => new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { timeStyle: 'short' }),
    [locale],
  )
  const percent = React.useMemo(
    () =>
      new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
        style: 'percent',
        maximumFractionDigits: 0,
      }),
    [locale],
  )

  const names = React.useMemo(
    () => new Map(countries.map((country) => [country.code.toLowerCase(), locale === 'fr' ? country.nameFr : country.name])),
    [countries, locale],
  )
  const nameOf = (code: string) => names.get(code) ?? code.toUpperCase()

  const entries = summary?.countries ?? []
  const noCompleteRun = entries.length > 0 && entries.every((entry) => entry.runs === 0)

  const sectorOptions = React.useMemo(
    () => [
      { value: 'all', label: t('world.sector.all' as MessageKey) },
      ...SECTORS.map((value) => ({
        value,
        label: t(`domain.${value}` as MessageKey),
      })),
    ],
    [t],
  )

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as WorldTab)}>
      <PageIntro title={t('world.title')} subtitle={t('world.subtitle')}>
        <Select
          ariaLabel={t('world.scope.label')}
          value={scope}
          onValueChange={(value) => setScope(value as WorldScopeDto)}
          options={[
            { value: 'mine', label: t('world.scope.mine') },
            { value: 'shared', label: t('world.scope.shared') },
          ]}
        />
        <Select
          ariaLabel={t('world.sector.label')}
          value={sector}
          onValueChange={(value) => setSector(value as Domain | 'all')}
          options={sectorOptions}
        />
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
          {t('world.refresh')}
        </Button>
      </PageIntro>

      <TabsList className="mb-3">
        <TabsTrigger value="table">{t('world.tab.table')}</TabsTrigger>
        <TabsTrigger value="map">{t('world.tab.map')}</TabsTrigger>
        <TabsTrigger value="battle">{t('world.tab.battle')}</TabsTrigger>
        <TabsTrigger value="watch">{t('world.tab.watch')}</TabsTrigger>
        <TabsTrigger value="settings">{t('world.tab.settings')}</TabsTrigger>
      </TabsList>

      <TabsContent value="table" className="space-y-3">
        {scope === 'shared' && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-3 py-2">
            <Badge tone="brand" className="text-[10px]">
              {t('world.shared.badge')}
            </Badge>
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{t('world.shared.note')}</p>
          </div>
        )}

        {noCompleteRun && (
          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary">
              <MapIcon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-foreground">{t('world.empty.title')}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t('world.empty.body')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => router.push('/readiness')}>
              {t('world.empty.action')}
            </Button>
          </div>
        )}

        {problem && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {t('world.error')} {problem}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void load()}>
              {t('world.retry')}
            </Button>
          </div>
        )}

        {!summary ? (
          <div className="border border-border" aria-busy="true" aria-label={t('world.loading')}>
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          </div>
        ) : (
          <WorldTable
            entries={entries}
            nameOf={nameOf}
            dateFormat={dateFormat}
            percent={percent}
            busy={loading}
            emptyLabel={t('world.table.empty')}
          />
        )}

        <div className="space-y-1 border-t border-border pt-2 text-[10px] text-muted-foreground">
          {summary && (
            <p>
              {t('world.updated', { time: timeFormat.format(new Date(summary.generatedAt)) })} · v
              {summary.schemaVersion} · framework {summary.frameworkVersion}
            </p>
          )}
          <p>{t('world.footnote', { dimensions: DISPLAY_RULES.dimensions })}</p>
          <p>
            {t('world.thresholds', {
              coverage: percent.format(DISPLAY_RULES.minCoverage),
              confidence: percent.format(DISPLAY_RULES.minConfidence),
              days: DISPLAY_RULES.staleAfterDays,
            })}
          </p>
        </div>
      </TabsContent>

      <TabsContent value="map">
        <Placeholder icon={MapIcon} title={t('world.placeholder.map.title')} body={t('world.placeholder.map.body')} />
      </TabsContent>
      <TabsContent value="battle">
        <Placeholder
          icon={Swords}
          title={t('world.placeholder.battle.title')}
          body={t('world.placeholder.battle.body')}
        />
      </TabsContent>
      <TabsContent value="watch">
        <Placeholder icon={Scale} title={t('world.placeholder.watch.title')} body={t('world.placeholder.watch.body')} />
      </TabsContent>
      <TabsContent value="settings">
        <Placeholder
          icon={Settings2}
          title={t('world.placeholder.settings.title')}
          body={t('world.placeholder.settings.body')}
        />
      </TabsContent>
    </Tabs>
  )
}

function WorldTable({
  entries,
  nameOf,
  dateFormat,
  percent,
  busy,
  emptyLabel,
}: {
  entries: WorldSummaryEntryDto[]
  nameOf: (code: string) => string
  dateFormat: Intl.DateTimeFormat
  percent: Intl.NumberFormat
  busy: boolean
  emptyLabel: string
}) {
  const { t } = useI18n()

  if (entries.length === 0) {
    return (
      <div className="border border-border px-4 py-12 text-center">
        <p className="text-[12px] text-muted-foreground">{emptyLabel}</p>
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto border border-border" aria-busy={busy || undefined}>
        <Table className="min-w-[46rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t('world.table.country')}</TableHead>
              <TableHead>{t('world.table.state')}</TableHead>
              <TableHead>{t('world.table.composite')}</TableHead>
              <TableHead>{t('world.table.coverage')}</TableHead>
              <TableHead>{t('world.table.confidence')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('world.table.lastRun')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('world.table.runs')}</TableHead>
              <TableHead className="hidden xl:table-cell">{t('world.table.registry')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const meta = STATE_META[entry.state]
              const StateIcon = meta.icon
              return (
                <TableRow key={entry.code}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CountryFlag code={entry.code} />
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium text-foreground">{nameOf(entry.code)}</span>
                        <span className="block font-mono text-[9px] uppercase text-muted-foreground">{entry.code}</span>
                      </span>
                    </div>
                  </TableCell>

                  <TableCell>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge tone={meta.tone} className="text-[9px]">
                          <StateIcon className="h-3 w-3" aria-hidden="true" />
                          {t(meta.label)}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-64 text-[11px]">
                        {t(meta.hint)}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>

                  <TableCell>
                    <ScoreCell entry={entry} />
                  </TableCell>

                  <TableCell className="text-[11px] tabular-nums">
                    {entry.coverage === null ? '—' : percent.format(entry.coverage)}
                  </TableCell>
                  <TableCell className="text-[11px] tabular-nums">
                    {entry.confidence === null ? '—' : percent.format(entry.confidence)}
                  </TableCell>

                  <TableCell className="hidden sm:table-cell">
                    {entry.lastRunAt === null ? (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-muted-foreground">
                          {dateFormat.format(new Date(entry.lastRunAt))}
                        </span>
                        {entry.stale && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge tone="warning" className="w-fit text-[9px]">
                                <CalendarClock className="h-3 w-3" aria-hidden="true" />
                                {t('world.stale')}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-[11px]">
                              {t('world.stale.hint', { days: DISPLAY_RULES.staleAfterDays })}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="hidden text-[11px] tabular-nums text-muted-foreground lg:table-cell">
                    {entry.runs}
                  </TableCell>

                  <TableCell className="hidden xl:table-cell">
                    <div className="flex flex-col gap-1">
                      <Badge
                        tone={entry.registryStatus === 'active' ? 'brand' : 'neutral'}
                        className="w-fit text-[9px]"
                      >
                        {t(
                          entry.registryStatus === 'active'
                            ? 'world.registry.active'
                            : entry.registryStatus === 'planned'
                              ? 'world.registry.planned'
                              : 'world.registry.unregistered',
                        )}
                      </Badge>
                      <span className="text-[9px] text-muted-foreground">
                        {t('world.sectors.count', {
                          count: entry.sectors.length,
                          total: SECTORS.length,
                        })}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}

/** A composite always sits beside its band colour; a missing one stays a dash. */
function ScoreCell({ entry }: { entry: WorldSummaryEntryDto }) {
  if (entry.composite === null) return <span className="text-[11px] text-muted-foreground">—</span>
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: maturityColor(entry.composite) }}
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold tabular-nums text-foreground">
          {entry.composite.toFixed(2)}
        </span>
        {entry.band && <span className="block truncate text-[9px] text-muted-foreground">{entry.band}</span>}
      </span>
    </div>
  )
}

function Placeholder({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-border px-4 py-6">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary/70 text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-2xl text-[11px] text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
