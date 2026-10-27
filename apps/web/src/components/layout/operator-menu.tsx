'use client'

import * as React from 'react'
import Link from 'next/link'
import { LogOut, Settings, ShieldCheck, User } from 'lucide-react'
import { cn } from '@sps/ui'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/lib/i18n'

/**
 * Operator menu, ported from the FSM rail: avatar + name/email trigger, a rounded
 * surface, and the same entries (account, preferences, sign out). Built locally so
 * the console does not pull a dropdown library for one menu.
 */
export function OperatorMenu({
  compact = false,
  align = 'start',
  side = 'top',
}: {
  compact?: boolean
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
}) {
  const { operator, signOut } = useAuth()
  const { t } = useI18n()
  const [open, setOpen] = React.useState(false)
  const [signingOut, setSigningOut] = React.useState(false)
  const container = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!operator) return null
  const initial = (operator.name || operator.email || 'A').charAt(0).toUpperCase()

  const itemClass =
    'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-700 transition-colors hover:bg-brand-primary/10 hover:text-brand-primary dark:text-slate-300 dark:hover:bg-brand-primary-dark/25 dark:hover:text-brand-primary-light'

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl bg-slate-100 px-3 py-1.5 transition-colors hover:bg-slate-200 dark:bg-brand-primary-dark/20 dark:hover:bg-brand-primary-dark/35',
          compact && 'justify-center rounded-full p-1',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary font-semibold text-white ring-2 ring-brand-primary/10 dark:ring-brand-primary-dark/40">
            {initial}
          </span>
          {!compact && (
            <span className="flex min-w-0 flex-col items-start">
              <span className="max-w-[130px] truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                {operator.name}
              </span>
              <span className="max-w-[130px] truncate text-[10px] text-slate-500 dark:text-slate-400">
                {operator.email}
              </span>
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 w-52 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-xl',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'start' ? 'left-0' : 'right-0',
          )}
        >
          <p className="px-2 py-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('header.account')}
          </p>
          <div className="my-1 h-px bg-border" />
          <Link href="/preferences" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <User className="h-3.5 w-3.5 text-slate-500" />
            {t('prefs.title')}
          </Link>
          <Link href="/security" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
            {t('security.title')}
          </Link>
          <Link href="/preferences" role="menuitem" className={itemClass} onClick={() => setOpen(false)}>
            <Settings className="h-3.5 w-3.5 text-slate-500" />
            {t('theme.open')}
          </Link>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true)
              setOpen(false)
              try {
                await signOut()
              } finally {
                setSigningOut(false)
              }
            }}
            className={cn(itemClass, 'hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400')}
          >
            <LogOut className={cn('h-3.5 w-3.5 text-slate-500', signingOut && 'animate-pulse')} />
            {t('header.signOut')}
          </button>
        </div>
      )}
    </div>
  )
}
