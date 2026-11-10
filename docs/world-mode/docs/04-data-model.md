# 04 — Data model

World mode reuses existing entities and adds a few. Everything persisted follows the repository pattern: **MongoDB when reachable, memory otherwise**, typed, operator attribution where private.

## 1. Reused entities (read-only unless stated)

| Entity | Where | Used for |
|---|---|---|
| `CountryRecord` (`code`, `name`, `nameFr`, `jurisdiction`, `region`, `authority`, `currency`, `languages`, `timezone`, `sectors`, `status: active|planned`) | `apps/api/src/countries.ts`, `/v1/countries` | Entity list, labels, enabled sectors, groups by `region` |
| `Domain` = `health|education|telecom|public_services|agriculture`; `COUNTRY_SECTORS` | `@sps/shared` | Sector selector, per-sector layers |
| `READINESS_DIMENSIONS` (13), `ReadinessFactor` (6), `DimensionScore` (`score 0–5`, `confidence 0–1`, `evidence`, `gaps`, `recommendations`, `webSources`) | `@sps/shared` | All readiness layers |
| `ReadinessReport` (`scores`, `scenario.composite/overall/weights`, per-dimension `countryChunks`/`globalChunks`) | `@sps/readiness` | Coverage, evidence drill-down |
| `ReadinessRunInput` (`dimensions`, `perDimensionK`, `useWeb`, `reasoningEffort`, `models{webSearch,evaluate,synthesis}`, `concurrency: parallel|sequential|orchestrated`, `maxDecisions`, `language`, `batchId`) | `apps/api/src/readiness-runs.ts` | **The per-country settings of a readiness battle test** |
| `ReadinessRunSummary` / run store (`complete|failed`, resumable) | `readiness_runs` | Latest result per (country, sector); resume |
| `ScenarioDefinition`, `ScenarioEvent`, `ScenarioRun` | `@sps/scenarios`, `@sps/shared` | Crisis battle tests |
| Exercise (timed injects, deterministic after-action score) | `@sps/exercise` | Table-top battle tests |
| Corpus manifest per country (`documents[]`: `id`, `docType`, `jurisdiction`, `pillar[]`, `status: present|verified|…`, `rights: official-text|open-licence|quotation-only|to-confirm`, `priority`, `file`) | `data/country/<code>/manifest.json`, `data/global/*` | Corpus completeness, rights |
| `KbChunk` + `Taxonomy` (`country`, `jurisdiction`, `docType`, `rights`, `pillar`) ; kb status `byCountry` (chunks) | `@sps/shared`, retrieval | Corpus size per country |
| `AuditRecord` (hash-chained: `id`, `runId`, `userId`, `ts`, `actor`, `action`, `target`, `lens`, `citations`, `hash`, `prevHash`) via `AuditService` | `@sps/audit` | All World actions are audited here |
| `Role = operator | admin` | `@sps/auth` | Permissions |

## 2. Small changes to existing code (backward compatible)
1. **Readiness run summary gains two stored fields**, computed at save time: `groundedDimensions` (number of dimensions with ≥ 1 country chunk) and `meanConfidence` (weighted mean of `DimensionScore.confidence`). Legacy runs are filled lazily from `report` by a one-off script (`scripts/backfill-readiness-summary.ts`). This avoids loading full reports (the existing `byCountry` projection drops `report`).
2. **`CountryRecord`** gains optional `adminLevel` (display label) and `groups?: string[]`; defaults keep every current record valid. (Groups themselves live in `world_groups`; this field is only a cache for the sheet.)
3. A `latestByCountrySector()` method on the readiness run store (aggregation, no report projection).
4. **`Jurisdiction` gains `subnational`** and the taxonomy gains an optional `subdivision` (ISO 3166-2, e.g. `US-CA`), see §10.
5. **Run summaries gain `sharing: 'shared' | 'excluded'`** (default `shared`; readiness and scenario runs), see §11.
6. `CountryRecord` gains optional `authorities` (per sector), `timezones[]` and `adminLevel`, see §9.

## 3. New collections
| Collection | Holds | Scope |
|---|---|---|
| `world_battle_tests` | Battle-test definition, settings cascade, manifest, state, per-country job states | operator |
| `world_battle_jobs` | One queued unit of work (country × sector × type): state, attempts, lease, linked run id | operator |
| `world_watch_jobs` | A legal-watch job (scope, status, steps, search trace) | operator |
| `world_watch_proposals` | A proposed legal text (source, rights, excerpt, hash, decision) | shared (validation queue) |
| `world_groups` | Country groups (CEMAC, ECOWAS, AU, EU…): members, source, validity dates | shared, admin-edited |
| `world_settings` | Admin runtime settings (queue caps, thresholds, watch flags) | shared, admin |

Indexes: `world_battle_jobs {state, priority, createdAt}`, `{operator, battleTestId}`; `world_watch_proposals {country, status}`; unique `world_groups.id`. Indexes are created by `scripts/ensure-mongo-indexes.ts` alongside the existing ones.

