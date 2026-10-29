'use client'

/**
 * The saved scenario runs, as a table. The list comes from the server in one go (it
 * stays short), so the search, the sector and status filters and the pagination are
 * applied here. The toolbar also starts a run · facilitator mode, or the chosen
 * sectors one after another · right before the funnel filter.
 */

import * as React from 'react'
import { Eye, Play, RotateCcw, Search, Siren, Trash2 } from 'lucide-react'
import {
  Button,
  Checkbox,
  DataTablePagination,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@sps/ui'
import { FilterPopover } from '@/components/filter-popover'
import { RowActionMenu } from '@/components/ui/row-action-menu'
import { RowActionButton } from '@/components/ui/row-action-button'
import { TableActionItem } from '@/components/ui/table-actions'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import type { ScenarioRunSummaryDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const DOMAINS = ['health', 'education', 'telecom', 'public_services', 'agriculture'] as const
const STATUSES = ['running', 'complete', 'failed'] as const
const PAGE_SIZE = 10

type Status = (typeof STATUSES)[number]

interface Filters {
  domains: string[]
  statuses: Status[]
}
const NO_FILTERS: Filters = { domains: [], statuses: [] }

/** Accents and case do not matter in the search field. */
function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function ScenarioHistory({
  runs,
  busy,
  canStart,
  activeId,
  maxSectors,
  onMaxSectorsChange,
  onOpen,
  onResume,
  onDelete,
  onFacilitate,
  onAuto,
}: {
  /** The saved runs; null while they load. */
  runs: ScenarioRunSummaryDto[] | null
  /** A run is being opened or resumed: the row actions wait. */
  busy: boolean
  /** The workspace has sectors: a new run can start. */
  canStart: boolean
  activeId?: string
  maxSectors: number
  onMaxSectorsChange: (value: number) => void
  onOpen: (run: ScenarioRunSummaryDto) => void
  onResume: (run: ScenarioRunSummaryDto) => void
  /** Deletes a saved run; rejects when the server refused, so the dialog stays open. */
  onDelete: (id: string) => Promise<void>
  onFacilitate: () => void
  onAuto: () => void
}) {
  const { t, locale } = useI18n()
  const [pending, setPending] = React.useState<ScenarioRunSummaryDto | null>(null)
  const [query, setQuery] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS)
  const [draft, setDraft] = React.useState<Filters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE)

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' })

  // The search waits a moment after the last keystroke, then the list starts again on page 1.
  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query])

  const toggle = <T extends string>(list: T[], value: T, checked: boolean | 'indeterminate'): T[] =>
    checked === true ? [...list, value] : list.filter((entry) => entry !== value)

  const statusLabel = (status: Status) => t(`scenario.status.${status}` as 'scenario.status.complete')

  const confirm = async () => {
    if (!pending) return
    await onDelete(pending.id)
    setPending(null)
  }

  const filtered = React.useMemo(() => {
    const needle = fold(search)
    return (runs ?? []).filter((run) => {
      if (filters.domains.length > 0 && !filters.domains.includes(run.domain)) return false
      if (filters.statuses.length > 0 && !filters.statuses.includes(run.status)) return false
      if (!needle) return true
      const haystack = fold(
        [run.title, t(`domain.${run.domain}` as 'domain.health'), run.country, statusLabel(run.status), formatDate(run.updatedAt)].join(' '),
      )
      return haystack.includes(needle)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the labels follow the locale, not the data
  }, [runs, filters, search, locale])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, totalPages)
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize)
  const narrowed = search !== '' || filters.domains.length > 0 || filters.statuses.length > 0
  const activeFilters = filters.domains.length + filters.statuses.length

  return (
    <section className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-[240px] sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('scenario.table.filter')}
            aria-label={t('scenario.table.filter')}
            className="h-7 w-full pl-8 text-[12px] sm:w-[240px]"
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="whitespace-nowrap text-[11px] text-muted-foreground">{t('scenario.settings.maxSectors.short')}</span>
            <Select
              ariaLabel={t('scenario.settings.maxSectors')}
              value={String(maxSectors)}
              onValueChange={(value) => onMaxSectorsChange(Number(value))}
              options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) }))}
              size="sm"
              className="w-[62px]"
            />
          </div>
          <Button variant="outline" size="sm" className="h-7 px-2.5 text-[11px]" onClick={onFacilitate} disabled={busy || !canStart}>
            {t('scenario.facilitated')}
          </Button>
          <Button size="sm" className="h-7 px-2.5 text-[11px]" onClick={onAuto} disabled={busy || !canStart}>
            <Play className="h-3.5 w-3.5" /> {t('scenario.auto')}
          </Button>
          <FilterPopover
            label={t('scenario.filter.button')}
            active={activeFilters > 0}
            open={filterOpen}
            onOpenChange={setFilterOpen}
            onOpen={() => setDraft(filters)}
            onApply={() => {
              setFilters(draft)
              setPage(1)
              setFilterOpen(false)
            }}
            onReset={() => setDraft(NO_FILTERS)}
          >
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-foreground">{t('scenario.filter.sectors')}</p>
              {DOMAINS.map((domain) => (
                <label key={domain} className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
                  <Checkbox
                    checked={draft.domains.includes(domain)}
                    onCheckedChange={(checked) => setDraft((value) => ({ ...value, domains: toggle(value.domains, domain, checked) }))}
                  />
                  {t(`domain.${domain}` as 'domain.health')}
                </label>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-foreground">{t('scenario.filter.status')}</p>
              {STATUSES.map((status) => (
                <label key={status} className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
                  <Checkbox
                    checked={draft.statuses.includes(status)}
                    onCheckedChange={(checked) => setDraft((value) => ({ ...value, statuses: toggle(value.statuses, status, checked) }))}
                  />
                  {statusLabel(status)}
                </label>
              ))}
            </div>
          </FilterPopover>
        </div>
      </div>

      {runs === null ? (
        <div className="border border-border" aria-busy="true" aria-label={t('scenario.historyLoading')}>
          <Table className="table-actions-overlay">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('scenario.table.date')}</TableHead>
                <TableHead>{t('scenario.table.sector')}</TableHead>
                <TableHead>{t('scenario.table.country')}</TableHead>
                <TableHead className="text-right">{t('scenario.table.progress')}</TableHead>
                <TableHead>{t('scenario.table.status')}</TableHead>
                <TableHead className="text-right">{t('scenario.table.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: Math.min(pageSize, 6) }, (_, index) => (
                <TableRow key={`skeleton-${index}`} className="hover:bg-transparent">
                  <TableCell className="min-w-[200px]">
                    <div className="shimmer h-3 w-36 rounded bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="shimmer h-3 w-16 rounded bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="shimmer h-3 w-7 rounded bg-secondary" />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="shimmer ml-auto h-3 w-10 rounded bg-secondary" />
                  </TableCell>
                  <TableCell>
                    <div className="shimmer h-4 w-16 rounded-full bg-secondary" />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="shimmer ml-auto h-3 w-14 rounded bg-secondary" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : rows.length === 0 ? (
        <div className="border border-border px-4 py-12 text-center">
          <div
            className={cn(
              'mx-auto mb-3 grid h-10 w-10 place-items-center rounded-2xl',
              narrowed ? 'bg-secondary/70 text-muted-foreground' : 'bg-brand-primary/10 text-brand-primary',
            )}
          >
            {narrowed ? <Search className="h-5 w-5" /> : <Siren className="h-5 w-5" />}
          </div>
          <p className="text-[12px] text-muted-foreground">
            {narrowed ? t('scenario.table.noMatch') : t('scenario.historyEmpty')}
          </p>
        </div>
      ) : (
        <div className="border border-border">
          <Table className="table-actions-overlay">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('scenario.table.date')}</TableHead>
                <TableHead>{t('scenario.table.sector')}</TableHead>
                <TableHead>{t('scenario.table.country')}</TableHead>
                <TableHead className="text-right">{t('scenario.table.progress')}</TableHead>
                <TableHead>{t('scenario.table.status')}</TableHead>
                <TableHead className="text-right">{t('scenario.table.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => (
                <TableRow
                  key={entry.id}
                  className={cn('cursor-pointer', entry.id === activeId && 'bg-brand-primary/5')}
                  onClick={() => onOpen(entry)}
                >
                  <TableCell className="min-w-[200px] text-[12px] font-medium text-foreground">{formatDate(entry.updatedAt)}</TableCell>
                  <TableCell className="text-[12px]">{t(`domain.${entry.domain}` as 'domain.health')}</TableCell>
                  <TableCell className="font-mono text-[12px]">{entry.country.toUpperCase()}</TableCell>
                  <TableCell className="text-right font-mono text-[12px]">
                    {entry.released}/{entry.total}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-px text-[9px] font-semibold',
                        entry.status === 'complete' && 'bg-emerald-500/10 text-emerald-600',
                        entry.status === 'failed' && 'bg-destructive/10 text-destructive',
                        entry.status === 'running' && 'bg-brand-primary/10 text-brand-primary',
                      )}
                    >
                      {statusLabel(entry.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                    <RowActionMenu
                      overlay
                      busy={busy}
                      inline={
                        <div className="flex items-center justify-end gap-1">
                          <RowActionButton label={t('scenario.table.open')} onClick={() => onOpen(entry)}>
                            <Eye className="h-3.5 w-3.5" />
                          </RowActionButton>
                          {entry.status !== 'complete' && (
                            <RowActionButton label={t('scenario.resume')} disabled={busy} onClick={() => onResume(entry)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </RowActionButton>
                          )}
                          <RowActionButton
                            label={t('scenario.delete.action')}
                            tone="danger"
                            disabled={busy}
                            onClick={() => setPending(entry)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </RowActionButton>
                        </div>
                      }
                    >
                      <TableActionItem icon={Eye} onClick={() => onOpen(entry)}>
                        {t('scenario.table.open')}
                      </TableActionItem>
                      {entry.status !== 'complete' && (
                        <TableActionItem icon={RotateCcw} disabled={busy} onClick={() => onResume(entry)}>
                          {t('scenario.resume')}
                        </TableActionItem>
                      )}
                      <TableActionItem icon={Trash2} variant="danger" disabled={busy} onClick={() => setPending(entry)}>
                        {t('scenario.delete.action')}
                      </TableActionItem>
                    </RowActionMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DataTablePagination
            currentPage={current}
            totalPages={totalPages}
            totalItems={filtered.length}
            itemsPerPage={pageSize}
            onPageChange={setPage}
            onItemsPerPageChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            labels={{
              rowsPerPage: t('table.rowsPerPage'),
              range: (from, to, count) => t('table.range', { from, to, total: count }),
              page: (currentPage, pages) => t('table.page', { current: currentPage, total: pages }),
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        onConfirm={confirm}
        title={t('scenario.delete.title')}
        description={
          pending
            ? t('scenario.delete.body', {
                date: formatDate(pending.updatedAt),
                sector: t(`domain.${pending.domain}` as 'domain.health'),
                country: pending.country.toUpperCase(),
              })
            : ''
        }
        confirmText={t('scenario.delete.confirm')}
        cancelText={t('common.cancel')}
      />
    </section>
  )
}
