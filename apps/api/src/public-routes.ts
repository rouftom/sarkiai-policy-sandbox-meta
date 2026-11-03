/**
 * Routes reachable without a console session: health, the whole
 * sign-in/sign-up/reset handshake, the Meta webhook, the signed approval links
 * and the published API reference. Everything else requires
 * `Authorization: Bearer <session>`.
 *
 * Kept outside `routes/index.ts` so the OpenAPI document can mark security
 * exactly as the guard enforces it, without importing the route graph.
 */
export function isPublicRoute(method: string, path: string): boolean {
  if (method === 'OPTIONS') return true
  if (path === '/health') return true
  if (path === '/openapi.json' || path === '/docs') return true
  if (path === '/v1/voice/realtime') return true
  if (path === '/v1/whatsapp/webhook') return true
  if (path.startsWith('/v1/whatsapp/approvals/')) return true
  if (path.startsWith('/v1/kb/images/') && method === 'GET') return true
  if (path === '/v1/auth/setup') return true
  if (path === '/v1/auth/captcha') return true
  if (path === '/v1/auth/signup') return true
  if (path === '/v1/auth/login') return true
  if (path === '/v1/auth/password') return true
  if (path === '/v1/auth/password/forgot') return true
  if (path === '/v1/auth/password/reset') return true
  if (path === '/v1/auth/email/verify') return true
  if (path === '/v1/auth/email/resend') return true
  if (path === '/v1/auth/mfa/enroll') return true
  if (path === '/v1/auth/mfa/confirm') return true
  if (path === '/v1/auth/mfa/verify') return true
  return false
}
