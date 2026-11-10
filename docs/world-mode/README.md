# SarkiAI Policy Sandbox — "World mode"
## Specification pack v0.4 (aligned with the repository, draft for validation)

*Date: 2026-11-07 · Supersedes v0.1 to v0.3 · Language: English (repository-facing). A French summary of decisions and changes is in `LISEZMOI.fr.md`.*

This pack lives in `docs/world-mode/`: the narrative documents under `docs/`,
the machine-readable contracts in `api/`, `schemas/`, `data/` and `examples/`,
plus `analysis/`, `backlog.csv` and `tools/`. Paths written inside the pack are
relative to this directory. It follows `AGENTS.md`, `docs/RULES.md` and
`docs/ARCHITECTURE.md` of the repository analysed (state: `main` =
`meta-hackathon`, tree `8d43425`).

## 1. What World mode is

A **World** console page in `apps/web` that adds, on top of the existing engine (it never forks it):

1. an interactive **world map** (SVG, framework-agnostic TypeScript package `@sps/worldmap`) with **regions/provinces** of every country;
2. **multi-country battle tests**: queue, run and compare the existing lenses (`readiness`, `simulation`, `hybrid`, exercise) over many countries, with per-country settings (the existing `ReadinessRunInput` settings first);
3. a **country sheet** with legal-corpus synthesis, readiness scores, KPIs, freshness, and one-click refresh;
4. a **choropleth** of the existing readiness result (13 dimensions, 0–5 scale) with **coverage and confidence** shown next to every score;
5. **legal watch** (roadmap M4) feeding a human validation queue before anything enters the corpus.

## 2. Decisions (validated)

| # | Decision |
|---|---|
| D1 | Custom map engine; `svg-world-maps` is **not** installed (see `analysis/`). |
| D2 | Framework-agnostic, zero-runtime-dependency TypeScript core, package name **`@sps/worldmap`**. |
| D3 | Regions/provinces kept for every country (admin-1, lazy-loaded, one coordinate space). |
| D4 | Geometry from **Natural Earth** (public domain, licence text verified) through a deterministic build pipeline; **generated artifacts are committed** (≈ 1 MB measured), raw sources are not; no SimpleMaps file is ever committed. |
| D5 | **No new maturity index**: reuse the 13-dimension / 6-factor readiness framework (0–5). |
| D6 | The multi-country orchestrator **adds a queue** in front of the existing 429 gate; its caps are **configurable** (env, then admin setting, then default). |
| D7 | Repository-facing docs and code in **English**; UI bilingual EN/FR through the existing flat-key i18n. |
| D8 | Imports are limited to `@sps/*` workspace packages and published dependencies. |
| D9 | **Report scope select** on the map: *My reports* (default) or *Shared reports*; the shared scope shows summary fields only. |
| D10 | Pilot countries after Cameroon: **United States and France**. |
| D11 | **No code is pushed to GitHub before 10 November 2026**: work stays local; PRs only afterwards. |
| D12 | **`subnational` is added to `Jurisdiction`** (with an optional ISO 3166-2 `subdivision`) so US state-level and other regional documents have a place in the corpus. |
| D13 | An operator can **exclude any of their runs from the shared scope** (`sharing: shared \| excluded`, default shared). |

## 3. Index

| File | Content |
|---|---|
| `docs/00-overview-and-scope.md` | Vision, personas, user stories, scope, principles, success metrics |
| `docs/01-architecture-decisions.md` | ADRs and system overview |
| `docs/02-map-engine.md` | `@sps/worldmap`: rendering, zoom, selection, layers, accessibility, performance |
| `docs/03-geodata-pipeline.md` | Sources, licences, build pipeline, formats, regions, geopolitical neutrality |
| `docs/04-data-model.md` | Reused entities, new entities, Mongo collections, read models |
| `docs/05-readiness-aggregation.md` | Map layers over the 13 dimensions; coverage, confidence, display rules |
| `docs/06-battle-tests.md` | Composer, per-country settings, queue and caps, execution, results, replay |
| `docs/07-legal-watch.md` | Web refresh aligned with roadmap M4: discovery, fetch, verify, review, ingest |
| `docs/08-ux-ui.md` | Page, panels, interactions, accessibility, i18n keys, theme |
| `docs/09-api-and-integration.md` | `/v1/world/*` routes, SSE, OpenAPI, config variables, file placement |
| `docs/10-security-compliance-audit.md` | Threats, audit actions, rights, licences |
| `docs/11-performance-quality-tests.md` | Budgets, benches, test strategy, definition of done |
| `docs/12-roadmap-and-work-packages.md` | Work packages, phasing, estimates, dependencies on M4/M6 |
| `docs/13-risks-and-open-questions.md` | Risk register, open questions |
| `docs/14-repo-alignment.md` | What is reused, what is new, small changes to existing code, conventions checklist |
| `api/worldmap.d.ts` | Public TypeScript contract (type-checked) |
| `schemas/*.json` | JSON Schemas |
| `data/`, `examples/` | Policy files, crosswalks (Cameroon, France departments→regions), outlying parts, examples |
| `analysis/` | Reproducible measurements: map package, regional maps, repository findings |
| `backlog.csv` | Work-package tickets |
| `tools/validate.py` | Validates examples/data against schemas (review aid; the repository toolchain stays Bun/TypeScript) |

## 4. Conventions

RFC 2119 keywords (MUST, SHOULD, MAY). IDs: `US-xx`, `REQ-xx`, `ADR-xxx`, `R-xx`, `Q-xx`, `T-xxx`. Performance numbers are **targets to validate by benchmark**. Example values are **fictional**. No fact about a real country's law is asserted in this pack.
