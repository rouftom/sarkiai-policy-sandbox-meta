# 11 — Performance, quality and tests

## 1. Reference conditions
Reference device: 4-core laptop, 8 GB RAM, integrated GPU, current Chrome/Edge, 1920×1080. Low-end: mid-range Android, ~4 GB RAM. Network for load tests: fast 3G emulation; local otherwise.

## 2. Budgets (targets to validate)
| Id | Metric | Reference | Low-end |
|---|---|---|---|
| PB-01 | Bytes before interactive (core + L0 + names), brotli | ≤ 120 KB | same |
| PB-02 | Time to interactive map (fast 3G) | ≤ 1.5 s | ≤ 3 s |
| PB-03 | L0 parse in worker | ≤ 15 ms | ≤ 40 ms |
| PB-04 | Recolour 250 entities | ≤ 8 ms | ≤ 20 ms |
| PB-05 | Hover → tooltip | ≤ 16 ms | ≤ 32 ms |
| PB-06 | Zoom/pan | ≥ 55 fps median (p95 ≥ 45) | ≥ 40 fps |
| PB-07 | Open a country (median admin-1 chunk) | ≤ 250 ms | ≤ 600 ms |
| PB-08 | Open the heaviest country (250 KB cap) | ≤ 600 ms | ≤ 1.5 s |
| PB-09 | Memory after 20 countries opened/closed | ≤ 150 MB, back within ±10 % | ≤ 220 MB |
| PB-10 | Leak over 1,000 mount/destroy | ≤ 5 % growth | same |
| PB-11 | Core size gzip | ≤ 25 KB | same |
| PB-12 | Table view, 250 rows | ≤ 30 ms | ≤ 80 ms |
| PB-13 | Total Blocking Time at load | ≤ 100 ms | ≤ 300 ms |
| PB-14 | `GET /v1/world/summary` (250 entries) | ≤ 150 ms warm, ≤ 60 KB | n/a |
| PB-15 | INP while a 12-country test streams | ≤ 200 ms | ≤ 350 ms |
| PB-16 | Queue: lease decision latency | ≤ 50 ms | n/a |
| PB-17 | Committed geometry artifacts, total | ≤ 3 MB (measured ≈ 1 MB) | n/a |
| PB-18 | `geo:build` rebuild is byte-identical | 100 % | n/a |

## 3. Bench setup
Playwright with `performance.mark/measure` and Chrome traces (CPU 4× slowdown for low-end). Scenarios: cold load · eight layer switches · 10 s continuous zoom/pan · open/close 20 countries including the three heaviest · 1,000 mount/destroy · 60-country selection · table view · simulated test with 500 events/s. `size-limit` guards PB-01 and PB-11. Reports kept; CI fails on > 10 % regression. Note: the repository's CI runs typecheck and unit tests only (e2e needs live services); perf/e2e benches are therefore an **opt-in workflow** (`workflow_dispatch`) plus a local `bun run bench:world`.

## 4. Test strategy (all runnable with `bun test`)
| Level | Scope |
|---|---|
| Unit | geometry helpers, colour scales, store, selection (property-based), summary building, display-rule resolution, settings precedence, queue fairness and leasing (stub `WorkGate`), cascade merge, audit action payloads |
| Integration (`*.integration.test.ts`, gated like existing ones) | Mongo stores, queue persistence and restart recovery, SSE resume with `Last-Event-ID`, readiness job with a stub engine |
| API | OpenAPI document includes World routes; zod validation; role checks; `queue_full`; `offline_mode` |
| E2E (`tests/e2e`, needs services) | launch from map → monitor → results; local-mode gating; proposal accept/reject |
| Visual | per-country snapshots at three zoom levels, themes, forced colors |
| Accessibility | axe-core + manual keyboard and screen-reader passes |
| Security | SSRF, injection, oversize, XSS-in-names suites |
| Chaos | provider drop mid-test, API restart mid-queue, corrupted chunk |
| Data QA | `docs/03` §10 |
| Golden | readiness aggregation fixtures (`docs/05` §8) |

## 5. Code quality
TypeScript strict as in `tsconfig.base.json`; `bun run typecheck` and `bun run test` green; Conventional Commits with scope; files kebab-case; header comment stating each file's role; PRs into `develop`, merge commits (no squash); doc updates in the same PR.

## 6. Definition of done (extends the repository's)
1. `bun run typecheck`, `bun run test` pass; `bun run build` passes for `apps/web` and published packages.
2. Targeted suites for retrieval/auth/migrations touched.
3. OpenAPI and `.env.example` updated; `docs/` and `README.md` updated.
4. Budgets met on the reference device; no critical axe violation; keyboard path verified.
5. Audit actions written and chain verified in a test.
6. Both locales updated for every new string.
7. Demonstrated on a clean `docker compose up` with `SANDBOX_MODE=local`.
