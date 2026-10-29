'use client'

/**
 * A confirmation before a destructive or irreversible action. Same look and
 * behaviour as the organization's confirm modal: a translucent rounded card, an
 * icon, a title and a description, and two actions. The dialog stays open while
 * the action runs, and closes when it succeeds.
 */

import * as React from 'react'
import { AlertTriangle, Loader } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, cn } from '@sps/ui'
import { useI18n } from '@/lib/i18n'

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmText,
  cancelText,
  isLoading = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  isLoading?: boolean
}) {
  const { t } = useI18n()
  const [busy, setBusy] = React.useState(false)
  const submitting = React.useRef(false)
  const loading = isLoading || busy

  const confirm = async () => {
    // A second click while the first request runs is ignored.
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch {
      // The caller shows the error; the dialog stays open.
    } finally {
      setBusy(false)
      submitting.current = false
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent
        showCloseButton={false}
        className="w-[calc(100%-2rem)] max-w-[min(400px,calc(100%-2rem))] gap-0 overflow-hidden rounded-3xl border-none p-0 shadow-none backdrop-blur-md bg-white/50 dark:bg-brand-primary-dark/25"
      >
        <div className="p-6">
          <DialogHeader className="space-y-3">
            <div className="mb-2 flex items-center">
              <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-xl bg-brand-primary/10 dark:bg-brand-primary-dark/20">
                <AlertTriangle className="h-4 w-4 text-brand-primary" />
              </div>
              <DialogTitle className="text-left text-md font-light leading-tight tracking-tighter text-slate-900 sm:text-lg dark:text-slate-100">
                {title}
              </DialogTitle>
            </div>
            <DialogDescription className="text-left text-sm font-medium text-slate-500 dark:text-slate-400">{description}</DialogDescription>
          </DialogHeader>
        </div>
        <div className="flex w-full flex-col-reverse items-center justify-end gap-2 px-6 pb-4 sm:flex-row">
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="h-7 w-full rounded-xl border-none bg-transparent px-6 text-[10px] font-semibold tracking-widest shadow-none transition-all hover:bg-slate-100 sm:w-auto dark:hover:bg-brand-primary-dark/30"
          >
            {cancelText ?? t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={() => void confirm()}
            className={cn(
              'flex h-7 w-full items-center gap-2 rounded-xl border-none bg-brand-primary px-6 text-[10px] font-semibold tracking-widest text-white shadow-none transition-all hover:bg-brand-primary-dark active:scale-95 sm:w-auto',
            )}
          >
            {loading && <Loader className="h-3 w-3 animate-spin" />}
            {confirmText ?? t('common.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
