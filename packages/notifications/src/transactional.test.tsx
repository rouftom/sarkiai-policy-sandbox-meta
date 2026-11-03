import { describe, expect, test } from 'bun:test'
import {
  renderEmailVerificationEmail,
  renderInvitationEmail,
  renderPasswordResetEmail,
} from './index'

const logoUrl = 'https://example.test/brand/sarkiai-mark.png'

describe('transactional e-mail templates', () => {
  test('invitation shows the temporary password and both languages', async () => {
    const { html, text } = await renderInvitationEmail({
      firstName: 'Amina',
      lastName: 'Ngono',
      email: 'amina@example.test',
      password: 'Tmp-9F2K-77QX',
      signInUrl: 'https://example.test/login',
      logoUrl,
    })

    expect(html).toContain('Tmp-9F2K-77QX')
    expect(html).toContain('https://example.test/login')
    expect(html).toContain('amina@example.test')
    expect(html).toContain(logoUrl)
    expect(html).toContain('Voici votre code de sécurité')
    expect(text).toContain('VOICI VOTRE CODE DE SÉCURITÉ')
    expect(text).toContain('Tmp-9F2K-77QX')
  })

  test('verification links to the signed route and states the expiry', async () => {
    const { html, text } = await renderEmailVerificationEmail({
      firstName: 'Amina',
      url: 'https://example.test/verify-email?token=abc123',
      logoUrl,
      expiresInHours: 24,
    })

    expect(html).toContain('https://example.test/verify-email?token=abc123')
    expect(html).toContain('Confirmez votre adresse')
    expect(text).toContain('Hello Amina')
    expect(text).toContain('24 heures')
    expect(text).toContain('24 hours')
  })

  test('password reset links to the signed route and states the expiry', async () => {
    const { html, text } = await renderPasswordResetEmail({
      firstName: 'Amina',
      url: 'https://example.test/reset-password?token=abc123',
      logoUrl,
      expiresInMinutes: 30,
    })

    expect(html).toContain('https://example.test/reset-password?token=abc123')
    expect(html).toContain('Réinitialisez votre mot de passe')
    expect(text).toContain('Reset your password')
    expect(text).toContain('30 minutes')
    expect(text).toContain('your password stays unchanged')
  })
})
