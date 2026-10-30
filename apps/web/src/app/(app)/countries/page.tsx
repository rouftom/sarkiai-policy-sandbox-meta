'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Globe2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
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
} from '@sps/ui'
import { ApiError, countriesApi, type CountryDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'
import { CountryDialog } from '@/components/country-dialog'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { useToast } from '@/components/shared/toast'
import { RowActionMenu } from '@/components/ui/row-action-menu'
import { RowActionButton } from '@/components/ui/row-action-button'
import { TableActionItem } from '@/components/ui/table-actions'

const TOTAL_SECTORS = 5

export default function CountriesPage() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const router = useRouter()
  const [countries, setCountries] = React.useState<CountryDto[] | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
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

      <Card className="overflow-hidden">
        {countries === null ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : problem ? (
          <p className="p-4 text-[11px] text-destructive">{`${t('countries.loadError')} ${problem}`}</p>
        ) : countries.length === 0 ? (
          <p className="p-6 text-center text-[11px] text-muted-foreground">{t('countries.empty')}</p>
        ) : (
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
              {countries.map((country) => (
                <TableRow
                  key={country.code}
                  className="cursor-pointer"
                  onClick={() => router.push(`/countries/${country.code}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary">
                        <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
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
        )}
      </Card>

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
