import { describe, expect, test } from 'bun:test'
import { acceptable } from './correction'

describe('acceptable correction', () => {
  test('keeps a close rewrite', () => {
    expect(acceptable('quelle est la loi sur la cybersecurite', 'Quelle est la loi sur la cybersécurité ?')).toBe(true)
  })

  test('rejects an empty or rewritten answer', () => {
    expect(acceptable('quelle est la loi', '')).toBe(false)
    expect(acceptable('quelle est la loi', 'Voici une longue réponse qui ne corrige rien mais raconte une autre histoire entière.')).toBe(false)
  })
})
