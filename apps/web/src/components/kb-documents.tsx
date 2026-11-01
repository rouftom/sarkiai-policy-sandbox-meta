'use client'

/**
 * Documents of the knowledge base, laid out like the organization's documents
 * screen: an upload surface on top, then the library as a table with search,
 * retire/restore per document and paging. The table scrolls on its own; the
 * page around it never gets a fixed height.
 */

import * as React from 'react'
import { RowActionMenu } from '@/components/ui/row-action-menu'
import { TableActionItem } from '@/components/ui/table-actions'
import { RowActionButton } from '@/components/ui/row-action-button'
import { Eye, ImageIcon, Pencil, RotateCcw, Search, Trash2, Upload, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { KbImageUploader } from '@/components/kb-image-uploader'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { documentHref } from '@/lib/kb-links'
import { Badge, Button, DataTablePagination, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Dialog, DialogContent, DialogHeader, DialogTitle } from '@sps/ui'
import { ApiError, knowledgeApi, type KbDocumentDto, type KbIngestResultDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'
import { countryOptions } from '@/lib/country-options'
import { useWorkspace } from '@/lib/workspace'
import { MediaUploader, UploadFailure, type UploadOutcome } from '@/components/media-uploader'
import { KbMiniStats, type KbSummary } from '@/components/kb-mini-stats'
import { formatSize } from '@/lib/format'

const ACCEPT = '.pdf,.txt,.md,.markdown,.csv,.json'
const ACCEPT_PATTERN = /\.(pdf|txt|md|markdown|csv|json)$/i
const MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_PAGE_SIZE = 10
const DOC_TYPES = ['law', 'policy', 'regulation', 'strategy', 'report', 'guidance']
const RIGHTS = ['official-text', 'open-licence', 'quotation-only', 'to-confirm'] as const
const PUBLISHABLE = new Set<string>(['official-text', 'open-licence'])

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
  onDelete,
  summary,
}: {
  documents: KbDocumentDto[]
  loading: boolean
  onChanged: () => Promise<void>
  onToggle: (document: KbDocumentDto, active: boolean) => Promise<void>
  /** Removes the document and its passages for good, once the operator confirms. */
  onDelete: (document: KbDocumentDto) => Promise<void>
  summary?: KbSummary
}) {
  const { t, locale } = useI18n()
  const { countries } = useWorkspace()
  const [country, setCountry] = React.useState('cm')
  const [docType, setDocType] = React.useState('policy')
  /** Fail closed: the operator must pick a publishable bucket before upload. */
  const [rights, setRights] = React.useState<(typeof RIGHTS)[number]>('to-confirm')
  /** The documents added in this dialog: the figures attach to each of them. */
  const [addedFilenames, setAddedFilenames] = React.useState<string[]>([])
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE)

  const countrySelectOptions = React.useMemo(
    () => countryOptions(countries, locale, country),
    [countries, country, locale],
  )

  const upload = React.useCallback(
    async (file: File): Promise<UploadOutcome> => {
      if (!PUBLISHABLE.has(rights)) {
        throw new UploadFailure(t('knowledge.vectorise.rightsBlocked'), [])
      }
      try {
        const result: KbIngestResultDto = await knowledgeApi.ingestFile({
          filename: file.name,
          contentBase64: await toBase64(file),
          country,
          jurisdiction: 'national',
          docType,
          rights,
          version: '2026',
        })
        setAddedFilenames((current) => (current.includes(file.name) ? current : [...current, file.name]))
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
    [country, docType, rights, t],
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
  const [pendingDelete, setPendingDelete] = React.useState<KbDocumentDto | null>(null)
  const router = useRouter()

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
                    options={countrySelectOptions}
                    ariaLabel={t('knowledge.vectorise.country')}
                    size="sm"
                    className="w-40"
                  />
                  <Select
                    value={docType}
                    onValueChange={setDocType}
                    options={DOC_TYPES.map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))}
                    ariaLabel={t('knowledge.vectorise.docType')}
                    size="sm"
                    className="w-36"
                  />
                  <Select
                    value={rights}
                    onValueChange={(value) => setRights(value as (typeof RIGHTS)[number])}
                    options={RIGHTS.map((value) => ({ value, label: t(`knowledge.rights.${value}`) }))}
                    ariaLabel={t('knowledge.rights.label')}
                    size="sm"
                    className="w-40"
                  />
                </>
              }
            />
            <p className="text-[10px] text-muted-foreground">{t('knowledge.vectorise.rightsHint')}</p>
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-[12px] font-semibold text-foreground">{t('kb.image.sectionTitle')}</p>
              <p className="text-[10px] text-muted-foreground">{t('kb.image.sectionHint')}</p>
              <KbImageUploader filenames={addedFilenames} onUploaded={() => void onChanged()} />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <section className="space-y-3">
        <div className="flex flex-nowrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-[200px] sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('knowledge.corpus.filter')}
              aria-label={t('knowledge.corpus.filter')}
              className="h-8 w-full pl-8 text-[12px] sm:w-[200px]"
            />
          </div>
          {summary && (
            <div className="ml-auto hidden shrink-0 sm:block">
              <KbMiniStats summary={summary} />
            </div>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label={t('knowledge.upload')}
            title={t('knowledge.upload')}
            onClick={() => setUploadOpen(true)}
            className="h-8 w-8 shrink-0 rounded-lg"
          >
            <Upload className="h-3.5 w-3.5" />
          </Button>
        </div>

        {visible.length === 0 ? (
          <p className="border border-border px-4 py-10 text-center text-[12px] text-muted-foreground">
            {loading ? t('knowledge.loading') : t('knowledge.corpus.empty')}
          </p>
        ) : (
          <div className="border border-border">
            <Table className="table-actions-overlay">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('knowledge.corpus.file')}</TableHead>
                  <TableHead>{t('knowledge.corpus.type')}</TableHead>
                  <TableHead className="text-right">{t('knowledge.corpus.size')}</TableHead>
                  <TableHead className="text-right">{t('knowledge.corpus.chunks')}</TableHead>
                  <TableHead className="text-right">{t('knowledge.corpus.action')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((document) => {
                  const retired = document.activeChunks === 0
                  return (
                    <TableRow
                      key={document.filename}
                      className="cursor-pointer"
                      onClick={() => router.push(documentHref(document.filename, undefined, 'view'))}
                    >
                      <TableCell className="min-w-[220px]">
                        <p className="text-[12px] font-medium text-foreground">{document.filename}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {document.country.toUpperCase()} ·{' '}
                          {document.lastIngestedAt
                            ? new Date(document.lastIngestedAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB')
                            : 'n/a'}
                        </p>
                      </TableCell>
                      <TableCell className="text-[12px]">{document.docType}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{formatSize(document.characters)}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">
                        {document.activeChunks.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                        <RowActionMenu
                          overlay
                          inline={
                            <div className="flex items-center justify-end gap-1">
                              <RowActionButton label={t('kb.action.details')} onClick={() => router.push(documentHref(document.filename, undefined, 'view'))}>
                                <Eye className="h-3.5 w-3.5" />
                              </RowActionButton>
                              <RowActionButton label={t('kb.action.edit')} onClick={() => router.push(documentHref(document.filename, undefined, 'edit'))}>
                                <Pencil className="h-3.5 w-3.5" />
                              </RowActionButton>
                              <RowActionButton
                                label={t('kb.action.media')}
                                onClick={() => router.push(documentHref(document.filename, 'media'))}
                              >
                                <ImageIcon className="h-3.5 w-3.5" />
                              </RowActionButton>
                              <RowActionButton
                                label={retired ? t('knowledge.corpus.restore') : t('knowledge.corpus.retire')}
                                tone={retired ? 'default' : 'danger'}
                                disabled={loading}
                                onClick={() => void onToggle(document, retired)}
                              >
                                {retired ? <RotateCcw className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                              </RowActionButton>
                              <RowActionButton
                                label={t('knowledge.corpus.delete')}
                                tone="danger"
                                disabled={loading}
                                onClick={() => setPendingDelete(document)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </RowActionButton>
                            </div>
                          }
                        >
                          <TableActionItem icon={Eye} onClick={() => router.push(documentHref(document.filename, undefined, 'view'))}>
                            {t('kb.action.details')}
                          </TableActionItem>
                          <TableActionItem icon={Pencil} onClick={() => router.push(documentHref(document.filename, undefined, 'edit'))}>
                            {t('kb.action.edit')}
                          </TableActionItem>
                          <TableActionItem icon={ImageIcon} onClick={() => router.push(documentHref(document.filename, 'media'))}>
                            {t('kb.action.media')}
                          </TableActionItem>
                          <TableActionItem
                            icon={retired ? RotateCcw : X}
                            variant={retired ? 'default' : 'danger'}
                            disabled={loading}
                            onClick={() => void onToggle(document, retired)}
                          >
                            {retired ? t('knowledge.corpus.restore') : t('knowledge.corpus.retire')}
                          </TableActionItem>
                          <TableActionItem icon={Trash2} variant="danger" disabled={loading} onClick={() => setPendingDelete(document)}>
                            {t('knowledge.corpus.delete')}
                          </TableActionItem>
                        </RowActionMenu>
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

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return
          await onDelete(pendingDelete)
          setPendingDelete(null)
        }}
        title={t('knowledge.corpus.deleteTitle')}
        description={
          pendingDelete
            ? t('knowledge.corpus.deleteBody', { filename: pendingDelete.filename, chunks: pendingDelete.chunks })
            : ''
        }
        confirmText={t('knowledge.corpus.delete')}
      />
    </div>
  )
}
