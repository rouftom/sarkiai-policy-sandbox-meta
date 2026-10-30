import { Globe2 } from 'lucide-react'
import { cn } from '@sps/ui'

/**
 * The flag of a country, derived from its ISO 3166-1 alpha-2 code: the two
 * letters map to the regional-indicator pair of the Unicode flag emoji, so the
 * registry needs no image asset and works offline. A code that is not two
 * letters (or a platform without flag glyphs) falls back to the globe.
 */
export function flagEmoji(code: string): string | null {
  const upper = code.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(upper)) return null
  return String.fromCodePoint(...[...upper].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65))
}

export function CountryFlag({ code, className }: { code: string; className?: string }) {
  const flag = flagEmoji(code)
  if (!flag) {
    return (
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-primary/10 text-brand-primary',
          className,
        )}
      >
        <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    )
  }
  return (
    <span
      role="img"
      aria-label={code.trim().toUpperCase()}
      className={cn('flex h-6 w-6 shrink-0 items-center justify-center text-[17px] leading-none', className)}
    >
      {flag}
    </span>
  )
}
