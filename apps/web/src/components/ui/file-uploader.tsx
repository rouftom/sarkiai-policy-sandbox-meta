'use client'

/**
 * Drop zone for files, styled as the organization's local-upload tab: a dashed
 * surface with an icon, the label and a primary action, that takes a click or a drop. It only reports the chosen files; the caller decides
 * what to do with them (see `MediaUploader`).
 */

import * as React from 'react'
import { CheckCircle2, Loader, Upload } from 'lucide-react'
import { cn } from '@sps/ui'

export interface FileUploaderProps {
  label: string
  hint?: string
  /** Text of the status pill on the right (e.g. "Choose files"). */
  actionLabel: string
  accept: string
  /** A batch is being processed: the icon turns into a spinner. */
  busy?: boolean
  done?: boolean
  error?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
  className?: string
}

export function FileUploader({
  label,
  hint,
  actionLabel,
  accept,
  busy = false,
  done = false,
  error = false,
  disabled = false,
  onFiles,
  className,
}: FileUploaderProps) {
  const id = React.useId()
  const [dragging, setDragging] = React.useState(false)

  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        type="file"
        multiple
        accept={accept}
        disabled={disabled || busy}
        className="sr-only"
        onChange={(event) => {
          onFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
      <label
        htmlFor={id}
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!disabled && !busy) onFiles(Array.from(event.dataTransfer.files))
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors',
          dragging ? 'border-brand-primary bg-brand-primary/5' : 'border-neutral-300 dark:border-neutral-700',
          error && 'border-destructive/50',
          (disabled || busy) && 'cursor-not-allowed opacity-70',
        )}
      >
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-2xl',
            error
              ? 'bg-destructive/10 text-destructive'
              : done
                ? 'bg-brand-primary text-primary-foreground'
                : 'bg-brand-primary/10 text-brand-primary dark:text-brand-primary-light',
          )}
        >
          {busy ? (
            <Loader className="h-5 w-5 animate-spin" />
          ) : done ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <Upload className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{label}</p>
          {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
        </div>
        <span className="rounded-lg bg-brand-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground">
          {actionLabel}
        </span>
      </label>
    </div>
  )
}
