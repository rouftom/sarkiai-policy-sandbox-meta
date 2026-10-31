'use client'

import * as React from 'react'
import { AlertTriangle, Copy, Loader, RefreshCw, ScrollText, ShieldCheck } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTablePagination,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
import { ASSISTANT_FINISHED, authApi, type AuditEventDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { useRefreshOnFocus } from '@/lib/use-refresh-on-focus'
import { auditActionLabel, auditActorLabel } from '@/lib/audit-labels'
import { PageIntro } from '@/components/page-intro'
import { RowActionMenu } from '@/components/ui/row-action-menu'
import { TableActionItem } from '@/components/ui/table-actions'
import { AuditEventDrawer } from '@/components/audit-event-drawer'
import { ICON_BUTTON_OUTLINE } from '@/components/icon-button-styles'
import { useToast } from '@/components/shared/toast'
import { Skeleton } from '@sps/ui'

/** The API caps a page at 500 records; the table pages through them locally. */
const FETCH_SIZE = 500

function formatTime(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })
}

export default function AuditPage() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [events, setEvents] = React.useState<AuditEventDto[]>([])
  const [chain, setChain] = React.useState<{ valid: boolean; brokenAt?: string; forks?: number } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [unreachable, setUnreachable] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [selected, setSelected] = React.useState<AuditEventDto | null>(null)

  const load = React.useCallback(
    async (notify = false) => {
      setLoading(true)
      setUnreachable(false)
      try {
        const response = await authApi.auditEvents(FETCH_SIZE)
        setEvents(response.events)
        setChain(response.chain)
        if (notify) toast.success(t('toast.auditRefreshed', { count: response.events.length }))
      } catch {
        setUnreachable(true)
        setEvents([])
        setChain(null)
        if (notify) toast.error(t('toast.auditFailed'))
      } finally {
        setLoading(false)
      }
    },
    [toast, t],
  )

  React.useEffect(() => {
    void load()
  }, [load])

  // The chain grows while the console stays open: refresh it when the operator
  // returns to the tab, or when an assistant turn has just written records.
  useRefreshOnFocus(load)
  React.useEffect(() => {
    const onFinished = () => void load()
    window.addEventListener(ASSISTANT_FINISHED, onFinished)
    return () => window.removeEventListener(ASSISTANT_FINISHED, onFinished)
  }, [load])

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return events
    return events.filter((event) =>
      [
        event.actor,
        event.action,
        event.target ?? '',
        auditActorLabel(event.actor, t, event.userId),
        auditActionLabel(event.action, t),
      ].some((value) => value.toLowerCase().includes(needle)),
    )
  }, [events, query, t])

  React.useEffect(() => {
    setPage(1)
  }, [query, pageSize])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const current = Math.min(page, totalPages)
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize)

  return (
    <>
      <PageIntro title={t('audit.title')} subtitle={t('audit.pageSubtitle')} />

      <Card className="flex min-h-[420px] flex-col">
        <CardHeader className="h-auto flex-nowrap gap-x-3 gap-y-2 py-2 sm:flex-wrap">
          <ScrollText className="hidden h-4 w-4 text-brand-primary sm:block dark:text-brand-primary-light" />
          <CardTitle className="hidden sm:block">{t('audit.title')}</CardTitle>
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 sm:ml-auto sm:flex-none sm:flex-wrap">
            {chain && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={chain.valid ? t('audit.chainOk') : t('audit.chainBroken', { at: chain.brokenAt ?? 'n/a' })}
                      className={chain.valid ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-600 hover:bg-muted sm:hidden dark:text-emerald-400' : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-rose-500 hover:bg-muted sm:hidden'}
                    >
                      {chain.valid ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-3 text-[11px]">
                    <p className="font-semibold">{chain.valid ? t('audit.chainOk') : t('audit.chainBroken', { at: chain.brokenAt ?? 'n/a' })}</p>
                    {chain.valid && (chain.forks ?? 0) > 0 && (
                      <p className="mt-1 text-[10px] text-muted-foreground">{t('audit.forks', { count: chain.forks ?? 0 })}</p>
                    )}
                  </PopoverContent>
                </Popover>
                <span className="hidden items-center gap-1.5 sm:inline-flex">
                  <Badge tone={chain.valid ? 'success' : 'danger'} className="max-w-full whitespace-nowrap">
                    {chain.valid ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {chain.valid ? t('audit.chainOk') : t('audit.chainBroken', { at: chain.brokenAt ?? 'n/a' })}
                  </Badge>
                  {chain.valid && (chain.forks ?? 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground">{t('audit.forks', { count: chain.forks ?? 0 })}</span>
                  )}
                </span>
              </>
            )}
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('audit.filter')}
              aria-label={t('audit.filter')}
              className="h-8 min-w-0 flex-1 text-[11px] sm:w-56 sm:flex-none"
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={t('audit.refresh')}
                    onClick={() => void load(true)}
                    disabled={loading}
                    className={ICON_BUTTON_OUTLINE}
                  >
                    {loading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="border-border bg-card text-[11px] font-medium text-foreground shadow-lg">
                  {t('audit.refresh')}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {loading && events.length === 0 && (
            <div className="space-y-2 p-4" aria-label={t('audit.loading')}>
              {[0, 1, 2, 3, 4].map((row) => (
                <Skeleton key={row} className="h-8 w-full" />
              ))}
            </div>
          )}

          {unreachable && (
            <div className="flex items-center gap-2 px-4 py-8 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t('audit.unavailable')}
            </div>
          )}

          {!loading && !unreachable && filtered.length === 0 && (
            <p className="px-4 py-8 text-xs text-muted-foreground">{t('audit.empty')}</p>
          )}

          {visible.length > 0 && (
            <>
              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
                <Table className="min-w-[720px] table-actions-overlay">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 hover:bg-transparent dark:border-brand-primary-dark/30">
                      <TableHead>{t('audit.time')}</TableHead>
                      <TableHead>{t('audit.actor')}</TableHead>
                      <TableHead>{t('audit.action')}</TableHead>
                      <TableHead>{t('audit.target')}</TableHead>
                      <TableHead>{t('audit.hash')}</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((event) => (
                      <TableRow
                        key={event.id}
                        tabIndex={0}
                        onClick={() => setSelected(event)}
                        onKeyDown={(keyboard) => {
                          if (keyboard.key === 'Enter' || keyboard.key === ' ') {
                            keyboard.preventDefault()
                            setSelected(event)
                          }
                        }}
                        aria-label={t('audit.drawer.open')}
                        className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary/40"
                      >
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatTime(event.ts, locale)}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate font-medium">
                          {auditActorLabel(event.actor, t, event.userId)}
                        </TableCell>
                        <TableCell>
                          <span
                            title={event.action}
                            className="inline-block max-w-[220px] truncate bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-primary-dark dark:text-brand-primary-light"
                          >
                            {auditActionLabel(event.action, t)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {event.target ?? 'n/a'}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">
                          {event.hash.slice(0, 12)}…
                        </TableCell>
                        <TableCell onClick={(click) => click.stopPropagation()}>
                          <RowActionMenu
                            overlay
                            inline={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t('audit.copyHash')}
                                onClick={() => void navigator.clipboard?.writeText(event.hash)}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            }
                          >
                            <TableActionItem icon={Copy} onClick={() => void navigator.clipboard?.writeText(event.hash)}>
                              {t('audit.copyHash')}
                            </TableActionItem>
                          </RowActionMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <DataTablePagination
                currentPage={current}
                totalPages={totalPages}
                totalItems={filtered.length}
                itemsPerPage={pageSize}
                onPageChange={setPage}
                onItemsPerPageChange={setPageSize}
                labels={{
                  rowsPerPage: t('table.rowsPerPage'),
                  range: (from, to, total) => t('table.range', { from, to, total }),
                  page: (currentPage, totalPageCount) =>
                    t('table.page', { current: currentPage, total: totalPageCount }),
                }}
              />
            </>
          )}
        </CardContent>
      </Card>

      <AuditEventDrawer event={selected} onClose={() => setSelected(null)} />
    </>
  )
}
