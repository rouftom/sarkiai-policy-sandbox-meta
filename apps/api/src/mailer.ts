/**
 * Transactional e-mail through Resend (same provider and environment variable
 * names as the SarkiAI enterprise stack: AUTH_RESEND_KEY / AUTH_RESEND_EMAIL_FROM
 * / AUTH_RESEND_EMAIL_REPLY_TO).
 *
 * The only message the sandbox sends is the root operator's invitation: a
 * one-time password, the console URL, and the two steps that follow the first
 * sign-in (replace the password, activate TOTP). Nothing else leaves the box.
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function signInUrl(): string {
  return `${config.mail.publicUrl.replace(/\/+$/, '')}/login`
}

/** Subject line: one language is enough, both are in the body. */
export function invitationSubject(): string {
  return 'Votre accès / Your access · SarkiAI Policy Sandbox'
}

export function invitationText(invitation: Invitation): string {
  const name = `${invitation.firstName} ${invitation.lastName}`.trim()
  const url = signInUrl()
  return [
    `Bonjour ${name},`,
    '',
    'Un accès opérateur vient d’être créé pour vous sur SarkiAI Policy Sandbox.',
    `Adresse de connexion : ${url}`,
    `Mot de passe provisoire : ${invitation.password}`,
    '',
    'À la première connexion, le console vous demandera de choisir un nouveau mot de passe, puis d’activer la double authentification (TOTP).',
    'Ce mot de passe provisoire ne fonctionne qu’une fois : ne le transférez pas.',
    '',
    '---',
    '',
    `Hello ${name},`,
    '',
    'An operator account has just been created for you on SarkiAI Policy Sandbox.',
    `Sign-in URL: ${url}`,
    `Temporary password: ${invitation.password}`,
    '',
    'On first sign-in the console asks you to choose a new password, then to activate two-factor authentication (TOTP).',
    'This temporary password works once: please do not forward it.',
    '',
    '— SarkiAI Policy Sandbox',
  ].join('\n')
}

