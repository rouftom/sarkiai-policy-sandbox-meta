import { describe, expect, test } from 'bun:test'
import type { KbChunk } from '@sps/shared'
import {
  citationFromChunk,
  citationRetryDirective,
  extractQuotes,
  formatCitation,
  formatCitationList,
  hasGroundedCitation,
  stripCitationLabels,
  validateCitations,
} from './index'

const chunk: KbChunk = {
  id: 'c1',
  filename: 'loi_2024_protection_donnees.pdf',
  text: 'Tout traitement de données à caractère personnel doit être licite et transparent pour la personne concernée.',
  chunkIndex: 0,
  country: 'cm',
  jurisdiction: 'national',
  docType: 'law',
  articleNumber: '12',
  headingPath: 'TITRE I > CHAPITRE II > ARTICLE 12',
  isActive: true,
}

describe('citations', () => {
  test('citationFromChunk truncates long quotes', () => {
    const citation = citationFromChunk(chunk, 20)
    expect(citation.country).toBe('cm')
    expect(citation.articleNumber).toBe('12')
    expect(citation.quote.endsWith('…')).toBe(true)
    expect(citation.quote.length).toBeLessThanOrEqual(21)
  })

  test('formatCitation renders country + article', () => {
    const label = formatCitation(citationFromChunk(chunk))
    expect(label).toContain('CM')
    expect(label).toContain('ARTICLE 12')
  })

  test('formatCitationList produces a Sources block', () => {
    const md = formatCitationList([citationFromChunk(chunk)])
    expect(md).toContain('Sources')
    expect(md).toContain('loi_2024_protection_donnees.pdf')
  })

  test('hasGroundedCitation requires an article/heading present in the answer', () => {
    expect(hasGroundedCitation('Conformément à ARTICLE 12, ...', [citationFromChunk(chunk)])).toBe(true)
    expect(hasGroundedCitation('Réponse sans référence', [citationFromChunk(chunk)])).toBe(false)
    expect(hasGroundedCitation('peu importe', [])).toBe(false)
  })
})

describe('citation validator', () => {
  const provision = citationFromChunk(chunk)

  test('extractQuotes finds every quoting convention and ignores short fragments', () => {
    const answer = [
      'As “Tout traitement de données à caractère personnel doit être licite et transparent pour la personne concernée.” says.',
      'The rule « tout traitement doit être licite » applies.',
      'He said "the law" — too short to verify.',
    ].join('\n')
    const quotes = extractQuotes(answer)
    expect(quotes).toHaveLength(2)
    expect(quotes[0]).toContain('Tout traitement')
  })

  test('a quote present in the corpus is accepted', () => {
    const answer = `ARTICLE 12 — “Tout traitement de données à caractère personnel doit être licite et transparent”`
    const result = validateCitations(answer, [provision])
    expect(result.ok).toBe(true)
    expect(result.rejected).toHaveLength(0)
    expect(result.used).toHaveLength(1)
  })

  test('accent and case differences do not trigger a rejection', () => {
    const answer = `ARTICLE 12 — “tout TRAITEMENT de donnees a caractere personnel doit etre licite”`
    expect(validateCitations(answer, [provision]).ok).toBe(true)
  })

  test('an invented provision is rejected', () => {
    const answer = `ARTICLE 12 — “le traitement des données de santé est interdit sans exception ni recours”`
    const result = validateCitations(answer, [provision])
    expect(result.ok).toBe(false)
    expect(result.rejected).toHaveLength(1)
  })

  test('an answer with no citation is invalid even when it quotes correctly', () => {
    const answer = '“Tout traitement de données à caractère personnel doit être licite et transparent”'
    const result = validateCitations(answer, [provision])
    expect(result.ok).toBe(false)
    expect(result.used).toHaveLength(0)
  })

  test('citationRetryDirective quotes the rejected passages back', () => {
    expect(citationRetryDirective(['invented text'])).toContain('invented text')
  })
})

describe('citation validator — real model output', () => {
  const provision = citationFromChunk(chunk)

  test('a citation label printed inside the quotes is not a fabrication', () => {
    // Observed from muse-spark-1.3: the provenance line is wrapped with the quote.
    const answer =
      '> loi_2024_protection_donnees.pdf · ARTICLE 12 : “Tout traitement de données à caractère personnel doit être licite et transparent pour la personne concernée.”'
    const result = validateCitations(answer, [provision])
    expect(result.rejected).toEqual([])
    expect(result.ok).toBe(true)
  })

  test('an ellipsis inside a real quote does not invalidate it', () => {
    const full = {
      ...provision,
      quote:
        'Tout traitement de données à caractère personnel doit être licite et transparent. Le responsable du traitement notifie toute violation à l’autorité.',
    }
    const answer =
      'ARTICLE 12 — “Tout traitement de données à caractère personnel doit être licite et transparent… Le responsable du traitement notifie toute violation à l’autorité.”'
    expect(validateCitations(answer, [full]).ok).toBe(true)
  })

  test('a quote that alters the wording is still rejected', () => {
    const answer =
      'ARTICLE 12 — “Tout traitement de données doit être licite, loyal et transparent”'
    expect(validateCitations(answer, [provision]).ok).toBe(false)
  })

  test('stripCitationLabels keeps the quoted text intact', () => {
    expect(stripCitationLabels('decret_2025.pdf · ARTICLE 7 : “Les établissements publics notifient”')).toContain(
      'Les établissements publics notifient',
    )
  })
})

describe('citation validator — truncated display excerpts', () => {
  test('a quote beyond the 240-char excerpt is valid against the full text', () => {
    const longText =
      'Tout traitement de données à caractère personnel doit être licite, loyal et transparent. ' +
      'Le responsable du traitement doit notifier à l’autorité de protection des données toute violation ' +
      'de données dans un délai de soixante-douze heures après en avoir pris connaissance, et documenter l’incident.'
    const displayed = citationFromChunk({ ...chunk, text: longText })
    expect(displayed.quote.endsWith('…')).toBe(true)

    const answer =
      'ARTICLE 12 — “Le responsable du traitement doit notifier à l’autorité de protection des données toute violation de données dans un délai de soixante-douze heures après en avoir pris connaissance”'
    // Compared with the excerpt alone, the tail is missing…
    expect(validateCitations(answer, [displayed]).ok).toBe(false)
    // …with the full provision text, it is verbatim.
    expect(validateCitations(answer, [displayed], { corpus: longText }).ok).toBe(true)
  })
})
