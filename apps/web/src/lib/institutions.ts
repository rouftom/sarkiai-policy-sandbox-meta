/**
 * The colour of an institution, as the hex value the chat composer and the
 * header use. Institutions carry a Tailwind text class for their icon; this maps
 * each one to the same colour, so the composer can be tinted with it.
 */
const ACCENTS: Record<string, string> = {
  'text-amber-500': '#f59e0b',
  'text-emerald-500': '#10b981',
  'text-sky-500': '#0ea5e9',
  'text-violet-500': '#8b5cf6',
  'text-rose-500': '#f43f5e',
  'text-orange-500': '#f97316',
  'text-lime-600': '#65a30d',
  'text-indigo-500': '#6366f1',
  'text-primary': '#0f766e',
}

export function institutionAccent(colorClass: string): string {
  return ACCENTS[colorClass] ?? '#0f766e'
}

/**
 * A darker shade of the same colour for text: the bright accent is too pale on
 * a light background, so labels use this one in light mode.
 */
const INKS: Record<string, string> = {
  'text-amber-500': '#b45309',
  'text-emerald-500': '#047857',
  'text-sky-500': '#0369a1',
  'text-violet-500': '#6d28d9',
  'text-rose-500': '#be123c',
  'text-orange-500': '#c2410c',
  'text-lime-600': '#4d7c0f',
  'text-indigo-500': '#4338ca',
  'text-primary': '#0f766e',
}

export function institutionInk(colorClass: string): string {
  return INKS[colorClass] ?? '#0f766e'
}
