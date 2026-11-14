# Data model

One store for the corpus and the trail:

- **MongoDB**: the knowledge base (`kb_chunks`, searched lexically with Atlas
  Search in `cloud` or a text index elsewhere) and the operational data (audit
  log, chain-of-thought traces, usage ledger, sessions).
- **MinIO**: image attachments referenced by chunks and citations.

There is no vector store and no embedding field. Types are canonical in
`packages/shared/src/types.ts`.

## Collection `kb_chunks`

One document per chunk, written by `AtlasIngestor`
(`packages/retrieval/src/atlas-ingest.ts`).

| Field | Type | Purpose |
|-------|------|---------|
| `_id` | string | `sha256(document, version, chunkIndex, text)`; makes re-ingestion idempotent |
| `filename`, `chunkIndex`, `text` | mixed | document grouping + body |
| `country` | string | ISO-3166 alpha-2 or `global`: **primary filter** |
| `jurisdiction` | national \| subnational \| regional \| international | legal level |
| `subdivision` | string? | ISO 3166-2 code (`US-CA`) when `jurisdiction` is `subnational` |
| `docType` | law/strategy/regulation/policy/treaty/standard/guidance/report | source class |
| `pillar` | string[] | readiness dimensions informed |
| `namespace` | string? | optional sub-corpus partition |
| `rights` | official-text \| open-licence \| quotation-only \| to-confirm | reuse status, enforced at ingestion |
| `headingPath` | string? | e.g. `TITRE I > CHAPITRE II > ARTICLE 12` |
| `articleNumber` | string? | e.g. `12` |
| `unitType`, `chunkRole` | mixed | structure-aware chunk metadata |
| `sourceUrl` | string? | provenance |
| `isActive` | boolean | retrieval gate; retirement keeps the row for audit |

Indexes:

- `sps_text_index` (Atlas Search, `cloud`): BM25 over `text` with the
  `sps_fr_folded` analyser, filter fields `country`, `jurisdiction`, `subdivision`,
  `docType`, `namespace` (typed `token`) and `isActive` (boolean). Definition in
  `packages/retrieval/src/atlas-index-definitions.ts`.
- MongoDB text index (`local`, `sovereign`): created at the first ingestion.
- Plain indexes for the console queries (`filename`, `isActive`).

## Run summaries (`readiness_runs`, `scenario_runs`)

Both collections store the full record for the owner and a summary for the
listings. The summary carries:

| Field | Type | Purpose |
|-------|------|---------|
| `groundedDimensions` | number | dimensions backed by at least one passage of the country's own corpus |
| `meanConfidence` | number? | weighted mean of the dimension confidences (same weights as the composite); null when nothing was scored |
| `sharing` | shared \| excluded | `excluded` hides the summary from other operators, country insights and World aggregates; the owner keeps it in `mine` |

`groundedDimensions` and `meanConfidence` are computed at save time, so the
country dashboard never loads a full report. Runs saved before they existed are
filled once by `bun run runs:backfill-summary` (idempotent, `--dry-run` prints
what it would touch). `sharing` defaults to `shared`; `PATCH
/v1/world/runs/:kind/:runId/sharing` changes it for the owner and is audited as
`world.run.sharing.changed`.

`GET /v1/world/summary?sector=…&scope=mine|shared` is the World read model: the
latest complete run per (country, sector), joined with the country registry,
with `coverage = groundedDimensions / 13`, `confidence = meanConfidence`, a
maturity `band` and a resolved `state` (`not-assessed`, `no-grounded-data`,
`low-confidence`, `ok`) from the display rules of the World specification. The
shared scope applies the same exclusion rule as the country dashboard, and the
route returns summary fields only — never a report.

Each entry also carries `bySector`: one row per sector the country has data for,
with `enabled` telling whether the registry scopes that sector in. The
comparison tab reads those rows, so one summary request powers the table, the
map and the cross-country comparison.

