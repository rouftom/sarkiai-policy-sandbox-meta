import { NextResponse } from "next/server";

/**
 * Egress relay for the Meta Model API.
 *
 * The API containers do not reach `api.meta.ai` (every model call comes back as
 * `model_not_found` from their egress), while Vercel does. The Fastify service
 * therefore points `META_BASE_URL` here, and this route forwards to Meta with
 * the team key held server-side.
 *
 * Guarded by a shared secret so the relay cannot be used by third parties.
 * Nothing is logged and no key ever leaves the server.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const META_ORIGIN = "https://api.meta.ai";
const ALLOWED_PREFIXES = ["v1/chat/completions", "v1/responses", "v1/messages", "v1/models", "v1/embeddings", "v1/images/generations", "v1/asr/transcribe"];

function authorised(request: Request): boolean {
  const expected = process.env.META_RELAY_KEY ?? "";
  const provided = request.headers.get("x-sps-relay-key") ?? "";
  if (!expected || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return mismatch === 0;
}

async function relay(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!authorised(request)) {
    return NextResponse.json({ error: { message: "unauthorised relay call" } }, { status: 401 });
  }

  const { path } = await context.params;
  const target = `${META_ORIGIN}/${path.join("/")}`;
  if (!ALLOWED_PREFIXES.some((prefix) => path.join("/").startsWith(prefix))) {
    return NextResponse.json({ error: { message: "path not allowed" } }, { status: 403 });
  }

  const key = process.env.META_RELAY_MODEL_KEY ?? "";
  if (!key) {
    return NextResponse.json({ error: { message: "relay key not configured" } }, { status: 500 });
  }

  const url = new URL(request.url);
  // Bytes, not text: multipart audio (WAV) must reach Meta unchanged.
  const upstream = await fetch(`${target}${url.search}`, {
    method: request.method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": request.headers.get("content-type") ?? "application/json",
      Accept: request.headers.get("accept") ?? "application/json",
    },
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
  });

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "no-store");

  return new Response(upstream.body, { status: upstream.status, headers });
}

export const GET = relay;
export const POST = relay;
