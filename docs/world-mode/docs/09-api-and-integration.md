# 09 — API and integration

Contract types: `api/worldmap.d.ts`. JSON Schemas: `schemas/`. All World routes require the console session (`Authorization: Bearer`), i.e. they are **not** listed in `public-routes.ts`.

## 1. File placement (follows existing patterns)

| New / changed file | Role |
|---|---|
| `packages/worldmap/` (`@sps/worldmap`) | Map engine, zero runtime deps |
| `packages/worldmap-geo/` (`@sps/worldmap-geo`) | Geodata build pipeline, crosswalks, manifest types, **committed generated artifacts** (`artifacts/`, ≈ 1 MB); `sources/` git-ignored |
| `packages/world/` (`@sps/world`) | Server-side domain: summary read model, battle-test orchestrator, job queue, legal watch, safe fetch, settings |
| `apps/api/src/world-routes.ts` | `registerWorldRoutes(app, deps)`, same style as `auth-routes.ts` / `voice-routes.ts`, called from `routes/index.ts` |
| `apps/api/src/world-*.ts` stores | `world-battle-store.ts`, `world-watch-store.ts`, `world-groups.ts`, `world-settings.ts` (Mongo or memory, like `readiness-runs.ts`) |
| `apps/api/src/openapi/schemas.ts`, `operations.ts` | zod schemas and operations for every route (`openapi.test.ts` pattern) |
| `apps/api/src/routes/index.ts` | add World launch routes to `EXPENSIVE_ROUTES`; register routes |
| `apps/api/src/config.ts` (+ `config.test.ts`) | `config.world.*` from the env vars of `docs/06` §5 and `docs/07` |
| `apps/web/src/app/(app)/world/page.tsx`, `apps/web/src/components/world/*` | UI |
| `apps/web/src/lib/api.ts` | `worldApi` client; `lib/i18n.tsx` `world.*` keys (EN+FR) |
| `packages/theme` | `maturityRamp` slot |
| `scripts/` | `fetch-geodata.sh`, `geo-build.ts` (`bun run geo:build`), `geo-verify.ts` (`bun run geo:verify`), `backfill-readiness-summary.ts`, `export-manifest.ts`, `check-country-onboarding.ts`; indexes in `ensure-mongo-indexes.ts` |
| `.env.example`, `docs/world-mode/*`, `README.md` | variables, docs |

## 2. Routes (`/v1/world/*`)
Errors follow the existing shape `{ error: '<code>', message }` and `validationFailure(reply, zodError)`. Mutations require `operator`; settings/groups/proposal-rights confirmation require `admin`.

### Read models
| Method | Path | Notes |
|---|---|---|
| GET | `/summary?sector=&scope=mine|shared` | `WorldSummary`; ETag; `scope` default `mine`; `shared` = summary fields of all operators' complete runs, no report content or operator identity |
| GET | `/countries/:code?scope=mine|shared` | `CountrySheet`, same scope rule |
| GET | `/groups` | groups with members (code lower-case) |
| PUT | `/groups/:id` (admin) | create/update; audited |
| PATCH | `/runs/:kind/:runId/sharing` | `{ sharing: 'shared' \| 'excluded' }`; owner only; `kind` = `readiness` or `scenario`; audited |
| GET | `/settings` · PUT `/settings` (admin) | thresholds, caps (effective value + source), flags |

### Battle tests
| Method | Path | Notes |
|---|---|---|
| POST | `/battle-tests/validate` | pre-flight report, no side effects |
| POST | `/battle-tests/dry-run` | plan without model calls |
| POST | `/battle-tests` | create + enqueue; **expensive route**; `202 { id }`, `429 queue_full` |
| GET | `/battle-tests` · `/battle-tests/:id` | list / state + manifest |
| GET | `/battle-tests/:id/events` | **SSE**, `Last-Event-ID` resume |
| POST | `/battle-tests/:id/pause` · `/resume` · `/cancel` | |
| POST | `/battle-tests/:id/jobs/:jobId/retry` | |
| GET | `/battle-tests/:id/results` | matrix, divergences, warnings |
| GET | `/battle-tests/compare?a=&b=` | A/B |
| POST | `/battle-tests/:id/replay` | creates a new test, returns drift |
| GET | `/battle-tests/:id/export?format=docx|json|csv` | docx via `mcp-docx` |

### Legal watch
| Method | Path | Notes |
|---|---|---|
| POST | `/watch/estimate` | queries, domains, model calls; `offline_mode` in local |
| POST | `/watch/jobs` | **expensive route**; gated by mode + `WORLD_WATCH_ENABLED` |
| GET | `/watch/jobs/:id` · `/watch/jobs/:id/events` (SSE) | |
| POST | `/watch/jobs/:id/cancel` | |
| GET | `/watch/proposals?country=&status=` | validation queue |
| POST | `/watch/proposals/:id/decision` | `{ decision: accept|reject|edit, edit?, reason? }`, role rules in `docs/07` §4 |
| POST | `/watch/import` | zip bundle, body limit ≈ 40 MB like image upload |

## 3. SSE event shape
Same conventions as the readiness stream (JSON per `data:` line, `type` discriminator, terminal `saved`/`failed` style events). World events: `test.queued`, `test.started`, `test.paused`, `test.resumed`, `test.finished`, `job.queued`, `job.leased`, `job.progress` (carries the engine's own events such as `running`, `result`, `decision`, `done`, `error` forwarded with the job id), `job.succeeded`, `job.failed`, `job.interrupted`, `queue.position`, `settings.changed`. Each event has a monotonically increasing `id` per test for `Last-Event-ID`.

## 4. Integration rules
1. **Engine access**: `@sps/world` receives dependencies (engine stack factory, stores, `WorkGate`, `AuditService`, usage store) by injection from `routes/index.ts`; it never imports `apps/api`.
2. **Operator scoping**: battle tests, jobs and watch jobs carry `operator.email`; proposals are shared; summaries follow the `scope` select (ADR-010).
3. **Gate**: orchestrator workers use `WorkGate.tryEnter(operator)`; if a lease is not available the job waits and retries with jitter.
4. **Audit**: `AuditService.logAction` for every action in `docs/06` §7 and `docs/07`.
5. **Config**: all variables in `config.ts`, documented in `.env.example`; invalid values fall back and warn.
6. **OpenAPI**: every route has an operation and schema; extend `openapi.test.ts` route list with representative World routes.
7. **Docs**: update `README.md` (layout, features), `docs/ARCHITECTURE.md` (runtime topology, storage), `docs/DATA-MODEL.md`, `ROADMAP.md` (M4/M6 cross-references).
8. **Sidecars**: unchanged. Word export reuses `mcp-docx` tool contracts; if a tool contract changes, change both sides and document it (repository rule).

## 5. Package build and size
`@sps/worldmap`: ESM, `sideEffects: false`, core ≤ 25 KB gzip excluding geometry, strict TypeScript, tests with `bun:test` beside sources. `@sps/world`: server-only. No Node-only import in `@sps/worldmap` (it is bundled by Next.js for the browser).

## 6. Versioning and compatibility
API additions under `/v1/world`; breaking changes need `/v2`. Geometry manifest has `schemaVersion` and `geoVersion`; the engine refuses an incompatible manifest with a clear message. Mongo documents carry `schemaVersion` with idempotent migrations in `scripts/`.

## 7. Telemetry
None outbound. Local diagnostics panel (`?debug=1`): frame time, element counts, geometry/framework versions, audit-chain verdict (reusing `AuditService` verification).