export function invitationHtml(invitation: Invitation): string {
  const name = escapeHtml(`${invitation.firstName} ${invitation.lastName}`.trim())
  const email = escapeHtml(invitation.to)
  const password = escapeHtml(invitation.password)
  const url = escapeHtml(signInUrl())
  const year = new Date().getFullYear()

  const step = (index: string, fr: string, en: string) => `
    <tr>
      <td style="padding:0 0 14px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td width="26" valign="top" style="font:600 13px/20px Helvetica,Arial,sans-serif;color:#1B834F;">${index}</td>
            <td style="font:400 13px/20px Helvetica,Arial,sans-serif;color:#334155;">
              ${fr}
              <span style="display:block;color:#94a3b8;font-size:11px;line-height:17px;">${en}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>`

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>SarkiAI Policy Sandbox</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f4;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Votre accès opérateur · Your operator access</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f6f4;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8e4;overflow:hidden;">
            <tr>
              <td style="background:#06140E;padding:26px 28px;">
                <div style="font:700 12px/16px Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8ee0b4;">SarkiAI</div>
                <div style="font:700 22px/28px Georgia,'Times New Roman',serif;color:#ffffff;margin-top:6px;">Policy Sandbox</div>
                <div style="font:400 12px/18px Helvetica,Arial,sans-serif;color:rgba(255,255,255,.62);margin-top:6px;">Accès opérateur · Operator access</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px 28px;">
                <p style="margin:0 0 10px 0;font:400 14px/22px Helvetica,Arial,sans-serif;color:#0f172a;">Bonjour <strong>${name}</strong>,</p>
                <p style="margin:0;font:400 14px/22px Helvetica,Arial,sans-serif;color:#334155;">
                  Un accès opérateur vient d’être créé pour <strong>${email}</strong> sur SarkiAI Policy Sandbox,
                  le bac à sable de politiques publiques.
                  <span style="display:block;color:#94a3b8;font-size:12px;line-height:19px;margin-top:4px;">
                    An operator account has just been created for ${email} on SarkiAI Policy Sandbox.
                  </span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 4px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f7faf8;border:1px solid #dcebe2;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="font:600 10px/14px Helvetica,Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#64748b;">Mot de passe provisoire · Temporary password</div>
                      <div style="font:700 20px/28px 'SFMono-Regular',Menlo,Consolas,monospace;letter-spacing:.06em;color:#06140E;margin-top:6px;word-break:break-all;">${password}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 6px 28px;">
                <a href="${url}" style="display:inline-block;background:#1B834F;color:#ffffff;text-decoration:none;font:600 14px/20px Helvetica,Arial,sans-serif;padding:12px 20px;border-radius:10px;">
                  Ouvrir la console · Open the console
                </a>
                <div style="font:400 11px/17px Helvetica,Arial,sans-serif;color:#94a3b8;margin-top:10px;word-break:break-all;">${url}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 0 28px;">
                <div style="font:600 11px/16px Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#1B834F;margin-bottom:10px;">À la première connexion · On first sign-in</div>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  ${step('01', 'Choisissez un nouveau mot de passe (12 caractères minimum).', 'Choose a new password (12 characters minimum).')}
                  ${step('02', 'Activez la double authentification : scannez le QR code avec votre application TOTP.', 'Activate two-factor authentication: scan the QR code with your TOTP app.')}
                  ${step('03', 'Conservez les dix codes de secours affichés une seule fois.', 'Keep the ten recovery codes shown once.')}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 26px 28px;">
                <p style="margin:0;font:400 11px/17px Helvetica,Arial,sans-serif;color:#94a3b8;">
                  Ce mot de passe provisoire ne fonctionne qu’une fois et doit être remplacé immédiatement.
                  Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.
                  <span style="display:block;margin-top:4px;">This temporary password works once and must be replaced immediately. If you did not request it, ignore this message.</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #eef2ef;padding:16px 28px;background:#fbfcfb;">
                <div style="font:400 10px/15px Helvetica,Arial,sans-serif;color:#94a3b8;">© ${year} SarkiAI Policy Sandbox · Meta Global AI Developer Hackathon</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * Send the invitation. Throws `MailError` so the route can roll the account back
 * and let the operator retry the setup.
 */
export async function sendInvitation(invitation: Invitation): Promise<MailResult> {
  const key = config.mail.apiKey
  if (!key) {
    throw new MailError('mail_not_configured', 'Resend is not configured (AUTH_RESEND_KEY).')
  }

  const payload: Record<string, unknown> = {
    from: config.mail.from,
    to: [invitation.to],
    subject: invitationSubject(),
    html: invitationHtml(invitation),
    text: invitationText(invitation),
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
      body: JSON.stringify(payload),
    })
  } catch {
    throw new MailError('mail_failed', 'The e-mail provider is unreachable.')
  }

  if (!response.ok) {
    // Body is a provider error message; it never contains the key.
    const detail = await response.text().catch(() => '')
    const message = detail.slice(0, 300) || `Resend responded ${response.status}.`
    throw new MailError('mail_failed', message)
  }

  const body = (await response.json().catch(() => null)) as { id?: string } | null
  return { id: body?.id }
}

export interface PasswordReset {
  to: string
  firstName?: string
  /** Signed, single-use token from `AuthService.createPasswordReset`. */
  token: string
  expiresAt: string
}

function resetUrl(token: string): string {
  const base = config.mail.publicUrl.replace(/\/+$/, '')
  return `${base}/reset-password?token=${encodeURIComponent(token)}`
}

export function passwordResetSubject(): string {
  return 'Réinitialisation du mot de passe / Password reset · SarkiAI Policy Sandbox'
}

