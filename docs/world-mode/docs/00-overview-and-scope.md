# 00 — Overview and scope

## 1. Vision

Move from a single-country sandbox (Cameroon, health-data incident) to a **multi-country laboratory**: see where each country stands, select countries, run the same lens everywhere with per-country settings, compare results, and refresh the underlying legal evidence — all with cited, auditable output.

> Pick countries on the map, run the same assessment or crisis everywhere, and see where mandates conflict. Every claim is cited.

## 2. Reality check (from the repository)

| Fact | Consequence |
|---|---|
| Only Cameroon has a country corpus (`data/country/cm`, 33 documents); `data/global/africa` (3) and `data/global/standards` (4) are reference corpora. | Until more countries are onboarded, most of the map is "not assessed". **Decision: the next countries are the United States and France** (differing from the repository roadmap's M6 wording, which names a Central/West African country; update M6 accordingly). World mode makes the empty state first-class and drives onboarding. |
| Readiness engine exists (13 dimensions, 6 factors, 0–5, confidence 0–1, what-if, bilingual text, streaming, resume, batches). | World mode **aggregates and orchestrates**; it never re-scores. |
| Scenario engine, exercise package, audit chain, WhatsApp/e-mail, impact analysis exist. | Battle-test types map to them. |
| `/v1/countries` registry exists (shared, data-driven). | The map's entity list for "active/planned" countries comes from it. |
| Runs are **operator-scoped**; country summaries are cross-operator (`readinessRuns.byCountry`). | **Decision: a select chooses the scope** — *My reports* (default) or *Shared reports*. Shared shows summary fields only; reports stay private to their operator. |

## 3. Personas

| Persona | Need |
|---|---|
| **Policy analyst** | Compare national frameworks, spot gaps and mandate conflicts. |
| **Institution focal point / regulator** | Test one's own country's preparedness under a crisis. |
| **Auditor / evaluator** | Verify rigour: from a score to the cited provisions and the audit chain. |
| **Corpus curator** | Onboard a country, validate proposed legal texts. |
| **Demo presenter** | Show the platform in minutes with a guided scenario. |

Roles in the repository today: `operator`, `admin` (`Role` in `@sps/auth`); roadmap M2 adds finer roles. World mode defines permissions against these two and is RBAC-ready (see `docs/10`).

## 4. User stories (M = V1, S = V2, C = later)

**Map**
- US-01 (M) Smooth world map; hover shows name and the active layer value.
- US-02 (M) Zoom/pan with wheel, pinch, keyboard.
- US-03 (M) Click a country: sheet opens, camera frames it, its **regions appear**.
- US-04 (M) Click a region: lightweight region sheet.
- US-05 (M) Search by name (EN/FR/local) via a command palette.
- US-06 (S) Multi-select (modifier click, rectangle, predefined groups such as CEMAC).
- US-07 (S) Micro-states stay visible and clickable.
- US-08 (M) Equivalent **table view** (accessibility, sorting, export).

**Readiness view**
- US-10 (M) Switch layer: composite, one dimension, one factor, coverage, confidence, freshness, corpus size.
- US-11 (M) A country without grounded data is hatched "no grounded data", never coloured as a low score.
- US-12 (M) From a score, open dimension evidence: gaps, recommendations, cited chunks (existing report UI components reused).
- US-13 (M) Country sheet: corpus (manifest status), readiness by sector, KPIs, run history, freshness.
- US-14 (S) Compare two or more countries (radar/table), reusing `recharts`.
- US-15 (S) Re-weight dimensions (existing `weights`) and recompute the composite client-side.
- US-16 (M) Choose the report scope in a select: **My reports** or **Shared reports** (summaries of everyone's complete runs that their owners did not exclude, never their content).
- US-17 (M) Exclude one of my runs from the shared scope, and include it again, from the sheet or the run page.

**Battle tests**
- US-30 (M) "Launch battle test": choose type, countries (map or list), sectors; configure each country.
- US-31 (M) Global settings with group → country → region overrides, inherited values visible.
- US-32 (M) Pre-flight check before launch (corpus present, provider ready, estimated cost/time, caps).
- US-33 (M) Live progress per country; pause, cancel, retry one country; survives page reload.
- US-34 (M) Per-country results and a cross-country comparison.
- US-35 (S) A/B comparison of two runs or two settings.
- US-36 (M) Reproducible run manifest; every step in the audit chain.
- US-37 (S) Export (Word via `mcp-docx`, JSON, CSV).
- US-38 (C) Cross-border incident scenario with flows on the map.

**Legal watch**
- US-20 (S) "Refresh this country": see progress, sources, proposed texts.
- US-21 (S) Review a proposal (rights, excerpt, source) and accept, reject or edit.
- US-22 (S) Freshness badge on every figure; stale items flagged.
- US-23 (C) Scheduled watch for a group of countries.
- US-24 (S) Offline source bundle import (zip) — works in `local` mode.

**Comfort**
- US-40 (S) Demo mode with guided tour. US-41 (S) EN/FR, light/dark/theme packs. US-42 (C) Shareable view link.

## 5. Scope

**In:** map engine and geodata pipeline; world read model over existing data; World page; multi-country orchestrator and queue; per-country settings; legal-watch pipeline with human validation; audit, security, tests, docs.

**Out (V1–V3):** new agents; sub-regional (district) maps except pilots; real-time third-party layers; legal advice (outputs are simulations and cited syntheses); multi-user real-time collaboration.

## 6. Principles

1. **Reuse before build** — no second readiness engine, no second audit log, no second corpus.
2. **Evidence first** — a value without a citation chain is not shown as a score.
3. **Coverage and confidence travel with every score.**
4. **Sovereignty** — `local` mode stays fully offline-capable; web features are gated by mode and flag.
5. **Auditable and replayable** — manifests and hash-chained audit records.
6. **Performance is a feature** — budgets enforced in CI.
7. **Accessible by construction** — the map is never the only way to reach information.
8. **Documented geopolitical neutrality.**
9. **Human in the loop** for anything coming from the web or a model before it enters the corpus.
10. **Agnostic core** — framework bindings are thin.

## 7. Success metrics

| Metric | V1 | V3 |
|---|---|---|
| Time to interactive map (fast 3G, mid device) | ≤ 1.5 s | same |
| Zoom/pan | ≥ 55 fps median | same |
| Entities shown | all UN members + listed territories | same |
| African countries with regions | 54/54 | all |
| Scores shown with coverage + confidence | 100 % | 100 % |
| Battle-test runs resumable after API restart | n/a | ≥ 99 % |
| Proposed legal texts with rights status before review | n/a | 100 % |
| Critical axe violations | 0 | 0 |
