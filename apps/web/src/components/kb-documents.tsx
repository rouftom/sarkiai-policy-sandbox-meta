'use client'

/**
 * Documents of the knowledge base, laid out like the organization's documents
 * screen: an upload surface on top, then the library as a table with search,
 * retire/restore per document and paging. The table scrolls on its own; the
 * page around it never gets a fixed height.
 */

import * as React from 'react'
import { RotateCcw, Search, Upload, X } from 'lucide-react'
import { Badge, Button, DataTablePagination, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle } from '@sps/ui'
import { ApiError, knowledgeApi, type KbDocumentDto, type KbIngestResultDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { MediaUploader, UploadFailure, type UploadOutcome } from '@/components/media-uploader'

const ACCEPT = '.pdf,.txt,.md,.markdown,.csv,.json'
const ACCEPT_PATTERN = /\.(pdf|txt|md|markdown|csv|json)$/i
const MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_PAGE_SIZE = 10
/** Country codes are data identifiers, shown as they are stored. */
const COUNTRY_OPTIONS = [
  { value: 'cm', label: 'CM' },
  { value: 'ae', label: 'AE' },
  { value: 'global', label: 'Global' },
]
const DOC_TYPES = ['law', 'policy', 'regulation', 'strategy', 'report', 'guidance']

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function KbDocuments({
  documents,
  loading,
  onChanged,
  onToggle,
}: {
  documents: KbDocumentDto[]
  loading: boolean
  onChanged: () => Promise<void>
  onToggle: (document: KbDocumentDto, active: boolean) => Promise<void>
}) {
  const { t, locale } = useI18n()
  const [country, setCountry] = React.useState('cm')
  const [docType, setDocType] = React.useState('policy')
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)

  const upload = React.useCallback(
    async (file: File): Promise<UploadOutcome> => {
      try {
        const result: KbIngestResultDto = await knowledgeApi.ingestFile({
          filename: file.name,
          contentBase64: await toBase64(file),
          country,
          jurisdiction: 'national',
          docType,
          version: '2026',
        })
        return {
          summary: t('media.done', { chunks: result.chunks, inserted: result.inserted, unchanged: result.unchanged }),
          steps: result.steps,
        }
      } catch (caught) {
        const body = caught instanceof ApiError ? caught.json<KbIngestResultDto & { error?: string }>() : null
        throw new UploadFailure(
          body?.error ?? (caught instanceof Error ? caught.message : String(caught)),
          body?.steps ?? [],
        )
      }
    },
    [country, docType, t],
  )

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? documents.filter((document) => document.filename.toLowerCase().includes(needle)) : documents
  }, [documents, query])

  React.useEffect(() => setPage(1), [query, pageSize])

  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const [uploadOpen, setUploadOpen] = React.useState(false)

  return (
    <div className="space-y-3">
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-2xl gap-0 overflow-hidden rounded-3xl p-0">
          <DialogHeader className="border-b border-border px-5 py-3">
            <DialogTitle className="text-sm font-semibold">{t('knowledge.uploadTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <MediaUploader
              accept={ACCEPT}
              acceptPattern={ACCEPT_PATTERN}
              maxBytes={MAX_BYTES}
              upload={upload}
              onBatchDone={() => void onChanged()}
              controls={
                <>
                  <Select
                    value={country}
                    onValueChange={setCountry}
                    options={COUNTRY_OPTIONS}
                    ariaLabel={t('knowledge.vectorise.country')}
                    size="sm"
                    className="w-40"
                  />
                  <Select
                    value={docType}
                    onValueChange={setDocType}
                    options={DOC_TYPES.map((value) => ({ value, label: value }))}
                    ariaLabel={t('knowledge.vectorise.docType')}
                    size="sm"
                    className="w-36"
                  />
                </>
              }
            />
          </div>
        </DialogContent>
      </Dialog>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label={t('knowledge.upload')}
            title={t('knowledge.upload')}
            onClick={() => setUploadOpen(true)}
            className="h-8 w-8 rounded-lg"
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('knowledge.corpus.filter')}
              aria-label={t('knowledge.corpus.filter')}
              className="h-8 pl-8 text-[12px]"
            />
          </div>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {t('media.count', { count: documents.length })}
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="border border-border px-4 py-10 text-center text-[12px] text-muted-foreground">
            {loading ? t('knowledge.loading') : t('knowledge.corpus.empty')}
          </p>
        ) : (
          <div className="border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('knowledge.corpus.file')}</TableHead>
                  <TableHead>{t('knowledge.corpus.type')}</TableHead>
                  <TableHead className="text-right">{t('knowledge.corpus.chunks')}</TableHead>
                  <TableHead className="text-right">{t('knowledge.corpus.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((document) => {
                  const retired = document.activeChunks === 0
                  return (
                    <TableRow key={document.filename}>
                      <TableCell className="min-w-[220px]">
                        <p className="text-[12px] font-medium text-foreground">{document.filename}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {document.country.toUpperCase()} ·{' '}
                          {document.lastIngestedAt
                            ? new Date(document.lastIngestedAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')
                            : '—'}
                        </p>
                      </TableCell>
                      <TableCell className="text-[12px]">{document.docType}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">
                        {document.activeChunks.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {retired && <Badge tone="warning">{t('knowledge.corpus.retired')}</Badge>}
                          <Button variant="ghost" size="sm" disabled={loading} onClick={() => void onToggle(document, retired)}>
                            {retired ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                            {retired ? t('knowledge.corpus.restore') : t('knowledge.corpus.retire')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <DataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={visible.length}
              itemsPerPage={pageSize}
              onPageChange={setPage}
              onItemsPerPageChange={setPageSize}
              labels={{
                rowsPerPage: t('table.rowsPerPage'),
                range: (from, to, total) => t('table.range', { from, to, total }),
                page: (current, total) => t('table.page', { current, total }),
              }}
            />
          </div>
        )}
      </section>
    </div>
  )
}
