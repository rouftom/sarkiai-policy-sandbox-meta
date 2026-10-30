import { describe, expect, test } from 'bun:test'
import { extractJsonObject, plainTextReply } from './structured'

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

describe('plainTextReply', () => {
  test('keeps a plain-text answer when the model skips the JSON envelope', () => {
    expect(plainTextReply('The health ministry must validate the cohort before release.')).toBe(
      'The health ministry must validate the cohort before release.',
    )
  })

  test('removes fences, a summary label and wrapping quotes', () => {
    expect(plainTextReply('```\nsummary: "A short update."\n```')).toBe('A short update.')
  })

  test('strips thinking tags before deciding', () => {
    const open = '<' + 'think' + 'ing>'
    const close = '<' + '/' + 'think' + 'ing>'
    expect(plainTextReply(open + 'compare options' + close + 'The run is at tick 3.')).toBe('The run is at tick 3.')
  })

  test('rejects empty replies and anything that still looks like JSON', () => {
    expect(plainTextReply('   ')).toBeNull()
    expect(plainTextReply('{"summary":"ok"}')).toBeNull()
    expect(plainTextReply('{"summary": ')).toBeNull()
  })

  test('trims to the requested length with an ellipsis', () => {
    const trimmed = plainTextReply('a'.repeat(1200), 900)
    expect(trimmed).toHaveLength(900)
    expect(trimmed?.endsWith('…')).toBe(true)
  })
})
