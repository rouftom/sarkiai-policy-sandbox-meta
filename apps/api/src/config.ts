/** Runtime configuration for the API application layer. */

import { isIP } from 'node:net'
import type { FastifyRequest } from 'fastify'

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

/**
 * Client address behind an edge.
 *
 * The host's load balancer terminates TLS, so the socket address is an internal
 * one. Edges put the real client in a header they set themselves; the API reads
 * the first valid address from `CLIENT_IP_HEADERS` (see `parseClientIpHeaders`)
 * and only falls back to `request.ip`.
 *
 * `TRUST_PROXY` controls that fallback, i.e. how much of `X-Forwarded-For` is
 * believed:
 *
 * - `false` — no proxy chain: the socket address is used.
 * - a number — proxies to trust, counted from the socket. `1` is the common case
 *   (one load balancer or ingress).
 * - `true` — trust the whole chain. Only sensible when the process is reachable
 *   exclusively through the proxy.
 *
 * Unset, one hop is trusted. A deployment whose edge supplies an overwritten
 * header does not depend on this setting at all.
 */
export type TrustProxySetting = boolean | ((address: string, hop: number) => boolean)

export function parseTrustProxy(value: string | undefined): TrustProxySetting {
  const raw = String(value ?? '').trim()
  if (!raw) return (_address, hop) => hop < 1
  const normalized = raw.toLowerCase()
  if (['false', 'no', 'off', '0'].includes(normalized)) return false
  if (['true', 'yes', 'on'].includes(normalized)) return true
  if (/^\d+$/.test(raw)) {
    const hops = Number(raw)
    // Same rule proxy-addr applies to a number: trust the first `hops` peers.
    return hops > 0 ? (_address, hop) => hop < hops : false
  }
  // An unrecognised value must not silently trust the chain.
  return (_address, hop) => hop < 1
}

/**
 * Headers that carry the client address set by the edge in front of the API.
 *
 * The default covers the common edges without naming one: Cloudflare and
 * Cloudflare-compatible CDNs (`CF-Connecting-IP`), Akamai / Fastly
 * (`True-Client-IP`), and nginx or a reverse proxy configured with
 * `proxy_set_header X-Real-IP $remote_addr`. `X-Forwarded-For` is deliberately
 * absent: it is a chain, so it is ambiguous and client-supplied values survive
 * on its left. A deployment that has only that header uses `TRUST_PROXY`
 * instead.
 *
 * The order matters: the first header with a valid address wins. Each listed
 * header must be **overwritten** by the edge for every request; a name the
 * caller can set is only safe when the origin is unreachable except through
 * that edge.
 *
 * `CLIENT_IP_HEADERS=none` disables header lookup and uses `request.ip` only.
 */
export const DEFAULT_CLIENT_IP_HEADERS = ['cf-connecting-ip', 'true-client-ip', 'x-real-ip'] as const

export function parseClientIpHeaders(value: string | undefined): string[] {
  const entries = String(value ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => /^[a-z0-9][a-z0-9-]*$/.test(entry))
  if (entries.some((entry) => entry === 'none' || entry === 'off' || entry === 'false')) return []
  return entries.length > 0 ? [...new Set(entries)] : [...DEFAULT_CLIENT_IP_HEADERS]
}

function firstValidAddress(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value.join(',') : value
  if (!raw) return null
  for (const part of raw.split(',')) {
    const candidate = part.trim()
    if (!candidate) continue
    if (isIP(candidate)) return candidate
    // Some edges append a port to an IPv4 address.
    const withPort = candidate.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
    if (withPort && isIP(withPort[1]!)) return withPort[1]!
  }
  return null
}

export interface ClientIpResolution {
  /** Resolved client address. */
  ip: string
  /** Header that supplied it, or `null` when the socket address was used. */
  source: string | null
}

