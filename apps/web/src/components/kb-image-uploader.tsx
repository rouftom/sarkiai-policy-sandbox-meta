'use client'

/**
 * Figures for documents: pick images (or drop them), give them a caption and an
 * optional readiness dimension, and attach them to every listed document. The
 * documents are fixed by the caller: those added in the upload dialog, or the one
 * open in a document's Media tab. The attached figures are shown as previews.
 */

import * as React from 'react'
import { ImagePlus, Loader } from 'lucide-react'
import { Input, Select, cn } from '@sps/ui'
import { READINESS_DIMENSIONS } from '@sps/shared'
import { knowledgeApi } from '@/lib/api'
import { useI18n } from '@/lib/i18n'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

interface Preview {
  id: string
  url: string
  caption: string
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

export function KbImageUploader({
  filenames = [],
  onUploaded,
}: {
  /** The documents the figures are attached to. Without one, nothing can be attached yet. */
  filenames?: string[]
  onUploaded: () => void
}) {
  const key = filenames.join('\u0000')
  const hasDocument = filenames.length > 0
  const { t } = useI18n()
  const [caption, setCaption] = React.useState('')
  const [dimension, setDimension] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [previews, setPreviews] = React.useState<Preview[]>([])
  const [message, setMessage] = React.useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const urls = React.useRef<string[]>([])

  // Previews belong to the documents of this session: a new document starts with none.
  React.useEffect(() => {
    urls.current.forEach((url) => URL.revokeObjectURL(url))
    urls.current = []
    setPreviews([])
  }, [key])

  React.useEffect(
    () => () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url))
    },
    [],
  )

  const upload = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith('image/')).slice(0, 12)
    if (list.length === 0 || !hasDocument) return
    const oversize = list.find((file) => file.size > MAX_IMAGE_BYTES)
    if (oversize) {
      setMessage({ tone: 'error', text: t('kb.image.tooLarge', { name: oversize.name }) })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const images = await Promise.all(
        list.map(async (file) => ({
          caption: caption.trim() || file.name.replace(/\.[^.]+$/, ''),
          mime: file.type,
          dataBase64: await toBase64(file),
          ...(dimension ? { dimension } : {}),
        })),
      )
      for (const filename of filenames) {
        await knowledgeApi.attachImages({ filename, images })
      }
      const created = list.map((file, index) => {
        const url = URL.createObjectURL(file)
        urls.current.push(url)
        return { id: `${file.name}-${index}-${Date.now()}`, url, caption: images[index]!.caption }
      })
      setPreviews((current) => [...created, ...current])
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

  const disabled = busy || !hasDocument

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
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
        tabIndex={disabled ? -1 : 0}
        aria-busy={busy || undefined}
        aria-disabled={disabled || undefined}
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
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {busy ? (
          <Loader className="h-5 w-5 animate-spin text-brand-primary" />
        ) : (
          <ImagePlus className="h-5 w-5 text-brand-primary dark:text-brand-primary-light" />
        )}
        <p className="text-[12px] font-medium text-foreground">{hasDocument ? t('kb.image.drop') : t('kb.image.needDocument')}</p>
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

      {previews.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {previews.map((preview) => (
            <li key={preview.id} className="overflow-hidden rounded-lg border border-border bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.url} alt={preview.caption} className="h-20 w-full object-contain bg-white" />
              <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">{preview.caption}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
