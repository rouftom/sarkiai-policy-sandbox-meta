import * as React from 'react'

/** Dense page heading: title and subtitle on the left, page controls on the right, one row. */
export function PageIntro({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3 pt-1">
      <div className="min-w-0">
        <h2 className="font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">{title}</h2>
        <p className="text-[11px] text-muted-foreground">{subtitle}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </section>
  )
}
