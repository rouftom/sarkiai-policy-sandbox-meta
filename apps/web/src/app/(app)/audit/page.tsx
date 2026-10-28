'use client'

import * as React from 'react'
import { AlertTriangle, Loader, RefreshCw, ScrollText, ShieldCheck } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTablePagination,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sps/ui'
import { authApi, type AuditEventDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { PageIntro } from '@/components/page-intro'

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
  const [events, setEvents] = React.useState<AuditEventDto[]>([])
  const [chain, setChain] = React.useState<{ valid: boolean; brokenAt?: string; forks?: number } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [unreachable, setUnreachable] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)

  const load = React.useCallback(async () => {
    setLoading(true)
    setUnreachable(false)
    try {
      const response = await authApi.auditEvents(FETCH_SIZE)
      setEvents(response.events)
      setChain(response.chain)
    } catch {
      setUnreachable(true)
      setEvents([])
      setChain(null)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return events
    return events.filter((event) =>
      [event.actor, event.action, event.target ?? ''].some((value) => value.toLowerCase().includes(needle)),
    )
  }, [events, query])

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
        <CardHeader className="h-auto flex-wrap gap-x-3 gap-y-2 py-2">
          <ScrollText className="h-4 w-4 text-brand-primary dark:text-brand-primary-light" />
          <CardTitle>{t('audit.title')}</CardTitle>
          <span className="text-[10px] text-muted-foreground">{t('audit.count', { count: filtered.length })}</span>
          <div className="ml-auto flex items-center gap-2">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('audit.filter')}
              aria-label={t('audit.filter')}
              className="h-8 w-40 text-[11px] sm:w-56"
            />
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {t('audit.refresh')}
            </Button>
          </div>
        </CardHeader>

        {chain && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
            <Badge tone={chain.valid ? 'success' : 'danger'} className="max-w-full whitespace-nowrap">
              {chain.valid ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {chain.valid ? t('audit.chainOk') : t('audit.chainBroken', { at: chain.brokenAt ?? '—' })}
            </Badge>
            {chain.valid && (chain.forks ?? 0) > 0 && (
              <span className="text-[10px] text-muted-foreground">{t('audit.forks', { count: chain.forks ?? 0 })}</span>
            )}
          </div>
        )}

        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          {loading && events.length === 0 && (
            <div className="flex items-center gap-2 px-4 py-8 text-xs text-muted-foreground">
              <Loader className="h-4 w-4 animate-spin" />
              {t('audit.loading')}
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
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 hover:bg-transparent dark:border-brand-primary-dark/30">
                      <TableHead>{t('audit.time')}</TableHead>
                      <TableHead>{t('audit.actor')}</TableHead>
                      <TableHead>{t('audit.action')}</TableHead>
                      <TableHead>{t('audit.target')}</TableHead>
                      <TableHead>{t('audit.hash')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatTime(event.ts, locale)}
                        </TableCell>
                        <TableCell className="max-w-[180px] truncate font-medium">{event.actor}</TableCell>
                        <TableCell>
                          <span className="bg-brand-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-primary-dark dark:text-brand-primary-light">
                            {event.action}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {event.target ?? '—'}
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-muted-foreground">
                          {event.hash.slice(0, 12)}…
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
    </>
  )
}
