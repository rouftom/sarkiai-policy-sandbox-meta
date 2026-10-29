/**
 * Deterministic document chunker for direct knowledge-base ingestion.
 *
 * The cloud demo cannot depend on the optional Python ingestion service, so the
 * API owns the same contract it did before: a document becomes heading-aware,
 * overlapping chunks that keep enough provenance (`headingPath`, article number)
 * for the citation validator to quote them back.
 *
 * No NLP, no model call: headings, paragraphs and sentence boundaries are enough
 * to make retrieval useful, and the result is fully reproducible for tests.
 */

export interface ChunkOptions {
  /** Soft ceiling for one chunk, in characters. */
  maxChars?: number
  /** Characters of the previous chunk repeated at the top of the next one. */
  overlapChars?: number
  /** Documents below this many characters are rejected by the API. */
  minChars?: number
}

export interface DocumentChunk {
  text: string
  chunkIndex: number
  headingPath?: string
  articleNumber?: string
}

export const CHUNK_DEFAULTS = {
  maxChars: 1500,
  overlapChars: 180,
  minChars: 24,
} as const

/** `## 2. Data minimisation` / `ARTICLE 7` / `SECTION 3` / a short ALL-CAPS line. */
const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/
const ARTICLE_PATTERN = /^(?:article|art\.?)\s+([0-9]+(?:\s*[a-z])?(?:[.\-][0-9]+)*)\b(?:\s*[:.\-–]\s*(.*))?$/i
const SECTION_PATTERN = /^(?:section|titre|title|chapitre|chapter)\s+([0-9]+(?:\s*[a-z])?)\b(?:\s*[:.\-–]\s*(.*))?$/i

function normalize(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

interface Section {
  headingPath?: string
  articleNumber?: string
  body: string
}

function pushSection(sections: Section[], section: Section): void {
  if (section.body.trim().length > 0) sections.push({ ...section, body: section.body.trim() })
}

/** Split a too-long paragraph on sentence boundaries (falls back to hard cuts). */
function splitLong(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]
  const sentences = text.match(/[^.!?…]+[.!?…]+[\s"”’)]*|[^.!?…]+$/g) ?? [text]
  const out: string[] = []
  let current = ''
  const flush = () => {
    if (current.trim()) out.push(current.trim())
    current = ''
  }
  for (const sentence of sentences) {
    const piece = sentence.trim()
    if (!piece) continue
    if (piece.length > maxChars) {
      flush()
      for (let start = 0; start < piece.length; start += maxChars) {
        out.push(piece.slice(start, start + maxChars).trim())
      }
      continue
    }
    if ((current + ' ' + piece).trim().length > maxChars) flush()
    current = `${current} ${piece}`.trim()
  }
  flush()
  return out.filter(Boolean)
}

function chunkSection(section: Section, maxChars: number, overlapChars: number): Array<Omit<DocumentChunk, 'chunkIndex'>> {
  const paragraphs = section.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, ' ').trim())
    .filter(Boolean)

  const pieces = paragraphs.flatMap((paragraph) => splitLong(paragraph, maxChars))
  const chunks: Array<Omit<DocumentChunk, 'chunkIndex'>> = []
  let current = ''

  const flush = () => {
    const text = current.trim()
    if (!text) return
    chunks.push({
      text,
      ...(section.headingPath ? { headingPath: section.headingPath } : {}),
      ...(section.articleNumber ? { articleNumber: section.articleNumber } : {}),
    })
    current = overlapChars > 0 ? text.slice(-overlapChars) : ''
  }

  for (const piece of pieces) {
    const candidate = current ? `${current} ${piece}` : piece
    if (candidate.length > maxChars && current.trim().length > overlapChars) {
      flush()
      current = piece
    } else {
      current = candidate
    }
  }
  flush()
  return chunks
}

/** Sections shorter than this, without an article number, join the previous section. */
const MIN_SECTION_CHARS = 400

/**
 * Upper-case lines are often running headers or sub-titles, not structure. Without
 * this merge, every such line starts a section and the chunks become tiny (a
 * 1.6 M-character compilation came out as 3,700 chunks of ~400 characters). Articles
 * keep their own section so the citation provenance stays exact.
 */
function mergeSmallSections(sections: Section[], maxChars: number): Section[] {
  const out: Section[] = []
  for (const section of sections) {
    const previous = out[out.length - 1]
    const body = section.body.trim()
    if (previous && !section.articleNumber && body.length < MIN_SECTION_CHARS && previous.body.length + body.length < maxChars) {
      previous.body = `${previous.body}\n${body}`
      continue
    }
    out.push({ ...section, body })
  }
  return out
}

/**
 * Turn one document into chunks. Headings open a new section and are kept in
 * `headingPath`; article/section numbers are extracted when recognisable.
 */
export function chunkDocument(raw: string, options: ChunkOptions = {}): DocumentChunk[] {
  const maxChars = Math.max(300, options.maxChars ?? CHUNK_DEFAULTS.maxChars)
  const overlapChars = Math.max(0, Math.min(options.overlapChars ?? CHUNK_DEFAULTS.overlapChars, maxChars - 100))
  const text = normalize(raw)
  if (text.length < (options.minChars ?? CHUNK_DEFAULTS.minChars)) return []

  const lines = text.split('\n')
  const sections: Section[] = []
  const headingStack: string[] = []
  let current: Section = { body: '' }

  for (const line of lines) {
    const trimmed = line.trim()
    const hashes = HEADING_PATTERN.exec(trimmed)
    const article = ARTICLE_PATTERN.exec(line.trim())
    const section = SECTION_PATTERN.exec(line.trim())
    const looksLikeHeading =
      Boolean(hashes) ||
      Boolean(article) ||
      Boolean(section) ||
      (trimmed.length > 2 && trimmed.length <= 90 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed))

    if (!looksLikeHeading) {
      current.body += `${line}\n`
      continue
    }

    pushSection(sections, current)

    let heading = trimmed
    if (hashes) {
      const level = hashes[1]!.length
      heading = hashes[2]!.trim()
      headingStack.length = Math.max(0, level - 1)
      headingStack[level - 1] = heading
    } else if (article) {
      heading = `${article[1] ? `Article ${article[1]}` : 'Article'}${article[2] ? ` · ${article[2].trim()}` : ''}`
      headingStack[headingStack.length > 1 ? 1 : 0] = heading
    } else if (section) {
      heading = `${section[1] ? `Section ${section[1]}` : 'Section'}${section[2] ? ` · ${section[2].trim()}` : ''}`
      headingStack[headingStack.length > 1 ? 1 : 0] = heading
    } else {
      headingStack[headingStack.length > 0 ? headingStack.length - 1 : 0] = heading
    }

    current = {
      headingPath: headingStack.filter(Boolean).join(' > '),
      ...(article?.[1] ? { articleNumber: article[1] } : {}),
      body: '',
    }
    // Keep the heading in the embedded text: it carries the legal context.
    current.body += `${heading}\n`
  }
  pushSection(sections, current)

  const chunks = mergeSmallSections(sections, maxChars).flatMap((section) => chunkSection(section, maxChars, overlapChars))
  return chunks.map((chunk, chunkIndex) => ({ ...chunk, chunkIndex }))
}
