# 06 — Multi-country battle tests

A **battle test** runs one of the existing lenses over several countries (and sectors) with per-country settings, then compares results. It is an **orchestration and comparison layer**: it creates the same runs the console already creates, so run pages, audit dossiers and exports keep working.

## 1. Types
| Type | Runs | Per-country settings | Result per job |
|---|---|---|---|
| `readiness` | `ReadinessEngine.assess` (streamed engine, `ReadinessRunInput`) | `dimensions`, `perDimensionK`, `useWeb`, `reasoningEffort`, `models{webSearch,evaluate,synthesis}`, `concurrency`, `maxDecisions`, `language`, dimension `weights` | `readiness_runs` entry (`composite`, scores, report) |
| `simulation` | Scenario engine + `PolicyOrchestrator` (auto-release mode) | scenario id, agents, `chunkDelayMs`, model | scenario run (joint situation report, coordinator conflicts, citations, audit) |
| `hybrid` | Simulation that emits the readiness/gap report | both | both |
| `exercise` | `@sps/exercise` (timed injects, deterministic after-action score) | exercise definition, clock, injects | exercise report |
| `cross-border` (later) | new scenario definition spanning countries | participants, vector | joint report with cross-jurisdiction conflicts |

New types are registered as modules (`BattleTestTypeModule`: parameter schema, job runner, result extractor, UI renderer); adding one does not touch the orchestrator core.

## 2. "Launch" flow
`Type & scenario → Participants → Settings → Pre-flight → Launch`

**Participants.** Select on the map (click, modifier-click, rectangle, group) or in a list; sector(s) chosen once (workspace `domains`) and applied to every country that has the sector enabled. Each chip shows readiness-to-run: corpus present? last result? stale? Maximum participants `WORLD_BATTLE_MAX_COUNTRIES` (default 60). Region targeting is allowed as context (a region id travels in the job input and prompt context).

**Settings cascade.** `type defaults → test-wide → group → country → region`. Each field shows where its value comes from and can be reset. Stored as the sparse overrides only (not the merged copy). A country drawer edits one country; "copy to…" duplicates overrides. Presets (named settings) are saved per operator.

**Subnational documents and references.** A country-level job retrieves `national` documents and the chosen reference corpora; `subnational` documents are excluded by default and included when the participant carries a `regionId` or the setting `includeSubnational` is true (`docs/04` §10). A per-country `referenceNamespaces` setting chooses the reference corpora (France: `eu` and `standards`).

**Pre-flight** (blocking errors, acknowledged warnings):
| Check | Source |
|---|---|
| Provider ready, mode, model ids resolved | `engine.provider` / `operatorStack` |
| Country in registry, status, sector enabled | `countries` |
| Corpus present (chunks > 0) and manifest critical documents present | kb status, manifest |
| Corpus changed since the last result (stale) | summary |
| Web needed but unavailable (`useWeb` in `local` mode) | mode gating |
| Estimated jobs, wall-clock range, token/cost range | `usage-store` history for the same (type, mode, model) if any; otherwise "unknown" |
| Effective caps (concurrency, queue room) | §5 |
| Budget alert (`RUN_BUDGET_USD`, alert-only) | existing config |
A **dry run** validates inputs and the execution plan without calling a model.

## 3. Execution

### States
Test: `draft → validated → queued → running → completed | partial | failed | canceled` (+ `paused`). Job: `queued → leased → running → succeeded | failed | skipped | canceled` (`failed → queued` on retry, `running → interrupted` after a restart).

### Queue (new)
- In-process worker pool inside `apps/api`; **jobs are persisted** in `world_battle_jobs`, so the queue survives restarts.
- A worker **leases** capacity from the existing `WorkGate` (`tryEnter(operator)`), so global and per-operator model-credit caps remain a single source of truth; when no lease is available the job **waits** (no 429 for jobs).
- Fairness: round-robin across operators, then priority, then age.
- Backpressure: `POST /v1/world/battle-tests` answers `429 queue_full` only when the queue itself is full (`WORLD_QUEUE_MAX`).
- Jobs call the engine **in-process** (not through HTTP), so the `RATE_LIMIT_EXPENSIVE_MAX` per-minute budget applies once to the launch request, not to each country.
- Each job has its own `AbortController` (**independent of the SSE client**); SSE is observation only. Cancel/pause act on the controller and on queued jobs.
- Retry: `WORLD_JOB_RETRIES` (default 2) with exponential back-off, only for retryable failures (provider 429/5xx, timeouts). A failed readiness job keeps its partial scores and is resumed through the existing resume mechanism (`failed` run + stored `input`), so a retry does not repay the dimensions already scored.
- Restart recovery: on boot, `running` jobs become `interrupted` and are re-queued when `world_settings.autoResume` is true (default true).

### Isolation
One job = one (country, sector, type) with its own run id, retrieval filter on the country taxonomy, and audit scope. No shared mutable state between jobs; verified by a test that runs two countries concurrently with a stub engine and asserts disjoint retrieval filters.