The display rules are deployment-wide. They live in the singleton
`world_settings` document (`_id: 'world'`), read by every operator through
`GET /v1/world/settings` and written by an administrator through `PUT
/v1/world/settings` (audited as `world.settings.updated`). When nothing has been
saved, the specification defaults apply; a Mongo outage keeps serving the last
value held in memory.

`GET /v1/kb/documents` accepts `country` and `rights` filters, which the legal
watch uses to list only the texts a jurisdiction may cite in full
(`official-text`, `open-licence`).

## `kb_images` and `kb_documents`

`kb_images` holds the figures attached to a document: `_id`, `filename`,
`documentId`, `caption`, `alt`, `tags`, `dimension`, `articleNumber`,
`headingPath`, `source`, `mime`, the bytes (`data`) or an `externalUrl`. Chunks
and citations carry an image `id` and `url`, so the console can render the
figure next to the quote without loading the bytes during retrieval.

`kb_documents` holds one metadata record per document (title, summary), keyed by
filename; the console uses it for the corpus list.

## MongoDB collections (operational)

### `audit_logs`

| Field | Purpose |
|-------|---------|
| `id`, `ts`, `actor`, `action`, `target`, `lens`, `citations` | event |
| `prevHash`, `hash` | tamper-evident chain |

`verifyChain()` recomputes every `hash` and reports the first break.

### `cot_traces`

`{ id, runId, agentId, step, thought, toolCalls[], model, ts }`: one document
per reasoning step, queryable by `runId`.

### `usage_events`

One document per metered call, written by `MongoUsageStore`. Indexed on `ts`,
`operator + ts`, `model + ts`, `agentId + ts` and a sparse `runId`; rows written
before the ledger knew `kind` or `status` read as successful chat calls.

| Field | Purpose |
|-------|---------|
| `ts`, `operator`, `route`, `runId`, `agentId` | when, who, which route and run/agent |
| `kind`, `status`, `latencyMs` | capability (`chat`, `retrieval`, `image`, `voice`, `sam`), outcome, duration |
| `mode`, `servedBy`, `model`, `inputTokens`, `outputTokens` | what answered and how many text tokens |
| `units`, `unit`, `costUsd` | non-token volume (`image`, `second`, `call`), list-price estimate; `null` when the tariff is unknown |

The ledger carries **no prompt, answer, audio, image or query string**: only the
route template, counters and the operator's address. An operator reads their own
rows; an administrator reads every row or one named operator. Every
cross-operator read by an administrator appends an `observability.read` record
to `audit_logs` (reader as `userId`, the operator whose rows were read as
`target`; one record per reader, target and minute, because the console fires
four reads when it opens). Rows are kept without expiry by design (cost history
and run-budget checks); the console says so and marks estimates, unpriced calls
and local free runs explicitly. A tariff missing from `LIST_PRICES` is stored as
`null`, never `0`.

When MongoDB is unreachable, rows are buffered in memory for the life of the
process and retried on the next write, so metering never breaks a request.

## Retrieval filter contract

The retriever and the agentic sub-agents apply the same exact-match filter
(`corpusFilter` in `packages/retrieval/src/agentic.ts`):

```
isActive     = true
country      = <query.country>
jurisdiction = <optional; a `jurisdictions` list becomes `$in`>
subdivision  = <optional ISO 3166-2 code>
docType      = <optional>
namespace    = <optional>
```

In `cloud` mode the filter becomes the `compound.filter` of the Atlas `$search`
stage; in `local` and `sovereign` it is merged into the MongoDB `$text` query.
Same contract, same result: a chunk outside the filter is never returned.

## Type relationships

```
Taxonomy ──▶ KbChunk ──▶ Citation
                    └──────────────▶ Gap (countryRef / globalRef)
AgentAssessment ── findings, citations, gaps, cotTraceId
ScenarioRun ──── ScenarioEvent[] (releaseChunk, visibleTo)
AuditRecord ──── hash chain            (MongoDB)
CoTTrace ─────── per-step reasoning    (MongoDB)
```
