# 05 — Readiness aggregation on the map

**World mode introduces no new maturity index.** It displays what `@sps/readiness` already produces: 13 dimensions in 6 factors (`data`, `research`, `deployment`, `standards`, `opensource`, `sandbox`), each scored **0–5** with a confidence **0–1**, a composite (weighted mean, weight 0 excludes) and a gap priority (`< 1.5` HIGH, `< 3` MEDIUM). The framework version is read from `data/global/standards/dimensions.json` (`framework_version`, currently 2.0, 111 metrics).

What World mode adds is **a read model and rules for what the map is allowed to show**, because the engine can score a country even when no country text was retrieved (it then leans on the global reference corpus). A score without national grounding must not be painted like a measurement.

## 1. Inputs per (country, sector)
From the latest **complete** readiness run, at summary level, for the selected **scope** (`mine`: the current operator's runs; `shared`: every operator's runs that were not excluded by their owner, summary fields only):
- `composite` (0–5), `overall`, per-dimension `score` and `confidence`;
- `groundedDimensions` = dimensions with ≥ `minCountryChunks` (default 1) chunks in `countryChunks` (stored at save time, `docs/04` §2);
- `meanConfidence` = Σ w·confidence / Σ w over scored dimensions (w = run weights, default 1);
- `createdAt`, `framework_version`, mode and model ids (from the run's audit trail).
From the corpus: kb status `byCountry` chunks; manifest completeness `criticalPresent / criticalTotal` when a `data/country/<code>/manifest.json` exists.

## 2. Derived measures
| Measure | Definition |
|---|---|
| `composite` | the engine's value, unchanged |
| `coverage` | `groundedDimensions / 13` |
| `confidence` | `meanConfidence` |
| `corpusCompleteness` | `criticalPresent / criticalTotal` (null when no manifest) |
| `freshnessDays` | days since the run; `stale` when `> staleAfterDays` (default 90) **or** the corpus changed after the run (manifest `generated` or latest ingestion later than `createdAt`) |
| `band` | `maturityLabel(round(composite))`: Not Started, Initial / Ad-hoc, Developing, Established, Advanced, Leading / Optimizing |

All thresholds live in `world_settings` (admin), with these defaults: `minCountryChunks 1`, `minCoverage 0.4`, `minConfidence 0.4`, `rankMinCoverage 0.6`, `rankMinConfidence 0.5`, `staleAfterDays 90`.

## 3. Display rules
| Condition | Map | Sheet |
|---|---|---|
| No complete run for the sector | **"Not assessed"** (neutral fill, thin outline) | Button: assess / add to battle test |
| Run exists, `coverage < minCoverage` | **"No grounded data"** (hatch) — never coloured by composite | Shows which dimensions lack national text; link to corpus onboarding |
| `coverage ≥ min`, `confidence < minConfidence` | Colour by composite + **dotted border** | Low-confidence warning |
| `coverage ≥ min`, `confidence ≥ min` | Colour by composite | Full detail |
| `stale` | small clock badge | "Out of date: corpus changed / older than N days" |

"Not assessed" and "No grounded data" are different states on purpose: the first means nobody ran it, the second means someone did but the result is not national evidence.

**Ranking** is offered only among countries with `coverage ≥ rankMinCoverage` and `confidence ≥ rankMinConfidence`; otherwise the UI shows the six maturity bands instead of ranks.

## 4. Layers offered
Composite · each of the 13 dimensions · each of the 6 factors (mean of its dimensions, as in `DIMENSION_FACTORS`) · coverage · confidence · freshness · corpus chunks · corpus completeness · "assessed sectors" count · battle-test status (during runs). Scale domain fixed 0–5 for scores, 0–1 for ratios.

**Sector choice.** Layers are per sector (the workspace `domain`). "All sectors" shows the mean of the latest composites over the country's enabled sectors that have a complete run, with `n` displayed.

## 5. Client-side re-weighting (US-15)
The summary carries the 13 per-dimension scores, so the console can recompute the composite for custom weights **without a model call**. To reuse the exact engine logic without bundling AI dependencies, move the pure functions (`MATURITY_LEVELS`, `maturityLabel`, `computeComposite`, `computeGapAnalysis`) behind a subpath export `@sps/readiness/scoring` (the file imports only types from `@sps/shared`); `@sps/readiness` re-exports them, nothing else changes. Custom weights are a view setting; the stored composite is the run's.

## 6. What-if and gaps
The country sheet links to the existing what-if (`POST /v1/readiness/whatif`, causal graph) and shows `computeGapAnalysis` output (HIGH/MEDIUM). No new causal logic.

## 7. Limits to state in the help text
- **Language bias**: corpus coverage in EN/FR; African languages are under-represented (`languages` in the registry shows what is expected).
- **Publication bias**: a country that publishes little online appears less documented, not necessarily less mature.
- **Reference-corpus effect**: dimensions can be scored from the global corpus; that is exactly what `coverage` exposes.
- **Run variance**: model output varies; the summary shows the latest complete run, and the sheet shows the history.
- **Mode effect**: runs from different modes/models are not strictly comparable; the sheet shows mode and model per run.

## 8. Tests
Golden fixtures for `coverage`, `confidence`, `stale`, display-rule resolution, ranking eligibility, factor means and weight re-computation (equals `computeComposite`). Unit tests in `packages/world/src/*.test.ts`; summary building tested against the memory store.
