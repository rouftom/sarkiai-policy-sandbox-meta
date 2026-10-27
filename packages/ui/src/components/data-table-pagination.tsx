'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from './button'
import { Select } from './select'

export interface DataTablePaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  onItemsPerPageChange: (items: number) => void
  /** Localised labels; defaults are the English console wording. */
  labels?: {
    rowsPerPage?: string
    range?: (from: number, to: number, total: number) => string
    page?: (current: number, total: number) => string
  }
  pageSizeOptions?: number[]
}

/**
 * Table footer copied from the FSM organisation console: rows-per-page picker
 * on the left, `from–to of total` in the middle, page chevrons on the right.
 */
export function DataTablePagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  labels,
  pageSizeOptions = [10, 20, 50, 100],
}: DataTablePaginationProps) {
  const safeTotalPages = Math.max(1, totalPages)
  const from = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1
  const to = Math.min(currentPage * itemsPerPage, totalItems)
  const rowsLabel = labels?.rowsPerPage ?? 'Rows per page'
  const range = labels?.range?.(from, to, totalItems) ?? `${from}–${to} of ${totalItems}`
  const pageLabel = labels?.page?.(currentPage, safeTotalPages) ?? `Page ${currentPage} of ${safeTotalPages}`

  return (
    <div className="mt-auto flex shrink-0 flex-col items-center justify-between gap-3 border-t border-slate-100 bg-transparent px-4 py-3 sm:flex-row sm:gap-0 dark:border-brand-primary-dark/25">
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
        <span className="hidden whitespace-nowrap text-[10px] font-light tracking-widest text-slate-500 md:block">
          {rowsLabel}
        </span>
        <Select
          value={String(itemsPerPage)}
          onValueChange={(next) => onItemsPerPageChange(Number(next))}
          ariaLabel={rowsLabel}
          options={pageSizeOptions.map((size) => ({ value: String(size), label: String(size) }))}
          className="w-16"
        />
      </div>

      <span className="text-[10px] font-light tracking-widest text-slate-500">{range}</span>

      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <span className="text-[10px] font-light tracking-widest text-slate-500">{pageLabel}</span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={currentPage >= safeTotalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
