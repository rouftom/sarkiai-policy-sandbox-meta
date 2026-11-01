import { describe, expect, test } from 'bun:test'
import { config, isAllowedOrigin, isOriginAllowed, localSetupPasswordFallback } from './config'

/** A configured deployment: canonical host plus the local dev origin. */
const configured = {
  origins: ['https://console.example', 'http://localhost:3000'],
  allowAny: false,
}

/**
 * Origins are configuration, not code. A configured console accepts its own
 * origins; a bare on-premise install stays permissive so a LAN host or a
 * non-default port never breaks it.
 */
describe('console origins', () => {
  test('accepts the configured canonical origin', () => {
    expect(isOriginAllowed('https://console.example', configured)).toBe(true)
  })

  test('accepts an origin listed as an alias, and only that one', () => {
    const withAlias = {
      origins: ['https://console.example', 'https://old-host.example'],
      allowAny: false,
    }
    expect(isOriginAllowed('https://old-host.example', withAlias)).toBe(true)
    expect(isOriginAllowed('https://other-host.example', withAlias)).toBe(false)
  })

  test('accepts loopback on any port', () => {
    expect(isOriginAllowed('http://localhost:3000', configured)).toBe(true)
    expect(isOriginAllowed('http://localhost:8080', configured)).toBe(true)
    expect(isOriginAllowed('http://127.0.0.1:8080', configured)).toBe(true)
    expect(isOriginAllowed('http://[::1]:8080', configured)).toBe(true)
  })

  test('accepts a LAN address or an internal name even with a configured origin', () => {
    for (const origin of [
      'http://192.168.1.20:8080',
      'http://10.0.0.5:3000',
      'http://172.16.4.7:3000',
      'http://172.31.0.2:3000',
      'http://169.254.10.1:3000',
      'http://policy-server:3000',
      'http://nas.local:3000',
      'https://portal.internal',
    ]) {
      expect(isOriginAllowed(origin, configured)).toBe(true)
    }
  })

  test('still refuses a public host that merely looks local', () => {
    expect(isOriginAllowed('http://192.168.1.20.evil.example', configured)).toBe(false)
    expect(isOriginAllowed('http://evil.internal.example', configured)).toBe(false)
    expect(isOriginAllowed('http://172.32.0.1:3000', configured)).toBe(false)
  })

  test('accepts a Vercel preview', () => {
    expect(isOriginAllowed('https://any-project-git-branch.vercel.app', configured)).toBe(true)
  })

  test('refuses an unrelated origin', () => {
    expect(isOriginAllowed('https://evil.example', configured)).toBe(false)
  })

  test('refuses a look-alike domain', () => {
    expect(isOriginAllowed('https://console.example.evil.example', configured)).toBe(false)
  })

  test('accepts a call without Origin (server to server)', () => {
    expect(isOriginAllowed(undefined, configured)).toBe(true)
  })

  test('self-hosted default accepts a LAN origin', () => {
    expect(isOriginAllowed('http://192.168.1.10:8080', { origins: [], allowAny: true })).toBe(true)
    expect(isOriginAllowed('https://policy.internal', { origins: [], allowAny: true })).toBe(true)
  })

  test('live config always accepts loopback and server calls', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true)
    expect(isAllowedOrigin('http://localhost:8080')).toBe(true)
    expect(isAllowedOrigin(undefined)).toBe(true)
  })

  test('uses the canonical origin for every outgoing link', () => {
    expect(config.web.canonicalUrl).toMatch(/^https?:\/\//)
    expect(config.mail.publicUrl).toBe(config.web.canonicalUrl)
    expect(config.whatsapp.webPublicUrl).toBe(config.web.canonicalUrl)
  })
})

/**
 * First-run setup without Resend: only a local console may receive the one-time
 * password in the response. A public host must keep refusing and roll back.
 */
describe('local setup password fallback', () => {
  test('allows a loopback console with no mail transport', () => {
    expect(localSetupPasswordFallback('mail_not_configured', 'http://localhost:3000')).toBe(true)
    expect(localSetupPasswordFallback('mail_not_configured', 'http://127.0.0.1:3000')).toBe(true)
  })

  test('allows a LAN or container-name console', () => {
    expect(localSetupPasswordFallback('mail_not_configured', 'http://192.168.1.20:3000')).toBe(true)
    expect(localSetupPasswordFallback('mail_not_configured', 'http://policy-server:3000')).toBe(true)
  })

  test('never displays the password on a public host', () => {
    expect(localSetupPasswordFallback('mail_not_configured', 'https://sps.djotta.com')).toBe(false)
    expect(localSetupPasswordFallback('mail_not_configured', 'https://console.example')).toBe(false)
  })

  test('only covers the missing-transport case', () => {
    expect(localSetupPasswordFallback('mail_failed', 'http://localhost:3000')).toBe(false)
    expect(localSetupPasswordFallback(undefined, 'http://localhost:3000')).toBe(false)
  })
})
