# Data model

Two stores, deliberately separated:

- **Qdrant** — the vector knowledge base (retrieval chunks, dense + sparse).
- **MongoDB** — operational data only (audit log + chain-of-thought traces).

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
| `country` | string | ISO-3166 alpha-2 or `global` — **primary filter** |
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

`{ id, runId, agentId, step, thought, toolCalls[], model, ts }` — one document
per reasoning step, queryable by `runId`.

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
