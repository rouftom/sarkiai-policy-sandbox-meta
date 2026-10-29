/**
 * The one e-mail template used by operator notifications.
 *
 * React Email renders it to HTML and to plain text on the server; the design is
 * the same monochrome frame as the transactional messages in `mailer.ts`, so an
 * operator recognises the console's mail at a glance. No remote asset: a
 * notification must survive a disconnected inbox.
 */

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import { render } from '@react-email/render'

const BRAND = 'SarkiAI Policy Sandbox'
const FOOTER = 'Made with ♥️ by Djotta'

const INK = '#111111'
const PAPER = '#f4f4f4'
const CARD = '#ffffff'
const LINE = '#e4e4e4'
const MUTED = '#6b6b6b'
const FAINT = '#9a9a9a'

export type NotificationLocale = 'fr' | 'en'

export interface NotificationEmailProps {
  locale?: NotificationLocale
  /** Inbox preview line, hidden in the body. */
  preview: string
  heading: string
  /** Optional standing first paragraph (context, country, run). */
  intro?: string
  /** Body copy; blank lines split paragraphs. */
  message: string
  cta?: { label: string; url: string }
  /** Consent / provenance line shown above the footer. */
  note?: string
  brand?: string
  sentAt?: string
}

function paragraphs(message: string): string[] {
  return String(message ?? '')
    .split(/\n{2,}/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function NotificationEmail({
  locale = 'en',
  preview,
  heading,
  intro,
  message,
  cta,
  note,
  brand = BRAND,
  sentAt,
}: NotificationEmailProps) {
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: PAPER }}>
        <Container style={{ maxWidth: 560, margin: '0 auto', padding: '28px 12px' }}>
          <Section
            style={{
              backgroundColor: CARD,
              border: `1px solid ${LINE}`,
              borderTop: `4px solid ${INK}`,
            }}
          >
            <Section style={{ backgroundColor: INK, padding: '22px 28px' }}>
              <Text
                style={{
                  margin: 0,
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  fontSize: 20,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: '#ffffff',
                }}
              >
                {brand}
              </Text>
              <Text
                style={{
                  margin: '6px 0 0',
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.7)',
                }}
              >
                {locale === 'fr' ? 'Notification opérateur' : 'Operator notification'}
              </Text>
            </Section>

            <Section style={{ padding: '26px 28px 8px' }}>
              <Heading
                style={{
                  margin: 0,
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  fontSize: 20,
                  lineHeight: '26px',
                  color: INK,
                }}
              >
                {heading}
              </Heading>
              {intro ? (
                <Text
                  style={{
                    margin: '10px 0 0',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    fontSize: 13,
                    lineHeight: '20px',
                    color: MUTED,
                  }}
                >
                  {intro}
                </Text>
              ) : null}
            </Section>

            <Section style={{ padding: '4px 28px 4px' }}>
              {paragraphs(message).map((paragraph, index) => (
                <Text
                  key={index}
                  style={{
                    margin: '0 0 12px',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    fontSize: 14,
                    lineHeight: '21px',
                    color: INK,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {paragraph}
                </Text>
              ))}
              {cta ? (
                <Section style={{ padding: '4px 0 12px' }}>
                  <Button
                    href={cta.url}
                    style={{
                      backgroundColor: INK,
                      color: '#ffffff',
                      fontFamily: 'Helvetica, Arial, sans-serif',
                      fontSize: 14,
                      fontWeight: 600,
                      padding: '12px 20px',
                      textDecoration: 'none',
                    }}
                  >
                    {cta.label}
                  </Button>
                  <Text
                    style={{
                      margin: '10px 0 0',
                      fontFamily: 'Helvetica, Arial, sans-serif',
                      fontSize: 11,
                      lineHeight: '17px',
                      color: FAINT,
                      wordBreak: 'break-all',
                    }}
                  >
                    {cta.url}
                  </Text>
                </Section>
              ) : null}
            </Section>

            {note ? (
              <Section style={{ padding: '0 28px 22px' }}>
                <Hr style={{ border: 0, borderTop: `1px solid ${LINE}`, margin: '0 0 12px' }} />
                <Text
                  style={{
                    margin: 0,
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    fontSize: 11,
                    lineHeight: '17px',
                    color: FAINT,
                  }}
                >
                  {note}
                </Text>
              </Section>
            ) : null}

            <Section style={{ backgroundColor: '#fafafa', borderTop: `1px solid ${LINE}`, padding: '14px 28px' }}>
              <Text
                style={{
                  margin: 0,
                  fontFamily: 'Helvetica, Arial, sans-serif',
                  fontSize: 10,
                  lineHeight: '15px',
                  color: FAINT,
                }}
              >
                © {new Date().getFullYear()} {brand} · {FOOTER}
                {sentAt ? ` · ${sentAt}` : ''}
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export interface RenderedEmail {
  html: string
  text: string
}

/** HTML + plain text in one call: Resend wants both, and some inboxes only read one. */
export async function renderNotificationEmail(props: NotificationEmailProps): Promise<RenderedEmail> {
  const element = <NotificationEmail {...props} />
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ])
  return { html, text }
}
