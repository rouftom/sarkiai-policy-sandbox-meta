/** Runtime configuration for the API application layer. */

function env(name: string, fallback = ''): string {
  return process.env[name] ?? fallback
}

/**
 * Is this the cloud demo?
 *
 * `SANDBOX_MODE=cloud` is the explicit switch, but a Render deployment that
 * received the Meta key without the mode still runs on Meta models. Treating
 * that as cloud keeps public sign-up open instead of silently closing it when
 * one environment variable is missing.
 */
const cloudDeployment =
  env('SANDBOX_MODE', 'local').toLowerCase() === 'cloud' || Boolean(env('MODEL_API_KEY'))

/**
 * Console origins.
 *
 * Nothing is hardcoded: `WEB_PUBLIC_URL` is the canonical origin (every link the
 * API sends is built from it), `WEB_PUBLIC_URL_ALIASES` lists any other origin
 * that must keep working (previous domain, staging host, second console...).
 * Without them the console is assumed to run locally. `*.vercel.app` previews
 * are always accepted, so a deployment link works whichever domain is live.
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

function isLocalOrigin(origin: string): boolean {
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

export interface OriginPolicy {
  /** Canonical origin plus configured aliases. */
  origins: string[]
  /** Accept every origin (self-hosted default until a canonical origin is set). */
  allowAny: boolean
}

/**
 * Whether a browser origin may call the API. `undefined` means a same-origin or
 * server-side call, which has no CORS decision to make. Every `*.vercel.app`
 * host is accepted, so previews and an older deployment keep working while the
 * canonical origin lives in `WEB_PUBLIC_URL`.
 */
export function isOriginAllowed(origin: string | undefined, policy: OriginPolicy): boolean {
  if (!origin) return true
  if (policy.allowAny) return true
  const candidate = originOf(origin)
  if (!candidate) return false
  if (policy.origins.includes(candidate) || isLocalOrigin(candidate)) return true
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.vercel.app')
  } catch {
    return false
  }
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

export const config = {
  host: env('HOST', '0.0.0.0'),
  port: Number(env('PORT', '8000')),
  serviceApiKey: env('SERVICE_API_KEY'),

  qdrant: {
    url: env('QDRANT_URL', 'http://localhost:6333'),
    apiKey: env('QDRANT_API_KEY'),
    collection: env('QDRANT_COLLECTION', 'policy_chunks'),
  },

  // Cloud retrieval: Voyage embeddings + MongoDB Atlas Vector/Search.
  // `auto` follows the provider mode (cloud => atlas, sovereign/local => qdrant).
  retrieval: {
    backend: env('RETRIEVAL_BACKEND', 'auto'),
    voyage: {
      apiKey: env('VOYAGE_API_KEY'),
      baseUrl: env('VOYAGE_API_URL', 'https://api.voyageai.com/v1'),
      embeddingModel: env('VOYAGE_EMBEDDING_MODEL', 'voyage-4'),
      rerankModel: env('VOYAGE_RERANK_MODEL', 'rerank-2'),
      dimensions: Number(env('EMBEDDING_DIMENSION', '1024')) || 1024,
    },
    atlas: {
      collection: env('MONGODB_RAG_COLLECTION', 'kb_chunks'),
      vectorIndex: env('MONGODB_VECTOR_INDEX', 'sps_vector_index'),
      textIndex: env('MONGODB_TEXT_INDEX', 'sps_text_index'),
      autoIndexes: env('MONGODB_AUTO_INDEXES', 'true') !== 'false',
    },
  },

  // Operational store only (audit log + chain-of-thought); no vectors.
  mongodb: {
    uri: env('MONGODB_URI', 'mongodb://localhost:27017'),
    dbName: env('MONGODB_DB_NAME', 'policy_sandbox'),
  },

  ingestion: {
    baseUrl: env('INGESTION_URL', 'http://localhost:8001'),
    apiKey: env('SERVICE_API_KEY'),
  },

  // Local faster-whisper service, used when the provider is not `cloud`.
  transcription: {
    url: env('TRANSCRIPTION_URL', 'http://localhost:8003'),
  },

  // Local LLM (Ollama, OpenAI-compatible). Muse Glimmer (Meta open weights) by default.
  ollama: {
    baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: env('OLLAMA_MODEL', 'muse-glimmer'),
  },

  // Local embeddings (Ollama).
  embeddings: {
    baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
    model: env('EMBEDDING_MODEL', 'bge-m3'),
  },

  // Optional local reranker (TEI). Empty URL => RRF-only.
  rerank: {
    url: env('RERANK_URL'),
    model: env('RERANK_MODEL', 'BAAI/bge-reranker-v2-m3'),
  },

  // Object storage (MinIO / S3) for assistant image attachments.
  s3: {
    endpoint: env('S3_ENDPOINT', 'http://localhost:9000'),
    bucket: env('S3_BUCKET', 'sps-attachments'),
    accessKey: env('S3_ACCESS_KEY', 'sps-minio'),
    secretKey: env('S3_SECRET_KEY', 'sps-minio-secret'),
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
     * Public self-service sign-up. Open on the cloud demo only (the hackathon
     * judges create their own account); closed for local / sovereign runs.
     * `AUTH_SIGNUP` can force it either way.
     */
    signup: env('AUTH_SIGNUP', cloudDeployment ? 'true' : 'false') === 'true',
    maxOperators: Number(env('AUTH_MAX_OPERATORS', '12')) || 12,
  },

  // Transactional e-mail (Resend): only used to mail an operator's first password.
  mail: {
    apiKey: env('AUTH_RESEND_KEY'),
    from: env('AUTH_RESEND_EMAIL_FROM', 'SarkiAI Policy Sandbox <hackathon@djotta.com>'),
    replyTo: env('AUTH_RESEND_EMAIL_REPLY_TO'),
    publicUrl: publicOrigin,
  },

  // The console's own origins. `canonicalUrl` builds every link we send (auth
  // e-mails, approval buttons); `allowedOrigins` is what the CORS layer accepts,
  // so the custom domain and the Vercel deployment both work during the switch.
  web: {
    canonicalUrl: publicOrigin,
    allowedOrigins: publicOrigins,
    isAllowedOrigin,
  },
} as const
