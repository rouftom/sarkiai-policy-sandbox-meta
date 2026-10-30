# Pipeline mapping: file by file

The engine is a **staged pipeline**: data sources → collection → preprocessing →
retrieval & model → policy → distribution → consumers: running under a single
orchestrator, with a locked-down sandbox as the validation environment. Every
stage emits its own audit events.

This document maps every stage to a concrete file so evaluators can verify the
architecture instead of taking it on faith.

## Stage vocabulary

We use these exact stage names throughout the codebase and the docs.

| Stage | Meaning | Our component | File |
|-------|---------|---------------|------|
| `source` | data sources | country/global corpora, media | `data/**`, `services/transcription` |
| `collector` | Collector | ingest API + client | `services/ingestion/.../routes.py`, `packages/kb` |
| `preprocessor` | Preprocessor | structure-aware chunking + OCR + embeddings | `services/ingestion/.../chunker.py`, `.../embeddings.py`, `services/ocr` |
| `model` | Model | hybrid retrieval + LLM agents | `packages/retrieval`, `packages/agents/src/model.ts` |
| `policy` | Policy | citation-mandatory prompts, gap engine, workflow profiles | `packages/agents/src/prompt.ts`, `packages/readiness`, `packages/shared/src/workflows.ts` |
| `distributor` | Distributor | API surface + web console + report/dossier | `apps/api`, `apps/web`, `packages/report` |
| `sink` | consumers/actors | institutional agents + joint situation report | `packages/agents/src/coordinator.ts` |
| `orchestrator` | orchestration | engine composition per lens | `apps/api/src/engine.ts` |
| `sandbox` | validation env | locked-down deployment + fine-tuning | `deploy/sandbox/` |

## At a glance

| pipeline stage | Repo module | Key files |
|--------------|-------------|-----------|
| Data sources | `data/`, `services/transcription` | `data/country/**`, `data/global/**`, `services/transcription/app/main.py` |
| Data collection | `services/ingestion`, `packages/kb` | `services/ingestion/src/rag_ingestion/api/routes.py`, `packages/kb/src/index.ts` |
| Data processing | `services/ingestion`, `services/ocr` | `services/ingestion/src/rag_ingestion/services/chunker.py`, `.../embeddings.py`, `.../qdrant_store.py`, `services/ocr/app/ocr.py` |
| ML model | `packages/retrieval`, `packages/agents/src/model.ts` | `packages/retrieval/src/index.ts`, `packages/agents/src/model.ts` |
| ML application | `packages/agents`, `packages/scenarios`, `packages/readiness`, `packages/citations` | see below |
| Management & orchestration | `packages/shared/src/workflows.ts`, `apps/api/src/engine.ts` | workflow profiles, engine composition |
| Security | `packages/audit` | `packages/audit/src/index.ts` |
| ML sandbox | `deploy/sandbox/` | `deploy/sandbox/docker-compose.sandbox.yml` |
| Data model / taxonomy | `packages/shared/src/types.ts` | `Taxonomy`, `KbChunk`, `Gap`, `AuditRecord`, `CoTTrace` |

## 1. Data sources

| Concern | File |
|---------|------|
| Country corpora placement | `data/country/cm/` |
| African regional reference corpus | `data/global/africa/` |
| Global best-practice corpus | `data/global/standards/` |
| Illustrative seed documents | `data/samples/*.txt` |
| Media-derived sources (briefings, hearings) | `services/transcription/app/main.py` |

## 2. Data collection

| Concern | File | Notes |
|---------|------|-------|
| HTTP ingest API (text + file) | `services/ingestion/src/rag_ingestion/api/routes.py` | `POST /v1/ingest/text`, `POST /v1/ingest/file` |
| Request schemas + jurisdiction taxonomy | `services/ingestion/src/rag_ingestion/api/schemas.py` | `IngestTaxonomy` |
| Typed client used by the API app | `packages/kb/src/index.ts` | `IngestionClient` |
| Corpus seed utility | `scripts/seed.sh` | bulk ingest |

## 3. Data processing

| Concern | File | Notes |
|---------|------|-------|
| Structure-aware chunking (FR/EN legal headings) | `services/ingestion/src/rag_ingestion/services/chunker.py` | `StructureAwareChunker` → `headingPath`, `articleNumber` |
| Embeddings (local bge-m3, 1024-d, Ollama) | `services/ingestion/src/rag_ingestion/services/embeddings.py` | `EmbeddingService` |
| Vector persistence in Qdrant (dense + sparse) + payload indexes + dedup | `services/ingestion/src/rag_ingestion/services/qdrant_store.py` | collection payload filters include `country` |
| OCR fallback for scanned gazettes | `services/ocr/app/ocr.py` | Tesseract `fra+eng` |
| Runtime config (ports, models, thresholds) | `services/ingestion/src/rag_ingestion/config.py` | pydantic-settings |

## 4. ML model

| Concern | File | Notes |
|---------|------|-------|
| Hybrid retrieval: query embedding → Qdrant dense + sparse BM25 → RRF → rerank | `packages/retrieval/src/index.ts` | `PolicyRetriever`, `rrf()` |
| LLM provider (local Ollama, qwen3.5:9b) | `packages/agents/src/model.ts` | `createModel()` |
| Model fine-tuning (sandbox credits, out-of-band) | `deploy/sandbox/README.md` §4 | point at tuned endpoint via env |

