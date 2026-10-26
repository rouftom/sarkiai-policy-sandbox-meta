import { describe, expect, test } from 'bun:test'
import type { KbChunk } from '@sps/shared'
import { citationFromChunk, formatCitation, formatCitationList, hasGroundedCitation } from './index'

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
