# Built during the Meta Global AI Developer Hackathon

**Project:** SarkiAI Policy Sandbox, Meta edition
**Team:** Djotta (Cameroon), Startup track
**Building period:** 26 October 2026 (kickoff, 12:00 PM ET) to 4 November 2026

This file is the honest ledger the rulebook asks for: what already existed, what
was built during the building period, and which Meta model does what.

## What existed before the hackathon

The baseline commit [`bdb8a11`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/bdb8a11b51487edc9f1b8633f8efa6034d2bd672) (`baseline: SarkiAI Policy Sandbox engine (v0.1.0)`, tag `pre-hackathon-baseline`) imports, as a single commit, the SarkiAI Policy Sandbox engine that **we wrote before the hackathon**. It already contained the items listed below. Everything from N1 onward was built during the hackathon, with the commits shown in the table.

The engine, published here unchanged as the starting point:

- national legal-corpus ingestion (structure-aware chunking, embeddings, jurisdiction metadata);
- **mandated institutional agents** that must cite the applicable provisions;
- a **coordinator** that reconciles independent assessments into a joint situation
  report and flags conflicts between mandates;
- progressive **scenario engine** and an AI-readiness **gap engine**;
- a **hash-chained audit log** plus persisted chain-of-thought traces;
- a Next.js console.

## Timeline

The hackathon kicked off on **26 October 2026 at 12:00 PM ET (17:00 in Cameroon, UTC+1)**.
The baseline engine was imported as a single commit after the kickoff; every later
commit is hackathon work. Author times, UTC+1:

| Time (26 Oct unless noted) | Commit | What |
|---|---|---|
| 20:48 | [`bdb8a11`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/bdb8a11b51487edc9f1b8633f8efa6034d2bd672) | Baseline import (engine written before the hackathon) |
| 20:49 | [`9a7d845`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/9a7d8456a8a25018f0137daacce5b5e78e66772c) | N1 provider modes scaffold |
| 20:57 | [`80cdbac`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/80cdbacdac67d12ded033bf543d9936a0a3acbcb) | N1 runtime mode switch |
| 21:05 | [`2043ad3`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/2043ad30122cd44e940f41bd6954d62b4a99ad83) | N2 citation validator |
| 21:12 | [`4bc2edc`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/4bc2edcb904f9fa0280768e4f77d04b7ed3b5203) | N10 incident timeline and audit trail |
| 21:25 | [`a143172`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/a143172920a7ecfbe6eb6c4e5f5e3d6cfcb65035) | N2 full-provision quote check |
| 22:01 | [`75e4908`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/75e4908ff69a4fc92c1fc302bd26a3380497a2fe) | N3 gazette ingestion with SAM 3.1 |
| 22:06 | [`bccaf9d`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/bccaf9d83b5e6ac077113dcbf9cf0a501f366051) | N5 Muse Glimmer Modelfile |
| 22:10 | [`1fd4c95`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/1fd4c9510019e8fe7cabb9ea7a1d01ecdf4ec2ba) | N6 voice notes to timed facts |
| 22:13 | [`f9a9e30`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/f9a9e30c9a15973cf66dd91e13853688005dc499) | N7 legislative impact |
| 27 Oct, 01:00 | [`913a99e`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/913a99e) | N4 WhatsApp approvals, N11 cloud retrieval |
| 27 Oct, 01:14 | [`23cfb10`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/23cfb10) | N8 crisis exercise |

## Open weights: where they run and what they do

| Model | Where it runs | What it does in the workflow |
|---|---|---|
| **Muse Spark Open** (`meta-models/muse-spark-open-1026`) | Baseten (partner inference), selected from the model menu of the hosted console or with `SANDBOX_MODE=sovereign` + `BASETEN_API_KEY` | Replaces Muse Spark for **all reasoning**: the mandated institutional agents, the coordinator and its conflict detection, the citation retries, the impact analysis and the exercise narrative. Every reasoning step records the model id in the audit chain. |
| **Muse Glimmer** (30B, Apache-2.0) | The institution's own hardware, through Ollama (`make glimmer`); default model of the `local` mode | The same reasoning steps, fully on-premise: no prompt, corpus or incident fact leaves the machine. |

SAM 3.1 and Muse Voice Transcribe run on the Meta Model API in every mode.

## What we built during the hackathon

Full diff: [`baseline...main`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/compare/bdb8a11b51487edc9f1b8633f8efa6034d2bd672...main)

