---
name: SarkiAI architecture
description: The invariants behind the SarkiAI engine — one engine with two lenses, the Qdrant/MongoDB/Atlas storage split, the package boundaries, the data flow per lens and the failure-isolation rules. Use before a cross-cutting change, when explaining how the engine works, or when deciding where new logic belongs.
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
5. **Provider-neutral and offline-capable.** Apache-2.0, no proprietary import,
   `local` and `sovereign` make no outbound call.

## Storage split

| Store | Holds | Used in |
| --- | --- | --- |
| Qdrant | `policy_chunks`, dense (`bge-m3`, 1024-d) + sparse BM25 | `local`, `sovereign` |
| MongoDB Atlas | `kb_chunks` with Vector Search + text index | `cloud` (and `RETRIEVAL_BACKEND=atlas`) |
| MongoDB | `audit_logs`, `cot_traces`, `usage_events`, runs, operators | every mode |
| MinIO | assistant image attachments, content-addressed (sha256) | every mode |

`KbChunk` is identical in both retrieval backends: switching mode changes where
the vectors live, not what the engine reads or cites. MongoDB is never in the
retrieval path in `local`/`sovereign` (no `$vectorSearch` dependency).

## Runtime topology

```
browser ─▶ apps/web (Next.js 16) ── REST + SSE ──▶ apps/api (Fastify)
                                                     │
                     engine.ts composes:             │
                       PolicyOrchestrator             ├─▶ MongoDB (audit, CoT, runs)
                       ScenarioEngine                 ├─▶ Qdrant  (dense + sparse RRF)
                       ReadinessEngine                ├─▶ services/ingestion ─▶ services/ocr
                       AuditService                   └─▶ provider (Ollama | Baseten | Meta API)
```

`cloud` substitutes Meta Model API for Ollama and Atlas/Voyage for
Qdrant/`bge-m3`; nothing else changes.

## Data flow — simulation lens

1. Ingestion writes structure-aware chunks + embeddings to the active backend.
2. `ScenarioEngine.release()` yields event batches per tick.
3. `PolicyOrchestrator.runAgent()` retrieves country provisions, builds the
   mandate-grounded prompt, generates, enforces citations.
4. Each agent emits an independent `AgentAssessment`; the coordinator
   reconciles them into a joint situation report.
5. `AuditService.traceStep()` records each reasoning step; `logAction()`
   appends a hash-chained record.

## Data flow — readiness lens

`ReadinessEngine.assess()` iterates 13 dimensions (Report 2.0, 6 factors),
retrieves national provisions **and** the regional/international corpus, and
asks the model for structured gaps. Output: `ReadinessReport` (JSON + Markdown),
scored 0–5 per dimension plus a composite.

## Failure isolation

- Ingestion, OCR and transcription are independent containers; the API depends
  on Qdrant + ingestion health, never on OCR.
- Sparse leg failure → dense-only retrieval with the same filter.
- OCR unreachable → text-native PDFs still ingest.
- Rerank error → the fused RRF order is returned unchanged.
- Mongo unreachable → metering buffers in memory; audit features degrade
  explicitly, they do not crash the request path.

## Where logic belongs

| Need | Package |
| --- | --- |
| Provider/model selection | `packages/agents/src/provider.ts` |
| Prompting, orchestration, structured output | `packages/agents` |
| Retrieval, RRF, backends | `packages/retrieval` |
| Domain types, taxonomy, lenses | `packages/shared` |
| Scoring, gaps, reports | `packages/readiness`, `packages/report` |
| Hash chain, CoT | `packages/audit` |
| HTTP, auth, stores, metering | `apps/api/src` |
| UI | `apps/web/src`, primitives in `packages/ui` |

A change that spans packages must keep the shared contracts in
`packages/shared` updated first, then the producers, then the consumers.
