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

  test('returns null when no object is present or the JSON is broken', () => {
    expect(extractJsonObject('no structure here')).toBeNull()
    expect(extractJsonObject('{"summary": ')).toBeNull()
  })
})
