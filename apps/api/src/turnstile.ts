/**
 * Cloudflare Turnstile for the public sign-up and password-reset forms.
 *
 * The console is publicly reachable, so asking for a reset link goes through a
 * human check. Local and sovereign installs keep the form untouched: no
 * third-party call and no key. A missing key disables the check instead of
 * blocking the form, and an unreachable Cloudflare never locks an operator out —
 * only an explicit refusal from Cloudflare rejects the request.
 *
 * The widget's public key is served to the console by `GET /v1/auth/captcha`, so
 * the web build carries no Turnstile variable: the API owns the whole feature.
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type SandboxMode = 'local' | 'sovereign' | 'cloud'
export type TurnstileAction = 'signup' | 'password_reset'

function read(name: string): string {
  return (process.env[name] ?? '').trim()
}

/**
 * Provider mode, resolved like the model provider: an explicit `cloud` wins,
 * an explicit `sovereign` is on-premise, and a deployment that received the Meta
 * key without the mode still runs in cloud (see `cloudDeployment` in
 * `config.ts`). Anything else is a local install.
 */
export function sandboxMode(): SandboxMode {
  const configured = read('SANDBOX_MODE').toLowerCase()
  if (configured === 'cloud') return 'cloud'
  if (configured === 'sovereign') return 'sovereign'
  return read('MODEL_API_KEY') ? 'cloud' : 'local'
}

/** The widget's public key, or null when the deployment has none. */
export function turnstileSiteKey(): string | null {
  return read('NEXT_PUBLIC_CLOUDFLARE_TURNSITE_SITE_KEY') || null
}

/**
 * The widget secret.
 *
 * `TURNSTILE_SECRET` is the canonical name; `CLOUDFLARE_TURNSITE_SITE_SECRET`
 * is the name this console has always used (and the one already deployed on
 * the API host), so both are read and the canonical one wins.
 */
function turnstileSecret(): string {
  return read('TURNSTILE_SECRET') || read('CLOUDFLARE_TURNSITE_SITE_SECRET')
}

/**
 * Whether a form must present a token: cloud or sovereign, with both
 * keys configured. Missing keys mean "off", never "block every request".
 */
export function turnstileEnabled(): boolean {
  return sandboxMode() !== 'local' && Boolean(turnstileSecret()) && Boolean(turnstileSiteKey())
}

export interface TurnstileConfig {
  required: boolean
  siteKey: string | null
}

/** What the console needs to render — or skip — the widget. */
export function turnstileConfig(): TurnstileConfig {
  if (!turnstileEnabled()) return { required: false, siteKey: null }
  return { required: true, siteKey: turnstileSiteKey() }
}

export async function verifyTurnstile(
  token: string | undefined,
  expectedAction: TurnstileAction,
  remoteIp?: string,
): Promise<boolean> {
  if (!turnstileEnabled()) return true
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false

  const body = new URLSearchParams({ secret: turnstileSecret(), response: token })
  if (remoteIp) body.set('remoteip', remoteIp)

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    // Cloudflare itself is unavailable: keep the form usable.
    if (response.status >= 500) return true
    if (!response.ok) return false

    const result = (await response.json()) as {
      success?: boolean
      action?: string
      hostname?: string
    }
    if (result.success !== true) return false
    // Cloudflare signs the surface into the token: a sign-up token must not
    // unlock the reset form, and the other way round.
    if (result.action !== expectedAction) return false

    const allowed = read('TURNSTILE_HOSTNAMES')
      .split(',')
      .map((hostname) => hostname.trim())
      .filter(Boolean)
    // A configured allowlist pins the console's hostname; left empty it accepts
    // whatever domain the widget itself allows.
    if (allowed.length > 0 && (!result.hostname || !allowed.includes(result.hostname))) return false

    return true
  } catch {
    // Network error or timeout: Cloudflare is not reachable, do not lock the form.
    return true
  }
}
