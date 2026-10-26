/**
 * Source attribution for legal/policy answers.
 *
 * Unlike a media assistant, a policy/legal adviser MUST cite the exact provision.
 * The chunker already captured `headingPath` and `articleNumber`, so we surface
 * them verbatim instead of paraphrasing.
 */

import type { Citation, DocType, KbChunk } from '@sps/shared'

export function citationFromChunk(chunk: KbChunk, quoteLength = 240): Citation {
  const quote = chunk.text.length > quoteLength ? `${chunk.text.slice(0, quoteLength).trim()}…` : chunk.text
  return {
    country: chunk.country,
    docType: (chunk.docType ?? 'policy') as DocType,
    filename: chunk.filename,
    articleNumber: chunk.articleNumber,
    headingPath: chunk.headingPath,
    sourceUrl: chunk.sourceUrl,
    quote,
  }
}

/** Human-readable label, e.g. "CM · Law 2024-01 · ARTICLE 12". */
export function formatCitation(citation: Citation): string {
  const parts = [`${citation.country.toUpperCase()}`, citation.filename]
  if (citation.articleNumber) parts.push(`ARTICLE ${citation.articleNumber}`)
  else if (citation.headingPath) parts.push(citation.headingPath)
  return parts.join(' · ')
}

/** Markdown footnote block for reports and chat answers. */
export function formatCitationList(citations: Citation[]): string {
  if (citations.length === 0) return ''
  const lines = citations.map((c, i) => {
    const url = c.sourceUrl ? ` ([source](${c.sourceUrl}))` : ''
    return `${i + 1}. **${formatCitation(c)}** — “${c.quote}”${url}`
  })
  return `\n\n---\n**Sources**\n${lines.join('\n')}`
}

/**
 * A grounded answer is invalid when it makes policy claims without at least one
 * citation. The orchestrator uses this as a hard post-condition.
 */
export function hasGroundedCitation(answer: string, citations: Citation[]): boolean {
  if (citations.length === 0) return false
  return citations.some((c) => {
    if (c.articleNumber && answer.includes(c.articleNumber)) return true
    return c.headingPath ? answer.includes(c.headingPath.split(' > ').pop() ?? '') : false
  })
}
