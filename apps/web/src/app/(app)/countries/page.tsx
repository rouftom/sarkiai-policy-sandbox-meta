'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Globe2, Loader, Pencil, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Checkbox,
  DataTablePagination,
  Input,
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
import { ApiError, countriesApi, type CountryDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'
import { CountryDialog } from '@/components/country-dialog'
import { CountryFlag } from '@/components/country-flag'
import { FilterPopover } from '@/components/filter-popover'
import { ICON_BUTTON_OUTLINE } from '@/components/icon-button-styles'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/shared/toast'
import { RowActionMenu } from '@/components/ui/row-action-menu'
import { RowActionButton } from '@/components/ui/row-action-button'
import { TableActionItem } from '@/components/ui/table-actions'

const TOTAL_SECTORS = 5
const PAGE_SIZE = 10
const STATUSES = ['active', 'planned'] as const

type Status = (typeof STATUSES)[number]

interface Filters {
  statuses: Status[]
  regions: string[]
}
const NO_FILTERS: Filters = { statuses: [], regions: [] }

/** Accents and case do not matter in the search field. */
function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export default function CountriesPage() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [countries, setCountries] = React.useState<CountryDto[] | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [filters, setFilters] = React.useState<Filters>(NO_FILTERS)
  const [draft, setDraft] = React.useState<Filters>(NO_FILTERS)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(PAGE_SIZE)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CountryDto | null>(null)
  const [deleting, setDeleting] = React.useState<CountryDto | null>(null)
  const [deleteProblem, setDeleteProblem] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    try {
      const result = await countriesApi.list()
      setCountries(result.countries)
      setProblem(null)
    } catch (cause) {
      setCountries([])
      setProblem((cause as Error).message)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (country: CountryDto) => {
    setEditing(country)
    setDialogOpen(true)
  }

  const onSaved = (country: CountryDto) => {
    toast.success(editing ? t('countries.updated') : t('countries.created'), country.name)
    void load()
  }

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteProblem(null)
    try {
      await countriesApi.remove(deleting.code)
      toast.success(t('countries.removed'), deleting.name)
      setDeleting(null)
      await load()
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
      // Keeps the confirmation open so the reason is read in place.
      throw cause
    }
  }

  const nameOf = (country: CountryDto) => (locale === 'fr' ? country.nameFr : country.name)
  const statusLabel = (status: Status) => t(`countries.status.${status}` as 'countries.status.active')

  /** The regions present in the registry, so the filter only offers real choices. */
  const regions = React.useMemo(() => {
    const seen = new Set<string>()
    for (const country of countries ?? []) {
      if (country.region) seen.add(country.region)
    }
    return [...seen].sort((a, b) => a.localeCompare(b))
  }, [countries])

  const toggle = <T extends string>(list: T[], value: T, checked: boolean | 'indeterminate'): T[] =>
    checked === true ? [...list, value] : list.filter((entry) => entry !== value)

  React.useEffect(() => {
    setPage(1)
  }, [query, filters, pageSize])

  const filtered = React.useMemo(() => {
    const needle = fold(query.trim())
    return (countries ?? []).filter((country) => {
      if (filters.statuses.length > 0 && !filters.statuses.includes(country.status)) return false
      if (filters.regions.length > 0 && !filters.regions.includes(country.region)) return false
      if (!needle) return true
      const haystack = fold(
        [
          country.name,
          country.nameFr,
          country.code,
          country.region,
          country.authority,
          statusLabel(country.status),
        ].join(' '),
      )
      return haystack.includes(needle)
      // eslint-disable-next-line react-hooks/exhaustive-deps -- the status label follows the locale, not the data
    })
  }, [countries, filters, query, locale])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, totalPages)
  const rows = filtered.slice((current - 1) * pageSize, current * pageSize)
  const narrowed = query.trim() !== '' || filters.statuses.length > 0 || filters.regions.length > 0
  const activeFilters = filters.statuses.length + filters.regions.length

  return (
    <>
      <PageIntro title={t('countries.title')} subtitle={t('countries.subtitle')}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                aria-label={t('countries.new')}
                onClick={openCreate}
                className="h-8 w-8 rounded-lg"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">
              {t('countries.new')}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </PageIntro>

      <section className="space-y-3">
        <div className="flex flex-nowrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-[240px] sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('countries.filter')}
              aria-label={t('countries.filter')}
              className="h-7 w-full pl-8 text-[12px] sm:w-[240px]"
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t('countries.refresh')}
                    onClick={() => void refresh()}
                    disabled={refreshing}
                    className={ICON_BUTTON_OUTLINE}
                  >
                    {refreshing ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-md">
                  {t('countries.refresh')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <FilterPopover
              label={t('countries.filter.button')}
              active={activeFilters > 0}
              open={filterOpen}
              onOpenChange={setFilterOpen}
              onOpen={() => setDraft(filters)}
              onApply={() => {
                setFilters(draft)
                setFilterOpen(false)
              }}
              onReset={() => setDraft(NO_FILTERS)}
            >
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-foreground">{t('countries.filter.status')}</p>
                {STATUSES.map((status) => (
                  <label key={status} className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
                    <Checkbox
                      checked={draft.statuses.includes(status)}
                      onCheckedChange={(checked) =>
                        setDraft((value) => ({ ...value, statuses: toggle(value.statuses, status, checked) }))
                      }
                    />
                    {statusLabel(status)}
                  </label>
                ))}
              </div>
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-foreground">{t('countries.filter.region')}</p>
                {regions.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">{t('countries.filter.noRegion')}</p>
                ) : (
                  regions.map((region) => (
                    <label key={region} className="flex cursor-pointer items-center gap-2 text-[12px] text-foreground">
                      <Checkbox
                        checked={draft.regions.includes(region)}
                        onCheckedChange={(checked) =>
                          setDraft((value) => ({ ...value, regions: toggle(value.regions, region, checked) }))
                        }
                      />
                      <span className="min-w-0 truncate">{region}</span>
                    </label>
                  ))
                )}
              </div>
            </FilterPopover>
          </div>
        </div>

        {countries === null ? (
          <div className="border border-border" aria-busy="true" aria-label={t('countries.loading')}>
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          </div>
        ) : problem ? (
          <p className="border border-border p-4 text-[11px] text-destructive">{`${t('countries.loadError')} ${problem}`}</p>
        ) : filtered.length === 0 ? (
          <div className="border border-border px-4 py-12 text-center">
            <div
              className={cn(
                'mx-auto mb-3 grid h-10 w-10 place-items-center rounded-2xl',
                narrowed ? 'bg-secondary/70 text-muted-foreground' : 'bg-brand-primary/10 text-brand-primary',
              )}
            >
              {narrowed ? <Search className="h-5 w-5" /> : <Globe2 className="h-5 w-5" />}
            </div>
            <p className="text-[12px] text-muted-foreground">
              {narrowed ? t('countries.noMatch') : t('countries.empty')}
            </p>
          </div>
        ) : (
          <div className="border border-border">
            <Table className="table-actions-overlay">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('countries.col.country')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('countries.col.region')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('countries.col.authority')}</TableHead>
                  <TableHead>{t('countries.col.sectors')}</TableHead>
                  <TableHead>{t('countries.col.status')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('countries.col.updated')}</TableHead>
                  <TableHead className="text-right">{t('countries.col.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((country) => (
                  <TableRow
                    key={country.code}
                    className="cursor-pointer"
                    onClick={() => router.push(`/countries/${country.code}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <CountryFlag code={country.code} />
                        <span className="min-w-0">
                          <span className="block truncate text-[12px]">{nameOf(country)}</span>
                          <span className="block font-mono text-[9px] uppercase text-muted-foreground">{country.code}</span>
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[11px] text-muted-foreground">
                      {country.region || '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-[11px] text-muted-foreground">
                      {country.authority || '—'}
                    </TableCell>
                    <TableCell className="text-[11px] font-mono">
                      {t('countries.sectorCount', { count: country.sectors.length, total: TOTAL_SECTORS })}
                    </TableCell>
                    <TableCell>
                      <Badge tone={country.status === 'active' ? 'brand' : 'neutral'} className="text-[9px]">
                        {country.status === 'active' ? t('countries.status.active') : t('countries.status.planned')}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-[10px] text-muted-foreground">
                      {new Date(country.updatedAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
                        dateStyle: 'medium',
                      })}
                    </TableCell>
                    <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                      <RowActionMenu
                        overlay
                        inline={
                          <div className="flex items-center justify-end gap-1">
                            <RowActionButton
                              label={t('countries.editTitle')}
                              onClick={() => openEdit(country)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </RowActionButton>
                            <RowActionButton
                              label={t('country.delete')}
                              tone="danger"
                              onClick={() => {
                                setDeleteProblem(null)
                                setDeleting(country)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </RowActionButton>
                          </div>
                        }
                      >
                        <TableActionItem icon={Pencil} onClick={() => openEdit(country)}>
                          {t('countries.editTitle')}
                        </TableActionItem>
                        <TableActionItem
                          icon={Trash2}
                          variant="danger"
                          onClick={() => {
                            setDeleteProblem(null)
                            setDeleting(country)
                          }}
                        >
                          {t('country.delete')}
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
      </section>

      <CountryDialog open={dialogOpen} onOpenChange={setDialogOpen} country={editing} onSaved={onSaved} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(next) => !next && setDeleting(null)}
        onConfirm={confirmDelete}
        title={t('countries.deleteTitle')}
        description={
          deleteProblem ??
          (deleting ? t('countries.deleteBody', { name: nameOf(deleting) }) : '')
        }
        confirmText={t('country.delete')}
      />
    </>
  )
}
