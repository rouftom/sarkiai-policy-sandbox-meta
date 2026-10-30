# Architecture

## Guiding principles

1. **One engine, two lenses.** A lens is a `WorkflowProfile` (data), never a
   forked code path.
2. **Jurisdiction-aware everywhere.** Every chunk, citation, gap and assessment
   carries `(country, jurisdiction, docType)`.
3. **Grounding is a hard post-condition.** A legal answer with zero citations is
   invalid.
4. **Every decision is auditable.** Reasoning is persisted, not merely streamed.
5. **Open and provider-neutral.** Apache-2.0. The same engine runs in three
   modes chosen by `SANDBOX_MODE`: `local` (any Ollama model + `bge-m3` +
   Qdrant), `sovereign` (Muse Glimmer 30B on Ollama, same local stack) and
   `cloud` (Meta Model API + Voyage + Atlas). `local` and `sovereign` make no
   outbound call at all, so the engine runs inside a locked-down sandbox with
   no data egress; `cloud` is an explicit, operator-chosen exception, visible
   in the console badge and recorded in the audit chain.

## Storage split

| Store | Holds | Why |
|-------|-------|-----|
| **Qdrant** | vector knowledge base (dense + sparse) in `local`/`sovereign` | open source, multi-arch, native hybrid RRF, payload filtering |
| **MongoDB** | audit log + chain-of-thought (self-hosted, or Atlas in `cloud` mode) | operational documents, no vectors: portable anywhere |
| **MongoDB Atlas** | vector knowledge base (`cloud` mode, Vector Search over `kb_chunks`) | managed hybrid search without running a second datastore |
| **MinIO** | assistant image attachments | S3-compatible local bucket, content-addressed (sha256) |

The `KbChunk` contract is identical in both retrieval backends, so switching
mode changes where vectors live, not what the engine reads or cites.

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

In `cloud` mode the same diagram holds with two substitutions: model calls go
to the Meta Model API instead of Ollama, and the vector leg goes to MongoDB
Atlas (Voyage embeddings) instead of Qdrant/`bge-m3`.

## Data flow (simulation lens)

1. **Ingest**: country corpus → `services/ingestion` → structure-aware chunks →
   `bge-m3` embeddings (Ollama) → Qdrant points (dense + sparse BM25). In
   `cloud` mode the same chunks are embedded with Voyage `voyage-4` and stored
   in MongoDB Atlas.
2. **Scenario start**: `ScenarioEngine.release()` yields event batches by tick.
3. **Per agent**: `PolicyOrchestrator.runAgent()` retrieves country provisions
   from Qdrant, builds the mandate-grounded prompt, generates, enforces citations.
4. **Coordination**: each agent emits an independent `AgentAssessment`; the
   coordinator reconciles them into a joint situation report.
5. **Auditability**: `AuditService.traceStep()` records each reasoning step;
   `logAction()` appends a hash-chained audit record to MongoDB.

## Readiness lens

`ReadinessEngine.assess()` iterates the 13 readiness dimensions (Report 2.0, 6 factors), retrieves the
country provisions **and** the external reference corpus (regional and
international) from the active vector backend, and asks the model to emit
structured gaps. Output: a `ReadinessReport` (JSON + Markdown).

## Why the two lenses share everything

| Shared | Lens-specific |
|--------|---------------|
| KB + retrieval (Qdrant or Atlas) | `ScenarioEngine` (simulation only) |
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
