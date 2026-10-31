import { createHmac } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import {
  approvalUrl,
  createApprovalToken,
  verifyApprovalToken,
  WhatsAppClient,
  WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_PREFIX,
} from './index'

function client(fetchImpl: typeof fetch, overrides: Partial<ConstructorParameters<typeof WhatsAppClient>[0]> = {}) {
  return new WhatsAppClient({
    phoneNumberId: '123456789',
    accessToken: 'test-token',
    verifyToken: 'verify-me',
    appSecret: 'app-secret',
    apiBaseUrl: 'https://graph.example/v1/',
    fetchImpl,
    ...overrides,
  })
}

describe('template transport', () => {
  test('posts a template with header, body and URL-button components', async () => {
    let captured: { url: string; init: RequestInit } | null = null
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} }
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 })
    }) as typeof fetch

    const result = await client(fakeFetch).sendTemplate({
      to: '+237 6 99 00 11 22',
      name: WHATSAPP_TEMPLATES.approvalRequest,
      language: 'en',
      bodyParams: ['Incident review', '2026-10-28T10:00:00Z'],
      headerImageUrl: 'https://example.org/report.png',
      buttonUrlParam: 'signed-token',
    })

    expect(result.messageId).toBe('wamid.1')
    expect(captured!.url).toBe('https://graph.example/v1/v26.0/123456789/messages')
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer test-token')
    const body = JSON.parse(String(captured!.init.body)) as Record<string, any>
    expect(body.to).toBe('237699001122')
    expect(body.type).toBe('template')
    expect(body.template.name).toBe('meta_hackathon_approval_request_v2')
    expect(body.template.language).toEqual({ code: 'en' })
    expect(body.template.components[0].type).toBe('header')
    expect(body.template.components[1].parameters).toHaveLength(2)
    expect(body.template.components[2]).toMatchObject({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: 'signed-token' }],
    })
  })

  test('every template carries the project prefix', () => {
    for (const name of Object.values(WHATSAPP_TEMPLATES)) {
      expect(name.startsWith(WHATSAPP_TEMPLATE_PREFIX)).toBe(true)
    }
  })

  test('refuses to send without credentials', async () => {
    const empty = new WhatsAppClient({ phoneNumberId: '', accessToken: '' })
    await expect(empty.sendTemplate({ to: '237699001122', name: WHATSAPP_TEMPLATES.jointReport })).rejects.toThrow(
      'not configured',
    )
  })

  test('sends free-form text only as a session reply', async () => {
    let body: Record<string, any> = {}
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as Record<string, any>
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.2' }] }), { status: 200 })
    }) as typeof fetch
    await client(fakeFetch).sendText('+237699001122', 'Approved')
    expect(body.type).toBe('text')
    expect(body.text.body).toBe('Approved')
  })
})

describe('webhook security', () => {
  test('accepts the Meta subscription handshake', () => {
    const ok = client(fetch).verifyChallenge({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'verify-me',
      'hub.challenge': '1234',
    })
    expect(ok).toEqual({ ok: true, challenge: '1234' })

    const wrong = client(fetch).verifyChallenge({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope' })
    expect(wrong.ok).toBe(false)
  })

  test('checks the HMAC of the exact raw body', () => {
    const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }))
    const signature = `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`
    const subject = client(fetch)
    expect(subject.verifySignature(raw, signature)).toBe(true)
    expect(subject.verifySignature(raw, `${signature}0`)).toBe(false)
    expect(subject.verifySignature(Buffer.from('{}'), signature)).toBe(false)
    expect(subject.verifySignature(raw, undefined)).toBe(false)
  })

  test('extracts statuses and inbound messages from nested entries', () => {
    const parsed = client(fetch).parseWebhook({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: 'wamid.1', status: 'delivered', recipient_id: '237699001122', timestamp: '1' }],
                messages: [
                  { id: 'wamid.2', from: '237699001122', type: 'text', text: { body: 'ok' }, timestamp: '2' },
                ],
              },
            },
          ],
        },
      ],
    })
    expect(parsed.statuses).toEqual([
      { id: 'wamid.1', status: 'delivered', recipientId: '237699001122', timestamp: '1' },
    ])
    expect(parsed.messages).toEqual([
      { id: 'wamid.2', from: '237699001122', type: 'text', text: 'ok', timestamp: '2' },
    ])
  })
})

describe('approval links', () => {
  const secret = 'approval-secret'

  test('round-trips the claims', () => {
    const { token, claims } = createApprovalToken({ runId: 'run-1', secret, subject: 'Review' })
    const verified = verifyApprovalToken(token, secret)
    expect(verified.ok).toBe(true)
    if (verified.ok) {
      expect(verified.claims.runId).toBe('run-1')
      expect(verified.claims.jti).toBe(claims.jti)
      expect(verified.claims.subject).toBe('Review')
    }
    expect(approvalUrl('https://demo.example/', token)).toBe(`https://demo.example/approve/${token}`)
  })

  test('rejects tampering, expiry and malformed payloads', () => {
    const { token } = createApprovalToken({ runId: 'run-1', secret, ttlSeconds: 60 })
    const [payload, signature] = token.split('.')
    const tampered = `${payload}.${signature!.slice(0, -1)}x`
    expect(verifyApprovalToken(tampered, secret)).toEqual({ ok: false, reason: 'signature' })

    const expired = createApprovalToken({ runId: 'run-1', secret, ttlSeconds: -1 })
    expect(verifyApprovalToken(expired.token, secret)).toEqual({ ok: false, reason: 'expired' })

    expect(verifyApprovalToken('not-a-token', secret)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyApprovalToken(token, '')).toEqual({ ok: false, reason: 'malformed' })
  })
})
