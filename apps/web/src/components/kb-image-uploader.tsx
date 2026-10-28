'use client'

/**
 * Figures for a document: pick images (or drop them), give them a caption, an
 * optional readiness dimension, and attach them. Used by the upload modal (the
 * document is chosen here) and by a document's Media tab (the document is fixed).
 */

import * as React from 'react'
import { ImagePlus, Loader } from 'lucide-react'
import { Input, Select, cn } from '@sps/ui'
import { READINESS_DIMENSIONS } from '@sps/shared'
import { knowledgeApi, type KbDocumentDto } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

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

export function KbImageUploader({
  documents,
  filename,
  onUploaded,
}: {
  documents?: KbDocumentDto[]
  /** When set, the figures go to this document and no document picker is shown. */
  filename?: string
  onUploaded: () => void
}) {
  const { t } = useI18n()
  const [target, setTarget] = React.useState(filename ?? documents?.[0]?.filename ?? '')
  const [caption, setCaption] = React.useState('')
  const [dimension, setDimension] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (filename) setTarget(filename)
  }, [filename])

  const upload = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'))
    if (list.length === 0 || !target) return
    const oversize = list.find((file) => file.size > MAX_IMAGE_BYTES)
    if (oversize) {
      setMessage({ tone: 'error', text: t('kb.image.tooLarge', { name: oversize.name }) })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const images = await Promise.all(
        list.slice(0, 12).map(async (file) => ({
          caption: caption.trim() || file.name.replace(/\.[^.]+$/, ''),
          mime: file.type,
          dataBase64: await toBase64(file),
          ...(dimension ? { dimension } : {}),
        })),
      )
      await knowledgeApi.attachImages({ filename: target, images })
      setCaption('')
      setMessage({ tone: 'ok', text: t('kb.image.attached', { count: images.length }) })
      onUploaded()
    } catch (caught) {
      setMessage({ tone: 'error', text: caught instanceof Error ? caught.message : String(caught) })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!filename && documents && (
          <Select
            value={target}
            onValueChange={setTarget}
            options={documents.map((document) => ({ value: document.filename, label: document.filename }))}
            ariaLabel={t('kb.image.document')}
            size="sm"
            className="min-w-0 w-56 max-w-full"
          />
        )}
        <Input
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder={t('kb.image.caption')}
          aria-label={t('kb.image.caption')}
          className="h-8 w-48 max-w-full text-[12px]"
        />
        <Select
          value={dimension}
          onValueChange={setDimension}
          options={[{ value: '', label: t('kb.image.noDimension') }, ...READINESS_DIMENSIONS.map((entry) => ({ value: entry.shortName, label: entry.name }))]}
          ariaLabel={t('kb.image.dimension')}
          size="sm"
          className="min-w-0 w-48 max-w-full"
        />
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-busy={busy || undefined}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void upload(event.dataTransfer.files)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-4 py-6 text-center transition-colors hover:border-brand-primary/50 hover:bg-brand-primary/5',
          dragging && 'border-brand-primary bg-brand-primary/10',
          (busy || !target) && 'pointer-events-none opacity-60',
        )}
      >
        {busy ? (
          <Loader className="h-5 w-5 animate-spin text-brand-primary" />
        ) : (
          <ImagePlus className="h-5 w-5 text-brand-primary dark:text-brand-primary-light" />
        )}
        <p className="text-[12px] font-medium text-foreground">{t('kb.image.drop')}</p>
        <p className="text-[10px] text-muted-foreground">{t('kb.image.hint')}</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(event) => void upload(event.target.files)}
        />
      </div>

      {message && (
        <p className={cn('text-[11px]', message.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
          {message.text}
        </p>
      )}
    </div>
  )
}
