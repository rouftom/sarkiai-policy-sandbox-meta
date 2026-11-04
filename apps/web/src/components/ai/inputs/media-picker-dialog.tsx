'use client'

/**
 * The composer's media picker.
 *
 * Adapted from the organization console's `MediaPickerDialog`: **Library** lists
 * the images the operator saved across their own conversations (never another
 * operator's) plus the open conversation and the composer, and **Device**
 * imports local files. A library thumbnail is a toggle: it shows a check while
 * its reference is in the message, and clicking it again detaches it without
 * deleting the stored image. Adding reuses the reference, so the bytes never
 * travel a second time. A device pick starts the upload immediately; the parent
 * owns the transfer and hands back the in-flight items, shown here with the
 * application's centred loader so progress is readable even while the dialog
 * stays open.
 */
import * as React from 'react'
import { AlertTriangle, Check, HardDrive, Images, Loader, Upload, X } from 'lucide-react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from '@sps/ui'
import type { AttachmentRefDto } from '@/lib/api'
import { formatBytes, type AttachmentLimits } from '@/lib/attachment-limits'
import { resolveAttachmentUrl } from '@/lib/attachment-url'
import { useI18n } from '@/lib/i18n'

/** One image the composer is uploading, mirrored here so its progress shows. */
export interface MediaUploadItem {
  key: string
  name: string
  /** Blob preview while the upload runs, the stored thumbnail once ready. */
  previewUrl: string
  status: 'uploading' | 'ready' | 'error'
  ref?: AttachmentRefDto
}

export interface MediaPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Images offered as a library: the operator's own, the open conversation and the composer. */
  gallery: AttachmentRefDto[]
  /** Ids the message already holds; their thumbnails show a check. */
  selectedIds?: readonly string[]
  /** Uploads in flight, with their centred progress overlay. */
  uploads?: readonly MediaUploadItem[]
  limits: AttachmentLimits
  /** A device pick: the parent validates and uploads it. */
  onFiles: (files: File[]) => void
  /** Toggles a stored image: adds its reference, or detaches it from the message. */
  onToggle: (ref: AttachmentRefDto) => void
  /** Why the last device selection was partly refused, if it was. */
  error?: string | null
  /** The library is still being read, so an empty grid is not final. */
  loading?: boolean
}

export function MediaPickerDialog({
  open,
  onOpenChange,
  gallery,
  selectedIds = [],
  uploads = [],
  limits,
  onFiles,
  onToggle,
  error = null,
  loading = false,
}: MediaPickerDialogProps) {
  const { t } = useI18n()
  const selected = React.useMemo(() => new Set(selectedIds), [selectedIds])
  const full = uploads.length >= limits.maxImages
  const room = Math.max(0, limits.maxImages - uploads.length)
  const uploading = uploads.some((item) => item.status === 'uploading')

  const limitsHint = t('assistant.mediaLimits', {
    size: formatBytes(limits.maxBytes),
    count: limits.maxImages,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-[min(480px,calc(100%-2rem))] gap-0 overflow-hidden rounded-3xl border-none bg-background/95 p-0 shadow-2xl backdrop-blur-md">
        <div className="p-5">
          <DialogHeader className="gap-1 pr-8">
            <DialogTitle className="text-left text-base font-semibold text-foreground">
              {t('assistant.mediaTitle')}
            </DialogTitle>
            <DialogDescription className="text-left text-xs leading-relaxed text-muted-foreground">
              {t('assistant.mediaHint')}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue={gallery.length > 0 || loading ? 'gallery' : 'device'} className="mt-4 gap-3">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="gallery" className="gap-1.5">
                <Images className="h-3.5 w-3.5" />
                {t('assistant.mediaGallery')}
              </TabsTrigger>
              <TabsTrigger value="device" className="gap-1.5">
                <HardDrive className="h-3.5 w-3.5" />
                {t('assistant.mediaDevice')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="gallery">
              {loading ? (
                <div
                  role="status"
                  aria-label={t('assistant.mediaLoading')}
                  className="grid place-items-center gap-2 rounded-xl border border-dashed border-border px-3 py-8"
                >
                  <Loader className="h-5 w-5 animate-spin text-brand-primary" />
                </div>
              ) : gallery.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  {t('assistant.mediaGalleryEmpty')}
                </p>
              ) : (
                <div className="custom-scrollbar grid max-h-64 grid-cols-4 gap-2 overflow-y-auto pr-1">
                  {gallery.map((ref) => {
                    const attached = selected.has(ref.id)
                    const blocked = !attached && full
                    return (
                      <button
                        key={ref.id}
                        type="button"
                        onClick={() => onToggle(ref)}
                        disabled={blocked}
                        aria-pressed={attached}
                        aria-label={
                          attached
                            ? t('assistant.mediaDetach')
                            : blocked
                              ? t('assistant.mediaFull')
                              : t('assistant.mediaAdd')
                        }
                        title={
                          attached
                            ? t('assistant.mediaDetach')
                            : blocked
                              ? t('assistant.mediaFull')
                              : ref.name
                        }
                        className={cn(
                          'group relative aspect-square overflow-hidden rounded-xl border transition-colors',
                          attached
                            ? 'border-brand-primary/60'
                            : blocked
                              ? 'cursor-not-allowed border-border opacity-50'
                              : 'border-border hover:border-brand-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveAttachmentUrl(ref.thumbnailUrl)}
                          alt={ref.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        {attached && (
                          <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/35">
                            <Check className="h-5 w-5 text-white group-hover:hidden" />
                            <X className="hidden h-5 w-5 text-white group-hover:block" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="device">
              <label
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-card/40 px-4 py-6 text-center transition-colors',
                  full ? 'cursor-not-allowed opacity-60' : 'hover:border-brand-primary/60',
                )}
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs font-medium text-foreground">{t('assistant.mediaChoose')}</span>
                <span className="text-[10px] text-muted-foreground">{limitsHint}</span>
                <input
                  type="file"
                  accept={limits.mimeTypes.join(',')}
                  multiple
                  disabled={full}
                  className="sr-only"
                  onChange={(event) => {
                    const files = Array.from(event.target.files ?? [])
                    event.target.value = ''
                    if (files.length > 0) onFiles(files)
                  }}
                />
              </label>
              {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

              {uploads.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {uploading ? t('assistant.mediaUploading') : t('assistant.mediaUploads')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {uploads.map((item) => (
                      <div
                        key={item.key}
                        className={cn(
                          'relative h-20 w-20 overflow-hidden rounded-xl border',
                          item.status === 'error' ? 'border-destructive' : 'border-border',
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.ref ? resolveAttachmentUrl(item.ref.thumbnailUrl) : item.previewUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                        {item.status === 'uploading' && (
                          <span
                            role="status"
                            aria-label={t('assistant.imageUploading')}
                            className="absolute inset-0 grid place-items-center rounded-xl bg-black/55"
                          >
                            <Loader className="h-6 w-6 animate-spin text-white" />
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span
                            className="absolute inset-0 grid place-items-center rounded-xl bg-destructive/60 text-white"
                            title={t('assistant.imageUploadFailed')}
                          >
                            <AlertTriangle className="h-5 w-5" />
                          </span>
                        )}
                        {item.status === 'ready' && (
                          <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="border-t border-border bg-card/40 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-left text-[10px] text-muted-foreground">
            {t('assistant.mediaRoom', { count: room })}
          </span>
          <Button type="button" size="sm" onClick={() => onOpenChange(false)}>
            {t('assistant.mediaDone')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
