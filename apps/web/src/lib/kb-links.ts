/** Route of one document's editor; `tab` opens the Details, Passages or Media tab. */
export function documentHref(filename: string, tab?: 'details' | 'passages' | 'media'): string {
  const base = `/knowledge/documents/${encodeURIComponent(filename)}`
  return tab && tab !== 'details' ? `${base}?tab=${tab}` : base
}
