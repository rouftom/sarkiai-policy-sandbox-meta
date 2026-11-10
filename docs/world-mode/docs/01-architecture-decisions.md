# 01 — Architecture decisions (ADR) and overview

## 1. Overview

```
                    ┌─────────────────────────── apps/web (Next.js 16, React 19) ───────────────────────────┐
                    │  /(app)/world/page.tsx                                                                │
                    │   ├─ components/world/*  (panels, composer, monitor, review)  — @sps/ui, @sps/theme  │
                    │   └─ components/world/world-map.tsx  (thin React binding)                            │
                    │          └── @sps/worldmap (framework-agnostic core, zero runtime deps)              │
                    │                 └── Web Worker (parse geometry)  ◄── @sps/worldmap-geo artifacts     │
                    └───────────────────────────────┬───────────────────────────────────────────────────────┘
                                                    │ REST + SSE  (/v1/world/*, existing /v1/countries, /v1/readiness/*)
                    ┌───────────────────────────────▼───────────────────────────────────────────────────────┐
                    │ apps/api (Bun + Fastify 5)                                                            │
                    │  world-routes.ts ──► @sps/world                                                       │
                    │     • WorldSummaryService  (read model over readiness_runs, countries, kb status)     │
                    │     • BattleTestOrchestrator + JobQueue (new) ──► engine.stackFor(...)                │
                    │            ├─ ReadinessEngine.assess   (existing)                                     │
                    │            ├─ ScenarioEngine / PolicyOrchestrator (existing)                          │
                    │            └─ exercise (existing)                                                     │
                    │     • LegalWatchService (new, gated)  ──► WebSearch (@sps/agents) + guarded fetcher   │
                    │     • AuditService.logAction (existing, hash chain)                                   │
                    └──────────────┬──────────────────────────────┬─────────────────────────────────────────┘
                                   │ MongoDB                      │ Ollama / Meta Model API / Baseten
                   countries · readiness_runs · kb_chunks · audit │   (mode: local | sovereign | cloud)
                   + new: world_battle_tests · world_watch_jobs · world_watch_proposals · world_groups
```

Main flows:
1. **Display** — static geometry (L0) + `GET /v1/world/summary` → choropleth.
2. **Drill-down** — click country → admin-1 chunk loaded by a worker → regions in the same coordinate space; country sheet from `/v1/countries/:code/insights` and `/v1/world/countries/:code`.
3. **Battle test** — composer → `POST /v1/world/battle-tests/validate` → `POST /v1/world/battle-tests` → queued jobs → SSE progress → results.
4. **Legal watch** — job → discover → fetch → rights check → proposals → human decision → ingest through the existing ingestor → recompute readiness through the orchestrator.

---

## ADR-001 — Custom map engine, not `svg-world-maps`
**Accepted.** Measured on the package (compiled and run): world geometry is light (211 entries, 315 paths, 201 KB SVG / 45 KB gzip, generated in ≈ 2 ms) but the library is a string template: 104 duplicate `id`s out of 315, a new `<style>` and class name per call, no data-driven fill, no selection, no zoom/pan, no `tabindex`/`role`/`aria-*`, 11 UN members missing (AD, BS, KI, MH, FM, MC, PW, WS, SM, TV, VU). Regional maps: 4,299 entities in 211 files, each in its own coordinate frame, 92 countries with non-ISO 4-letter codes. See `analysis/`.

## ADR-002 — Geometry from Natural Earth through a deterministic pipeline; artifacts committed
**Accepted.** The repository is public under Apache-2.0 (`LICENSE`, content under CC BY 4.0 in `LICENSE-CONTENT`). Natural Earth is public domain (verified from the licence text of its source repository). The pipeline builds admin-0 (50 m) and admin-1 (10 m) into a single projected coordinate space. **Generated artifacts are committed** because they are small (measured ≈ 1 MB for the whole world including every admin-1 entity) and make a clean clone and the on-premise image work with no build or network; raw sources are fetched by script and git-ignored, like corpus payloads. SimpleMaps-derived files are governed by the SimpleMaps SVG licence (no raw redistribution) and are **never committed**; geoBoundaries is not used until its licence has been read. See `docs/03` §8.

