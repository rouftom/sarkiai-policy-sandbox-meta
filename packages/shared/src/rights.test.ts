import { describe, expect, it } from 'bun:test'
import {
  CORPUS_RIGHTS,
  PUBLISHABLE_RIGHTS,
  RightsBlockedError,
  assertPublishableRights,
  isPublishableRights,
  normalizeCorpusRights,
} from './rights'

describe('corpus rights', () => {
  it('exposes the four documented buckets', () => {
    expect([...CORPUS_RIGHTS]).toEqual(['official-text', 'open-licence', 'quotation-only', 'to-confirm'])
    expect([...PUBLISHABLE_RIGHTS]).toEqual(['official-text', 'open-licence'])
  })

  it('only publishes official texts and explicit open licences', () => {
    expect(isPublishableRights('official-text')).toBe(true)
    expect(isPublishableRights('open-licence')).toBe(true)
    expect(isPublishableRights('quotation-only')).toBe(false)
    expect(isPublishableRights('to-confirm')).toBe(false)
  })

  it('fails closed on a missing or unknown value', () => {
    expect(normalizeCorpusRights(undefined)).toBe('to-confirm')
    expect(normalizeCorpusRights(null)).toBe('to-confirm')
    expect(normalizeCorpusRights('')).toBe('to-confirm')
    expect(normalizeCorpusRights('Official-Text')).toBe('to-confirm')
    expect(normalizeCorpusRights(42)).toBe('to-confirm')
  })

  it('refuses a restricted payload with an actionable error', () => {
    expect(() => assertPublishableRights('quotation-only', 'article.txt')).toThrow(RightsBlockedError)
    expect(() => assertPublishableRights(undefined, 'article.txt')).toThrow(/quotation-only and to-confirm/)
    expect(assertPublishableRights('official-text', 'law.txt')).toBe('official-text')
  })
})
