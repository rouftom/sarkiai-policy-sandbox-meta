'use client'

/**
 * The one place where files enter the console. Drop or choose files, watch each
 * one through its steps, read the journal of what the pipeline did. Everything
 * about a file's life in the browser lives here: validation, the sequential
 * queue (one upload at a time keeps the model and index calls predictable),
 * progress and the per-file result. The caller only says how one file is sent
 * and what to do once a batch has landed.
 */

import * as React from 'react'
import { AlertTriangle, Check, FileText, Loader, Upload, X } from 'lucide-react'
import { Button, IndeterminateBar, cn } from '@sps/ui'
import { useI18n } from '@/lib/i18n'

export interface UploadStep {
  id: string
  label: string
  status: 'ok' | 'skipped' | 'warning' | 'error'
  detail: string
  ms: number
}

export interface UploadOutcome {
  /** One line shown under the file name once it is done. */
  summary: string
  steps?: UploadStep[]
}

/** Thrown by `upload` to fail a file while still reporting its steps. */
export class UploadFailure extends Error {
  constructor(
    message: string,
    readonly steps: UploadStep[] = [],
  ) {
    super(message)
    this.name = 'UploadFailure'
  }
}

interface QueueItem {
  id: string
  file: File
  status: 'queued' | 'uploading' | 'done' | 'failed'
  outcome?: UploadOutcome
  error?: string
}

export interface MediaUploaderProps {
  /** `accept` attribute of the file input, e.g. `.pdf,.txt`. */
  accept: string
  /** Extension filter applied to the dropped or chosen names. */
  acceptPattern: RegExp
  maxBytes: number
  /** Send one file. Resolve with the outcome, or throw an `UploadFailure`. */
  upload: (file: File) => Promise<UploadOutcome>
  /** Called once a batch is finished and at least one file landed. */
  onBatchDone?: () => void
  /** Controls shown above the drop zone (country, document type, ...). */
  controls?: React.ReactNode
  className?: string
}

const MAX_QUEUE = 30

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

export function MediaUploader({
  accept,
  acceptPattern,
  maxBytes,
  upload,
  onBatchDone,
  controls,
  className,
}: MediaUploaderProps) {
  const { t } = useI18n()
  const [queue, setQueue] = React.useState<QueueItem[]>([])
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const running = queue.some((item) => item.status === 'queued' || item.status === 'uploading')

  const update = (id: string, patch: Partial<QueueItem>) =>
    setQueue((previous) => previous.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return
    const incoming = Array.from(files).map<QueueItem>((file) => {
      const id = crypto.randomUUID()
      if (!acceptPattern.test(file.name)) return { id, file, status: 'failed', error: t('media.unsupported') }
      if (file.size > maxBytes) return { id, file, status: 'failed', error: t('media.tooLarge') }
      return { id, file, status: 'queued' }
    })
    setQueue((previous) => [...incoming, ...previous].slice(0, MAX_QUEUE))
  }

  // Sequential: the next queued file starts once nothing is uploading.
  React.useEffect(() => {
    const next = queue.find((item) => item.status === 'queued')
    if (!next || queue.some((item) => item.status === 'uploading')) return
    update(next.id, { status: 'uploading' })
    upload(next.file)
      .then((outcome) => update(next.id, { status: 'done', outcome }))
      .catch((caught: unknown) => {
        const failure = caught instanceof UploadFailure ? caught : null
        update(next.id, {
          status: 'failed',
          error: failure?.message ?? (caught instanceof Error ? caught.message : String(caught)),
          outcome: failure?.steps.length ? { summary: '', steps: failure.steps } : undefined,
        })
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one upload per queue change
  }, [queue])

  React.useEffect(() => {
    if (!running && queue.some((item) => item.status === 'done')) onBatchDone?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per finished batch
  }, [running])

  return (
    <div className={cn('space-y-3', className)}>
      {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}

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
          'flex flex-col items-center justify-center gap-2 border border-dashed px-4 py-8 text-center transition-colors',
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
          accept={accept}
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
            <QueueRow
              key={item.id}
              item={item}
              onRemove={() => setQueue((previous) => previous.filter((entry) => entry.id !== item.id))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function QueueRow({ item, onRemove }: { item: QueueItem; onRemove: () => void }) {
  const { t } = useI18n()
  const steps = item.outcome?.steps ?? []
  return (
    <li className="border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        {item.status === 'uploading' ? (
          <Loader className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-primary dark:text-brand-primary-light" />
        ) : item.status === 'done' ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-brand-primary dark:text-brand-primary-light" />
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
            {item.status === 'done' && (item.outcome?.summary ?? t('media.queued'))}
            {item.status === 'failed' && (item.error ?? t('media.failed'))}
          </p>
        </div>
        {(item.status === 'done' || item.status === 'failed') && (
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-muted-foreground hover:bg-secondary"
            aria-label={t('media.dismiss')}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {item.status === 'uploading' && <IndeterminateBar className="mt-2" label={t('media.indexing')} />}
      {steps.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground">{t('media.journal')}</summary>
          <ol className="mt-1.5 space-y-1">
            {steps.map((step) => (
              <li key={`${step.id}-${step.label}`} className="flex items-start gap-2 text-[10px]">
                <span
                  className={cn(
                    'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                    step.status === 'ok' && 'bg-brand-primary dark:bg-brand-primary-light',
                    step.status === 'warning' && 'bg-amber-500',
                    step.status === 'error' && 'bg-destructive',
                    step.status === 'skipped' && 'bg-muted-foreground',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{step.label}</span>
                  <span className="text-muted-foreground">: {step.detail}</span>
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
