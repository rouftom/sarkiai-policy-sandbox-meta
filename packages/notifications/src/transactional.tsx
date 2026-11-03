/**
 * Transactional e-mails sent by the API: operator invitation (temporary
 * password), sign-up address confirmation and password reset.
 *
 * Layouts follow the React Email demo templates the console adopted:
 *   - invitation      → Community/magic-links/plaid-verify-identity (narrow card,
 *                       identity code block),
 *   - e-mail verification → 01-Barebone/subscription-confirmation,
 *   - password reset  → 01-Barebone/password-reset.
 *
 * All three stay bilingual FR/EN, like the hand-written messages they replace,
 * and ship an HTML part plus a plain-text part.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react'
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
  render,
} from 'react-email'
import type { RenderedEmail } from './email'

const BRAND = 'SarkiAI Policy Sandbox'
const FOOTER = 'Made with ♥️ by Djotta'

const INK = '#06140E'
const PAPER = '#F3F4F6'
const CARD = '#FFFFFF'
const LINE = '#E4E4E7'
const MUTED = '#43454B'
const FAINT = '#7B7D81'
const BRAND_GREEN = '#1B834F'
const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"

const BODY: CSSProperties = { margin: 0, fontFamily: FONT, lineHeight: 1.5 }
const HEADING: CSSProperties = { margin: 0, fontFamily: FONT, color: INK, fontWeight: 600 }

/** FR copy in full size, EN below in the muted secondary style. */
function Bilingual({
  fr,
  en,
  style,
}: {
  fr: ReactNode
  en: ReactNode
  style?: CSSProperties
}) {
  return (
    <>
      <Text style={{ ...BODY, margin: '0 0 6px', fontSize: 15, color: MUTED, ...style }}>{fr}</Text>
      <Text style={{ ...BODY, margin: 0, fontSize: 13, color: FAINT, ...style }}>{en}</Text>
    </>
  )
}

function Footer({ year = new Date().getFullYear() }: { year?: number }) {
  return (
    <Text style={{ ...BODY, margin: '24px 0 0', fontSize: 11, color: FAINT, textAlign: 'center' }}>
      © {year} {BRAND} · {FOOTER}
    </Text>
  )
}

/* ── Invitation / security code ─────────────────────────────────────────── */

export interface InvitationEmailProps {
  firstName: string
  lastName: string
  email: string
  /** One-time password the operator replaces at first sign-in. */
  password: string
  signInUrl: string
  /** Absolute URL of the hosted brand mark. */
  logoUrl: string
}

