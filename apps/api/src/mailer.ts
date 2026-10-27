/**
 * Transactional e-mail through Resend (same provider and environment variable
 * names as the SarkiAI enterprise stack: AUTH_RESEND_KEY / AUTH_RESEND_EMAIL_FROM
 * / AUTH_RESEND_EMAIL_REPLY_TO).
 *
 * Three messages leave the box, all with the same monochrome layout:
 *   - the root operator's invitation (one-time password),
 *   - the sign-up confirmation link (before the second factor),
 *   - the password-reset link.
 *
 * The HTTP call is a plain `fetch` on purpose: no SDK, no bundler-specific
 * runtime, and the API key never appears in a log line.
 */

import { config } from './config.js'

export type MailErrorCode = 'mail_not_configured' | 'mail_failed'

export class MailError extends Error {
  constructor(
    readonly code: MailErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'MailError'
  }
}

export interface Invitation {
  to: string
  firstName: string
  lastName: string
  password: string
  /** ISO timestamp used in the footer, injected so the template stays pure. */
  issuedAt?: string
}

export interface MailResult {
  id?: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const BRAND = 'SarkiAI Policy Sandbox'
const FOOTER = 'Made with ♥️ by Djotta'

/* Monochrome palette shared by every message. */
const INK = '#111111'
const PAPER = '#f4f4f4'
const CARD = '#ffffff'
const LINE = '#e4e4e4'
const MUTED = '#6b6b6b'
const FAINT = '#9a9a9a'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function baseUrl(): string {
  return config.mail.publicUrl.replace(/\/+$/, '')
}

function signInUrl(): string {
  return `${baseUrl()}/login`
}

/**
 * Shared frame: dark header band, one card, a footer line. Only the body
 * differs between the three messages.
 */
function layout(options: { title: string; subtitle: string; body: string; lang?: string }): string {
  const year = new Date().getFullYear()
  return `<!doctype html>
<html lang="${options.lang ?? 'fr'}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${BRAND}</title>
  </head>
  <body style="margin:0;padding:0;background:${PAPER};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.subtitle)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${PAPER};padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:${CARD};border:1px solid ${LINE};">
            <tr>
              <td style="background:${INK};padding:24px 28px;">
                <div style="font:700 22px/28px Helvetica,Arial,sans-serif;letter-spacing:.12em;color:#ffffff;">${BRAND}</div>
                <div style="font:400 12px/18px Helvetica,Arial,sans-serif;color:rgba(255,255,255,.7);margin-top:6px;">${escapeHtml(options.title)}</div>
              </td>
            </tr>
            ${options.body}
            <tr>
              <td style="border-top:1px solid ${LINE};padding:14px 28px;background:#fafafa;">
                <div style="font:400 10px/15px Helvetica,Arial,sans-serif;color:${FAINT};">© ${year} ${BRAND} · ${FOOTER}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;font:600 14px/20px Helvetica,Arial,sans-serif;padding:12px 20px;">${label}</a>
                <div style="font:400 11px/17px Helvetica,Arial,sans-serif;color:${FAINT};margin-top:10px;word-break:break-all;">${href}</div>`
}

function bilingual(fr: string, en: string): string {
  return `${fr}<span style="display:block;color:${FAINT};font-size:12px;line-height:18px;margin-top:4px;">${en}</span>`
}

/** Subject line: one language is enough, both are in the body. */
export function invitationSubject(): string {
  return `Votre accès / Your access · ${BRAND}`
}

export function invitationText(invitation: Invitation): string {
  const name = `${invitation.firstName} ${invitation.lastName}`.trim()
  const url = signInUrl()
  return [
    `Bonjour ${name},`,
    '',
    `Un accès opérateur vient d’être créé pour vous sur ${BRAND}.`,
    `Adresse de connexion : ${url}`,
    `Mot de passe provisoire : ${invitation.password}`,
    '',
    'À la première connexion, la console vous demandera de choisir un nouveau mot de passe, puis d’activer la double authentification (TOTP).',
    'Ce mot de passe provisoire ne fonctionne qu’une fois : ne le transférez pas.',
    '',
    '---',
    '',
    `Hello ${name},`,
    '',
    `An operator account has just been created for you on ${BRAND}.`,
    `Sign-in URL: ${url}`,
    `Temporary password: ${invitation.password}`,
    '',
    'On first sign-in the console asks you to choose a new password, then to activate two-factor authentication (TOTP).',
    'This temporary password works once: please do not forward it.',
    '',
    `— ${BRAND}`,
  ].join('\n')
}

export function invitationHtml(invitation: Invitation): string {
  const name = escapeHtml(`${invitation.firstName} ${invitation.lastName}`.trim())
  const email = escapeHtml(invitation.to)
  const password = escapeHtml(invitation.password)
  const url = escapeHtml(signInUrl())

  const step = (index: string, fr: string, en: string) => `
    <tr>
      <td style="padding:0 0 14px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="26" valign="top" style="font:600 13px/20px Helvetica,Arial,sans-serif;color:${INK};">${index}</td>
            <td style="font:400 13px/20px Helvetica,Arial,sans-serif;color:#333333;">${bilingual(fr, en)}</td>
          </tr>
        </table>
      </td>
    </tr>`

  const body = `
            <tr>
              <td style="padding:26px 28px 8px 28px;">
                <p style="margin:0 0 10px 0;font:400 14px/22px Helvetica,Arial,sans-serif;color:${INK};">Bonjour <strong>${name}</strong>,</p>
                <p style="margin:0;font:400 14px/22px Helvetica,Arial,sans-serif;color:#333333;">
                  ${bilingual(
                    `Un accès opérateur vient d’être créé pour <strong>${email}</strong> sur ${BRAND}.`,
                    `An operator account has just been created for ${email} on ${BRAND}.`,
                  )}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 4px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f7f7f7;border:1px solid ${LINE};">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="font:600 10px/14px Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:${MUTED};">Mot de passe provisoire · Temporary password</div>
                      <div style="font:700 20px/28px 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:.06em;color:${INK};margin-top:6px;word-break:break-all;">${password}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 6px 28px;">
                ${button(url, 'Ouvrir la console · Open the console')}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 0 28px;">
                <div style="font:600 11px/16px Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:${INK};margin-bottom:10px;">À la première connexion · On first sign-in</div>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  ${step('01', 'Choisissez un nouveau mot de passe (12 caractères minimum).', 'Choose a new password (12 characters minimum).')}
                  ${step('02', 'Activez la double authentification : scannez le QR code avec votre application TOTP.', 'Activate two-factor authentication: scan the QR code with your TOTP app.')}
                  ${step('03', 'Conservez les dix codes de secours affichés une seule fois.', 'Keep the ten recovery codes shown once.')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 26px 28px;">
                <p style="margin:0;font:400 11px/17px Helvetica,Arial,sans-serif;color:${FAINT};">
                  ${bilingual(
                    'Ce mot de passe provisoire ne fonctionne qu’une fois et doit être remplacé immédiatement. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.',
                    'This temporary password works once and must be replaced immediately. If you did not request it, ignore this message.',
                  )}
                </p>
              </td>
            </tr>`

  return layout({ title: 'Accès opérateur · Operator access', subtitle: 'Votre accès opérateur · Your operator access', body })
}

export interface EmailVerification {
  to: string
  firstName?: string
  /** Signed, 24-hour token from `AuthService.createEmailVerification`. */
  token: string
  expiresAt: string
}

function verificationUrl(token: string): string {
  return `${baseUrl()}/verify-email?token=${encodeURIComponent(token)}`
}

export function emailVerificationSubject(): string {
  return `Confirmez votre adresse / Confirm your address · ${BRAND}`
}

export function emailVerificationText(verification: EmailVerification): string {
  const name = verification.firstName?.trim() || 'there'
  const url = verificationUrl(verification.token)
  return [
    `Bonjour ${name},`,
    '',
    `Confirmez votre adresse e-mail pour activer votre compte ${BRAND} : ${url}`,
    'Une fois l’adresse confirmée, la double authentification (TOTP) est demandée à la connexion.',
    'Ce lien expire dans 24 heures.',
    '',
    '---',
    '',
    `Hello ${name},`,
    '',
    `Confirm your e-mail address to activate your ${BRAND} account: ${url}`,
    'Once the address is confirmed, two-factor authentication (TOTP) is requested at sign-in.',
    'This link expires in 24 hours.',
    '',
    `— ${BRAND}`,
  ].join('\n')
}

export function emailVerificationHtml(verification: EmailVerification): string {
  const name = escapeHtml(verification.firstName?.trim() || 'there')
  const url = escapeHtml(verificationUrl(verification.token))
  const body = `
            <tr>
              <td style="padding:26px 28px 8px 28px;">
                <p style="margin:0 0 10px 0;font:400 14px/22px Helvetica,Arial,sans-serif;color:${INK};">Bonjour <strong>${name}</strong>,</p>
                <p style="margin:0;font:400 14px/22px Helvetica,Arial,sans-serif;color:#333333;">
                  ${bilingual(
                    `Confirmez votre adresse e-mail pour activer votre compte ${BRAND}. La double authentification sera demandée ensuite, à la connexion.`,
                    `Confirm your e-mail address to activate your ${BRAND} account. Two-factor authentication follows at sign-in.`,
                  )}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 6px 28px;">
                ${button(url, 'Confirmer mon adresse · Confirm my address')}
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 26px 28px;">
                <p style="margin:0;font:400 11px/17px Helvetica,Arial,sans-serif;color:${FAINT};">
                  ${bilingual(
                    'Ce lien expire dans 24 heures. Si vous n’êtes pas à l’origine de cette inscription, ignorez cet e-mail.',
                    'This link expires in 24 hours. If you did not sign up, ignore this message.',
                  )}
                </p>
              </td>
            </tr>`
  return layout({ title: 'Confirmation de l’adresse · Address confirmation', subtitle: 'Confirmez votre adresse · Confirm your address', body })
}

export interface PasswordReset {
  to: string
  firstName?: string
  /** Signed, single-use token from `AuthService.createPasswordReset`. */
  token: string
  expiresAt: string
}

function resetUrl(token: string): string {
  return `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`
}

function minutesUntil(expiresAt: string): number {
  return Math.max(1, Math.round((Date.parse(expiresAt) - Date.now()) / 60_000))
}

export function passwordResetSubject(): string {
  return `Réinitialisation du mot de passe / Password reset · ${BRAND}`
}

export function passwordResetText(reset: PasswordReset): string {
  const name = reset.firstName?.trim() || 'there'
  const url = resetUrl(reset.token)
  const minutes = minutesUntil(reset.expiresAt)
  return [
    `Bonjour ${name},`,
    '',
    `Une réinitialisation de mot de passe a été demandée pour votre compte ${BRAND}.`,
    `Choisissez un nouveau mot de passe : ${url}`,
    `Ce lien expire dans ${minutes} minutes et ne fonctionne qu’une fois.`,
    'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
    '',
    '---',
    '',
    `Hello ${name},`,
    '',
    `A password reset was requested for your ${BRAND} account.`,
    `Choose a new password: ${url}`,
    `This link expires in ${minutes} minutes and works once.`,
    'If you did not request it, ignore this e-mail: your password stays unchanged.',
    '',
    `— ${BRAND}`,
  ].join('\n')
}

export function passwordResetHtml(reset: PasswordReset): string {
  const name = escapeHtml(reset.firstName?.trim() || 'there')
  const url = escapeHtml(resetUrl(reset.token))
  const minutes = minutesUntil(reset.expiresAt)
  const body = `
            <tr>
              <td style="padding:26px 28px 8px 28px;">
                <p style="margin:0 0 10px 0;font:400 14px/22px Helvetica,Arial,sans-serif;color:${INK};">Bonjour <strong>${name}</strong>,</p>
                <p style="margin:0;font:400 14px/22px Helvetica,Arial,sans-serif;color:#333333;">
                  ${bilingual(
                    `Une réinitialisation de mot de passe a été demandée pour votre compte. Le lien ne fonctionne qu’une fois et expire dans ${minutes} minutes.`,
                    `A password reset was requested for your account. The link works once and expires in ${minutes} minutes.`,
                  )}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 6px 28px;">
                ${button(url, 'Choisir un mot de passe · Choose a password')}
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 26px 28px;">
                <p style="margin:0;font:400 11px/17px Helvetica,Arial,sans-serif;color:${FAINT};">
                  ${bilingual(
                    'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
                    'If you did not request it, ignore this message: your password stays unchanged.',
                  )}
                </p>
              </td>
            </tr>`
  return layout({ title: 'Mot de passe · Password', subtitle: 'Réinitialisation du mot de passe · Password reset', body })
}

/** POST one message to Resend. The provider's error text never contains the key. */
async function send(payload: Record<string, unknown>): Promise<MailResult> {
  const key = config.mail.apiKey
  if (!key) {
    throw new MailError('mail_not_configured', 'Resend is not configured (AUTH_RESEND_KEY).')
  }
  if (config.mail.replyTo) payload.reply_to = config.mail.replyTo

  let response: Response
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: config.mail.from, ...payload }),
    })
  } catch {
    throw new MailError('mail_failed', 'The e-mail provider is unreachable.')
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    const message = detail.slice(0, 300) || `Resend responded ${response.status}.`
    throw new MailError('mail_failed', message)
  }

  const body = (await response.json().catch(() => null)) as { id?: string } | null
  return { id: body?.id }
}

/**
 * Send the invitation. Throws `MailError` so the route can roll the account back
 * and let the operator retry the setup.
 */
export async function sendInvitation(invitation: Invitation): Promise<MailResult> {
  return send({
    to: [invitation.to],
    subject: invitationSubject(),
    html: invitationHtml(invitation),
    text: invitationText(invitation),
  })
}

/** Send the sign-up confirmation link. Throws `MailError` like the invitation. */
export async function sendEmailVerification(verification: EmailVerification): Promise<MailResult> {
  return send({
    to: [verification.to],
    subject: emailVerificationSubject(),
    html: emailVerificationHtml(verification),
    text: emailVerificationText(verification),
  })
}

/** Send the reset link. Throws `MailError` like the invitation sender. */
export async function sendPasswordReset(reset: PasswordReset): Promise<MailResult> {
  return send({
    to: [reset.to],
    subject: passwordResetSubject(),
    html: passwordResetHtml(reset),
    text: passwordResetText(reset),
  })
}
