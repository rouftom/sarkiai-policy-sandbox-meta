import { describe, expect, test } from 'bun:test'
import { extractJsonObject } from './structured'

describe('extractJsonObject', () => {
  test('reads a bare object', () => {
    expect(extractJsonObject('{"summary":"ok"}')).toEqual({ summary: 'ok' })
  })

  test('strips code fences and surrounding prose', () => {
    const reply = 'Here is the report:\n```json\n{"agreements":["a"],"conflicts":[]}\n```\nThanks.'
    expect(extractJsonObject(reply)).toEqual({ agreements: ['a'], conflicts: [] })
  })

  test('repairs trailing commas and typographic quotes', () => {
    expect(extractJsonObject('{“score”: 3, “gaps”: [“a”,],}')).toEqual({ score: 3, gaps: ['a'] })
  })

  test('closes a reply cut off by the token budget', () => {
    expect(extractJsonObject('{"score": 2, "evidence": ["one", "two"')).toEqual({ score: 2, evidence: ['one', 'two'] })
  })

  test('returns null when no object is present or the JSON is broken', () => {
    expect(extractJsonObject('no structure here')).toBeNull()
    expect(extractJsonObject('{"summary": ')).toBeNull()
  })
})