/** First valid address from the configured headers, else the socket address. */
export function resolveClientIp(
  headers: Record<string, string | string[] | undefined>,
  socketIp: string,
  names: readonly string[],
): ClientIpResolution {
  for (const name of names) {
    const ip = firstValidAddress(headers[name])
    if (ip) return { ip, source: name }
  }
  return { ip: socketIp, source: null }
}

/**
 * Is this the cloud demo?
 *
 * `SANDBOX_MODE=cloud` is the explicit switch, but a deployment that received
 * the Meta key without the mode still runs on Meta models. Treating that as
 * cloud keeps public sign-up open instead of silently closing it when one
 * environment variable is missing.
 */
const cloudDeployment =
  env('SANDBOX_MODE', 'local').toLowerCase() === 'cloud' || Boolean(env('MODEL_API_KEY'))

/**
 * `local`, `sovereign` or `cloud`. An unknown value is treated as local. Cloud
 * and sovereign deployments keep assistant media in Cloudinary (the enterprise
 * setup) unless `MEDIA_STORE` says otherwise; local and self-hosted installs use
 * MinIO / S3 by default.
 */
const sandboxMode = env('SANDBOX_MODE', 'local').toLowerCase()

const requestedMediaStore = env('MEDIA_STORE', '').toLowerCase()
const defaultMediaStore = sandboxMode === 'cloud' || sandboxMode === 'sovereign' ? 'cloudinary' : 's3'

/**
 * Console origins.
 *
 * Nothing is hardcoded: `WEB_PUBLIC_URL` is the canonical origin (every link the
 * API sends is built from it), `WEB_PUBLIC_URL_ALIASES` lists any other origin
 * that must keep working (previous domain, staging host, second console...).
 * Without them the console is assumed to run locally.
 *
 * On-premise installs are the reason the policy is not closed by default: a
 * `docker compose up` behind a LAN name or a reverse proxy cannot know its own
 * public origin. Until `WEB_PUBLIC_URL` is set, any origin is accepted (the
 * behaviour that preceded this allowlist, and harmless on a token-authenticated
 * API). Setting the variable — or `WEB_ALLOW_ANY_ORIGIN=true` for an unusual
 * proxy setup — makes the choice explicit. `WEB_ALLOW_ANY_ORIGIN` also works in
 * cloud mode for a host that really needs it.
 */
const DEV_ORIGIN = `http://localhost:${env('WEB_DEV_PORT', '3000')}`

function originOf(value: string | undefined): string | null {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

function originList(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => originOf(entry))
    .filter((entry): entry is string => Boolean(entry))
}

const configuredOrigin = originOf(env('WEB_PUBLIC_URL'))
const publicOrigin = configuredOrigin ?? DEV_ORIGIN

const publicOrigins = [
  ...new Set([publicOrigin, ...originList(env('WEB_PUBLIC_URL_ALIASES')), DEV_ORIGIN]),
]

/**
 * Origins that can only come from the local network: loopback on any port,
 * private and link-local IPv4 ranges, single-label hostnames (a container name,
 * a NetBIOS name), and the reserved private suffixes. Those are always accepted
 * so a self-hosted install never breaks on a remapped port, a LAN address or an
 * internal DNS entry — regardless of whether `WEB_PUBLIC_URL` is set.
 *
 * A public hostname can never match: it has a dot and a registrable suffix, and
 * its address is not in a private range.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const PRIVATE_SUFFIXES = ['.local', '.internal', '.lan', '.home.arpa']

export function isLocalOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin)
    if (protocol !== 'http:' && protocol !== 'https:') return false
    if (LOOPBACK_HOSTS.has(hostname)) return true

    const v4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (v4) {
      const a = Number(v4[1])
      const b = Number(v4[2])
      return (
        a === 10 ||
        a === 127 ||
        (a === 192 && b === 168) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 169 && b === 254)
      )
    }

    if (!hostname.includes('.')) return true
    return hostname === 'home.arpa' || PRIVATE_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  } catch {
    return false
  }
}

/**
 * A local install with no mail transport may return the root one-time password
 * in the setup response: it is the only way in, and the screen shows it once.
 * A public host never does — a mail failure there still rolls the account back.
 */
