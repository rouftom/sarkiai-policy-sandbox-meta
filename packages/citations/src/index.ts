/**
 * Source attribution for legal/policy answers.
 *
 * Unlike a media assistant, a policy/legal adviser MUST cite the exact provision.
 * The chunker already captured `headingPath` and `articleNumber`, so we surface
 * them verbatim instead of paraphrasing.
 */

import type { Citation, CitationValidation, DocType, KbChunk } from '@sps/shared'

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

/**
 * Quote-level verification (N2).
 *
 * `hasGroundedCitation` only checks that *some* article number appears. The
 * validator goes further: every passage the answer quotes must exist in the
 * retrieved provisions. A model that "remembers" a plausible article is caught
 * here, before the claim reaches an institution.
 */

/** Normalise for comparison: case, accents, punctuation and whitespace. */
function normalise(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[«»“”„"'’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Quoted passages of an answer, in every convention we expect models to use
 * (“…”, "...", «…», or a blockquote line). Spans shorter than `minLength` are
 * ignored: short fragments ("the law") are too generic to verify.
 */
export function extractQuotes(answer: string, minLength = 24): string[] {
  const patterns = [/[“"«]([^”"»]{8,600})[”"»]/g, /^\s*>\s+(.{8,600})$/gm]
  const quotes: string[] = []
  for (const pattern of patterns) {
    for (const match of answer.matchAll(pattern)) {
      const quote = (match[1] ?? '').trim()
      if (!quote) continue
      if (normalise(quote).length >= minLength) quotes.push(quote)
    }
  }
  return [...new Set(quotes)]
}

/** Corpus text to compare quotes against. */
function corpusOf(citations: Citation[]): string {
  return normalise(citations.map((c) => c.quote).join(' '))
}

/**
 * Validate an answer against its citations.
 *
 * `used` keeps only the citations the answer actually invokes; `rejected` lists
 * the quotes that appear nowhere in the corpus.
 */
export function validateCitations(
  answer: string,
  citations: Citation[],
  options: { attempts?: number } = {},
): CitationValidation {
  const normalisedAnswer = normalise(answer)
  const used = citations.filter((c) => {
    if (c.articleNumber && normalisedAnswer.includes(normalise(c.articleNumber))) return true
    const heading = c.headingPath?.split(' > ').pop()
    return heading ? normalisedAnswer.includes(normalise(heading)) : false
  })

  const corpus = corpusOf(citations)
  const rejected = extractQuotes(answer).filter((quote) => !corpus.includes(normalise(quote)))

  return { ok: used.length > 0 && rejected.length === 0, used, rejected, attempts: options.attempts ?? 1 }
}

/** Corrective message sent back to the model after a rejected answer. */
export function citationRetryDirective(rejected: string[]): string {
  const list = rejected.map((quote) => `- “${quote.slice(0, 200)}”`).join('\n')
  return `Your previous answer was REJECTED by the citation validator. These passages do not appear in the CONTEXT provisions:
${list}

Rewrite the answer now:
- quote only text that appears verbatim in the CONTEXT;
- cite each provision as "filename · ARTICLE n";
- if the CONTEXT does not support the point, state the gap instead of filling it.`
}