export function InvitationEmail({
  firstName,
  lastName,
  email,
  password,
  signInUrl,
  logoUrl,
}: InvitationEmailProps) {
  const name = `${firstName} ${lastName}`.trim()

  return (
    <Html lang="fr">
      <Head />
      <Preview>
        Votre code de sécurité · Your security code · {BRAND}
      </Preview>
      <Body style={{ ...BODY, backgroundColor: CARD, padding: '20px 0' }}>
        <Container
          style={{
            maxWidth: 360,
            margin: '0 auto',
            padding: '56px 0 44px',
            backgroundColor: CARD,
            border: `1px solid ${LINE}`,
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(20, 50, 70, 0.2)',
          }}
        >
          <Img
            src={logoUrl}
            width="64"
            height="64"
            alt={BRAND}
            style={{ display: 'block', margin: '0 auto' }}
          />
          <Text
            style={{
              ...BODY,
              margin: '20px 8px 8px',
              color: BRAND_GREEN,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '1px',
              lineHeight: '16px',
              textAlign: 'center',
              textTransform: 'uppercase',
            }}
          >
            Vérifiez votre identité · Verify your identity
          </Text>
          <Heading
            style={{
              ...HEADING,
              fontSize: 20,
              fontWeight: 500,
              lineHeight: '24px',
              textAlign: 'center',
            }}
          >
            Voici votre code de sécurité
          </Heading>
          <Text
            style={{
              ...BODY,
              margin: '8px 24px 0',
              color: MUTED,
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            Entrez-le à la première connexion · Enter it at first sign-in
          </Text>

          <Section
            style={{
              width: 280,
              margin: '16px auto 14px',
              backgroundColor: 'rgba(6, 20, 14, 0.05)',
              borderRadius: 4,
            }}
          >
            <Text
              style={{
                ...BODY,
                margin: 0,
                padding: '8px 0',
                color: INK,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '3px',
                lineHeight: '40px',
                textAlign: 'center',
                wordBreak: 'break-all',
              }}
            >
              {password}
            </Text>
          </Section>

          <Text
            style={{
              ...BODY,
              margin: '0 24px',
              color: MUTED,
              fontSize: 13,
              lineHeight: '20px',
              textAlign: 'center',
            }}
          >
            Compte <strong>{email}</strong> · Account <strong>{email}</strong>
          </Text>

          <Section style={{ margin: '18px 0 0', textAlign: 'center' }}>
            <Button
              href={signInUrl}
              style={{
                display: 'inline-block',
                backgroundColor: INK,
                color: '#FFFFFF',
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: 600,
                lineHeight: '18px',
                padding: '10px 18px',
                borderRadius: 6,
                textDecoration: 'none',
              }}
            >
              Ouvrir la console · Open the console
            </Button>
          </Section>

          <Text
            style={{
              ...BODY,
              margin: '18px 24px 0',
              color: MUTED,
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            À la première connexion · On first sign-in
          </Text>
          <Section style={{ margin: '8px 24px 0', textAlign: 'center' }}>
            <Text style={{ ...BODY, margin: '0 0 4px', fontSize: 11, color: MUTED }}>
              01 · Choisissez un nouveau mot de passe (12 caractères minimum).
            </Text>
            <Text style={{ ...BODY, margin: '0 0 4px', fontSize: 11, color: MUTED }}>
              02 · Activez la double authentification avec votre application TOTP.
            </Text>
            <Text style={{ ...BODY, margin: 0, fontSize: 11, color: MUTED }}>
              03 · Conservez les dix codes de secours affichés une seule fois.
            </Text>
          </Section>

          <Text
            style={{
              ...BODY,
              margin: '18px 24px 0',
              color: FAINT,
              fontSize: 11,
              lineHeight: '17px',
              textAlign: 'center',
            }}
          >
            Ce mot de passe provisoire ne fonctionne qu’une fois. Si vous n’êtes pas à l’origine de
            cette demande, ignorez cet e-mail.
            <br />
            This temporary password works once. If you did not request it, ignore this message.
          </Text>
        </Container>

        <Text
          style={{
            ...BODY,
            margin: '20px 0 0',
            color: INK,
            fontSize: 12,
            fontWeight: 800,
            lineHeight: '23px',
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          Sécurisé par {BRAND} · Securely powered by {BRAND}
        </Text>
      </Body>
    </Html>
  )
}

/* ── Shared Barebone frame ──────────────────────────────────────────────── */

function BareboneFrame({
  preview,
  logoUrl,
  heading,
  subheading,
  children,
}: {
  preview: string
  logoUrl: string
  heading: string
  subheading: string
  children: ReactNode
}) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ ...BODY, backgroundColor: PAPER, textAlign: 'center' }}>
        <Container style={{ maxWidth: 640, width: '100%', margin: '32px auto' }}>
          <Section style={{ backgroundColor: CARD }}>
            <Section style={{ padding: '16px 24px 12px' }}>
              <Row>
                <Column style={{ width: '50%', padding: '7px 0', verticalAlign: 'middle' }}>
                  <Img
                    src={logoUrl}
                    width="28"
                    height="28"
                    alt=""
                    style={{ display: 'block' }}
                  />
                </Column>
                <Column
                  align="right"
                  style={{ width: '50%', padding: '7px 0', verticalAlign: 'middle' }}
                >
                  <Text style={{ ...BODY, margin: 0, color: FAINT, fontSize: 13, textAlign: 'right' }}>
                    {BRAND}
                  </Text>
                </Column>
              </Row>
            </Section>

            <Section
              style={{
                backgroundColor: PAPER,
                borderRadius: 8,
                padding: '48px 40px',
                textAlign: 'center',
              }}
            >
              <Img
                src={logoUrl}
                width="56"
                height="56"
                alt={BRAND}
                style={{ display: 'block', margin: '0 auto 20px' }}
              />
              <Heading as="h1" style={{ ...HEADING, fontSize: 28, lineHeight: 1.3 }}>
                {heading}
              </Heading>
              <Text style={{ ...BODY, margin: '4px 0 0', color: FAINT, fontSize: 13 }}>
                {subheading}
              </Text>
              {children}
            </Section>

            <Section style={{ backgroundColor: CARD }}>
              <Row>
                <Column style={{ padding: '32px 24px', textAlign: 'center' }}>
                  <Text
                    style={{
                      ...BODY,
                      margin: '0 auto',
                      maxWidth: 320,
                      color: FAINT,
                      fontSize: 13,
                    }}
                  >
                    Console de politique · Policy console
                  </Text>
                  <Footer />
                </Column>
              </Row>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/* ── Sign-up address confirmation ───────────────────────────────────────── */

export interface EmailVerificationEmailProps {
  firstName?: string
  url: string
  logoUrl: string
  expiresInHours?: number
}

export function EmailVerificationEmail({
  firstName,
  url,
  logoUrl,
  expiresInHours = 24,
}: EmailVerificationEmailProps) {
  const name = firstName?.trim() || 'there'

  return (
    <BareboneFrame
      preview={`Confirmez votre adresse · Confirm your address · ${BRAND}`}
      logoUrl={logoUrl}
      heading="Confirmez votre adresse"
      subheading="Confirm your e-mail address"
    >
      <Section style={{ margin: '32px 0 0' }}>
        <Bilingual
          fr={
            <>
              Bonjour {name}, confirmez votre adresse e-mail pour activer votre compte {BRAND}.
              La double authentification sera demandée ensuite, à la connexion.
            </>
          }
          en={
            <>
              Hello {name}, confirm your e-mail address to activate your {BRAND} account. Two-factor
              authentication follows at sign-in.
            </>
          }
          style={{ maxWidth: 380, margin: '0 auto 16px' }}
        />
      </Section>

      <Section style={{ margin: '16px 0 0' }}>
        <Button
          href={url}
          style={{
            display: 'inline-block',
            backgroundColor: INK,
            color: '#FFFFFF',
            fontFamily: FONT,
            fontSize: 16,
            lineHeight: '24px',
            padding: '16px 28px',
            borderRadius: 8,
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          Confirmer mon adresse · Confirm my address
        </Button>
      </Section>

      <Text
        style={{
          ...BODY,
          margin: '32px auto 0',
          maxWidth: 400,
          color: FAINT,
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        Ce lien expire dans {expiresInHours} heures. Si vous n’êtes pas à l’origine de cette
        inscription, ignorez cet e-mail.
        <br />
        This link expires in {expiresInHours} hours. If you did not sign up, ignore this message.
      </Text>
    </BareboneFrame>
  )
}

/* ── Password reset ─────────────────────────────────────────────────────── */

export interface PasswordResetEmailProps {
  firstName?: string
  url: string
  logoUrl: string
  expiresInMinutes: number
}

export function PasswordResetEmail({
  firstName,
  url,
  logoUrl,
  expiresInMinutes,
}: PasswordResetEmailProps) {
  const name = firstName?.trim() || 'there'

  return (
    <BareboneFrame
      preview={`Réinitialisation du mot de passe · Password reset · ${BRAND}`}
      logoUrl={logoUrl}
      heading="Réinitialisez votre mot de passe"
      subheading="Reset your password"
    >
      <Section style={{ margin: '32px 0 0' }}>
        <Bilingual
          fr={
            <>
              Bonjour {name}, une réinitialisation de mot de passe a été demandée pour votre compte.
              Le lien ne fonctionne qu’une fois et expire dans {expiresInMinutes} minutes.
            </>
          }
          en={
            <>
              Hello {name}, a password reset was requested for your account. The link works once and
              expires in {expiresInMinutes} minutes.
            </>
          }
          style={{ maxWidth: 380, margin: '0 auto 16px' }}
        />
      </Section>

      <Section style={{ margin: '16px 0 0' }}>
        <Button
          href={url}
          style={{
            display: 'inline-block',
            backgroundColor: INK,
            color: '#FFFFFF',
            fontFamily: FONT,
            fontSize: 16,
            lineHeight: '24px',
            padding: '16px 28px',
            borderRadius: 8,
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          Choisir un mot de passe · Choose a password
        </Button>
      </Section>

      <Text
        style={{
          ...BODY,
          margin: '32px auto 0',
          maxWidth: 400,
          color: FAINT,
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe
        reste inchangé.
        <br />
        If you did not request it, ignore this message: your password stays unchanged.
      </Text>
    </BareboneFrame>
  )
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

async function renderEmail(element: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  return { html, text }
}

export function renderInvitationEmail(props: InvitationEmailProps): Promise<RenderedEmail> {
  return renderEmail(<InvitationEmail {...props} />)
}

export function renderEmailVerificationEmail(
  props: EmailVerificationEmailProps,
): Promise<RenderedEmail> {
  return renderEmail(<EmailVerificationEmail {...props} />)
}

export function renderPasswordResetEmail(props: PasswordResetEmailProps): Promise<RenderedEmail> {
  return renderEmail(<PasswordResetEmail {...props} />)
}