export function localSetupPasswordFallback(errorCode: string | undefined, canonicalUrl: string): boolean {
  return errorCode === 'mail_not_configured' && isLocalOrigin(canonicalUrl)
}

export interface OriginPolicy {
  /** Canonical origin plus configured aliases. */
  origins: string[]
  /** Accept every origin (self-hosted default until a canonical origin is set). */
  allowAny: boolean
}

/**
 * Whether a browser origin may call the API. `undefined` means a same-origin or
 * server-side call, which has no CORS decision to make. Besides the configured
 * origins, local-network origins are accepted; anything else is refused.
 */
export function isOriginAllowed(origin: string | undefined, policy: OriginPolicy): boolean {
  if (!origin) return true
  if (policy.allowAny) return true
  const candidate = originOf(origin)
  if (!candidate) return false
  return policy.origins.includes(candidate) || isLocalOrigin(candidate)
}

/**
 * Runtime policy. An explicit `WEB_PUBLIC_URL` (or a cloud deployment, which
 * always has one) closes the allowlist; a bare self-hosted install keeps the
 * historical open behaviour, so no on-premise setup breaks on upgrade. Local
 * network origins are accepted either way (see `isLocalOrigin`).
 */
const originPolicy: OriginPolicy = {
  origins: publicOrigins,
  allowAny:
    env('WEB_ALLOW_ANY_ORIGIN').toLowerCase() === 'true' ||
    (!cloudDeployment && !configuredOrigin),
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  return isOriginAllowed(origin, originPolicy)
}

/**
 * Resolve the caller's address once: an edge header first, the socket otherwise.
 * Request logs use the source; throttles only need the address.
 */
export function clientIpResolution(
  request: Pick<FastifyRequest, 'headers' | 'ip'>,
): ClientIpResolution {
  return resolveClientIp(request.headers, request.ip, config.proxy.clientIpHeaders)
}

export function clientIp(request: Pick<FastifyRequest, 'headers' | 'ip'>): string {
  return clientIpResolution(request).ip
}

