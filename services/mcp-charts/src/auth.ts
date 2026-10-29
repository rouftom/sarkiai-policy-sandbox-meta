import crypto from "node:crypto";

/**
 * API key authentication shared by the Vercel handler (`api/mcp.ts`) and the
 * standalone Express server (`src/main.ts`).
 *
 * A key is accepted from any of the following locations (first match wins):
 *  1. One of the supported HTTP headers (case-insensitive, see API_KEY_HEADER_NAMES).
 *     `Authorization` accepts raw keys as well as `Bearer <key>`, `Token <key>`,
 *     `ApiKey <key>`, `Api-Key <key>` and `Basic base64(user:key)` schemes, which
 *     makes the server compatible with the Anthropic MCP connector
 *     (`authorization_token` -> `Authorization: Bearer <key>`).
 *  2. A query-string parameter (see API_KEY_QUERY_PARAMS), for clients that can only
 *     configure a URL (e.g. remote connectors without custom headers).
 *  3. Legacy: an `mcp-session-id` ending with the key (`<org>-<key>`), as used by the
 *     SarkiAI MultiMcpClient.
 *
 * Authentication is only enforced when at least one key is configured through
 * `MCP_API_KEYS` (comma separated), `MCP_API_KEY` or `SEA_MCP_API_KEY`.
 * Set `MCP_AUTH_DISABLED=true` to temporarily bypass enforcement.
 */

export const API_KEY_HEADER_NAMES = [
  "x-api-key",
  "authorization",
  "api-key",
  "apiKey",
  "x-apikey",
  "api-token",
  "x-auth-token",
] as const;

export const API_KEY_QUERY_PARAMS = [
  "api_key",
  "apiKey",
  "api-key",
  "x-api-key",
  "apikey",
  "api_token",
  "token",
] as const;

const LEGACY_SESSION_HEADER = "mcp-session-id";
const AUTH_SCHEMES = /^(bearer|token|apikey|api-key|key)\s+/i;

export type HeaderGetter = (name: string) => string | null | undefined;

export interface AuthResult {
  ok: boolean;
  /** HTTP status to return when ok is false (401 invalid key, 503 server misconfigured). */
  status?: number;
  /** Where the accepted credential came from (never contains the key itself). */
  source?: string;
  reason?: string;
}

/** Returns the list of accepted API keys configured in the environment. */
export function getConfiguredApiKeys(): string[] {
  const raw = [process.env.MCP_API_KEYS, process.env.MCP_API_KEY, process.env.SEA_MCP_API_KEY]
    .filter(Boolean)
    .join(",");
  return Array.from(new Set(raw.split(",").map((k) => k.trim()).filter(Boolean)));
}

/** Authentication is mandatory (fail-closed). Only MCP_AUTH_DISABLED=true (local development) bypasses it. */
export function isAuthEnforced(): boolean {
  return !/^(1|true|yes)$/i.test(process.env.MCP_AUTH_DISABLED ?? "");
}

/** Normalises a raw header/query value into a bare credential. */
export function extractCredential(value: string | null | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  if (!v) return null;
  if (/^basic\s+/i.test(v)) {
    try {
      const decoded = Buffer.from(v.replace(/^basic\s+/i, ""), "base64").toString("utf8");
      const idx = decoded.indexOf(":");
      // Prefer the password part, fall back to the username part (e.g. "key:")
      v = idx >= 0 ? decoded.slice(idx + 1) || decoded.slice(0, idx) : decoded;
    } catch {
      return null;
    }
  } else {
    v = v.replace(AUTH_SCHEMES, "");
  }
  v = v.trim().replace(/^["']|["']$/g, "");
  return v || null;
}

function digest(value: string): Buffer {
  return crypto.createHash("sha256").update(value).digest();
}

/** Constant-time comparison against every configured key. */
function matchesAnyKey(candidate: string, keys: string[]): boolean {
  const c = digest(candidate);
  let match = false;
  for (const key of keys) {
    // Do not short-circuit to keep timing independent of key position
    if (crypto.timingSafeEqual(c, digest(key))) match = true;
  }
  return match;
}

/**
 * Validates an incoming request.
 * @param getHeader case-insensitive header getter
 * @param searchParams parsed query string of the request
 */
export function authenticate(getHeader: HeaderGetter, searchParams?: URLSearchParams | null): AuthResult {
  if (!isAuthEnforced()) return { ok: true, source: "disabled" };
  const keys = getConfiguredApiKeys();
  if (keys.length === 0) {
    return { ok: false, status: 503, reason: "Server misconfigured: no API key is configured (MCP_API_KEYS or SEA_MCP_API_KEY)." };
  }

  for (const name of API_KEY_HEADER_NAMES) {
    const credential = extractCredential(getHeader(name) ?? getHeader(name.toLowerCase()));
    if (credential && matchesAnyKey(credential, keys)) return { ok: true, source: `header:${name}` };
  }

  if (searchParams) {
    for (const name of API_KEY_QUERY_PARAMS) {
      const credential = extractCredential(searchParams.get(name));
      if (credential && matchesAnyKey(credential, keys)) return { ok: true, source: `query:${name}` };
    }
  }

  // Legacy SarkiAI scheme: mcp-session-id = "<org-slug>-<key>"
  const sessionId = getHeader(LEGACY_SESSION_HEADER) || searchParams?.get("sessionId");
  if (sessionId) {
    for (const key of keys) {
      if (sessionId.length >= key.length && matchesAnyKey(sessionId.slice(-key.length), [key])) {
        return { ok: true, source: "legacy:mcp-session-id" };
      }
    }
  }

  return {
    ok: false,
    reason: `Missing or invalid API key. Provide it via one of the headers: ${API_KEY_HEADER_NAMES.join(", ")} (Authorization supports "Bearer <key>"), or the "api_key" query parameter.`,
  };
}

/** Builds a JSON-RPC compliant 401 response for the Web (Fetch API) runtime. */
export function unauthorizedResponse(reason: string, corsHeaders: Record<string, string> = {}, status = 401): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: `Unauthorized: ${reason}` }, id: null }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="mcp", error="invalid_token"',
        ...corsHeaders,
      },
    },
  );
}

/** CORS headers advertising every accepted API key header. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": [
    "Content-Type",
    "Accept",
    "Mcp-Session-Id",
    "Mcp-Protocol-Version",
    "Last-Event-ID",
    "X-Mcp-Server",
    ...API_KEY_HEADER_NAMES,
  ].join(", "),
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};
