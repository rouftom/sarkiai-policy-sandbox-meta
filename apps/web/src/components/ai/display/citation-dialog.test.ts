import { describe, expect, test } from 'bun:test'
import { locatePassage } from './citation-dialog'

const chunks = [{ chunkIndex: 250 }, { chunkIndex: 251 }, { chunkIndex: 252 }]

describe('locating the cited passage', () => {
  test('finds the passage by its chunk index, wherever it sits in the document', () => {
    expect(locatePassage(chunks, 252)).toBe(2)
    expect(locatePassage(chunks, 250)).toBe(0)
  })

  test('a passage outside the loaded document is reported as missing, not replaced by the first one', () => {
    expect(locatePassage(chunks, 999)).toBe(-1)
    expect(locatePassage(chunks, undefined)).toBe(-1)
  })
})
