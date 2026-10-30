'use client'

import * as React from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger, cn } from '@sps/ui'

export interface SearchSelectOption {
  value: string
  label: string
  hint?: string
  /** Extra words matched by the filter but never shown (ids, country codes). */
  keywords?: string
}

/**
 * A single-value picker with a filter field, for lists too long to scan: crisis
 * runs, countries. Radix owns placement and dismissal; the filter stays simple
 * (case- and accent-insensitive substring on label, hint and keywords).
 */
export function SearchSelect({
  value,
  onValueChange,
  options,
  ariaLabel,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  className,
  disabled = false,
}: {
  value: string
  onValueChange: (value: string) => void
  options: SearchSelectOption[]
  ariaLabel: string
  placeholder: string
  searchPlaceholder: string
  emptyLabel: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const selected = options.find((option) => option.value === value)

  const normalized = React.useMemo(() => normalize(query), [query])
  const filtered = React.useMemo(() => {
    if (!normalized) return options
    return options.filter((option) =>
      [option.label, option.hint ?? '', option.keywords ?? ''].some((field) =>
        normalize(field).includes(normalized),
      ),
    )
  }, [normalized, options])

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'flex h-7 w-full items-center justify-between gap-2 rounded-lg border border-border bg-transparent px-2 text-left text-[11px] text-foreground outline-none',
            'hover:border-brand-primary/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span
            className={cn('min-w-0 truncate', !selected && 'text-muted-foreground')}
            title={selected?.label}
          >
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown
            className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-56 max-w-[22rem] p-1.5"
      >
        <div className="flex items-center gap-1.5 rounded-lg border border-border px-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-7 min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div role="listbox" aria-label={ariaLabel} className="custom-scrollbar mt-1 max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-center text-[10px] text-muted-foreground">{emptyLabel}</p>
          ) : (
            filtered.map((option) => {
              const isSelected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors',
                    isSelected
                      ? 'bg-brand-primary/10 text-brand-primary-dark dark:bg-brand-primary-dark/40 dark:text-brand-primary-light'
                      : 'text-foreground hover:bg-secondary',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {option.hint}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Lowercase, without accents: "Adamaoua" matches "adamaoua" and "Cameroun" matches "cameroun". */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
