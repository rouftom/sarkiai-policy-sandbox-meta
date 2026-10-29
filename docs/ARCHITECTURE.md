# Architecture

## Guiding principles

1. **One engine, two lenses.** A lens is a `WorkflowProfile` (data), never a
   forked code path.
2. **Jurisdiction-aware everywhere.** Every chunk, citation, gap and assessment
   carries `(country, jurisdiction, docType)`.
3. **Grounding is a hard post-condition.** A legal answer with zero citations is
   invalid.
4. **Every decision is auditable.** Reasoning is persisted, not merely streamed.
5. **Open and sovereign.** Apache-2.0; **all models run locally** (Ollama:
   qwen2.5 LLM + bge-m3 embeddings; optional local TEI reranker); no cloud call;
   runs entirely inside a locked-down sandbox: no data egress.

## Storage split

| Store | Holds | Why |
|-------|-------|-----|
| **Qdrant** | vector knowledge base (dense + sparse) | open source, multi-arch, native hybrid RRF, payload filtering |
| **MongoDB** | audit log + chain-of-thought | operational documents, no vectors: portable anywhere |
| **MinIO** | assistant image attachments | S3-compatible local bucket, content-addressed (sha256) |

Secrets are versioned with **SOPS + age** (see [`SECRETS.md`](./SECRETS.md)); no
secret server. The UI follows the admin **SarkiAI Compact** charter via
`@sps/theme` (theme packs, charte slots).

Splitting them means the retrieval engine is replaceable and the operational
store never dictates vector-search capabilities.

## Runtime topology

```
                         ┌──────────────────────────┐
          browser ──────▶│  apps/web (Next.js 16)   │  lens selector + assistant
                         └────────────┬─────────────┘
                                      │ REST + SSE
                         ┌────────────▼─────────────┐
                         │  apps/api (Fastify)      │
                         │  engine.ts composes:     │
                         │   • PolicyOrchestrator   │
                         │   • ScenarioEngine       │
                         │   • ReadinessEngine      │
                         │   • AuditService         │
                         └───┬───────────┬──────────┘
                             │           │
             hybrid RAG ─────┘           ├───── audit / CoT ──▶ MongoDB
        ┌────────────────────┐           └───── ingest clients
        │ Qdrant             │◀─────────────────────────────────┐
        │ dense + sparse RRF │                                  │
        └────────────────────┘                       ┌──────────┴──────────┐
                                                     │ services/ingestion  │
                                                     │ (chunk+embed+store) │
                                                     └──────────┬──────────┘
                                                                │ OCR fallback
                                                                ▼
                                                        ┌──────────────┐
                                                        │ services/ocr │
                                                        └──────────────┘
```

## Data flow (simulation lens)

1. **Ingest**: country corpus → `services/ingestion` → structure-aware chunks →
   local bge-m3 embeddings (Ollama) → Qdrant points (dense + sparse BM25).
2. **Scenario start**: `ScenarioEngine.release()` yields event batches by tick.
3. **Per agent**: `PolicyOrchestrator.runAgent()` retrieves country provisions
   from Qdrant, builds the mandate-grounded prompt, generates, enforces citations.
4. **Coordination**: each agent emits an independent `AgentAssessment`; the
   coordinator reconciles them into a joint situation report.
5. **Auditability**: `AuditService.traceStep()` records each reasoning step;
   `logAction()` appends a hash-chained audit record to MongoDB.

## Readiness lens

`ReadinessEngine.assess()` iterates the 13 readiness dimensions (Report 2.0, 6 factors), retrieves the
country provisions **and** the global best-practice corpus from Qdrant, and asks
the model to emit structured gaps. Output: a `ReadinessReport` (JSON + Markdown).

## Why the two lenses share everything

| Shared | Lens-specific |
|--------|---------------|
| KB + retrieval (Qdrant) | `ScenarioEngine` (simulation only) |
| Citations | `readinessReport` stage (readiness/hybrid) |
| Gap analysis (**always on**) | |
| Agents + mandates | |
| Audit + CoT (MongoDB) | |

## Failure isolation

- Ingestion, OCR and transcription are independent containers. `api` depends on
  `qdrant` + `ingestion` health; the audit store (Mongo) is separate.
- Hybrid degradation: if Qdrant cannot compute the sparse BM25 leg, retrieval
  falls back to dense-only with the same filter.
- OCR is best-effort: if unreachable, text-native PDFs still ingest.
- Rerank is best-effort: on provider error the fused order is returned unchanged.
