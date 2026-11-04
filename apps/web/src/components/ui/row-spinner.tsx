import { Loader } from 'lucide-react'
import { cn } from '@sps/ui'

/**
 * The placeholder a table row shows while its route is opening. It keeps the
 * action area's footprint, so the row does not jump when the spinner replaces
 * the buttons.
 */
export function RowSpinner({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-6 w-6 items-center justify-center', className)}>
      <Loader className="h-4 w-4 animate-spin text-brand-primary" aria-hidden="true" />
    </span>
  )
}
