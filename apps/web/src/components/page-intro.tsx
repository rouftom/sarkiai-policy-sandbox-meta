import * as React from 'react'

/**
 * Dense page heading: title and subtitle on the left, page controls on the right,
 * one row. Long titles and subtitles truncate instead of pushing the controls
 * onto another line.
 *
 * On small screens an `aside` control (a range switch, a filter) stays on the
 * heading line while `children` wrap below it; from `md` up everything sits in
 * one right-aligned row, in the order heading, aside, children.
 */
export function PageIntro({
  title,
  subtitle,
  children,
  leading,
  aside,
}: {
  title: string
  subtitle: string
  children?: React.ReactNode
  /** Placed before the title, e.g. a back button. */
  leading?: React.ReactNode
  /** Compact control kept beside the heading on small screens. */
  aside?: React.ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 pb-3 pt-1">
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-2 pr-2 md:basis-48">
        {leading}
        <div className="min-w-0 flex-1">
        <h2 className="truncate font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {aside && <div className="min-w-0 shrink-0 md:ml-auto">{aside}</div>}
      {children && (
        <div
          className={
            aside
              ? 'flex w-full min-w-0 max-w-full items-center gap-2 md:w-auto md:flex-wrap md:justify-end'
              : 'ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2'
          }
        >
          {children}
        </div>
      )}
    </section>
  )
}
