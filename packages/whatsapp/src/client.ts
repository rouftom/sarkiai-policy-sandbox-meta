/**
 * WhatsApp Cloud API client · called directly, no external notification gateway.
 *
 * The public repo must stay reproducible, so the transport is ~100 lines of
 * `fetch` against the Graph API instead of depending on a private worker. The
 * API only sends approved templates on the business-initiated path; free-form
 * text is reserved for the 24 h customer-service window.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

export const WHATSAPP_TEMPLATE_PREFIX = 'meta_hackathon_'

/** Templates created in the WABA for this project. Names are exact, review-bound. */
export const WHATSAPP_TEMPLATES = {
  jointReport: `${WHATSAPP_TEMPLATE_PREFIX}joint_report`,
  deadlineAlert: `${WHATSAPP_TEMPLATE_PREFIX}deadline_alert`,
  approvalRequest: `${WHATSAPP_TEMPLATE_PREFIX}approval_request`,
  /** No variable, no button: the only way to smoke-test a number. */
  helloWorld: `${WHATSAPP_TEMPLATE_PREFIX}hello_world`,
} as const

export type WhatsAppTemplate = (typeof WHATSAPP_TEMPLATES)[keyof typeof WHATSAPP_TEMPLATES]

export const WHATSAPP_TEMPLATE_LABELS: Record<WhatsAppTemplate, string> = {
  [WHATSAPP_TEMPLATES.jointReport]: 'Joint report',
  [WHATSAPP_TEMPLATES.deadlineAlert]: 'Deadline alert',
  [WHATSAPP_TEMPLATES.approvalRequest]: 'Approval request',
  [WHATSAPP_TEMPLATES.helloWorld]: 'Hello world (test)',
}

export interface WhatsAppConfig {
  version?: string
  phoneNumberId: string
  /** WhatsApp Business Account id, needed to read template review status. */
  wabaId?: string
  accessToken: string
  verifyToken?: string
  appSecret?: string
  /** Graph API root (default: https://graph.facebook.com). */
  apiBaseUrl?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export interface TemplateMessageInput {
  to: string
  name: string
  language?: string
  /** Body variables, in template order. */
  bodyParams?: string[]
  /** Optional header image (public HTTPS URL). */
  headerImageUrl?: string
  /** Optional URL-button suffix (the template's base URL is fixed in Meta). */
  buttonUrlParam?: string
}

export interface SentMessage {
  messageId: string
}

/** One row of `GET /{WABA}/message_templates`. */
export interface TemplateSummary {
  id: string
  name: string
  status: string
  category?: string
  language?: string
}

export interface WebhookStatus {
  id: string
  status: string
  recipientId?: string
  timestamp?: string
  error?: string
}

export interface WebhookMessage {
  id: string
  from: string
  timestamp?: string
  type: string
  text?: string
  button?: string
  interactiveId?: string
}

export interface ParsedWebhook {
  statuses: WebhookStatus[]
  messages: WebhookMessage[]
}

const DEFAULT_API_BASE = 'https://graph.facebook.com'
const DEFAULT_VERSION = 'v26.0'

function normalizeNumber(value: string): string {
  return value.replace(/[\s\-().]/g, '')
}

/** Keep template variables within Meta's 1024-character limit. */
function templateParam(value: string): string {
  return value.length <= 1024 ? value : `${value.slice(0, 1021)}...`
}

export class WhatsAppClient {
  private readonly version: string
  private readonly phoneNumberId: string
  private readonly wabaId: string
  private readonly accessToken: string
  private readonly verifyToken: string
  private readonly appSecret: string
  private readonly apiBaseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly timeoutMs: number

  constructor(config: WhatsAppConfig) {
    this.version = config.version ?? DEFAULT_VERSION
    this.phoneNumberId = config.phoneNumberId
    this.wabaId = config.wabaId ?? ''
    this.accessToken = config.accessToken
    this.verifyToken = config.verifyToken ?? ''
    this.appSecret = config.appSecret ?? ''
    this.apiBaseUrl = (config.apiBaseUrl ?? DEFAULT_API_BASE).replace(/\/+$/, '')
    this.fetchImpl = config.fetchImpl ?? fetch
    this.timeoutMs = config.timeoutMs ?? 20_000
  }

  get configured(): boolean {
    return Boolean(this.phoneNumberId && this.accessToken)
  }

