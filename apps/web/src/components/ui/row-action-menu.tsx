'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sps/ui'
import { cn } from '@sps/ui'

interface RowActionMenuProps {
  /** Dropdown content (usually `TableActionItem`s). */
  children: React.ReactNode
  /** Inline action buttons rendered directly in the cell (desktop hover). */
  inline?: React.ReactNode
  /** Always-visible trigger (e.g. a `…` button) that opens the menu on click. */
  trigger?: React.ReactNode
  /**
   * Overlay variant: the actions live in a zero-width sticky column and are
   * revealed as a frosted overlay on row hover (requires `table-actions-overlay`
   * on the `<Table>`).
   */
  overlay?: boolean
  /** Optional label rendered at the top of the dropdown. */
  menuLabel?: React.ReactNode
  /** Extra classes for the dropdown content. */
  contentClassName?: string
  /** Long-press duration (ms) on touch devices. */
  longPressMs?: number
  /**
   * CSS selector of the interactive container that receives the long-press /
   * right-click and the "menu open" highlight. Defaults to the table row `tr`;
   * pass e.g. `[data-history-item]` for list items outside a table.
   */
  containerSelector?: string
  /** Attribute set on the container while the menu is open. */
  highlightAttribute?: string
  /**
   * Locks the whole row's actions while a mutation is in flight (prevents
   * double submits / side-effect races). Disables the inline buttons, closes
   * the dropdown and dims the actions.
   */
  busy?: boolean
}

/**
 * RowActionMenu
 *
 * Row actions that adapt to the device, while the row carries `group/row`:
 * - Desktop: the inline buttons / trigger are shown in the cell and the SAME
 *   actions are openable via a right-click anywhere on the row.
 * - Touch: a long-press anywhere on the row opens the dropdown.
 *
 * The dropdown is anchored to the MIDDLE of the row (right-click / long-press /
 * trigger click) via an invisible absolute anchor rather than the pointer.
 */
export function RowActionMenu({
  children,
  inline,
  trigger,
  overlay = false,
  menuLabel,
  contentClassName,
  longPressMs = 500,
  containerSelector = 'tr',
  highlightAttribute = 'data-row-menu-open',
  busy = false,
}: RowActionMenuProps) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const openMenu = useCallback(() => {
    const root = rootRef.current
    const row = root?.closest(containerSelector) as HTMLElement | null
    if (!row) return
    // A long-press on touch tends to select the row text: clear it so the
    // dropdown is not shown over a highlighted title.
    window.getSelection()?.removeAllRanges()
    // Anchor the menu to the MIDDLE of the row, not the pointer position.
    // The anchor must be `position: absolute` (not `fixed`): the row lives
    // inside surfaces with `backdrop-filter` (Card, header…), which would
    // become the containing block for a fixed element and offset it.
    const rowRect = row.getBoundingClientRect()
    const container = row.closest('[data-slot="table-container"]')
    const containerRect = container?.getBoundingClientRect()
    // Centre on the VISIBLE part of the row (the table can be wider than the
    // viewport, so the geometric centre may be off-screen).
    const visibleLeft = containerRect ? Math.max(rowRect.left, containerRect.left) : rowRect.left
    const visibleRight = containerRect ? Math.min(rowRect.right, containerRect.right) : rowRect.right
    const targetX = (visibleLeft + visibleRight) / 2
    const targetY = rowRect.top + rowRect.height / 2

    // Convert viewport coordinates into the containing-block coordinates used
    // by the absolutely-positioned anchor. In overlay mode the root itself is
    // positioned (so it IS the containing block); otherwise fall back to the
    // nearest positioned ancestor.
    const isRootPositioned = root ? window.getComputedStyle(root).position !== 'static' : false
    const containingBlock =
      ((isRootPositioned ? root : root?.offsetParent) as HTMLElement | null) ?? document.body
    const blockRect = containingBlock.getBoundingClientRect()
    setAnchor({ x: targetX - blockRect.left, y: targetY - blockRect.top })
    setOpen(true)
  }, [containerSelector])

  useEffect(() => {
    const root = rootRef.current
    const row = root?.closest(containerSelector) as HTMLElement | null
    if (!row) return

    const onContextMenu = (event: MouseEvent) => {
      // Right-click on desktop only (skip coarse/touch pointers).
      if (window.matchMedia('(pointer: coarse)').matches) return
      event.preventDefault()
      openMenu()
    }

    const onTouchStart = () => {
      clearLongPress()
      longPressTimer.current = setTimeout(() => openMenu(), longPressMs)
    }
    const onTouchEnd = () => clearLongPress()
    const onTouchMove = () => clearLongPress()

    row.addEventListener('contextmenu', onContextMenu)
    row.addEventListener('touchstart', onTouchStart, { passive: true })
    row.addEventListener('touchend', onTouchEnd)
    row.addEventListener('touchmove', onTouchMove, { passive: true })

    return () => {
      row.removeEventListener('contextmenu', onContextMenu)
      row.removeEventListener('touchstart', onTouchStart)
      row.removeEventListener('touchend', onTouchEnd)
      row.removeEventListener('touchmove', onTouchMove)
      clearLongPress()
    }
  }, [longPressMs, clearLongPress, openMenu, containerSelector])

  // Close on scroll so the anchor does not drift.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [open])

  // Lock the row while a mutation is in flight.
  useEffect(() => {
    if (busy) setOpen(false)
  }, [busy])

  // Keep the row highlighted (same background as its hover state) while its
  // action menu is open, essential on touch where there is no hover.
  useEffect(() => {
    const row = rootRef.current?.closest(containerSelector)
    if (!row) return
    if (open) {
      row.setAttribute(highlightAttribute, 'true')
      window.getSelection()?.removeAllRanges()
    } else {
      row.removeAttribute(highlightAttribute)
    }
    return () => row.removeAttribute(highlightAttribute)
  }, [open, containerSelector, highlightAttribute])

  return (
    <div
      ref={rootRef}
      aria-busy={busy || undefined}
      className={cn(
        'flex items-center justify-center',
        busy && 'pointer-events-none opacity-60',
        overlay &&
          'pointer-events-none absolute inset-y-0 right-0 gap-1.5 rounded-l-2xl px-4 opacity-0 backdrop-blur-md transition-opacity duration-150 bg-brand-primary/10 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 dark:bg-brand-primary-dark/20',
      )}
    >
      {inline}
      {trigger ? (
        <span
          className="inline-flex items-center justify-center"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation()
            openMenu()
          }}
        >
          {trigger}
        </span>
      ) : null}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {/* Zero-size trigger positioned at the middle of the row (absolute anchor). */}
        <DropdownMenuTrigger asChild>
          <span
            aria-hidden="true"
            style={{ position: 'absolute', left: anchor.x, top: anchor.y, width: 0, height: 0, pointerEvents: 'none' }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="center"
          className={cn(
            'w-48 rounded-2xl p-1.5 backdrop-blur-md border border-neutral-300 dark:border-neutral-800',
            contentClassName,
          )}
        >
          {menuLabel && (
            <>
              <DropdownMenuLabel className="text-[9px] font-light text-slate-400 px-2 py-1.5 tracking-widest">
                {menuLabel}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-neutral-100 dark:bg-neutral-800" />
            </>
          )}
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
