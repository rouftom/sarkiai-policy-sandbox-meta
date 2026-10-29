import { describe, expect, test } from 'bun:test'
import { formatPhone, maskPhone, normalizePhone, renderNotificationEmail } from './index'

describe('normalizePhone', () => {
  test('accepts an E.164 number as-is', () => {
    const result = normalizePhone('+237612345678')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.phone.e164).toBe('+237612345678')
      expect(result.phone.country).toBe('CM')
    }
  })

  test('completes a national number with the default country', () => {
    const result = normalizePhone('6 12 34 56 78', 'CM')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.phone.e164).toBe('+237612345678')
  })

  test('rejects an empty value', () => {
    expect(normalizePhone('')).toEqual({ ok: false, reason: 'empty' })
  })

  test('rejects a number that is not valid', () => {
    const result = normalizePhone('+237000000')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(['invalid', 'too_short', 'unparsable']).toContain(result.reason)
  })
})

describe('phone formatting', () => {
  test('masks all but the country prefix and the last two digits', () => {
    const masked = maskPhone('+237612345678')
    expect(masked.startsWith('+237')).toBe(true)
    expect(masked.endsWith('78')).toBe(true)
    expect(masked).not.toContain('6123')
  })

  test('formats for display', () => {
    expect(formatPhone('+237612345678')).toContain('6')
    expect(formatPhone('not-a-number')).toBe('not-a-number')
  })
})

describe('renderNotificationEmail', () => {
  test('renders HTML and plain text with the message and the call to action', async () => {
    const { html, text } = await renderNotificationEmail({
      locale: 'fr',
      preview: 'Rapport conjoint disponible',
      heading: 'Rapport conjoint',
      intro: 'Cameroun · santé',
      message: 'Premier paragraphe.\n\nSecond paragraphe.',
      cta: { label: 'Ouvrir la console', url: 'https://example.test/scenarios/run_1' },
      note: 'Vous recevez ce message parce que vous avez consenti aux notifications.',
    })
    expect(html).toContain('Rapport conjoint')
    expect(html).toContain('Premier paragraphe.')
    expect(html).toContain('https://example.test/scenarios/run_1')
    expect(text).toContain('Premier paragraphe.')
    expect(text).toContain('Second paragraphe.')
  })
})
