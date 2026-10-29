'use client'

/**
 * One global toast stack: every action that ends tells the operator what
 * happened, with a tone (done, failed, neutral) and the detail of the outcome.
 * The provider lives above the app shell, so a panel deep in a page does not
 * have to render its own banner.
 */

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@sps/ui'
import { useI18n } from '@/lib/i18n'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
}

interface ToastItem extends ToastInput {
  id: number
}

interface ToastApi {
  show: (toast: ToastInput) => number
  success: (title: string, description?: string) => number
  error: (title: string, description?: string) => number
  info: (title: string, description?: string) => number
  dismiss: (id: number) => void
}

const ToastContext = React.createContext<ToastApi | null>(null)

const TONE_TIMEOUT: Record<ToastTone, number> = {
  success: 4200,
  info: 4200,
  error: 7000,
}

const TONE_ICON = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const

const TONE_STYLE: Record<ToastTone, string> = {
  success: 'text-emerald-500',
  error: 'text-destructive',
  info: 'text-brand-primary dark:text-brand-primary-light',
}

const TONE_BORDER: Record<ToastTone, string> = {
  success: 'border-emerald-500/40',
  error: 'border-destructive/40',
  info: 'border-brand-primary/30 dark:border-brand-primary-dark/40',
}

let sequence = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const [items, setItems] = React.useState<ToastItem[]>([])

  const dismiss = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const show = React.useCallback((toast: ToastInput) => {
    const id = ++sequence
    setItems((current) => [...current.slice(-3), { id, tone: 'info', ...toast }])
    return id
  }, [])

  const value = React.useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (title, description) => show({ title, description, tone: 'success' }),
      error: (title, description) => show({ title, description, tone: 'error' }),
      info: (title, description) => show({ title, description, tone: 'info' }),
    }),
    [show, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-sm"
      >
        {items.map((item) => {
          const tone = item.tone ?? 'info'
          const Icon = TONE_ICON[tone]
          return (
            <div
              key={item.id}
              role={tone === 'error' ? 'alert' : 'status'}
              className={cn(
                'pointer-events-auto flex w-full min-w-0 items-start gap-2 rounded-xl border bg-card px-3 py-2.5 text-xs shadow-lg',
                TONE_BORDER[tone],
              )}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE_STYLE[tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-foreground">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 break-words text-[11px] leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label={t('common.close')}
                className="mt-0.5 shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <AutoDismiss id={item.id} tone={tone} onDismiss={dismiss} />
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

/** Each toast carries its own timer, so a new one does not reset the others. */
function AutoDismiss({ id, tone, onDismiss }: { id: number; tone: ToastTone; onDismiss: (id: number) => void }) {
  React.useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(id), TONE_TIMEOUT[tone])
    return () => window.clearTimeout(timer)
  }, [id, tone, onDismiss])
  return null
}

export function useToast(): ToastApi {
  const context = React.useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.')
  return context
}
