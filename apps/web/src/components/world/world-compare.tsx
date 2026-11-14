'use client'

/**
 * Comparative tests: the same World read model, read side by side.
 *
 * The tab reads the summary already loaded by the page — no second request — so
 * changing a column or the sector filter never waits on the network. Only a
 * grounded composite (`state === 'ok'`) is marked as a leader: comparing a
 * missing or ungrounded value would reward the country that published least.
 */

import * as React from 'react'
import { Crown, Swords, TriangleAlert } from 'lucide-react'
import type { Domain } from '@sps/shared'
import { maturityColor } from '@sps/theme'
import {
  Badge,
  Button,
  MultiSelect,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@sps/ui'
import type { WorldStateDto, WorldSummaryEntryDto } from '@/lib/api'
import { useI18n, type MessageKey } from '@/lib/i18n'
import { CountryFlag } from '@/components/country-flag'
import { SECTORS, STATE_META } from './world-model'

export function WorldCompare({
  entries,
  sector,
  nameOf,
  dateFormat,
  percent,
  maxCountries,
  loading,
  problem,
  onRetry,
  onOpenReadiness,
}: {
  entries: WorldSummaryEntryDto[]
  sector: Domain | 'all'
  nameOf: (code: string) => string
  dateFormat: Intl.DateTimeFormat
  percent: Intl.NumberFormat
  maxCountries: number
  loading: boolean
  problem: string | null
  onRetry: () => void
  onOpenReadiness: () => void
}) {
  const { t } = useI18n()
  const withData = React.useMemo(() => entries.filter((entry) => entry.runs > 0), [entries])
  const [selected, setSelected] = React.useState<string[]>([])

  // Default columns: the best grounded composites, three at most. A country
  // that leaves the scope is dropped; when fewer than two remain, reseed.
  React.useEffect(() => {
    setSelected((current) => {
      const available = new Set(entries.map((entry) => entry.code))
      const kept = current.filter((code) => available.has(code)).slice(0, maxCountries)
      if (kept.length >= 2) return kept.length === current.length ? current : kept
      const best = [...withData]
        .sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1))
        .slice(0, Math.min(3, maxCountries))
        .map((entry) => entry.code)
      return best.length >= 2 ? best : entries.slice(0, Math.min(2, entries.length)).map((entry) => entry.code)
    })
  }, [entries, withData, maxCountries])

  const options = React.useMemo(
    () => entries.map((entry) => ({ value: entry.code, label: `${nameOf(entry.code)} · ${entry.code.toUpperCase()}` })),
    [entries, nameOf],
  )
  const columns = selected
    .map((code) => entries.find((entry) => entry.code === code))
    .filter((entry): entry is WorldSummaryEntryDto => Boolean(entry))

  const leader = (pick: (entry: WorldSummaryEntryDto) => number | null): string | null => {
    const values = columns
      .map((entry) => ({ code: entry.code, value: pick(entry) }))
      .filter((row): row is { code: string; value: number } => row.value !== null)
    if (values.length < 2) return null
    return values.sort((a, b) => b.value - a.value)[0]!.code
  }

  const bestComposite = leader((entry) => (entry.state === 'ok' ? entry.composite : null))
  const bestCoverage = leader((entry) => entry.coverage)
  const bestConfidence = leader((entry) => entry.confidence)

  const sectorRows = React.useMemo(() => {
    if (sector !== 'all') return []
    return SECTORS.filter((value) =>
      columns.some((entry) =>
        entry.bySector.some((row) => row.sector === value && row.enabled && row.lastRunAt !== null),
      ),
    )
  }, [columns, sector])

  if (entries.length === 0) {
    return (
      <div className="border border-border px-4 py-12 text-center">
        <p className="text-[12px] text-muted-foreground">{t('world.table.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {problem && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {t('world.error')} {problem}
          </span>
          <Button variant="ghost" size="sm" onClick={onRetry}>
            {t('world.retry')}
          </Button>
        </div>
      )}

      {withData.length < 2 ? (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Swords className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-foreground">{t('world.compare.empty.title')}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t('world.compare.empty.body')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onOpenReadiness}>
            {t('world.empty.action')}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-foreground">{t('world.compare.choose')}</p>
              <p className="text-[10px] text-muted-foreground">
                {t('world.compare.chooseHint', { max: maxCountries, count: selected.length })}
              </p>
            </div>
            <MultiSelect
              ariaLabel={t('world.compare.choose')}
              values={selected}
              onValuesChange={setSelected}
              options={options}
              minSelected={Math.min(2, options.length)}
              maxSelected={maxCountries}
              className="w-56"
            />
          </div>

          {loading && !columns.length ? (
            <div className="space-y-2 border border-border p-4" aria-busy="true">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : columns.length < 2 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[11px] text-muted-foreground">
              {t('world.compare.needTwo')}
            </div>
          ) : (
            <TooltipProvider delayDuration={200}>
              <div className="overflow-x-auto border border-border" aria-busy={loading || undefined}>
                <Table className="min-w-[34rem]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-32">{t('world.compare.metric')}</TableHead>
                      {columns.map((entry) => (
                        <TableHead key={entry.code} className="min-w-[9rem]">
                          <div className="flex items-center gap-2">
                            <CountryFlag code={entry.code} />
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-medium text-foreground">
                                {nameOf(entry.code)}
                              </span>
                              <span className="block font-mono text-[9px] uppercase text-muted-foreground">
                                {entry.code}
                              </span>
                            </span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <CompareRow label={t('world.table.state')}>
                      {columns.map((entry) => (
                        <StateCell key={entry.code} entry={entry} />
                      ))}
                    </CompareRow>

                    <CompareRow label={t('world.table.composite')}>
                      {columns.map((entry) => (
                        <NumericCell
                          key={entry.code}
                          value={entry.composite}
                          leader={bestComposite === entry.code}
                          leaderLabel={t('world.compare.leader')}
                          format={(value) => (
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: maturityColor(value) }}
                                aria-hidden="true"
                              />
                              <span className="font-semibold tabular-nums">{value.toFixed(2)}</span>
                            </span>
                          )}
                          hint={entry.band ?? undefined}
                        />
                      ))}
                    </CompareRow>

                    <CompareRow label={t('world.table.coverage')}>
                      {columns.map((entry) => (
                        <NumericCell
                          key={entry.code}
                          value={entry.coverage}
                          leader={bestCoverage === entry.code}
                          leaderLabel={t('world.compare.leader')}
                          format={(value) => percent.format(value)}
                        />
                      ))}
                    </CompareRow>

                    <CompareRow label={t('world.table.confidence')}>
                      {columns.map((entry) => (
                        <NumericCell
                          key={entry.code}
                          value={entry.confidence}
                          leader={bestConfidence === entry.code}
                          leaderLabel={t('world.compare.leader')}
                          format={(value) => percent.format(value)}
                        />
                      ))}
                    </CompareRow>

                    <CompareRow label={t('world.table.lastRun')}>
                      {columns.map((entry) => (
                        <TableCell key={entry.code} className="text-[11px] text-muted-foreground">
                          {entry.lastRunAt === null ? (
                            '—'
                          ) : (
                            <span className="flex flex-wrap items-center gap-1.5">
                              {dateFormat.format(new Date(entry.lastRunAt))}
                              {entry.stale && (
                                <Badge tone="warning" className="text-[9px]">
                                  {t('world.stale')}
                                </Badge>
                              )}
                            </span>
                          )}
                        </TableCell>
                      ))}
                    </CompareRow>

                    <CompareRow label={t('world.table.runs')}>
                      {columns.map((entry) => (
                        <TableCell key={entry.code} className="text-[11px] tabular-nums">
                          {entry.runs}
                        </TableCell>
                      ))}
                    </CompareRow>

                    <CompareRow label={t('world.compare.sectorsCovered')}>
                      {columns.map((entry) => {
                        const covered = entry.bySector.filter(
                          (row) => row.enabled && row.lastRunAt !== null,
                        ).length
                        return (
                          <TableCell key={entry.code} className="text-[11px] tabular-nums">
                            {t('world.sectors.count', { count: covered, total: entry.sectors.length || SECTORS.length })}
                          </TableCell>
                        )
                      })}
                    </CompareRow>
                  </TableBody>
                </Table>
              </div>

              {sectorRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[12px] font-semibold text-foreground">{t('world.compare.matrix')}</p>
                  <p className="text-[10px] text-muted-foreground">{t('world.compare.matrixHint')}</p>
                  <div className="overflow-x-auto border border-border">
                    <Table className="min-w-[34rem]">
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-32">{t('world.sector.label')}</TableHead>
                          {columns.map((entry) => (
                            <TableHead key={entry.code} className="min-w-[9rem] text-[10px] uppercase text-muted-foreground">
                              {entry.code}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sectorRows.map((value) => {
                          const cells = columns.map((entry) => ({
                            entry,
                            cell: entry.bySector.find((row) => row.sector === value),
                          }))
                          const best = cells
                            .filter(({ cell }) => cell?.state === 'ok' && typeof cell.composite === 'number')
                            .sort((a, b) => (b.cell?.composite ?? 0) - (a.cell?.composite ?? 0))[0]?.entry.code
                          return (
                            <TableRow key={value}>
                              <TableCell className="text-[11px] font-medium text-foreground">
                                {t(`domain.${value}` as MessageKey)}
                              </TableCell>
                              {cells.map(({ entry, cell }) => (
                                <SectorCell
                                  key={entry.code}
                                  state={cell?.state}
                                  composite={cell?.composite ?? null}
                                  enabled={cell?.enabled ?? false}
                                  leader={best === entry.code}
                                  leaderLabel={t('world.compare.leader')}
                                  stateLabel={
                                    cell ? t(STATE_META[cell.state].label) : t('world.state.not-assessed')
                                  }
                                />
                              ))}
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground">{t('world.compare.note')}</p>
            </TooltipProvider>
          )}
        </>
      )}
    </div>
  )
}

function CompareRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell className="text-[10px] font-black tracking-widest text-muted-foreground">{label}</TableCell>
      {children}
    </TableRow>
  )
}

function StateCell({ entry }: { entry: WorldSummaryEntryDto }) {
  const { t } = useI18n()
  const meta = STATE_META[entry.state]
  const Icon = meta.icon
  return (
    <TableCell>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge tone={meta.tone} className="text-[9px]">
            <Icon className="h-3 w-3" aria-hidden="true" />
            {t(meta.label)}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-[11px]">
          {t(meta.hint)}
        </TooltipContent>
      </Tooltip>
    </TableCell>
  )
}

function NumericCell({
  value,
  format,
  hint,
  leader,
  leaderLabel,
}: {
  value: number | null
  format: (value: number) => React.ReactNode
  hint?: string
  leader: boolean
  leaderLabel: string
}) {
  return (
    <TableCell className="text-[11px] tabular-nums">
      {value === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={cn(leader && 'text-foreground')}>{format(value)}</span>
          {leader && <Crown className="h-3 w-3 text-brand-primary" aria-label={leaderLabel} />}
          {hint && <span className="text-[9px] text-muted-foreground">{hint}</span>}
        </span>
      )}
    </TableCell>
  )
}

function SectorCell({
  state,
  composite,
  enabled,
  leader,
  leaderLabel,
  stateLabel,
}: {
  state: WorldStateDto | undefined
  composite: number | null
  enabled: boolean
  leader: boolean
  leaderLabel: string
  stateLabel: string
}) {
  if (state === undefined || composite === null) {
    return (
      <TableCell className="text-[11px] text-muted-foreground" title={stateLabel}>
        —
      </TableCell>
    )
  }
  const grounded = state === 'ok'
  return (
    <TableCell className="text-[11px] tabular-nums">
      <span className="flex items-center gap-1.5" title={stateLabel}>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: grounded ? maturityColor(composite) : 'var(--muted-foreground)' }}
          aria-hidden="true"
        />
        <span className={cn('font-medium', !enabled && 'text-muted-foreground line-through')}>
          {composite.toFixed(2)}
        </span>
        {leader && <Crown className="h-3 w-3 text-brand-primary" aria-label={leaderLabel} />}
      </span>
    </TableCell>
  )
}
