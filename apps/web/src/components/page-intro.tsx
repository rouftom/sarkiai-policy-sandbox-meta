import * as React from 'react'

/**
 * Dense page heading: title and subtitle on the left, page controls on the right,
 * one row. Long titles and subtitles truncate instead of pushing the controls
 * onto another line; on small screens the controls wrap below the heading.
 */
export function PageIntro({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3 pt-1">
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="truncate font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
        <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      {children && <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">{children}</div>}
    </section>
  )
}
