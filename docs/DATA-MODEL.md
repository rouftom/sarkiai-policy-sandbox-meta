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
| `jurisdiction` | national \| regional \| international | legal level |
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
  `sps_fr_folded` analyser, filter fields `country`, `jurisdiction`, `docType`,
  `namespace` (typed `token`) and `isActive` (boolean). Definition in
  `packages/retrieval/src/atlas-index-definitions.ts`.
- MongoDB text index (`local`, `sovereign`): created at the first ingestion.
- Plain indexes for the console queries (`filename`, `isActive`).

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
jurisdiction = <optional>
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