export const config = {
  /** Deployment profile: `cloud` also covers a host that only received the Meta key. */
  deployment: {
    mode: env('SANDBOX_MODE', 'local').toLowerCase(),
    cloud: cloudDeployment,
  },
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', '8000')),

  /**
   * Client-IP resolution behind an edge. `request.ip` follows Fastify's
   * `trustProxy`; `clientIp()` reads the configured edge header first, so the
   * per-IP rate limits and request logs see the real caller. See
   * `parseTrustProxy` and `parseClientIpHeaders`.
   */
  proxy: {
    trust: parseTrustProxy(env('TRUST_PROXY')),
    clientIpHeaders: parseClientIpHeaders(env('CLIENT_IP_HEADERS')),
  },

  // Corpus search: a lexical index (Atlas Search in the cloud, a MongoDB text
  // index in local and sovereign) driven by the Meta model of the mode.
  // `depth` is the default reasoning budget per search: lexical | fast | deep.
  retrieval: {
    backend: env('RETRIEVAL_BACKEND', 'auto'),
    depth: (['lexical', 'fast', 'deep'].includes(env('RETRIEVAL_DEPTH', 'fast')) ? env('RETRIEVAL_DEPTH', 'fast') : 'fast') as 'lexical' | 'fast' | 'deep',
    atlas: {
      collection: env('MONGODB_RAG_COLLECTION', 'kb_chunks'),
      textIndex: env('MONGODB_TEXT_INDEX', 'sps_text_index'),
      autoIndexes: env('MONGODB_AUTO_INDEXES', 'true') !== 'false',
    },
  },

  // Operational store: audit log, chain-of-thought and the corpus passages.
  mongodb: {
    uri: env('MONGODB_URI', 'mongodb://localhost:27017'),
    dbName: env('MONGODB_DB_NAME', 'policy_sandbox'),
    /**
     * False when the install runs without a Mongo store. Operator accounts then
     * fall back to the in-memory service; better-auth owns the accounts (and
     * therefore needs Mongo) only when the URI is actually configured.
     */
    configured: Boolean(env('MONGODB_URI')),
  },

  // Local LLM (Ollama, OpenAI-compatible). Muse Glimmer (Meta open weights) by default.
  ollama: {
    baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: env('OLLAMA_MODEL', 'muse-glimmer'),
  },

  // Object storage (MinIO / S3) for assistant image attachments.
  s3: {
    endpoint: env('S3_ENDPOINT', 'http://localhost:9000'),
    bucket: env('S3_BUCKET', 'sps-attachments'),
    accessKey: env('S3_ACCESS_KEY', 'sps-minio'),
    secretKey: env('S3_SECRET_KEY', 'sps-minio-secret'),
  },

  /**
   * Assistant chat attachments: images only. The console reads the caps from
   * `GET /v1/attachments/limits`, so a deployment that sets them keeps the
   * composer in step. Defaults: four images of 2 MiB each.
   */
  attachments: {
    maxImages: Math.max(1, Number(env('ASSISTANT_MAX_IMAGES', '4')) || 4),
    maxBytes: Math.max(1, Number(env('ASSISTANT_MAX_IMAGE_BYTES', String(2 * 1024 * 1024))) || 2 * 1024 * 1024),
  },

  /**
   * Where the assistant keeps the images it was sent.
   *
   * `s3` (local, sovereign without Cloudinary) stores the bytes in MinIO / S3,
   * content-addressed, and serves them through a signed read route with a WebP
   * thumbnail. `cloudinary` (cloud demo) uploads them to the dedicated
   * `CLOUDINARY_SPS_FOLDER/attachments` folder. `MEDIA_STORE` overrides the
   * mode-derived default; an unconfigured Cloudinary falls back to S3 at boot.
   *
   * Signed read URLs never expire: the content is immutable, so rotating
   * `ATTACHMENT_SIGNING_SECRET` (or the session secret it falls back to) is the
   * way to revoke them.
   */
  media: {
    store: (requestedMediaStore === 's3' || requestedMediaStore === 'cloudinary'
      ? requestedMediaStore
      : defaultMediaStore) as 's3' | 'cloudinary',
    thumbnailWidth: Math.max(64, Number(env('ATTACHMENT_THUMBNAIL_WIDTH', '480')) || 480),
    signingSecret:
      env('ATTACHMENT_SIGNING_SECRET') || env('SESSION_SECRET') || env('APPROVAL_SECRET') || 'sps-attachments-dev',
  },

  // WhatsApp Cloud API, called directly from the API (no external gateway).
  // Cloud API is the only channel; approval decisions stay inside the web app.
  whatsapp: {
    version: env('WHATSAPP_VERSION', 'v26.0'),
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    wabaId: env('WHATSAPP_WABA'),
    accessToken: env('WHATSAPP_ACCESS_TOKEN'),
    verifyToken: env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    appSecret: env('WHATSAPP_APP_SECRET'),
    recipient: env('WHATSAPP_RECIPIENT_WAID'),
    templateLanguage: env('WHATSAPP_TEMPLATE_LANGUAGE', 'en'),
    apiBaseUrl: env('WHATSAPP_API_URL', 'https://graph.facebook.com'),
    approvalSecret: env('APPROVAL_SECRET'),
    webPublicUrl: publicOrigin,
  },

  // Operator auth: session signing only. Accounts are created from the console's
  // one-time setup screen; no password is seeded from the environment.
  auth: {
    sessionSecret: env('SESSION_SECRET') || env('APPROVAL_SECRET'),
    /**
     * better-auth's own signing key: it encrypts the TOTP secret and recovery
     * codes and signs the links better-auth would issue. Must be at least 32
     * characters; when unset the session secret is used (or a SHA-256 of it).
     */
    betterAuthSecret: env('BETTER_AUTH_SECRET'),
    /**
     * Public origin of this API, used by better-auth to build links.
     * `BETTER_AUTH_URL` is the name the shared auth packages use; `API_PUBLIC_URL`
     * is the historical name kept for this deployment.
     */
    baseUrl: env('BETTER_AUTH_URL') || env('API_PUBLIC_URL') || `http://localhost:${env('PORT', '8000')}`,
    /** Cookie prefix better-auth issues; mirrors the shared auth default. */
    cookiePrefix: env('BETTER_AUTH_COOKIE_PREFIX', 'sps-'),
    /**
     * Public self-service sign-up. Open on the cloud demo only (the hackathon
     * judges create their own account); closed for local / sovereign runs.
     * `AUTH_SIGNUP` can force it either way.
     */
    signup: env('AUTH_SIGNUP', cloudDeployment ? 'true' : 'false') === 'true',
    maxOperators: Number(env('AUTH_MAX_OPERATORS', '12')) || 12,
    /**
     * better-auth runs a password reset (consume the token, revoke the
     * sessions, set the password) in a MongoDB transaction when this is on.
     * Default off: a transaction needs a replica set or a mongos, and a bare
     * local `mongod` — which this project supports — refuses them.
     */
    betterAuthTransactions: env('BETTER_AUTH_TRANSACTIONS', 'false') === 'true',
  },

  /**
   * Per-caller request budgets. `RATE_LIMIT_MAX` covers the authenticated API
   * as a whole, `RATE_LIMIT_EXPENSIVE_MAX` the routes that spend model credits.
   * Counters are in-process: one instance today, and `RATE_LIMIT_ENABLED=false`
   * is the escape hatch if a console workflow ever needs a higher burst.
   */
  rateLimit: {
    enabled: env('RATE_LIMIT_ENABLED', 'true') !== 'false',
    windowMs: Number(env('RATE_LIMIT_WINDOW_MS', '60000')) || 60_000,
    max: Number(env('RATE_LIMIT_MAX', '240')) || 240,
    expensiveMax: Number(env('RATE_LIMIT_EXPENSIVE_MAX', '20')) || 20,
  },

  /**
   * Caps on in-flight model work. One readiness series legitimately runs five
   * streams at once, so the per-operator default sits above that; past it the
   * API answers 429 rather than queueing. `AI_CONCURRENCY_PER_OPERATOR=0` turns
   * the gate off (0 means "no cap" for both values).
   */
  concurrency: {
    perOperator: Number(env('AI_CONCURRENCY_PER_OPERATOR', '8')) || 0,
    global: Number(env('AI_CONCURRENCY_GLOBAL', '16')) || 0,
    /**
     * Dimensions one readiness run evaluates at the same time. Cells are the
     * expensive part: 13 in parallel per sector multiplies fast.
     */
    dimensions: Math.max(1, Number(env('READINESS_DIMENSION_CONCURRENCY', '4')) || 4),
  },

  // Transactional e-mail (Resend): only used to mail an operator's first password.
  mail: {
    apiKey: env('AUTH_RESEND_KEY'),
    from: env('AUTH_RESEND_EMAIL_FROM', 'SarkiAI Policy Sandbox <hackathon@djotta.com>'),
    replyTo: env('AUTH_RESEND_EMAIL_REPLY_TO'),
    publicUrl: publicOrigin,
  },

  // The console's own origins. `canonicalUrl` builds every link we send (auth
  // e-mails, approval buttons); `allowedOrigins` is what the CORS layer and
  // better-auth accept, so a custom domain and its aliases work during a switch.
  web: {
    canonicalUrl: publicOrigin,
    allowedOrigins: publicOrigins,
    isAllowedOrigin,
  },
} as const
