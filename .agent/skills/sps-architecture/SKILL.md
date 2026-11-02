---
name: SarkiAI architecture
description: The invariants behind the SarkiAI engine — one engine with two lenses, the MongoDB corpus and operational stores, the package boundaries, the data flow per lens and the failure-isolation rules. Use before a cross-cutting change, when explaining how the engine works, or when deciding where new logic belongs.
---

# SarkiAI architecture

## Five invariants

1. **One engine, two lenses.** A lens is a `WorkflowProfile` (data), never a
   forked code path. Simulation and readiness share retrieval, citations,
   agents and audit.
2. **Jurisdiction-aware everywhere.** Every chunk, citation, gap and assessment
   carries `(country, jurisdiction, docType)`. A filter that drops one of these
   is a bug.
3. **Grounding is a hard post-condition.** A legal answer with zero citations
   is invalid; reject it rather than returning prose.
4. **Every decision is auditable.** Reasoning is persisted (`cot_traces`) and
   actions are hash-chained (`audit_logs`), not merely streamed.
5. **Meta-only and offline-capable.** Apache-2.0, no proprietary import. Every
   model called at runtime is a Meta model; `local` makes no outbound call.

## Storage split

| Store | Holds | Used in |
| --- | --- | --- |
| MongoDB (`kb_chunks`) | the corpus, searched lexically: Atlas Search in `cloud`, a text index in `local`/`sovereign` | every mode |
| MongoDB Atlas | the same corpus with the `sps_text_index` Atlas Search index | `cloud` |
| MongoDB | `audit_logs`, `cot_traces`, `usage_events`, runs, operators | every mode |
| MinIO | assistant image attachments, content-addressed (sha256) | every mode |

`KbChunk` is identical in both search backends: switching mode changes where the
BM25 index lives, not what the engine reads or cites. There is **no vector
store and no embedding**: the Meta model of the mode plans the search, runs the
sub-agents, judges and ranks (`packages/retrieval/src/agentic.ts`).

## Runtime topology

```
browser ─▶ apps/web (Next.js 16) ── REST + SSE ──▶ apps/api (Fastify)
                                                     │
                     engine.ts composes:             │
                       AgenticRetriever               ├─▶ MongoDB (corpus + index, audit, CoT, runs)
                       AtlasIngestor                  ├─▶ MinIO   (image attachments)
                       PolicyOrchestrator             └─▶ provider (Ollama | Baseten | Meta API)
                       ScenarioEngine
                       ReadinessEngine
                       AuditService
```

`cloud` substitutes the Meta Model API for Ollama and Atlas Search for the
MongoDB text index; nothing else changes. Ingestion runs in the API process.

## Data flow — simulation lens

1. `AtlasIngestor` writes structure-aware chunks to `kb_chunks` and ensures the
   search index exists.
2. `ScenarioEngine.release()` yields event batches per tick.
3. `PolicyOrchestrator.runAgent()` runs the agentic search over country
   provisions, builds the mandate-grounded prompt, generates, enforces citations.
4. Each agent emits an independent `AgentAssessment`; the coordinator
   reconciles them into a joint situation report.
5. `AuditService.traceStep()` records each reasoning step; `logAction()`
   appends a hash-chained record.

## Data flow — readiness lens

`ReadinessEngine.assess()` iterates 13 dimensions (Report 2.0, 6 factors),
retrieves national provisions **and** the regional/international corpus, and
asks the model for structured gaps. Output: `ReadinessReport` (JSON + Markdown),
scored per dimension plus a composite.

## Failure isolation

- Ingestion runs in the API process but is transactional per document: a failed
  ingest leaves the previous chunk set in place and reports the error.
- Agentic search degrades: every model step (plan, judge, rank) is bounded and,
  on failure, falls back to the lexical BM25 order with the same filter.
- Mongo unreachable → metering buffers in memory; audit features degrade
  explicitly, they do not crash the request path.
- Vision unreachable → scanned pages are not segmented; text-native documents
  still ingest.

## Where logic belongs

| Need | Package |
| --- | --- |
| Provider/model selection | `packages/agents/src/provider.ts` |
| Prompting, orchestration, structured output | `packages/agents` |
| Retrieval, agentic search, lexical source, ingestion | `packages/retrieval` |
| Chunking | `packages/kb` |
| Scanned-page segmentation (SAM 3.1) | `packages/gazette` |
| Domain types, taxonomy, lenses | `packages/shared` |
| Scoring, gaps, reports | `packages/readiness`, `packages/report` |
| Hash chain, CoT | `packages/audit` |
| HTTP, auth, stores, metering | `apps/api/src` |
| UI | `apps/web/src`, primitives in `packages/ui` |

A change that spans packages must keep the shared contracts in
`packages/shared` updated first, then the producers, then the consumers.
