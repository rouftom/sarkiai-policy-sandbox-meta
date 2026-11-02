# Architecture

## Guiding principles

1. **One engine, two lenses.** A lens is a `WorkflowProfile` (data), never a
   forked code path.
2. **Jurisdiction-aware everywhere.** Every chunk, citation, gap and assessment
   carries `(country, jurisdiction, docType)`.
3. **Grounding is a hard post-condition.** A legal answer with zero citations is
   invalid.
4. **Every decision is auditable.** Reasoning is persisted, not merely streamed.
5. **Open, Meta-only and provider-neutral.** Apache-2.0. The same engine runs in
   three modes chosen by `SANDBOX_MODE`: `local` (Muse Glimmer 30B on Ollama),
   `sovereign` (Muse Spark Open on Baseten, or Muse Glimmer on Ollama) and
   `cloud` (Meta Model API). Every model the engine calls at runtime is a Meta
   model. `local` makes no outbound model call, so the engine runs inside a
   locked-down sandbox with no data egress; `cloud` is an explicit,
   operator-chosen exception, visible in the console badge and recorded in the
   audit chain.

## Storage split

| Store | Holds | Why |
|-------|-------|-----|
| **MongoDB** | corpus (`kb_chunks`), audit log and chain-of-thought | one document store for the corpus and the trail; the search index is an index on the same collection, not a second datastore |
| **MongoDB Atlas** | same corpus, with **Atlas Search** (BM25) in `cloud` mode | managed lexical search over `kb_chunks` |
| **MinIO** | assistant image attachments | S3-compatible local bucket, content-addressed (sha256) |

The `KbChunk` contract is identical in both search backends: `RETRIEVAL_BACKEND`
only changes **where the BM25 index lives** (Atlas Search or a MongoDB text
index), not what the engine reads or cites. There is no vector store: the corpus
is searched lexically and the Meta model of the mode does the planning, the
judging and the ranking (see [Agentic corpus search](../README.md#agentic-corpus-search)).

Secrets are versioned with **SOPS + age** (see [`SECRETS.md`](./SECRETS.md)); no
secret server. The UI follows the admin **SarkiAI Compact** charter via
`@sps/theme` (theme packs, charte slots).

## Runtime topology

```
                         ┌──────────────────────────┐
          browser ──────▶│  apps/web (Next.js 16)   │  lens selector + assistant
                         └────────────┬─────────────┘
                                      │ REST + SSE
                         ┌────────────▼─────────────┐
                         │  apps/api (Fastify)      │
                         │  engine.ts composes:     │
                         │   • AgenticRetriever     │
                         │   • AtlasIngestor        │
                         │   • PolicyOrchestrator   │
                         │   • ScenarioEngine       │
                         │   • ReadinessEngine      │
                         │   • AuditService         │
                         └───┬───────────┬──────────┘
                             │           │
        agentic search ──────┘           ├───── audit / CoT ──▶ MongoDB
        ┌────────────────────┐           │
        │ MongoDB            │◀──────────┘
        │ kb_chunks + index  │
        └────────────────────┘
```

In `cloud` mode the same diagram holds with two substitutions: model calls go to
the Meta Model API instead of Ollama, and the lexical index is Atlas Search
instead of a MongoDB text index. Ingestion runs inside the API process
(`AtlasIngestor`), so there is no separate ingestion, OCR or transcription
service.

## Data flow (simulation lens)

1. **Ingest**: country corpus → `AtlasIngestor` (`packages/retrieval/src/atlas-ingest.ts`)
   → structure-aware chunks → `kb_chunks`, with a content hash for idempotence.
   The MongoDB text index (or the Atlas Search index) is created at the first
   ingestion.
2. **Scenario start**: `ScenarioEngine.release()` yields event batches by tick.
3. **Per agent**: `PolicyOrchestrator.runAgent()` runs the agentic search over
   the country provisions, builds the mandate-grounded prompt, generates,
   enforces citations.
4. **Coordination**: each agent emits an independent `AgentAssessment`; the
   coordinator reconciles them into a joint situation report.
5. **Auditability**: `AuditService.traceStep()` records each reasoning step;
   `logAction()` appends a hash-chained audit record to MongoDB.

## Readiness lens

`ReadinessEngine.assess()` iterates the 13 readiness dimensions (Report 2.0, 6 factors), retrieves the
country provisions **and** the external reference corpus (regional and
international) through the agentic search, and asks the model to emit
structured gaps. Output: a `ReadinessReport` (JSON + Markdown).

## Why the two lenses share everything

| Shared | Lens-specific |
|--------|---------------|
| Corpus + agentic search | `ScenarioEngine` (simulation only) |
| Citations | `readinessReport` stage (readiness/hybrid) |
| Gap analysis (**always on**) | |
| Agents + mandates | |
| Audit + CoT (MongoDB) | |

## Failure isolation

- Ingestion runs in the API process but is transactional per document: a failed
  ingest leaves the previous chunk set in place and reports the error on the
  step journal.
- Agentic degradation: every model step (plan, judge, rank) is bounded by a
  sub-agent count, a round count and a timeout. On failure the search falls back
  to the lexical BM25 order, so an agent never waits on a failed call.
- The audit store (MongoDB) is separate from the API process: an unreachable
  audit store does not prevent the API from booting.
