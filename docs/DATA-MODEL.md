# Data model

Two stores, deliberately separated:

- **Qdrant**: the vector knowledge base (retrieval chunks, dense + sparse).
- **MongoDB**: operational data only (audit log + chain-of-thought traces).

Types are canonical in `packages/shared/src/types.ts`.

## Qdrant collection `policy_chunks`

Named vectors:

| Vector | Kind | Source | Purpose |
|--------|------|--------|---------|
| `dense` | dense, 1024-d, cosine | local `bge-m3` (Ollama) | semantic retrieval |
| `text` | sparse, IDF modifier | BM25 (`Qdrant/bm25`) | lexical retrieval → hybrid RRF |

Payload (per point):

| Field | Type | Purpose |
|-------|------|---------|
| `country` | string | ISO-3166 alpha-2 or `global`: **primary filter** |
| `jurisdiction` | national \| regional \| international | legal level |
| `docType` | law/strategy/regulation/policy/treaty/standard/guidance/report | source class |
| `pillar` | string[] | readiness dimensions informed |
| `namespace` | string? | optional sub-corpus partition |
| `filename`, `chunkIndex`, `text` | mixed | document grouping + body |
| `headingPath` | string? | e.g. `TITRE I > CHAPITRE II > ARTICLE 12` |
| `articleNumber` | string? | e.g. `12` |
| `unitType`, `chunkRole`, `parentText` | mixed | structure-aware chunk metadata |
| `sourceUrl` | string? | provenance |
| `contentHash` | string | deterministic dedup key (also the point id) |
| `isActive` | boolean | retrieval gate |

Payload indexes (keyword): `country`, `jurisdiction`, `docType`, `namespace`;
(bool): `isActive`.

Point ids are `uuid5(content_hash)` → re-ingestion is idempotent.

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

The retriever builds a Qdrant `must` filter from the query taxonomy:

```
isActive = true
country    = <query.country>
jurisdiction = <optional>
docType      = <optional>
namespace    = <optional>
```

MongoDB is never in the retrieval path (no `$vectorSearch` dependency).

## Type relationships

```
Taxonomy ──▶ KbChunk ──▶ Citation
                    └──────────────▶ Gap (countryRef / globalRef)
AgentAssessment ── findings, citations, gaps, cotTraceId
ScenarioRun ──── ScenarioEvent[] (releaseChunk, visibleTo)
AuditRecord ──── hash chain            (MongoDB)
CoTTrace ─────── per-step reasoning    (MongoDB)
```
