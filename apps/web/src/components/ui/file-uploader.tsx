'use client'

/**
 * Drop zone for files, ported from the organization `FileUploader`: a header
 * row (icon chip, title, optional hint, status pill) over a dashed surface that
 * takes a click or a drop. It only reports the chosen files; the caller decides
 * what to do with them (see `MediaUploader`).
 */

import * as React from 'react'
import { CheckCircle2, FileUp, Loader } from 'lucide-react'
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
          'flex cursor-pointer flex-col gap-2 border border-dashed px-4 py-3 transition-colors',
          dragging ? 'border-brand-primary bg-brand-primary/5' : 'border-border bg-card',
          error && 'border-destructive/50',
          (disabled || busy) && 'cursor-not-allowed opacity-70',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
                error
                  ? 'bg-destructive/10 text-destructive'
                  : done
                    ? 'bg-brand-primary text-primary-foreground'
                    : 'bg-brand-primary/10 text-brand-primary dark:text-brand-primary-light',
              )}
            >
              {busy ? (
                <Loader className="h-3.5 w-3.5 animate-spin" />
              ) : done ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <FileUp className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{label}</p>
              {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
            </div>
          </div>
          <span className="shrink-0 bg-brand-primary/10 px-2.5 py-1 text-[10px] font-medium text-brand-primary dark:text-brand-primary-light">
            {actionLabel}
          </span>
        </div>
      </label>
    </div>
  )
}
