import { describe, expect, test } from 'bun:test'
import { chunkDocument } from './chunk'

const LAW = `# Data protection act

## Article 1 · Purpose
This Act governs the processing of personal data in Cameroon.

Article 2: Principles
Personal data shall be processed lawfully, fairly and transparently. Data must be collected for specified purposes and kept no longer than necessary.

## Section 3 · Rights
Every data subject has the right to access, rectify and erase their personal data. The controller must answer within thirty days.
`

describe('chunkDocument', () => {
  test('rejects empty and very short documents', () => {
    expect(chunkDocument('')).toHaveLength(0)
    expect(chunkDocument('too short')).toHaveLength(0)
  })

  test('keeps heading paths and article numbers as provenance', () => {
    const chunks = chunkDocument(LAW, { maxChars: 600, overlapChars: 0 })
    expect(chunks.length).toBeGreaterThan(0)
    expect(chunks.some((chunk) => chunk.headingPath?.includes('Data protection act'))).toBe(true)
    expect(chunks.some((chunk) => chunk.articleNumber === '2')).toBe(true)
    expect(chunks.every((chunk) => chunk.text.trim().length > 0)).toBe(true)
  })

  test('respects the chunk ceiling and produces stable indices', () => {
    const long = Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1}. ${'word '.repeat(90)}`).join('\n\n')
    const chunks = chunkDocument(long, { maxChars: 800, overlapChars: 120 })
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index))
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(800)
  })

  test('is deterministic', () => {
    const first = chunkDocument(LAW, { maxChars: 700, overlapChars: 100 })
    const second = chunkDocument(LAW, { maxChars: 700, overlapChars: 100 })
    expect(second).toEqual(first)
  })

  test('running headers do not turn into one tiny chunk each', () => {
    const body = Array.from(
      { length: 40 },
      (_, index) => `RAPPORT ANNUEL SECTION ${index}\nLe texte de cette page décrit le dispositif applicable et ses modalités de mise en œuvre.`,
    ).join('\n')
    const chunks = chunkDocument(body, { maxChars: 1500, overlapChars: 0 })
    expect(chunks.length).toBeLessThan(10)
  })

  test('articles keep their own section, so their numbers survive the merge', () => {
    const text = `${'Texte introductif. '.repeat(30)}\n\nARTICLE 4\nLe responsable du traitement informe la personne concernée.\n\nARTICLE 5\nLes données sont conservées pendant une durée limitée.`
    const numbers = chunkDocument(text, { maxChars: 1500, overlapChars: 0 }).map((chunk) => chunk.articleNumber)
    expect(numbers).toContain('4')
    expect(numbers).toContain('5')
  })
})
