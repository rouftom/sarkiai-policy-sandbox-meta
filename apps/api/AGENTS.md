# `apps/api` — API rules

Bun + Fastify 5 service. It is the only process that talks to the model
providers, MongoDB, Qdrant and the messaging providers.

## Structure

| File | Role |
| --- | --- |
| `src/index.ts` | process entry: CORS, route registration, signals, graceful shutdown |
| `src/config.ts` | the typed environment reader used by the API and its stores |
| `src/routes/index.ts` | HTTP surface, the API-wide Bearer guard, route handlers |
| `src/auth-routes.ts` | setup, sign-in, TOTP, reset, operators; `currentOperator()` |
| `src/<domain>.ts` | a store or a client per domain (`readiness-runs`, `scenarios`, `usage-store`, …) |
| `src/<domain>.test.ts` | unit tests, colocated, no network and no database |

Public routes (auth, health, webhook, signed approval links) are declared in
`isPublicRoute`. Everything else runs behind the `onRequest` guard, which also
enters the metering context. A new route is authenticated by default — never
add a permissive path without a comment explaining why.

## Conventions

- Register routes in `src/routes/index.ts`; keep the handler body small and push
  logic into a package (`@sps/...`) or a `src/*.ts` store.
- Validate every body, query and params with `zod`. Reject with
  `reply.status(400).send({ error, message })`; the client renders `error`.
- Read configuration through `config`, never `process.env` in a handler. A
  module that owns its own feature may read its variable directly (for example
  `turnstile.ts`), but it must be documented the same way. A new variable goes
  to `config.ts` (or its owning module), `.env.example` (placeholder only) and
  `README.md` / `deploy/api/README.md`.
- Never log a token, a password, a key, a full phone number or a raw prompt.
  Use `maskPhone`, and keep prompts in the audit trail, not in logs.
- Meter what spends credits: the usage store receives `kind`, `status`, tokens
  and the model id. A new paid call must be recorded, or the run budget lies.
- Rate limits (per operator) and backpressure (in-flight model calls) are
  already applied by the middleware. Do not add ad-hoc throttling.
- Long work streams over SSE (for example `/v1/scenarios/:id/release`); disable
  proxy buffering (`X-Accel-Buffering: no`) and never hold a request open
  without a heartbeat.
- Store access goes through the repository modules. Use parameterised queries
  and scoped filters; never interpolate user input into a Mongo filter.
- Never import `@sarkiai/*` or the proprietary AgenticUI harness. Workspace
  packages and declared dependencies only.

## Tests

- Unit: `bun test apps/api/src` — no infrastructure, no network, no clock.
- Gated integration: `*.integration.test.ts`, skipped unless the env is set.
- A bug fix ships with the test that would have caught it.
- `cd apps/api && bun run typecheck` must pass.

## Done

`bun test apps/api/src` + `bun run typecheck` + a `curl` smoke on `/health` and
the touched route.
