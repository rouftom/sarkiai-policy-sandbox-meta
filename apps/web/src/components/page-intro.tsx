/** Page heading used by the console's secondary pages. */
export function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="pb-5 pt-2">
      <h2 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 max-w-2xl text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
    </section>
  )
}
