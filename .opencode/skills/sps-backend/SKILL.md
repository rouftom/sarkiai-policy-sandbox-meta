---
name: SarkiAI API backend
description: Conventions for the Fastify API in apps/api — where routes and stores live, the API-wide Bearer guard, config access, zod validation, metering, SSE, rate limits and backpressure, and the tests to run. Use when adding or changing a route, an auth behaviour, a store, a cron, or an error contract.
---

# SarkiAI API backend

## Layout

| File | Responsibility |
| --- | --- |
| `apps/api/src/index.ts` | boot: plugins, CORS, route registration, health, signals, shutdown |
| `apps/api/src/config.ts` | the only `process.env` reader; typed and testable |
| `apps/api/src/routes/index.ts` | HTTP surface + the single `onRequest` guard |
| `apps/api/src/auth-routes.ts` | `/v1/auth/*`, operators, `currentOperator()` |
| `apps/api/src/<domain>.ts` | one store/client per domain, colocated `.test.ts` |
| `apps/api/scripts/` | operational scripts (demo reset) |

## Adding a route

1. Put the handler in `routes/index.ts` (or a dedicated `*-routes.ts` for a new
   domain) and register it from `registerRoutes`.
2. Validate with `zod`:

   ```ts
   const body = z.object({ country: z.string().min(2) }).parse(request.body)
   ```

3. Auth is automatic: the guard resolves the Bearer token, sets
   `request.operator` and enters the metering context. Only `isPublicRoute`
   paths skip it — add one only with a written reason (signed links, webhooks,
   `/health`, auth).
4. Return typed payloads; failures use
   `reply.status(code).send({ error, message })`. Stable codes the UI depends
   on: `unauthorized`, `forbidden`, `not_found`, `rate_limited`, `busy`,
   `mail_not_configured`, `password_change_required`, `totp_required`.
5. Meter paid work (`kind`, `status`, model, tokens) or the run budget is
   wrong.
6. Add a unit test that would fail without the change.

## Config

- Read through `config.*`; never `process.env` in a handler or a package.
- New variable → `config.ts` with a default and a comment, `.env.example`
  (placeholder, never a real value), and the reference doc (`README.md` or
  `deploy/api/README.md`).
- Booleans accept `true/false/1/0`; parsers must not throw at import time.
- Secrets never have a usable default. `change-me-*` values are for local only.

## Cross-cutting middleware

- **Rate limit**: per operator, `RATE_LIMIT_*`; expensive routes get the
  tighter cap. Refusal = `429` + `Retry-After` + `RateLimit-*`.
- **Backpressure**: in-flight model work capped by `AI_CONCURRENCY_*`;
  past the cap answer `429 { error: "busy" }` immediately, never queue.
- **Shutdown**: `SIGTERM`/`SIGINT` stops accepting, waits ≤ 20 s, closes Mongo.
  New long-lived resources must register a closer with `closeStores`.
- **CORS**: `config.web.isAllowedOrigin`; localhost/private ranges are always
  allowed, public origins must be listed.
- **SSE**: hijack the reply, set `text/event-stream`, `no-transform`,
  `X-Accel-Buffering: no`; emit heartbeats; stop on client abort.

## Storage

- One store module per collection, typed records, indexes created at startup
  or by `bun run kb:indexes`.
- Always scope reads by `operator` unless the caller is an administrator, and
  append an `observability.read` audit record for cross-operator reads.
- Never log a prompt, a token, a password or a full phone number.

## Checks

```bash
cd apps/api && bun run typecheck
bun test apps/api/src
curl -s localhost:8000/health
```

Then exercise the touched route with a real token (or the local one-time
password path). A route that changes auth must be tested in both the success
and failure direction.
