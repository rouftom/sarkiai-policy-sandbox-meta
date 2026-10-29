import { describe, expect, test } from 'bun:test'
import { INSTITUTIONS } from '@sps/shared'
import { buildSystemPrompt, languageName } from './prompt'

const institution = INSTITUTIONS.find((i) => i.id === 'ministry_health')!

describe('agent answer language', () => {
  test('the answer is written in the language of the console', () => {
    const fr = buildSystemPrompt({ institution, country: 'cm', domain: 'health', chunks: [], language: 'fr' })
    const en = buildSystemPrompt({ institution, country: 'cm', domain: 'health', chunks: [], language: 'en' })
    expect(fr).toContain('write every sentence of your answer in French')
    expect(en).toContain('write every sentence of your answer in English')
    expect(fr).not.toContain('in English')
  })

  test('English when no language is given', () => {
    const prompt = buildSystemPrompt({ institution, country: 'cm', domain: 'health', chunks: [] })
    expect(prompt).toContain('write every sentence of your answer in English')
    expect(languageName('fr')).toBe('French')
  })
})
