# Built during the Meta Global AI Developer Hackathon

**Project:** SarkiAI Policy Sandbox, Meta edition
**Team:** Djotta (Cameroon), Startup track
**Building period:** 27 October – 4 November 2026

This file is the honest ledger the rulebook asks for: what already existed, what
was built during the building period, and which Meta model does what.

## What existed before the hackathon

Baseline: tag [`pre-hackathon-baseline`](../../tree/pre-hackathon-baseline).

The core engine was written earlier as a local-first policy sandbox, and is
published here unchanged as the starting point:

- national legal-corpus ingestion (structure-aware chunking, embeddings, jurisdiction metadata);
- **mandated institutional agents** that must cite the applicable provisions;
- a **coordinator** that reconciles independent assessments into a joint situation
  report and flags conflicts between mandates;
- progressive **scenario engine** and an AI-readiness **gap engine**;
- a **hash-chained audit log** plus persisted chain-of-thought traces;
- a Next.js console.

## What we built during the hackathon

Full diff: [`pre-hackathon-baseline...meta-hackathon`](../../compare/pre-hackathon-baseline...meta-hackathon)

| # | Feature | Meta model | Status | Commits |
|---|---------|-----------|--------|---------|
| N1 | Provider layer (`cloud` / `sovereign` / `local`), provider badge, `provider.switched` audit event, model recorded per reasoning step | Muse Spark (Meta Model API) | done | see `git log --oneline pre-hackathon-baseline..meta-hackathon` |
| N2 | Citation validator: a quote absent from the corpus is rejected and the agent retries | Muse Spark | done | see `git log --oneline pre-hackathon-baseline..meta-hackathon` |
| N3 | Scanned gazette ingestion: column segmentation, per-zone transcription, SAM artefact overlay, provenance carried into the KB (`@sps/gazette`, `/v1/gazette/*`, console panel) | SAM 3.1 + Muse Spark | done | `bun run check:gazette` |
| N4 | **WhatsApp channel**: joint reports and deadline alerts sent as approved utility templates (`meta_hackathon_*`); an approval request carries a signed, expiring link and the decision is taken in the web app (`/approve/:token`), recorded once in `whatsapp_approvals` and in the audit chain. Direct Meta Cloud API client, no notification gateway. |: | done | `bun test packages/whatsapp` |
| N5 | Sovereign mode: the same engine on open weights, one command to build the local Muse Glimmer (`deploy/ollama/Modelfile.glimmer`, `make glimmer`) | Muse Glimmer 30B (Ollama), Muse Spark Open (hosted) | done | `make glimmer` |
| N6 | Voice notes turned into timed, speaker-attributed facts (`@sps/voice`, `/v1/voice/transcribe`); cloud uses Muse Voice Transcribe, sovereign/local use on-premise faster-whisper | Muse Voice Transcribe | done | `bun test packages/voice` |
| N7 | Impact analysis: a new provision re-opens the persisted incidents it changes (`@sps/impact`, `/v1/impact/analyze`) | Muse Spark | done | `bun test packages/impact` |
| N8 | **Table-top crisis exercise**: authored injects released on a clock, an action log kept by the team, and a score computed deterministically (addressed / late / missed, coverage, response time) before Muse Spark writes the after-action narrative. The narrative cannot change the score (`@sps/exercise`, `/v1/exercise/*`, console panel). | Muse Spark / Muse Glimmer | done | `bun test packages/exercise` |
| N9 | **Public communication in Fulfulde or Hausa**: drafts from verified facts only, hard-blocked on political content and medical advice, every draft marked `pending native review`; invented phone numbers are flagged (`@sps/communications`, `/v1/communications/*`). API-only: the console panel was removed after review. | Muse Spark | done (API) | `bun test packages/communications` |
| N10 | Demo UI: incident timeline (who saw what), clickable citations, bilingual EN/FR, provider badge, audit-chain check |: | done | see `git log --oneline pre-hackathon-baseline..meta-hackathon` |
| N11 | **Operable knowledge base** (`/knowledge`): corpus counts and retirement, in-process Atlas ingestion with a six-step journal (chunk → embed → upsert → index → verify), index state and repair, and a retrieval playground that exposes dense/BM25/RRF/rerank scores and provenance | Voyage `voyage-4` + `rerank-2` | done | `bun test packages/kb packages/retrieval` |

Cloud mode also switches the retrieval backend: chunk embeddings come from
**Voyage `voyage-4`** and search runs on **MongoDB Atlas** (`$vectorSearch` +
`$search` BM25, RRF, `rerank-2`). Local and sovereign modes keep `bge-m3` +
Qdrant, so no corpus leaves the machine. Atlas index definitions live in
`packages/retrieval/src/atlas-index-definitions.ts` (the JSON under `deploy/mongo/`
is the CLI artifact, kept in sync by a test) and are created idempotently at
startup, in cloud mode only.

## Deployment

Public demo: the Next.js console on a web host, and the Fastify API as a Docker
web service, so the SSE stream and the WhatsApp webhook keep a stable origin.
Settings are in `deploy/web/README.md` and `deploy/api/README.md`.

WhatsApp: the three `meta_hackathon_*` utility templates were submitted to the
WABA on 27 October 2026 (ids in `deploy/whatsapp/templates.md`) and stay
`PENDING` until Meta approves them: no business-initiated message is delivered
before that.

## How to run

See the README: environment variables, the three provider modes, and one command
per use case.

## Data

Every person, hospital, institution, case and phone number used in the demo is
fictional. No real health data is used.
