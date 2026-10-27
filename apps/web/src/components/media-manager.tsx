'use client'

import * as React from 'react'
import { AlertTriangle, Check, FileText, Loader, RotateCcw, Upload, X } from 'lucide-react'
import { Badge, Button, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@sps/ui'
import { ApiError, knowledgeApi, type KbDocumentDto, type KbIngestResultDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const ACCEPT = /\.(pdf|txt|md|markdown|csv|json)$/i
const MAX_BYTES = 25 * 1024 * 1024
const COUNTRY_OPTIONS = [
  { value: 'cm', label: 'Cameroon (CM)' },
  { value: 'ae', label: 'United Arab Emirates (AE)' },
  { value: 'global', label: 'Global' },
]
const DOC_TYPES = ['law', 'policy', 'regulation', 'strategy', 'report', 'guidance']

interface QueueItem {
  id: string
  file: File
  status: 'queued' | 'uploading' | 'done' | 'failed'
  result?: KbIngestResultDto
  error?: string
}

function fmt(value: number): string {
  return value.toLocaleString('en-US')
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

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

/**
 * The one place where documents enter and leave the knowledge base: drop or
 * choose files, watch each one through the ingestion steps, then manage the
 * whole library (search, retire, restore). Mirrors the FSM media manager: one
 * surface for the upload, the queue and the assets.
 */
export function MediaManager({
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
  const [queue, setQueue] = React.useState<QueueItem[]>([])
  const [dragging, setDragging] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const inputRef = React.useRef<HTMLInputElement>(null)
  const running = queue.some((item) => item.status === 'queued' || item.status === 'uploading')

  const update = (id: string, patch: Partial<QueueItem>) =>
    setQueue((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  const ingest = async (item: QueueItem) => {
    update(item.id, { status: 'uploading' })
    try {
      const result = await knowledgeApi.ingestFile({
        filename: item.file.name,
        contentBase64: await toBase64(item.file),
        country,
        jurisdiction: 'national',
        docType,
        version: '2026',
      })
      update(item.id, { status: 'done', result })
    } catch (caught) {
      const body = caught instanceof ApiError ? caught.json<KbIngestResultDto & { error?: string }>() : null
      update(item.id, {
        status: 'failed',
        error: body?.error ?? (caught instanceof Error ? caught.message : String(caught)),
        result: body?.steps ? (body as KbIngestResultDto) : undefined,
      })
    }
  }

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return
    const incoming = Array.from(files).map<QueueItem>((file) => {
      const id = crypto.randomUUID()
      if (!ACCEPT.test(file.name)) return { id, file, status: 'failed', error: t('media.unsupported') }
      if (file.size > MAX_BYTES) return { id, file, status: 'failed', error: t('media.tooLarge') }
      return { id, file, status: 'queued' }
    })
    setQueue((previous) => [...incoming, ...previous].slice(0, 30))
  }

  // Sequential: one document at a time keeps Voyage and Atlas calls predictable.
  React.useEffect(() => {
    const next = queue.find((item) => item.status === 'queued')
    if (!next || queue.some((item) => item.status === 'uploading')) return
    void ingest(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue])

  React.useEffect(() => {
    if (!running && queue.some((item) => item.status === 'done')) void onChanged()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle ? documents.filter((document) => document.filename.toLowerCase().includes(needle)) : documents
  }, [documents, query])

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={country} onValueChange={setCountry} options={COUNTRY_OPTIONS} ariaLabel={t('knowledge.vectorise.country')} size="sm" className="w-52" />
          <Select
            value={docType}
            onValueChange={setDocType}
            options={DOC_TYPES.map((value) => ({ value, label: value }))}
            ariaLabel={t('knowledge.vectorise.docType')}
            size="sm"
            className="w-36"
          />
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            addFiles(event.dataTransfer.files)
          }}
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-8 text-center transition-colors',
            dragging ? 'border-brand-primary bg-brand-primary/5' : 'border-border bg-card',
          )}
        >
          <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-primary/10 text-brand-primary dark:text-brand-primary-light">
            <Upload className="h-4 w-4" />
          </span>
          <p className="text-[12px] font-medium text-foreground">{t('media.drop')}</p>
          <p className="max-w-sm text-[10px] text-muted-foreground">{t('media.hint')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            {t('media.browse')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,.csv,.json"
            hidden
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </div>

        {queue.length > 0 && (
          <ul className="space-y-1.5">
            {queue.map((item) => (
              <QueueRow key={item.id} item={item} onRemove={() => setQueue((previous) => previous.filter((entry) => entry.id !== item.id))} />
            ))}
          </ul>
        )}
      </section>

      <section className="min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('knowledge.corpus.filter')}
            aria-label={t('knowledge.corpus.filter')}
            className="h-8 max-w-xs text-[12px]"
          />
          <span className="ml-auto text-[11px] text-muted-foreground">
            {t('media.count', { count: documents.length })}
          </span>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-10 text-center text-[12px] text-muted-foreground">
            {loading ? t('knowledge.loading') : t('knowledge.corpus.empty')}
          </p>
        ) : (
          <div className="custom-scrollbar max-h-[560px] overflow-auto rounded-xl border border-border">
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
                {visible.map((document) => {
                  const retired = document.activeChunks === 0
                  return (
                    <TableRow key={document.filename}>
                      <TableCell className="min-w-0">
                        <p className="max-w-[260px] truncate text-[12px] font-medium text-foreground">{document.filename}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {document.country.toUpperCase()} · {document.lastIngestedAt ? new Date(document.lastIngestedAt).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB') : '—'}
                        </p>
                      </TableCell>
                      <TableCell className="text-[12px]">{document.docType}</TableCell>
                      <TableCell className="text-right font-mono text-[12px]">{fmt(document.activeChunks)}</TableCell>
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
          </div>
        )}
      </section>
    </div>
  )
}

function QueueRow({ item, onRemove }: { item: QueueItem; onRemove: () => void }) {
  const { t } = useI18n()
  const steps = item.result?.steps ?? []
  return (
    <li className="rounded-xl border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        {item.status === 'uploading' ? (
          <Loader className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-primary" />
        ) : item.status === 'done' ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        ) : item.status === 'failed' ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-medium text-foreground">{item.file.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {bytes(item.file.size)} ·{' '}
            {item.status === 'queued' && t('media.queued')}
            {item.status === 'uploading' && t('media.indexing')}
            {item.status === 'done' &&
              t('media.done', { chunks: item.result?.chunks ?? 0, inserted: item.result?.inserted ?? 0, unchanged: item.result?.unchanged ?? 0 })}
            {item.status === 'failed' && (item.error ?? t('media.failed'))}
          </p>
        </div>
        {(item.status === 'done' || item.status === 'failed') && (
          <button type="button" onClick={onRemove} className="rounded p-1 text-muted-foreground hover:bg-secondary" aria-label={t('media.dismiss')}>
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {steps.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground">{t('media.journal')}</summary>
          <ol className="mt-1.5 space-y-1">
            {steps.map((step) => (
              <li key={`${step.id}-${step.label}`} className="flex items-start gap-2 text-[10px]">
                <span
                  className={cn(
                    'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                    step.status === 'ok' && 'bg-emerald-500',
                    step.status === 'warning' && 'bg-amber-500',
                    step.status === 'error' && 'bg-destructive',
                    step.status === 'skipped' && 'bg-slate-400',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{step.label}</span>
                  <span className="text-muted-foreground"> — {step.detail}</span>
                </span>
                <span className="shrink-0 font-mono text-[9px] text-muted-foreground">{step.ms} ms</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  )
}