## 4. Results
Per job: a link to the native run (page and dossier exist). Test level:
- **Matrix** country × metric. Readiness: composite, overall, 13 scores, HIGH/MEDIUM gap counts, coverage, confidence. Simulation/hybrid: coordinator-flagged mandate conflicts, citations count and grounding post-condition result, audit entries, duration. Exercise: deterministic after-action score. Cost/duration from `usage-store`.
- **Divergence view**: same dimension or inject across countries with the cited chunks side by side (reuses citation components).
- **Heterogeneity warnings** (automatic): different corpus sizes, different modes/models, different `framework_version`, stale corpora, mixed languages.
- **Map**: any matrix metric as a layer; participants coloured by job state during the run.
- **A/B**: compare two tests (settings diff, per-country metric deltas).
- **Export**: Word via `mcp-docx`, JSON and CSV through the existing export routes pattern.
No metric is invented: everything is read from existing run outputs.

## 5. Caps and configuration (ADR-007)
Precedence: **admin runtime setting (`world_settings`) → environment variable → mode default**. Effective value and its source are shown in Settings → World → "Queue and caps".

| Setting | Env var | Default | Notes |
|---|---|---|---|
| Queue enabled | `WORLD_QUEUE_ENABLED` | `true` | `false` disables World battle tests |
| Concurrent jobs per operator | `WORLD_QUEUE_CONCURRENCY` | `local` 1 · `sovereign` 2 · `cloud` `min(4, AI_CONCURRENCY_PER_OPERATOR)` | local = one GPU |
| Concurrent jobs, whole process | `WORLD_QUEUE_CONCURRENCY_GLOBAL` | `local` 1 · `sovereign` 4 · `cloud` `min(8, AI_CONCURRENCY_GLOBAL)` | |
| Queue length | `WORLD_QUEUE_MAX` | 500 | `queue_full` beyond |
| Participants per test | `WORLD_BATTLE_MAX_COUNTRIES` | 60 | |
| Job timeout | `WORLD_JOB_TIMEOUT_MS` | 900000 | per job |
| Retries | `WORLD_JOB_RETRIES` | 2 | retryable only |
| Auto-resume after restart | admin setting | `true` | |

Rules: a configured value never exceeds the `WorkGate` global cap unless that gate is disabled (`AI_CONCURRENCY_*=0`); invalid or non-positive values fall back to the next level and log a warning. Runtime changes apply to the next lease without restart and write `world.settings.changed` to the audit chain (who, old, new). The existing gate caps stay env-driven (`AI_CONCURRENCY_PER_OPERATOR` default 8, `AI_CONCURRENCY_GLOBAL` default 16, `RATE_LIMIT_EXPENSIVE_MAX` default 20/min); an optional work package (W-09) adds `WorkGate.setLimits()` so the same admin screen can adjust them live. Add all variables to `.env.example`, `docs/` and `apps/api/src/config.ts` with tests in `config.test.ts`.

## 6. Manifest and replay
```
manifest { testId, type, sectors, participants, frameworkVersion, codeVersion, geoVersion,
  perJob { code, sector, settingsHash, runId, mode, modelIds, corpusFingerprint (chunk count + latest ingestion ts + manifest generated), startedAt } }
```
Replay creates a **new** test from the stored settings (`POST /v1/world/battle-tests/:id/replay`) and reports drift (corpus changed, model unavailable, framework changed). LLM output is not bit-reproducible; deterministic parts are the exercise score and the pre/post conditions (citations present, settings equal). The audit chain already records the model id of every step; the manifest hash is added to the `world.battle.start` record.

## 7. Audit
Records go through `AuditService.logAction` (hash chain, `lens` required). Actions: `world.battle.create | validate | start | pause | resume | cancel | finish`, `world.job.start | done | fail | retry`, `world.settings.changed`. `lens` = the job's lens; test-level actions use the type's lens (`hybrid` for mixed). World-level actions without a lens (settings, groups) use `hybrid` as the composition profile; whether to extend `WorkflowLens` is Q-05.

## 8. Requirements
REQ-B01 launch from the map in ≤ 5 clicks with a preset · REQ-B02 settings cascade visible and resettable · REQ-B03 blocking pre-flight and dry run · REQ-B04 queue persists, survives restart, never answers 429 to a job · REQ-B05 jobs isolated · REQ-B06 caps configurable with the documented precedence · REQ-B07 cancel/pause/retry per job · REQ-B08 manifest, replay, audit · REQ-B09 heterogeneity warnings · REQ-B10 results link to native runs · REQ-B11 UI usable while jobs run (SSE with `Last-Event-ID` resume) · REQ-B12 simulation disclaimer shown on every result.

## 9. Edge cases
No corpus → blocked with onboarding link (or "gaps only" readiness explicitly labelled ungrounded) · provider lost mid-test → affected jobs `failed(provider)`, test `partial`, retry offered · corpus updated during a run → jobs keep their start fingerprint, warning shown · local mode and `useWeb` → forced off with notice · two operators queue concurrently → fair share · API restart → recovery · very long tests → progress persisted per job.