## 4. Read models
**`WorldSummary`** (`GET /v1/world/summary?sector=health&scope=mine|shared`; `scope` defaults to `mine`; `shared` returns summary fields only, for runs not excluded by their owner): per country (ISO2 lower-case, as in the registry)
```
{ code, status, sectors[], composite|null, coverage, confidence, band, runs, lastRunAt, stale,
  corpus:{ chunks, manifestPresent, criticalPresent, criticalTotal }, dims?:{ [shortName]: number|null } }
```
Built from the registry, the latest complete run per (country, sector), kb status `byCountry`, and the manifest completeness. ≤ 60 KB for 250 entries; ETag + short cache; recomputed on run save.

**`CountrySheet`** (`GET /v1/world/countries/:code`): registry record + `/insights` data + per-sector latest run summaries + corpus manifest status + watch freshness + group memberships + regions list (ids only).

## 5. `BattleTest` (new)
```
BattleTest { id, operator, type, title, sectors[], participants[{code, regionId?}],
  settings: { global, groups{}, countries{}, regions{} },   // cascade (see docs/06)
  manifest, state, jobs[], createdAt, finishedAt?, tags[] }
```
`type` ∈ `readiness | simulation | hybrid | exercise | cross-border (later)`. A job links to the existing run (`readiness_runs.id` or scenario run id) so existing UIs (run pages, dossiers, exports) work on its results.

## 6. Legal-watch entities (new)
`WatchProposal { id, country, sourceUrl, title, docType, jurisdiction, authority, publishedAt?, rights: CorpusRights, excerpt (≤ 400 chars), contentHash, discoveredBy (query), status: pending|accepted|rejected|ingested, decision{by,at,reason}, ingestRef? }`. Accepting creates a **manifest entry** with `status` and `rights` and calls the existing ingestor (content-hash idempotent). Details: `docs/07`.

## 7. Quality rules
QR-01 a score shown on the map requires a complete run and `coverage ≥ threshold`. QR-02 a proposal cannot be accepted with `rights = to-confirm` unless an admin confirms. QR-03 manifest `status` values stay those already used (`present`, `verified`, …); World mode adds none. QR-04 every create/update/delete of a World entity writes an audit record. QR-05 no personal data; scenarios use synthetic data.

## 8. Versioning
Each new document carries `schemaVersion`; migrations are idempotent scripts in `scripts/` tested with `bun test`. The maturity method is the framework's (`framework_version` in `data/global/standards/dimensions.json`); `world_summary` stores the `framework_version` it was computed with.

## 9. Registry seeds for `us` and `fr` (proposal to confirm)
Conventions taken from the existing Cameroon seed: `timezone` is the IANA zone of the **seat of government** (Cameroon: `Africa/Douala`), used for exercise clocks and report timestamps; `authority` is the institution the sandbox is aligned with. Because the United States and France span several zones and have several relevant authorities, the registry gains **optional** `timezones[]` (display only, no logic in V1), per-sector `authorities`, and `adminLevel` (`{en, fr}` label of the region level). Seeds: `data/registry-seeds.example.json`.

| Field | `us` | `fr` |
|---|---|---|
| `name` / `nameFr` | United States / États-Unis | France / France |
| `jurisdiction`, `region` | national, North America | national, Western Europe |
| `currency`, `languages` | USD, `en` | EUR, `fr` |
| `timezone` (seat of government) | `America/New_York` | `Europe/Paris` |
| `authority` (primary, health scenario) | HHS | CNIL |
| `authorities` by sector | health HHS · telecom FCC · education Department of Education · agriculture USDA · public_services to define | health Ministry of Health · others to define at onboarding |
| `adminLevel` | state / État | region / région |
| `sectors` at creation | `health` only; others added as corpus arrives | `health` only |
| `status` | `planned` until activation | `planned` until activation |
Authority names are proposals for the content team to confirm; they are institutional choices, not facts the engine depends on.

**Activation rule** (`scripts/check-country-onboarding.ts`): a country becomes `active` when its manifest exists, at least 80 % of its `critical` documents are `present` or `verified`, every document carries a `rights` value, and the reference namespaces are chosen (France: `eu` plus `standards`). Until then it stays `planned` and shows as *Not assessed* with the onboarding checklist.

## 10. Jurisdiction `subnational` and `subdivision`
`Jurisdiction` becomes `national | subnational | regional | international`. Here `regional` keeps its current meaning (supranational blocs such as the African or European level) and `subnational` means below the country (US states, French regions, Cameroonian regions). A subnational document carries `country` and a `subdivision` (ISO 3166-2). Rules: a **country-level job** retrieves `national` documents plus the chosen reference corpora and **excludes `subnational` documents by default**; a job whose participant carries a `regionId`, or a job with `includeSubnational: true`, also retrieves subnational documents (all of the country's, or only that subdivision's). The retrieval filter accepts several jurisdictions and an optional subdivision; the Atlas index definitions and `deploy/mongo/kb.indexes.json` gain the `subdivision` token field. Existing documents keep `national` and need no migration. The registry field `CountryRecord.jurisdiction` is a separate concept and is unchanged.

## 11. Run sharing flag
Readiness and scenario run summaries gain `sharing: 'shared' | 'excluded'`, default `shared` (existing runs count as shared, as today's country dashboard already exposes their summaries). The owner can change it (`PATCH /v1/world/runs/:kind/:runId/sharing`, audited as `world.run.sharing.changed`). An excluded run is hidden from the `shared` scope, from other operators' country insights and from World summaries; the owner still sees it in `mine`. It affects only summaries: reports were never shared.
