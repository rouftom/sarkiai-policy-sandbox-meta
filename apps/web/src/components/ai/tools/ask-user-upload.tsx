'use client'

/**
 * File answer for a `request_input` card with `input: 'file'`. Wraps the shared
 * `FileUploader` and keeps one file. The card decides when to send it.
 */

import * as React from 'react'
import { FileText } from 'lucide-react'
import { FileUploader } from '@/components/ui/file-uploader'
import { useI18n } from '@/lib/i18n'

export interface AskUserUploadProps {
  label: string
  hint?: string
  /** `accept` attribute, e.g. `.pdf,.docx`. Empty means any file. */
  accept?: string
  file: File | null
  disabled?: boolean
  onChange: (file: File | null) => void
}

export function AskUserUpload({ label, hint, accept, file, disabled = false, onChange }: AskUserUploadProps) {
  const { t } = useI18n()

  return (
    <div className="space-y-1.5">
      <FileUploader
        label={label}
        hint={hint}
        actionLabel={file ? t('agentui.upload.replace') : t('agentui.upload.choose')}
        accept={accept ?? ''}
        done={!!file}
        disabled={disabled}
        // Cancelling the system picker reports an empty list: keep the current file.
        onFiles={(files) => {
          if (files[0]) onChange(files[0])
        }}
      />
      {file && (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground ml-0.5 min-w-0">
          <FileText className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{file.name}</span>
        </p>
      )}
    </div>
  )
}