## 5. ML application

| Concern | File | Notes |
|---------|------|-------|
| Mandated agent run (retrieve → ground → generate → trace) | `packages/agents/src/orchestrator.ts` | `PolicyOrchestrator.runAgent` |
| Grounded system prompt + mandatory-citation directive | `packages/agents/src/prompt.ts` | `buildSystemPrompt`, `citationDirective` |
| Progressive, chunked error-scenario engine | `packages/scenarios/src/index.ts` | `ScenarioEngine.release()` (async generator) |
| readiness gap engine (13 dimensions / 6 factors) | `packages/readiness/src/index.ts` | `ReadinessEngine.assess`, `renderReadinessMarkdown` |
| Multi-agent coordination & reconciliation | `packages/agents/src/coordinator.ts` | `MultiAgentCoordinator.runTick/reconcile` |
| Source attribution / citation formatting | `packages/citations/src/index.ts` | `citationFromChunk`, `hasGroundedCitation` |
| Institutional mandates registry | `packages/shared/src/agents.ts` | `INSTITUTIONS`, `institutionsForDomain` |
| Auditable run dossier (audit + CoT + reports + citations) | `packages/report/src/index.ts` | `buildRunDossier`, `renderDossierMarkdown`, `ReportStore` |

## 6. Management & orchestration

| Concern | File | Notes |
|---------|------|-------|
| Declarative lens profiles (simulation / readiness / hybrid) | `packages/shared/src/workflows.ts` | `WORKFLOW_PROFILES`, `getWorkflowProfile` |
| Composition of packages per lens | `apps/api/src/engine.ts` | `createEngine`, `createScenario` |
| HTTP surface | `apps/api/src/routes/index.ts` | `/v1/agents/ask`, `/v1/scenarios/:id/release`, `/v1/scenarios/run`, `/v1/readiness/report`, `/v1/audit/*`, `/v1/audit/dossier/:runId` |
| UI lens selector + readiness console | `apps/web/src/app/page.tsx`, `apps/web/src/components/lens-selector.tsx` | both lenses visible |

## 7. Security

| Concern | File | Notes |
|---------|------|-------|
| Hash-chained, tamper-evident audit log | `packages/audit/src/index.ts` | `logAction`, `verifyChain` |
| Persisted chain-of-thought traces | `packages/audit/src/index.ts` | `traceStep`, `getTrace` |
| Service-to-service auth | `services/*/app/main.py`, `services/ingestion/.../routes.py` | `X-API-Key` / `SERVICE_API_KEY` |
| SSRF-safe transcription (stateless, RAM-only) | `services/transcription/app/main.py` | size cap, no disk |
| Secret hygiene | `.gitignore`, `.env.example` | real env never committed |

## 8. ML sandbox

| Concern | File | Notes |
|---------|------|-------|
| Sandbox deployment topology | `deploy/sandbox/docker-compose.sandbox.yml` | Qdrant KB + external Mongo (ops), registry images |
| Sandbox variables | `deploy/sandbox/.env.sandbox.example` | `MONGODB_URI`, keys, registry |
| Fine-tuning path | `deploy/sandbox/README.md` | uses Lab cloud credits |

## 9. AI Readiness Framework 2.0 (6 factors / 13 dimensions)

The canonical definitions are vendored at `data/global/standards/dimensions.json`
(6 factors, 13 dimensions, 100+ metrics) and encoded in
`packages/shared/src/types.ts` (`READINESS_FACTORS`, `READINESS_DIMENSIONS`).
The readiness engine iterates all 13 dimensions
(`READINESS_DIMENSION_IDS`) and maps each gap to a dimension + factor.

| Factor | Dimensions |
|--------|-----------|
| `data` | D1 Data/Model Marketplace, D2 Generated Content, D3 Cross-Domain, D4 Contextualization |
| `research` | D4 Contextualization |
| `deployment` | D4, D6 Human Interface, D10 AI & Policies, D12 Granular Priorities, D13 Digital Infrastructure |
| `standards` | D3, D5 AI Integration, D6, D7 Strategy Alignment, D8 Collaboration |
| `opensource` | D1, D2, D8 |
| `sandbox` | D9 Human Impact, D10, D11 AI for Inclusion |

## 10. Hackathon §5: progressive scenario events

`packages/scenarios/src/index.ts` implements the requirement literally:
`ScenarioEvent.releaseChunk` groups events into ticks, `ScenarioEngine.release()`
yields one batch at a time, and `visibleTo` encodes **information asymmetry** so
each institutional agent receives a different, incomplete picture.

## 11. Hackathon §6: audit & chain-of-thought

`packages/audit/src/index.ts` stores two artifacts:
1. `audit_logs`: hash-chained records (`prevHash` → `hash`) for `verifyChain()`.
2. `cot_traces`: one document per reasoning step, queryable by `runId`.
`apps/api/src/routes/index.ts` exposes `GET /v1/audit/chain` and
`GET /v1/audit/trace/:runId` for reviewer inspection, and
`GET /v1/audit/dossier/:runId?format=json|markdown` bundles the whole run
(audit chain + CoT + joint reports + citations) via `packages/report`.
