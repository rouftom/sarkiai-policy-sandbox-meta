/**
 * Signed, expiring approval links.
 *
 * The approval decision is taken in the web app (no WhatsApp quick-reply), so a
 * WhatsApp notification only carries a link. The token is stateless and signed
 * with `APPROVAL_SECRET`; single use is enforced by the API's Mongo store on the
 * `jti`, not by the token itself.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

export interface ApprovalClaims {
  /** Token format version. */
  v: 1
  runId: string
  /** Single-use identifier (persisted when the decision is recorded). */
  jti: string
  /** Expiry, Unix seconds. */
  exp: number
  /** Short human-readable subject, shown on the approval page. */
  subject?: string
  /** Operator (e-mail) who owns the run, so the page only reads their reports. */
  userId?: string
}

export type ApprovalVerification =
  | { ok: true; claims: ApprovalClaims }
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' }

const MAX_TOKEN_LENGTH = 4096

function base64url(value: Buffer | string): string {
  return Buffer.from(value).toString('base64url')
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export interface CreateApprovalTokenInput {
  runId: string
  secret: string
  ttlSeconds?: number
  subject?: string
  userId?: string
  jti?: string
  now?: number
}

export function createApprovalToken(input: CreateApprovalTokenInput): {
  token: string
  claims: ApprovalClaims
} {
  if (!input.secret) throw new Error('APPROVAL_SECRET is not configured.')
  if (!input.runId) throw new Error('An approval token needs a runId.')

  const now = input.now ?? Math.floor(Date.now() / 1000)
  const claims: ApprovalClaims = {
    v: 1,
    runId: input.runId,
    jti: input.jti ?? randomUUID(),
    exp: now + (input.ttlSeconds ?? 24 * 60 * 60),
    ...(input.subject ? { subject: input.subject.slice(0, 200) } : {}),
    ...(input.userId ? { userId: input.userId.slice(0, 200) } : {}),
  }
  const payload = base64url(JSON.stringify(claims))
  return { token: `${payload}.${sign(payload, input.secret)}`, claims }
}

export function verifyApprovalToken(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): ApprovalVerification {
  if (!secret || !token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'malformed' }

  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [payload, signature] = parts
  if (!payload || !signature) return { ok: false, reason: 'malformed' }

  const expected = sign(payload, secret)
  if (expected.length !== signature.length) return { ok: false, reason: 'signature' }
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
    return { ok: false, reason: 'signature' }
  }

  let claims: ApprovalClaims
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as ApprovalClaims
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (
    claims.v !== 1 ||
    typeof claims.runId !== 'string' ||
    !claims.runId ||
    typeof claims.jti !== 'string' ||
    !claims.jti ||
    !Number.isInteger(claims.exp)
  ) {
    return { ok: false, reason: 'malformed' }
  }
  if (claims.exp <= now) return { ok: false, reason: 'expired' }
  if (claims.userId !== undefined && typeof claims.userId !== 'string') {
    return { ok: false, reason: 'malformed' }
  }

  return { ok: true, claims }
}

/** Build the link sent in the template's URL button (base URL + token suffix). */
export function approvalUrl(webPublicUrl: string, token: string): string {
  return `${webPublicUrl.replace(/\/+$/, '')}/approve/${token}`
}
