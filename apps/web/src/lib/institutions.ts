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
  'text-primary': '#0f766e',
}

export function institutionAccent(colorClass: string): string {
  return ACCENTS[colorClass] ?? '#0f766e'
}