## ADR-003 — Retained-mode SVG with a renderer interface
**Accepted.** One stable `<path>` per geometry part, incremental updates, borders as one mesh path, no `innerHTML`. A Canvas 2D renderer sits behind the same `Renderer` interface for very dense layers.

## ADR-004 — Framework-agnostic core; React binding in the app
**Accepted.** `@sps/worldmap` has no runtime dependency and no DOM framework. Because `apps/web` is React-only, the React binding lives in `apps/web/src/components/world/` (≈ 150 lines). A Web Component wrapper is optional (work package W-13). Styling by CSS custom properties mapped to `@sps/ui` tokens; no inline styles injected by the core (CSP-friendly).

## ADR-005 — Projected geometry, one coordinate space
**Accepted.** Projection applied at build time; countries and regions share the same space; drill-down is a camera move. Antimeridian cuts handled at build.

## ADR-006 — Reuse the readiness framework; World mode computes nothing new
**Accepted.** Dimensions, factors, 0–5 scale, composite, gap priority and what-if come from `@sps/shared` and `@sps/readiness`. World mode adds **read models** (summary, coverage, freshness) and **orchestration**.

## ADR-007 — Queue in front of the existing gate; configurable caps
**Accepted.** The existing `WorkGate` answers 429 immediately above its caps (`AI_CONCURRENCY_PER_OPERATOR=8`, `AI_CONCURRENCY_GLOBAL=16`, `0` disables) and the `RATE_LIMIT_EXPENSIVE_MAX=20` per minute budget applies to expensive routes. A multi-country run cannot be built on per-request streams. The orchestrator therefore:
- runs jobs **in-process** (calling the engine, not the HTTP routes), so the per-request rate limit is not the bottleneck, while still **leasing from the same `WorkGate`** so global capacity is respected;
- **queues** instead of refusing (bounded; `429 queue_full` only when the queue itself is full);
- is **configurable**: precedence **admin runtime setting → environment variable → mode-based default**; all changes audited (`docs/06` §5).

## ADR-008 — Background jobs independent of the HTTP connection
**Accepted.** Today `abortOnDisconnect` cancels work when the tab closes. Battle-test jobs use their own `AbortController`; SSE is observation only. Jobs are persisted (Mongo, memory fallback like every store) and resumable after restart through the existing `failed`/resume mechanism of readiness runs.

## ADR-009 — Mode gating of web access
**Accepted.** In `SANDBOX_MODE=local` no outbound call is made (existing guarantee). Legal watch's online steps require `SANDBOX_MODE` ≠ `local` **and** `WORLD_WATCH_ENABLED=true`; offline bundle import works in every mode. This matches the existing wiring where `webSearch` exists only for a model/provider that supports it.

## ADR-010 — Report scope: a select chooses *My reports* or *Shared reports*
**Accepted.** `GET /v1/world/summary` and the country sheet take `scope=mine|shared` (default `mine`). `mine`: summaries of the current operator's complete runs. `shared`: summaries of every operator's complete runs, **summary fields only** (composite, coverage, confidence, band, dates, counts): never report text, settings, chain-of-thought or operator identity. The selected scope is shown on the map and printed in exports. Battle tests and run details always stay operator-scoped. Whether an operator can exclude a run from the shared scope is Q-02b.

## ADR-011 — Persistence follows the repository pattern
**Accepted.** Each new store exposes one class: Mongo when reachable, in-memory otherwise, always typed, tested with `bun test` (unit, plus `*.integration.test.ts` gated like existing ones).

## ADR-012 — i18n and naming conventions
**Accepted.** English identifiers and docs; kebab-case files; `@sps/<name>` packages with `src/index.ts`; new UI strings added to **both** locales at once in the flat key map (a missing key is a type error). Conventional Commits with scope (`feat(world): …`).

## ADR-014 — Outlying parts: mainland framing, chips, optional insets
**Accepted.** One coordinate space makes France (overseas departments) and the USA (Alaska, Hawaii, territories) span the globe. Entities carry `focusBBox` (mainland) for framing and `outlying[]` for far parts, shown as chips; an optional inset mode redraws them in boxes. See `docs/02` §2.3 and `docs/03` §9.

## ADR-013 — Reproducibility
**Accepted.** Each battle test stores a manifest (per country: corpus snapshot fingerprint, model ids, settings hash, seeds where supported, code version, geo version). The audit chain records the model id of every step already; World mode adds the manifest hash.
