import { describe, expect, test } from 'bun:test'
import {
  config,
  DEFAULT_CLIENT_IP_HEADERS,
  isAllowedOrigin,
  isOriginAllowed,
  localSetupPasswordFallback,
  parseClientIpHeaders,
  parseTrustProxy,
  resolveClientIp,
} from './config'

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
 * Client IPs come from a header the edge overwrites. `TRUST_PROXY` only decides
 * how much of `X-Forwarded-For` the socket fallback believes. Both are
 * deployment configuration, not constants.
 */
describe('proxy trust', () => {
  test('defaults to trusting one hop', () => {
    for (const value of [undefined, '', '   ']) {
      const policy = parseTrustProxy(value)
      expect(typeof policy).toBe('function')
      if (typeof policy !== 'function') continue
      expect(policy('203.0.113.1', 0)).toBe(true)
      expect(policy('203.0.113.1', 1)).toBe(false)
    }
  })

  test('reads an explicit boolean', () => {
    expect(parseTrustProxy('false')).toBe(false)
    expect(parseTrustProxy('off')).toBe(false)
    expect(parseTrustProxy('true')).toBe(true)
    expect(parseTrustProxy('on')).toBe(true)
  })

  test('reads a hop count', () => {
    const policy = parseTrustProxy('2')
    expect(typeof policy).toBe('function')
    if (typeof policy !== 'function') return
    expect(policy('203.0.113.1', 0)).toBe(true)
    expect(policy('203.0.113.1', 1)).toBe(true)
    expect(policy('203.0.113.1', 2)).toBe(false)
    expect(parseTrustProxy('0')).toBe(false)
  })

  test('an unrecognised value keeps the safe default', () => {
    const policy = parseTrustProxy('10.0.0.0/8')
    expect(typeof policy).toBe('function')
    if (typeof policy !== 'function') return
    expect(policy('203.0.113.1', 0)).toBe(true)
    expect(policy('203.0.113.1', 1)).toBe(false)
  })

  test('is part of the live configuration', () => {
    expect(config.proxy.trust).not.toBeUndefined()
  })
})

/**
 * The edge header is the primary source: the hosting provider's proxy address
 * would make every throttle global, so the first valid value wins and the
 * socket is only a fallback.
 */
describe('client IP resolution', () => {
  const socketIp = '10.231.26.97'

  test('reads the first configured header that carries an address', () => {
    const resolved = resolveClientIp(
      { 'cf-connecting-ip': '203.0.113.7', 'x-real-ip': '203.0.113.8' },
      socketIp,
      parseClientIpHeaders('cf-connecting-ip, x-real-ip'),
    )
    expect(resolved).toEqual({ ip: '203.0.113.7', source: 'cf-connecting-ip' })
  })

  test('falls through headers that are empty or invalid', () => {
    const resolved = resolveClientIp(
      { 'cf-connecting-ip': 'not-an-ip', 'x-real-ip': '2001:db8::1' },
      socketIp,
      ['cf-connecting-ip', 'x-real-ip'],
    )
    expect(resolved).toEqual({ ip: '2001:db8::1', source: 'x-real-ip' })
  })

  test('reads the first address of a list value', () => {
    const resolved = resolveClientIp(
      { 'x-real-ip': '203.0.113.9, 10.0.0.1' },
      socketIp,
      ['x-real-ip'],
    )
    expect(resolved).toEqual({ ip: '203.0.113.9', source: 'x-real-ip' })
  })

  test('accepts an IPv4 address with a port', () => {
    expect(resolveClientIp({ 'x-real-ip': '203.0.113.10:443' }, socketIp, ['x-real-ip'])).toEqual({
      ip: '203.0.113.10',
      source: 'x-real-ip',
    })
  })

  test('uses the socket when no header matches', () => {
    expect(resolveClientIp({}, socketIp, DEFAULT_CLIENT_IP_HEADERS)).toEqual({
      ip: socketIp,
      source: null,
    })
  })

  test('the default list covers common edges without X-Forwarded-For', () => {
    expect(parseClientIpHeaders(undefined)).toEqual([...DEFAULT_CLIENT_IP_HEADERS])
    expect(parseClientIpHeaders('')).toEqual([...DEFAULT_CLIENT_IP_HEADERS])
    expect(parseClientIpHeaders('CF-Connecting-IP, X-Real-IP')).toEqual([
      'cf-connecting-ip',
      'x-real-ip',
    ])
    expect(DEFAULT_CLIENT_IP_HEADERS).not.toContain('x-forwarded-for')
  })

  test('none disables header lookup for a hardened deployment', () => {
    expect(parseClientIpHeaders('none')).toEqual([])
    expect(parseClientIpHeaders('off')).toEqual([])
  })

  test('is part of the live configuration', () => {
    if (!process.env.CLIENT_IP_HEADERS) {
      expect(config.proxy.clientIpHeaders).toEqual([...DEFAULT_CLIENT_IP_HEADERS])
    }
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

/**
 * Assistant images: the deployment caps them. Unset, the defaults are the ones
 * the console assumes, so a bare install already refuses what the API refuses.
 */
describe('assistant image caps', () => {
  test('are positive whatever the deployment configures', () => {
    expect(Number.isInteger(config.attachments.maxImages)).toBe(true)
    expect(config.attachments.maxImages).toBeGreaterThan(0)
    expect(config.attachments.maxBytes).toBeGreaterThan(0)
  })

  test('default to four images of two megabytes when unset', () => {
    if (!process.env.ASSISTANT_MAX_IMAGES) expect(config.attachments.maxImages).toBe(4)
    if (!process.env.ASSISTANT_MAX_IMAGE_BYTES) expect(config.attachments.maxBytes).toBe(2 * 1024 * 1024)
  })
})
