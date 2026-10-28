/** Size of a text document, as the knowledge base counts it (characters ≈ bytes for corpus text). */
export function formatSize(characters: number): string {
  if (characters < 1000) return `${characters} B`
  if (characters < 1_000_000) return `${(characters / 1000).toFixed(1)} KB`
  return `${(characters / 1_000_000).toFixed(1)} MB`
}