| # | Feature | Meta model | Status | Commits |
|---|---------|-----------|--------|---------|
| N1 | Provider layer (`cloud` / `sovereign` / `local`), provider badge, `provider.switched` audit event, model recorded per reasoning step | Muse Spark (Meta Model API) | done | [`9a7d845`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/9a7d8456a8a25018f0137daacce5b5e78e66772c), [`80cdbac`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/80cdbacdac67d12ded033bf543d9936a0a3acbcb) (first commit; later commits in the diff) |
| N2 | Citation validator: a quote absent from the corpus is rejected and the agent retries | Muse Spark | done | [`2043ad3`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/2043ad30122cd44e940f41bd6954d62b4a99ad83), [`a143172`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/a143172920a7ecfbe6eb6c4e5f5e3d6cfcb65035) (first commit; later commits in the diff) |
| N3 | Scanned gazette ingestion: column segmentation, per-zone transcription, SAM artefact overlay, provenance carried into the KB (`@sps/gazette`, `/v1/gazette/*`, console panel) | SAM 3.1 + Muse Spark | done | [`75e4908`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/75e4908ff69a4fc92c1fc302bd26a3380497a2fe) (first commit; later commits in the diff) |
| N4 | **WhatsApp channel**: joint reports and deadline alerts sent as approved utility templates (`meta_hackathon_*`); an approval request carries a signed, expiring link and the decision is taken in the web app (`/approve/:token`), recorded once in `whatsapp_approvals` and in the audit chain. Direct Meta Cloud API client, no notification gateway. | — | done | [`913a99e`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/913a99e) (first commit; later commits in the diff) |
| N5 | Sovereign mode: the same engine on open weights, one command to build the local Muse Glimmer (`deploy/ollama/Modelfile.glimmer`, `make glimmer`) | Muse Glimmer 30B (Ollama), Muse Spark Open (hosted) | done | [`bccaf9d`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/bccaf9d83b5e6ac077113dcbf9cf0a501f366051) (first commit; later commits in the diff) |
| N6 | Voice notes turned into timed, speaker-attributed facts (`@sps/voice`, `/v1/voice/transcribe`); cloud uses Muse Voice Transcribe, sovereign/local use on-premise faster-whisper | Muse Voice Transcribe | done | [`1fd4c95`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/1fd4c9510019e8fe7cabb9ea7a1d01ecdf4ec2ba) (first commit; later commits in the diff) |
| N7 | Impact analysis: a new provision re-opens the persisted incidents it changes (`@sps/impact`, `/v1/impact/analyze`, console panel under the gazette ingestion) | Muse Spark | done | [`f9a9e30`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/f9a9e30c9a15973cf66dd91e13853688005dc499) (first commit; later commits in the diff) |
| N8 | **Table-top crisis exercise**: authored injects released on a clock, an action log kept by the team, and a score computed deterministically (addressed / late / missed, coverage, response time) before Muse Spark writes the after-action narrative. The narrative cannot change the score (`@sps/exercise`, `/v1/exercise/*`, console panel). | Muse Spark / Muse Glimmer | done | [`23cfb10`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/23cfb10) (first commit; later commits in the diff) |
| N9 | Local-language drafts (Fulfulde, Hausa) | — | **dropped**: the message of commit `23cfb10` announces them, but no code or content for them is in the repository | [`23cfb10`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/23cfb10) (message only) |
| N10 | Demo UI: incident timeline (who saw what), clickable citations, bilingual EN/FR, provider badge, audit-chain check | — | done | [`4bc2edc`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/4bc2edcb904f9fa0280768e4f77d04b7ed3b5203) (first commit; later commits in the diff) |
| N11 | **Operable knowledge base** (`/knowledge`): corpus counts and retirement, in-process Atlas ingestion with a six-step journal (chunk → embed → upsert → index → verify), index state and repair, and a retrieval playground that exposes dense/BM25/RRF/rerank scores and provenance | Voyage `voyage-4` + `rerank-2` | done | [`913a99e`](https://github.com/rouftom/sarkiai-policy-sandbox-meta/commit/913a99e) (first commit; later commits in the diff) |

Cloud mode also switches the retrieval backend. Meta publishes neither an
embedding nor a reranking model, so `voyage-4` and `rerank-2` are the only
non-Meta models in the pipeline. They rank passages and produce no text; every
reasoning, vision, segmentation and speech step runs on Meta (see the README,
*Why Voyage for retrieval*). Chunk embeddings come from **Voyage `voyage-4`** and search runs on **MongoDB Atlas** (`$vectorSearch` +
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