  /** Business-initiated message. */
  async sendTemplate(input: TemplateMessageInput): Promise<SentMessage> {
    const to = normalizeNumber(input.to).replace(/^\+/, '')
    if (!/^\d{8,15}$/.test(to)) throw new Error(`Invalid WhatsApp recipient: ${input.to}`)

    const components: Array<Record<string, unknown>> = []
    if (input.headerImageUrl) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: input.headerImageUrl } }],
      })
    }
    const bodyParams = input.bodyParams ?? []
    if (bodyParams.length > 0) {
      components.push({
        type: 'body',
        parameters: bodyParams.map((text) => ({ type: 'text', text: templateParam(text) })),
      })
    }
    if (input.buttonUrlParam) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: templateParam(input.buttonUrlParam) }],
      })
    }

    return this.send({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: input.name,
        language: { code: input.language ?? 'en' },
        ...(components.length > 0 ? { components } : {}),
      },
    })
  }

  /** Free-form message, only valid inside the 24 h customer-service window. */
  async sendText(to: string, text: string): Promise<SentMessage> {
    const recipient = normalizeNumber(to).replace(/^\+/, '')
    if (!text.trim()) throw new Error('WhatsApp text is empty.')
    return this.send({
      messaging_product: 'whatsapp',
      to: recipient,
      type: 'text',
      text: { body: text.slice(0, 4096), preview_url: false },
    })
  }

  /** Meta webhook subscription handshake (`hub.challenge` echoed on success). */
  verifyChallenge(params: Record<string, unknown>): { ok: boolean; challenge?: string } {
    const mode = String(params['hub.mode'] ?? '')
    const token = String(params['hub.verify_token'] ?? '')
    const challenge = params['hub.challenge']
    if (mode !== 'subscribe' || !this.verifyToken || token !== this.verifyToken) return { ok: false }
    return typeof challenge === 'string' ? { ok: true, challenge } : { ok: false }
  }

  /** Verify `X-Hub-Signature-256` over the exact raw body. */
  verifySignature(rawBody: Buffer | Uint8Array | string, header: string | undefined): boolean {
    if (!this.appSecret || !header) return false
    const expected = `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`
    const provided = header.trim().toLowerCase()
    if (provided.length !== expected.length) return false
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
    } catch {
      return false
    }
  }

  /**
   * Extract delivery statuses and inbound messages. Meta nests them two levels
   * deep (`entry[].changes[].value`); unknown shapes are ignored, never thrown.
   */
  parseWebhook(payload: unknown): ParsedWebhook {
    const statuses: WebhookStatus[] = []
    const messages: WebhookMessage[] = []
    const entries = (payload as { entry?: unknown[] } | null)?.entry
    if (!Array.isArray(entries)) return { statuses, messages }

    for (const entry of entries) {
      const changes = (entry as { changes?: unknown[] })?.changes
      if (!Array.isArray(changes)) continue
      for (const change of changes) {
        const value = (change as { value?: Record<string, unknown> })?.value
        if (!value) continue

        const rawStatuses = value.statuses
        if (Array.isArray(rawStatuses)) {
          for (const status of rawStatuses as Array<Record<string, unknown>>) {
            if (typeof status.id !== 'string' || typeof status.status !== 'string') continue
            statuses.push({
              id: status.id,
              status: status.status,
              ...(typeof status.recipient_id === 'string' ? { recipientId: status.recipient_id } : {}),
              ...(typeof status.timestamp === 'string' ? { timestamp: status.timestamp } : {}),
              ...(Array.isArray(status.errors) && status.errors.length > 0
                ? { error: JSON.stringify(status.errors[0]).slice(0, 500) }
                : {}),
            })
          }
        }

        const rawMessages = value.messages
        if (Array.isArray(rawMessages)) {
          for (const message of rawMessages as Array<Record<string, unknown>>) {
            if (typeof message.id !== 'string' || typeof message.from !== 'string') continue
            const text = (message.text as { body?: unknown } | undefined)?.body
            const button = (message.button as { text?: unknown } | undefined)?.text
            const interactive = (
              message.interactive as { button_reply?: { id?: unknown } } | undefined
            )?.button_reply?.id
            messages.push({
              id: message.id,
              from: message.from,
              type: typeof message.type === 'string' ? message.type : 'unknown',
              ...(typeof message.timestamp === 'string' ? { timestamp: message.timestamp } : {}),
              ...(typeof text === 'string' ? { text } : {}),
              ...(typeof button === 'string' ? { button } : {}),
              ...(typeof interactive === 'string' ? { interactiveId: interactive } : {}),
            })
          }
        }
      }
    }

    return { statuses, messages }
  }

  /**
   * Review status of every template in the WABA, so the console can say
   * "pending review" instead of failing at send time. Any Graph error is thrown;
   * callers treat it as "unknown", never as "approved".
   */
  async listTemplates(): Promise<TemplateSummary[]> {
    if (!this.configured || !this.wabaId) return []
    const url = new URL(`${this.apiBaseUrl}/${this.version}/${this.wabaId}/message_templates`)
    url.searchParams.set('fields', 'id,name,status,category,language')
    url.searchParams.set('limit', '200')
    let response: Response
    try {
      response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      })
    } catch (error) {
      throw new Error(`WhatsApp request failed: ${(error as Error).message}`)
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`WhatsApp API failed (${response.status}): ${text.slice(0, 300)}`)
    }
    const body = (await response.json().catch(() => ({}))) as { data?: TemplateSummary[] }
    return body.data ?? []
  }

  private async send(body: unknown): Promise<SentMessage> {
    if (!this.configured) {
      throw new Error('WhatsApp Cloud API is not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN).')
    }

    let response: Response
    try {
      response = await this.fetchImpl(
        `${this.apiBaseUrl}/${this.version}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      )
    } catch (error) {
      throw new Error(`WhatsApp request failed: ${(error as Error).message}`)
    }

    const text = await response.text()
    if (!response.ok) throw new Error(`WhatsApp API failed (${response.status}): ${text.slice(0, 500)}`)
    const parsed = JSON.parse(text || '{}') as { messages?: Array<{ id?: string }> }
    const messageId = parsed.messages?.[0]?.id
    if (!messageId) throw new Error('WhatsApp API returned no message id.')
    return { messageId }
  }
}
