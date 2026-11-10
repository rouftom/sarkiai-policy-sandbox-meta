import type { NextConfig } from 'next'

/**
 * Origins that may reach this app (server actions CSRF allowlist).
 *
 * Nothing is hardcoded and nothing is provider-specific: the canonical origin
 * comes from `NEXT_PUBLIC_WEB_URL`, extra origins from
 * `NEXT_PUBLIC_WEB_ORIGINS` / `WEB_PUBLIC_URL_ALIASES`, and local development is
 * always allowed. A preview or review host is just another origin: list it in
 * `NEXT_PUBLIC_WEB_ORIGINS`. Next also accepts a same-origin request whose
 * `Origin` matches the `Host` header, so an on-premise install behind a LAN name
 * or a reverse proxy needs no extra configuration.
 */
function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function hostOf(value: string | undefined): string | null {
  const trimmed = firstNonEmpty(value)
  if (!trimmed) return null
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).host
  } catch {
    return null
  }
}

function hostsOf(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => hostOf(entry))
    .filter((entry): entry is string => Boolean(entry))
}

const productionHost = hostOf(process.env.NEXT_PUBLIC_WEB_URL)

const devPort = firstNonEmpty(process.env.NEXT_PUBLIC_WEB_PORT) ?? '3000'

/**
 * Every allowed origin comes from configuration: no platform wildcard is
 * assumed, so the same build works on any host.
 */
const deploymentOrigins = [
  ...new Set(
    [
      productionHost,
      ...hostsOf(process.env.NEXT_PUBLIC_WEB_ORIGINS),
      ...hostsOf(process.env.WEB_PUBLIC_URL_ALIASES),
      `localhost:${devPort}`,
    ].filter((host): host is string => Boolean(host)),
  ),
]

/**
 * Content-Security-Policy, limited to the two directives that matter for model
 * output rendered in the console: `img-src` (an injected image URL can leak data
 * in its query string) and `frame-src` (an injected frame can impersonate the
 * UI). Other resource types keep the browser defaults.
 *
 * Allowed: this app, inline data and blobs, the API host (figures), Cloudinary
 * (report images), the MCP app hosts (chart and document views) and the
 * Turnstile challenge. The MCP sandbox pages are excluded. Extra hosts:
 * `NEXT_PUBLIC_CSP_IMG_SOURCES`, `NEXT_PUBLIC_CSP_FRAME_SOURCES`
 * (comma-separated origins). Set `NEXT_PUBLIC_CSP_REPORT_ONLY=true` to observe
 * violations without blocking.
 */
function originOfUrl(value: string | undefined): string | null {
  const trimmed = firstNonEmpty(value)
  if (!trimmed) return null
  try {
    return new URL(trimmed).origin
  } catch {
    return null
  }
}

function originsOf(value: string | undefined): string[] {
  return String(value ?? '')
    .split(',')
    .map((entry) => originOfUrl(entry))
    .filter((entry): entry is string => Boolean(entry))
}

/**
 * Origins of the configured MCP apps, from `NEXT_PUBLIC_MCP_SERVERS` (the same
 * JSON the console reads): a configured server is framed, nothing else is.
 * A malformed value is left to the app's parser, which fails loudly; here it
 * only means no extra frame origin.
 */
function mcpOrigins(value: string | undefined): string[] {
  try {
    const parsed = JSON.parse(firstNonEmpty(value) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((entry) => (entry && typeof entry === 'object' ? originOfUrl((entry as { url?: string }).url) : null))
      .filter((origin): origin is string => Boolean(origin))
  } catch {
    return []
  }
}

const MCP_APP_ORIGINS = mcpOrigins(process.env.NEXT_PUBLIC_MCP_SERVERS)

function sourceList(values: (string | null | undefined)[]): string {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].join(' ')
}

const imgSources = sourceList([
  "'self'",
  'data:',
  'blob:',
  originOfUrl(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'),
  'https://res.cloudinary.com',
  ...originsOf(process.env.NEXT_PUBLIC_CSP_IMG_SOURCES),
])

const frameSources = sourceList([
  "'self'",
  'data:',
  'blob:',
  ...MCP_APP_ORIGINS,
  'https://challenges.cloudflare.com',
  ...originsOf(process.env.NEXT_PUBLIC_CSP_FRAME_SOURCES),
])

const cspHeader = process.env.NEXT_PUBLIC_CSP_REPORT_ONLY === 'true'
  ? 'Content-Security-Policy-Report-Only'
  : 'Content-Security-Policy'

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The MCP sandbox pages (`/sandbox_*.html`) host third-party app UIs in a
        // sandboxed frame with their own assets; the policy applies everywhere else.
        source: '/:path((?!sandbox_).*)',
        headers: [{ key: cspHeader, value: `img-src ${imgSources}; frame-src ${frameSources}` }],
      },
      {
        // An approval link carries a one-time token in the path: never cache it.
        source: '/approve/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ]
  },
  output: 'standalone',
  reactStrictMode: true,
  // Workspace packages ship TypeScript sources (main → src/index.ts).
  transpilePackages: ['@sps/ui', '@sps/shared', '@sps/theme'],
  experimental: {
    optimizePackageImports: ['lucide-react', '@sps/ui'],
    serverActions: { allowedOrigins: deploymentOrigins },
  },
}

export default nextConfig
