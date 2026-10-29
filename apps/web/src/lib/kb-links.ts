/**
 * Route of one document. `tab` opens the Details, Passages or Media tab; `mode`
 * `view` opens it read-only (the default is the editor).
 */
export function documentHref(filename: string, tab?: 'details' | 'passages' | 'media', mode?: 'view' | 'edit'): string {
  const base = `/knowledge/documents/${encodeURIComponent(filename)}`
  const params = new URLSearchParams()
  if (tab && tab !== 'details') params.set('tab', tab)
  if (mode === 'view') params.set('mode', 'view')
  const query = params.toString()
  return query ? `${base}?${query}` : base
}
