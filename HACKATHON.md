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
| N4 | **WhatsApp channel** — joint reports and deadline alerts sent as approved utility templates (`meta_hackathon_*`); an approval request carries a signed, expiring link and the decision is taken in the web app (`/approve/:token`), recorded once in `whatsapp_approvals` and in the audit chain. Direct Meta Cloud API client, no notification gateway. | — | done | `bun test packages/whatsapp` |
| N5 | Sovereign mode: the same engine on open weights, one command to build the local Muse Glimmer (`deploy/ollama/Modelfile.glimmer`, `make glimmer`) | Muse Glimmer 30B (Ollama), Muse Spark Open (hosted) | done | `make glimmer` |
| N6 | Voice notes turned into timed, speaker-attributed facts (`@sps/voice`, `/v1/voice/transcribe`); cloud uses Muse Voice Transcribe, sovereign/local use on-premise faster-whisper | Muse Voice Transcribe | done | `bun test packages/voice` |
| N7 | Impact analysis: a new provision re-opens the persisted incidents it changes (`@sps/impact`, `/v1/impact/analyze`) | Muse Spark | done | `bun test packages/impact` |
| N8 | Crisis exercise mode with timed injects and an after-action report | Muse Spark / open weights | ☐ | |
| N9 | Public-communication drafts in Fulfulde or Hausa (native review required) | Muse Spark | ☐ | |
| N10 | Demo UI: incident timeline (who saw what), clickable citations, bilingual EN/FR, provider badge, audit-chain check | — | done | see `git log --oneline pre-hackathon-baseline..meta-hackathon` |

Cloud mode also switches the retrieval backend: chunk embeddings come from
**Voyage `voyage-4`** and search runs on **MongoDB Atlas** (`$vectorSearch` +
`$search` BM25, RRF, `rerank-2`). Local and sovereign modes keep `bge-m3` +
Qdrant, so no corpus leaves the machine. Atlas indexes are declared in
`deploy/mongo/kb.indexes.json` and created only in cloud mode.

## How to run

See the README: environment variables, the three provider modes, and one command
per use case.

## Data

Every person, hospital, institution, case and phone number used in the demo is
fictional. No real health data is used.
