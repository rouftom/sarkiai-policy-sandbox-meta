'use client'

/**
 * The saved assessments, as a table in the readiness page. One page at a time comes
 * from the server; the pages already read are kept in a cache, cleared when the search,
 * the filters or the saved assessments change. A search field, a funnel filter on sector
 * and status, and per row an open action and a delete action (after a confirmation).
 */

import * as React from 'react'
import { Eye, Loader, Search, Trash2 } from 'lucide-react'
import { Checkbox, DataTablePagination, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@sps/ui'
import { FilterPopover } from '@/components/filter-popover'
import { RowActionMenu } from '@/components/ui/row-action-menu'
import { TableActionItem } from '@/components/ui/table-actions'
import { RowActionButton } from '@/components/ui/row-action-button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { api, type ReadinessRunSummaryDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const DOMAINS = ['health', 'education', 'telecom', 'public_services', 'agriculture'] as const
const STATUSES = ['complete', 'failed'] as const
const PAGE_SIZE = 10

type Status = (typeof STATUSES)[number]

interface Filters {
  domains: string[]
  statuses: Status[]
}
const NO_FILTERS: Filters = { domains: [], statuses: [] }

export function ReadinessHistory({
  version,
  activeId,
  onOpen,
  onDelete,
  deletingId,
}: {
  /** Changes when the saved assessments change: the cache is dropped and the page reloaded. */
  version: number
  activeId?: string
  onOpen: (id: string) => void
  onDelete: (id: string) => Promise<void>
  deletingId: string | null
}) {
  const { t, locale } = useI18n()
  const [pending, setPending] = React.useState<ReadinessRunSummaryDto | null>(null)
  const [query, setQuery] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS)
  const [draft, setDraft] = React.useState<Filters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE)
  const [rows, setRows] = React.useState<ReadinessRunSummaryDto[] | null>(null)
  const [total, setTotal] = React.useState(0)
  const cache = React.useRef(new Map<number, { runs: ReadinessRunSummaryDto[]; total: number }>())

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

  const filterKey = JSON.stringify([search, filters, pageSize])

  // Pages are cached per search, filter set and page size; a change drops them.
  React.useEffect(() => {
    cache.current.clear()
  }, [filterKey, version])

  React.useEffect(() => {
    const hit = cache.current.get(page)
    if (hit) {
      setRows(hit.runs)
      setTotal(hit.total)
      return
    }
    let cancelled = false
    api
      .readinessRuns({ page, limit: pageSize, q: search, domains: filters.domains, statuses: filters.statuses })
      .then((result) => {
        if (cancelled) return
        // An API that predates the paged list answers without a total: the rows it sent are all there is.
        const count = typeof result.total === 'number' ? result.total : result.runs.length
        const pages = Math.max(1, Math.ceil(count / pageSize))
        if (page > pages) {
          setPage(pages)
          return
        }
        cache.current.set(page, { runs: result.runs, total: count })
        setRows(result.runs)
        setTotal(count)
      })
      .catch(() => {
        if (!cancelled) {
          setRows([])
          setTotal(0)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the filters are part of filterKey
  }, [page, filterKey, version])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const filtered = search !== '' || filters.domains.length > 0 || filters.statuses.length > 0
  const activeFilters = filters.domains.length + filters.statuses.length

  const toggle = <T extends string>(list: T[], value: T, checked: boolean | 'indeterminate'): T[] =>
    checked === true ? [...list, value] : list.filter((entry) => entry !== value)

  const confirm = async () => {
    if (!pending) return
    await onDelete(pending.id)
    setPending(null)
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-nowrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-[240px] sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('readiness.table.filter')}
            aria-label={t('readiness.table.filter')}
            className="h-7 w-full pl-8 text-[12px] sm:w-[240px]"
          />
        </div>
        <div className="ml-auto shrink-0">
        <FilterPopover
          label={t('readiness.filter.button')}
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
            <p className="text-[11px] font-semibold text-foreground">{t('readiness.filter.sectors')}</p>
            {DOMAINS.map((domain) => (
              <label key={domain} className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
                <Checkbox
                  checked={draft.domains.includes(domain)}
                  onCheckedChange={(checked) => setDraft((current) => ({ ...current, domains: toggle(current.domains, domain, checked) }))}
                />
                {t(`domain.${domain}` as 'domain.health')}
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-foreground">{t('readiness.filter.status')}</p>
            {STATUSES.map((status) => (
              <label key={status} className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
                <Checkbox
                  checked={draft.statuses.includes(status)}
                  onCheckedChange={(checked) => setDraft((current) => ({ ...current, statuses: toggle(current.statuses, status, checked) }))}
                />
                {status === 'complete' ? t('readiness.table.saved') : t('readiness.status.failed')}
              </label>
            ))}
          </div>
        </FilterPopover>
        </div>
      </div>

      {rows === null ? (
        <p className="flex items-center gap-2 py-10 text-[11px] text-muted-foreground">
          <Loader className="h-3.5 w-3.5 animate-spin" /> {t('readiness.historyLoading')}
        </p>
      ) : rows.length === 0 ? (
        <p className="border border-border px-4 py-10 text-center text-[12px] text-muted-foreground">
          {filtered ? t('readiness.table.noMatch') : t('readiness.historyEmpty')}
        </p>
      ) : (
        <div className="border border-border">
          <Table className="table-actions-overlay">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t('readiness.table.date')}</TableHead>
                <TableHead>{t('readiness.table.sector')}</TableHead>
                <TableHead>{t('readiness.table.country')}</TableHead>
                <TableHead className="text-right">{t('readiness.table.composite')}</TableHead>
                <TableHead className="text-right">{t('readiness.table.dimensions')}</TableHead>
                <TableHead>{t('readiness.table.status')}</TableHead>
                <TableHead className="text-right">{t('readiness.table.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((entry) => {
                const deleting = entry.id === deletingId
                return (
                  <TableRow
                    key={entry.id}
                    className={cn('cursor-pointer', entry.id === activeId && 'bg-brand-primary/5')}
                    onClick={() => onOpen(entry.id)}
                  >
                    <TableCell className="min-w-[200px]">
                      <p className="text-[12px] font-medium text-foreground">{formatDate(entry.createdAt)}</p>
                      <p className="text-[10px] text-muted-foreground">{entry.runBy}</p>
                    </TableCell>
                    <TableCell className="text-[12px]">{t(`domain.${entry.domain}` as 'domain.health')}</TableCell>
                    <TableCell className="font-mono text-[12px]">{entry.country.toUpperCase()}</TableCell>
                    <TableCell className="text-right font-mono text-[12px]">{entry.composite ?? 'n/a'}/5</TableCell>
                    <TableCell className="text-right font-mono text-[12px]">{entry.dimensions}</TableCell>
                    <TableCell>
                      {entry.status === 'failed' ? (
                        <span className="rounded-full bg-destructive/10 px-1.5 py-px text-[9px] font-semibold text-destructive">
                          {t('readiness.status.failed')}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">{t('readiness.table.saved')}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <RowActionMenu
                        overlay
                        inline={
                          <div className="flex items-center justify-end gap-1">
                            <RowActionButton label={t('readiness.table.open')} onClick={() => onOpen(entry.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </RowActionButton>
                            <RowActionButton
                              label={t('readiness.history.delete')}
                              tone="danger"
                              disabled={deleting}
                              onClick={() => setPending(entry)}
                            >
                              {deleting ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </RowActionButton>
                          </div>
                        }
                      >
                        <TableActionItem icon={Eye} onClick={() => onOpen(entry.id)}>
                          {t('readiness.table.open')}
                        </TableActionItem>
                        <TableActionItem icon={Trash2} variant="danger" disabled={deleting} onClick={() => setPending(entry)}>
                          {t('readiness.history.delete')}
                        </TableActionItem>
                      </RowActionMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          <DataTablePagination
            currentPage={Math.min(page, totalPages)}
            totalPages={totalPages}
            totalItems={total}
            itemsPerPage={pageSize}
            onPageChange={setPage}
            onItemsPerPageChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
            labels={{
              rowsPerPage: t('table.rowsPerPage'),
              range: (from, to, count) => t('table.range', { from, to, total: count }),
              page: (current, pages) => t('table.page', { current, total: pages }),
            }}
          />
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        onConfirm={confirm}
        title={t('readiness.history.deleteTitle')}
        description={pending ? t('readiness.history.deleteBody', { date: formatDate(pending.createdAt), country: pending.country.toUpperCase() }) : ''}
        confirmText={t('readiness.history.deleteConfirm')}
        cancelText={t('readiness.history.cancel')}
      />
    </section>
  )
}
