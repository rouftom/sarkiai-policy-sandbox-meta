# Pipeline mapping: file by file

The engine is a **staged pipeline**: data sources → collection → preprocessing →
retrieval & model → policy → distribution → consumers: running under a single
orchestrator, with a locked-down sandbox as the validation environment. Every
stage emits its own audit events.

This document maps every stage to a concrete file so evaluators can verify the
architecture instead of taking it on faith. Every model named here is a Meta
model.

## Stage vocabulary

We use these exact stage names throughout the codebase and the docs.

| Stage | Meaning | Our component | File |
|-------|---------|---------------|------|
| `source` | data sources | country/global corpora, gazette scans | `data/**`, `packages/gazette` |
| `collector` | Collector | ingest API + client | `apps/api/src/routes/index.ts`, `packages/retrieval/src/atlas-ingest.ts`, `packages/kb` |
| `preprocessor` | Preprocessor | structure-aware chunking + scanned-page segmentation | `packages/kb/src/chunk.ts`, `packages/gazette` |
| `model` | Model | agentic lexical retrieval + Meta model agents | `packages/retrieval/src/agentic.ts`, `packages/agents/src/model.ts` |
| `policy` | Policy | citation-mandatory prompts, gap engine, workflow profiles | `packages/agents/src/prompt.ts`, `packages/readiness`, `packages/shared/src/workflows.ts` |
| `distributor` | Distributor | API surface + web console + report/dossier | `apps/api`, `apps/web`, `packages/report` |
| `sink` | consumers/actors | institutional agents + joint situation report | `packages/agents/src/coordinator.ts` |
| `orchestrator` | orchestration | engine composition per lens | `apps/api/src/engine.ts` |
| `sandbox` | validation env | locked-down deployment | `docker-compose.yml`, `deploy/ollama` |

## At a glance

| pipeline stage | Repo module | Key files |
|--------------|-------------|-----------|
| Data sources | `data/`, `packages/gazette` | `data/country/**`, `data/global/**`, `packages/gazette/src/index.ts` |
| Data collection | `packages/retrieval`, `packages/kb` | `packages/retrieval/src/atlas-ingest.ts`, `packages/kb/src/index.ts` |
| Data processing | `packages/kb`, `packages/gazette` | `packages/kb/src/chunk.ts`, `packages/gazette/src/pipeline.ts` |
| ML model | `packages/retrieval`, `packages/agents/src/model.ts` | `packages/retrieval/src/agentic.ts`, `packages/agents/src/model.ts` |
| ML application | `packages/agents`, `packages/scenarios`, `packages/readiness`, `packages/citations` | see below |
| Management & orchestration | `packages/shared/src/workflows.ts`, `apps/api/src/engine.ts` | workflow profiles, engine composition |
| Security | `packages/audit` | `packages/audit/src/index.ts` |
| ML sandbox | `docker-compose.yml`, `deploy/ollama/` | Ollama + MongoDB + MinIO topology |
| Data model / taxonomy | `packages/shared/src/types.ts` | `Taxonomy`, `KbChunk`, `Gap`, `AuditRecord`, `CoTTrace` |

## 1. Data sources

| Concern | File |
|---------|------|
| Country corpora placement | `data/country/cm/` |
| African regional reference corpus | `data/global/africa/` |
| Global best-practice corpus | `data/global/standards/` |
| Illustrative seed documents | `data/samples/*.txt` |
| Scanned gazettes | uploaded pages, segmented by `packages/gazette` |

## 2. Data collection

| Concern | File | Notes |
|---------|------|-------|
| HTTP ingest API (text + file) | `apps/api/src/routes/index.ts` | `POST /v1/kb/ingest`, `POST /v1/kb/ingest/text` |
| Chunking + storage + search index | `packages/retrieval/src/atlas-ingest.ts` | `AtlasIngestor` |
| Typed chunk contract | `packages/kb/src/index.ts` | re-exports `chunkDocument` |
| Corpus seed utility | `scripts/seed-corpus.ts` (`bun run kb:seed`) | bulk ingest through the API |
| Directory seed utility | `scripts/seed.sh` (`make seed`) | local docker stack |

## 3. Data processing

| Concern | File | Notes |
|---------|------|-------|
| Structure-aware chunking (FR/EN legal headings) | `packages/kb/src/chunk.ts` | `chunkDocument` → `headingPath`, `articleNumber` |
| Scanned-page segmentation (layout, SAM 3.1, transcription) | `packages/gazette/src/pipeline.ts`, `sam.ts`, `transcribe.ts` | Meta model + SAM 3.1 |
| Runtime config (ports, models, thresholds) | `apps/api/src/config.ts` | typed env access |

## 4. ML model

| Concern | File | Notes |
|---------|------|-------|
| Agentic corpus search: BM25 + sub-agents + judge + rank | `packages/retrieval/src/agentic.ts` | `AgenticRetriever` |
| Lexical source: Atlas Search (cloud) / MongoDB text index | `packages/retrieval/src/atlas.ts` | `CorpusSource`, `fuseRanked` |
| LLM provider (Muse Spark, Muse Spark Open, Muse Glimmer) | `packages/agents/src/model.ts`, `packages/agents/src/provider.ts` | `createModel`, `buildModelStack` |
| Model fine-tuning (out-of-band) | `deploy/ollama/Modelfile.glimmer` | tuned `sps-glimmer` tag |

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
| Composition of packages per lens | `apps/api/src/engine.ts` | `createEngine`, `createScenario`, `createKnowledgeIngestor` |
| HTTP surface | `apps/api/src/routes/index.ts` | `/v1/agents/ask`, `/v1/scenarios/:id/release`, `/v1/scenarios/run`, `/v1/readiness/report`, `/v1/kb/*`, `/v1/audit/*` |
| UI lens selector + readiness console | `apps/web/src/app/page.tsx`, `apps/web/src/components/lens-selector.tsx` | both lenses visible |

## 7. Security

| Concern | File | Notes |
|---------|------|-------|
| Hash-chained, tamper-evident audit log | `packages/audit/src/index.ts` | `logAction`, `verifyChain` |
| Persisted chain-of-thought traces | `packages/audit/src/index.ts` | `traceStep`, `getTrace` |
| Session auth + admin guard on ingestion | `packages/auth`, `apps/api/src/turnstile.ts` | bearer session, Turnstile |
| Secret hygiene | `.gitignore`, `.env.example` | real env never committed |

## 8. Deployment

| Concern | File | Notes |
|---------|------|-------|
| Local topology | `docker-compose.yml` | Ollama + MongoDB + MinIO, api + web |
| Development hot reload | `docker-compose.dev.yml` | bind mounts |
| Ollama model tag (Muse Glimmer) | `deploy/ollama/Modelfile.glimmer` | sampling + 32K context |
| Render deployment | `deploy/api/blueprint.yaml` | Meta Model API + Atlas |

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