export function passwordResetText(reset: PasswordReset): string {
  const name = reset.firstName?.trim() || 'there'
  const url = resetUrl(reset.token)
  const minutes = Math.max(
    1,
    Math.round((Date.parse(reset.expiresAt) - Date.now()) / 60_000),
  )
  return [
    `Bonjour ${name},`,
    '',
    'Une réinitialisation de mot de passe a été demandée pour votre compte SarkiAI Policy Sandbox.',
    `Choisissez un nouveau mot de passe : ${url}`,
    `Ce lien expire dans ${minutes} minutes et ne fonctionne qu’une fois.`,
    'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
    '',
    '---',
    '',
    `Hello ${name},`,
    '',
    'A password reset was requested for your SarkiAI Policy Sandbox account.',
    `Choose a new password: ${url}`,
    `This link expires in ${minutes} minutes and works once.`,
    'If you did not request it, ignore this e-mail: your password stays unchanged.',
    '',
    '— SarkiAI Policy Sandbox',
  ].join('\n')
}

export function passwordResetHtml(reset: PasswordReset): string {
  const name = escapeHtml(reset.firstName?.trim() || 'there')
  const url = escapeHtml(resetUrl(reset.token))
  const minutes = Math.max(
    1,
    Math.round((Date.parse(reset.expiresAt) - Date.now()) / 60_000),
  )
  const year = new Date().getFullYear()

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>SarkiAI Policy Sandbox</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f6f4;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Réinitialisation du mot de passe · Password reset</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f4f6f4;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8e4;overflow:hidden;">
            <tr>
              <td style="background:#06122B;padding:26px 28px;">
                <div style="font:700 12px/16px Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#8fc0ff;">SarkiAI</div>
                <div style="font:700 22px/28px Georgia,'Times New Roman',serif;color:#ffffff;margin-top:6px;">Policy Sandbox</div>
                <div style="font:400 12px/18px Helvetica,Arial,sans-serif;color:rgba(255,255,255,.62);margin-top:6px;">Mot de passe · Password</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px 28px;">
                <p style="margin:0 0 10px 0;font:400 14px/22px Helvetica,Arial,sans-serif;color:#0f172a;">Bonjour <strong>${name}</strong>,</p>
                <p style="margin:0;font:400 14px/22px Helvetica,Arial,sans-serif;color:#334155;">
                  Une réinitialisation de mot de passe a été demandée pour votre compte.
                  Choisissez un nouveau mot de passe ci-dessous. Le lien ne fonctionne qu’une fois et expire dans ${minutes} minutes.
                  <span style="display:block;color:#94a3b8;font-size:12px;line-height:19px;margin-top:4px;">
                    A password reset was requested for your account. Choose a new password below. The link works once and expires in ${minutes} minutes.
                  </span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 6px 28px;">
                <a href="${url}" style="display:inline-block;background:#0866FF;color:#ffffff;text-decoration:none;font:600 14px/20px Helvetica,Arial,sans-serif;padding:12px 20px;border-radius:10px;">
                  Choisir un mot de passe · Choose a password
                </a>
                <div style="font:400 11px/17px Helvetica,Arial,sans-serif;color:#94a3b8;margin-top:10px;word-break:break-all;">${url}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:4px 28px 26px 28px;">
                <p style="margin:0;font:400 11px/17px Helvetica,Arial,sans-serif;color:#94a3b8;">
                  Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.
                  <span style="display:block;margin-top:4px;">If you did not request it, ignore this message: your password stays unchanged.</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #eef2ef;padding:16px 28px;background:#fbfcfb;">
                <div style="font:400 10px/15px Helvetica,Arial,sans-serif;color:#94a3b8;">© ${year} SarkiAI Policy Sandbox · Meta Global AI Developer Hackathon</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** Send the reset link. Throws `MailError` like the invitation sender. */
export async function sendPasswordReset(reset: PasswordReset): Promise<MailResult> {
  const key = config.mail.apiKey
  if (!key) {
    throw new MailError('mail_not_configured', 'Resend is not configured (AUTH_RESEND_KEY).')
  }

  const payload: Record<string, unknown> = {
    from: config.mail.from,
    to: [reset.to],
    subject: passwordResetSubject(),
    html: passwordResetHtml(reset),
    text: passwordResetText(reset),
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
      body: JSON.stringify(payload),
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
