/**
 * Transactional e-mail through Resend (same provider and environment variable
 * names as the SarkiAI enterprise stack: AUTH_RESEND_KEY / AUTH_RESEND_EMAIL_FROM
 * / AUTH_RESEND_EMAIL_REPLY_TO).
 *
 * Three messages leave the box, each rendered by a React Email template in
 * `@sps/notifications`:
 *   - the root operator's invitation (temporary password, Plaid-style card),
 *   - the sign-up confirmation link (Barebone subscription-confirmation frame),
 *   - the password-reset link (Barebone password-reset frame).
 *
 * The HTTP call is a plain `fetch` on purpose: no SDK, no bundler-specific
 * runtime, and the API key never appears in a log line.
 */

import { config } from './config.js'
import {
  renderEmailVerificationEmail,
  renderInvitationEmail,
  renderNotificationEmail,
  renderPasswordResetEmail,
  type NotificationLocale,
} from '@sps/notifications'

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
  /** ISO timestamp kept for callers; the template uses the send date. */
  issuedAt?: string
}

export interface MailResult {
  id?: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const BRAND = 'SarkiAI Policy Sandbox'

function baseUrl(): string {
  return config.mail.publicUrl.replace(/\/+$/, '')
}

function signInUrl(): string {
  return `${baseUrl()}/login`
}

/** Hosted brand mark used by the three templates. */
function brandLogoUrl(): string {
  return `${baseUrl()}/brand/sarkiai-mark.png`
}

/** Subject line: one language is enough, both are in the body. */
export function invitationSubject(): string {
  return `Votre accès / Your access · ${BRAND}`
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

function hoursUntil(expiresAt: string): number {
  return Math.max(1, Math.round((Date.parse(expiresAt) - Date.now()) / 3_600_000))
}

export function passwordResetSubject(): string {
  return `Réinitialisation du mot de passe / Password reset · ${BRAND}`
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
  const { html, text } = await renderInvitationEmail({
    firstName: invitation.firstName,
    lastName: invitation.lastName,
    email: invitation.to,
    password: invitation.password,
    signInUrl: signInUrl(),
    logoUrl: brandLogoUrl(),
  })
  return send({
    to: [invitation.to],
    subject: invitationSubject(),
    html,
    text,
  })
}

/** Send the sign-up confirmation link. Throws `MailError` like the invitation. */
export async function sendEmailVerification(verification: EmailVerification): Promise<MailResult> {
  const { html, text } = await renderEmailVerificationEmail({
    ...(verification.firstName ? { firstName: verification.firstName } : {}),
    url: verificationUrl(verification.token),
    logoUrl: brandLogoUrl(),
    expiresInHours: hoursUntil(verification.expiresAt),
  })
  return send({
    to: [verification.to],
    subject: emailVerificationSubject(),
    html,
    text,
  })
}

/** Send the reset link. Throws `MailError` like the invitation sender. */
export async function sendPasswordReset(reset: PasswordReset): Promise<MailResult> {
  const { html, text } = await renderPasswordResetEmail({
    ...(reset.firstName ? { firstName: reset.firstName } : {}),
    url: resetUrl(reset.token),
    logoUrl: brandLogoUrl(),
    expiresInMinutes: minutesUntil(reset.expiresAt),
  })
  return send({
    to: [reset.to],
    subject: passwordResetSubject(),
    html,
    text,
  })
}

/** Whether Resend has a key: the console shows this before offering a broadcast. */
export function mailConfigured(): boolean {
  return Boolean(config.mail.apiKey)
}

export function mailFrom(): string {
  return config.mail.from
}

export interface NotificationMail {
  to: string
  subject: string
  heading: string
  intro?: string
  message: string
  cta?: { label: string; url: string }
  note?: string
  locale?: NotificationLocale
}

/**
 * Operator notification, rendered by the React Email template in
 * `@sps/notifications`. One recipient per call: an address is never put in a
 * `Bcc` list, so no one sees who else was notified.
 */
export async function sendNotificationEmail(input: NotificationMail): Promise<MailResult> {
  const { html, text } = await renderNotificationEmail({
    ...(input.locale ? { locale: input.locale } : {}),
    preview: input.heading,
    heading: input.heading,
    ...(input.intro ? { intro: input.intro } : {}),
    message: input.message,
    ...(input.cta ? { cta: input.cta } : {}),
    ...(input.note ? { note: input.note } : {}),
    sentAt: new Date().toISOString(),
  })
  return send({
    to: [input.to],
    subject: input.subject.slice(0, 160),
    html,
    text,
  })
}
