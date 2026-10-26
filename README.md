# SarkiAI Policy Sandbox

> Policy-grounded, multi-agent AI engine for the **Meta Global AI Developer Hackathon** (Startup track).
> One engine, two lenses: **error-scenario simulation** and **AI-readiness assessment**.

[![Meta Model API](https://img.shields.io/badge/Meta%20Model%20API-Muse%20Spark-0866FF?style=for-the-badge)](https://dev.meta.ai)
[![Open weights](https://img.shields.io/badge/Open%20weights-Muse%20Glimmer-0866FF?style=for-the-badge)](https://dev.meta.ai/models/muse-glimmer)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000?style=for-the-badge&logo=fastify)](https://fastify.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-compose-2496ED?style=for-the-badge&logo=docker)](https://docs.docker.com/compose/)

---

## Why

When a health-data incident hits a public hospital, responsibilities are split between the health
ministry, the data-protection authority, the telecom regulator and the cyber agency. Legal deadlines are
unclear, information arrives piece by piece, and decisions leave no trace.

This engine ingests a country's legal corpus and runs **mandated institutional agents** that must cite
the applicable provisions. A coordinator reconciles their assessments into a joint situation report and
flags conflicts between mandates. Every step lands in a **hash-chained audit log**.

It runs on **Meta models**, in three interchangeable provider modes:

- **cloud** — Meta Model API: `muse-spark-1.3` for reasoning, `sam-3.1` for scanned-gazette
  segmentation, `muse-voice-transcribe-1.0` for WhatsApp voice notes.
- **sovereign** — **Muse Glimmer** (30B, Apache-2.0) served locally by Ollama: same engine, no data
  leaving the institution.
- **local** — any Ollama-served model (`qwen3.5:9b` + `bge-m3` embeddings) for offline development.

- **Primary country:** Cameroon (MINPOSTEL-aligned), then multi-country (UAE → …).
- **Primary domain:** healthcare, with cross-domain spillover (data protection, telecom, cybersecurity).
- **Open by design:** permissive license (Apache-2.0 code, CC BY 4.0 content).

## One engine, two lenses

| Lens | Purpose | Basis |
|------|---------|-----------|
| `simulation` | Run a progressive, chunked error scenario across mandated agents; produce an audit trail + gap findings. | scenario engine |
| `readiness` | Assess a country corpus against the 13 AI-readiness dimensions (6 factors); produce a gap report. | readiness framework |
| `hybrid` | Simulation that emits the readiness / gap report as a by-product. | both |

The lens is a **declarative workflow profile** (`packages/shared`), never a duplicated code path.
Gap analysis is a **shared service** consumed by every lens, so no evaluation criterion is lost.

## Architecture

```
 data sources ──▶ collection ──▶ processing ──▶ retrieval & model ──▶ application ──▶ governance
      │               │              │                 │                   │              │
 data/country     services/      services/         packages/kb        packages/agents   packages/audit
 data/global      ingestion      ingestion+ocr     packages/retrieval packages/scenarios (audit + CoT)
 data/standards   (fetch/load)   (chunk+embed)                        packages/readiness
                                                                      packages/citations
```

See [`docs/PIPELINE-MAPPING.md`](docs/PIPELINE-MAPPING.md) for the file-by-file mapping.

## Repository layout

```
sarkiai-policy-sandbox/
├─ apps/
│  ├─ api/            # Fastify: agent orchestration, SSE streaming, REST/OpenAPI
│  └─ web/            # Next.js: lens selector, simulation console, readiness report
├─ packages/          # TypeScript workspace packages (@sps/*)
│  ├─ shared/         # types, workflow profiles, config, jurisdiction model
│  ├─ kb/             # ingestion client + knowledge-base domain logic
│  ├─ retrieval/      # hybrid RAG (Qdrant dense + sparse BM25, RRF + rerank)
│  ├─ citations/      # article/section source attribution
│  ├─ agents/         # roles, mandates, orchestrator (AI SDK ToolLoopAgent)
│  ├─ scenarios/      # progressive event engine (chunked release)
│  ├─ readiness/      # gap engine + AI readiness dimensions
│  ├─ audit/          # immutable audit log + persisted CoT traces
│  ├─ report/         # run dossier: audit + CoT + reports + citations
│  ├─ ui/             # shared components (SarkiAI Compact charter)
│  ├─ theme/          # admin theme packs (fada, green, ocean, sunset, mono)
│  └─ storage/        # MinIO/S3 client (content-addressed attachments)
├─ services/          # Python microservices
│  ├─ ingestion/      # structure-aware legal chunking + embeddings + Qdrant store
│  ├─ ocr/            # scanned gazette OCR (Tesseract)
│  └─ transcription/  # optional media → timestamped transcript
├─ data/              # corpora: country/cm, country/ae, global/standards (git-ignored payloads)
├─ deploy/
│  ├─ sandbox/        # locked-down sandbox deployment
│  └─ mongo/init/     # local operational store seed (audit + CoT)
└─ docs/              # strategic note, mapping, architecture, data model, roadmap
```

## Quick start

> **Pick a provider mode** with `SANDBOX_MODE` in `.env`: `local` (default —
> Ollama, no key, nothing leaves the machine), `sovereign` (Muse Glimmer on
> Ollama, or a hosted open-weight endpoint) or `cloud` (Meta Model API, requires
> `MODEL_API_KEY`). The badge in the console shows which one is answering.
> First local run pulls ~9 GB (qwen3.5:9b) + ~2 GB (bge-m3).

### Everything at once

```bash
cp .env.example .env
docker compose up --build -d
make models                # pull qwen3.5:9b + bge-m3 into Ollama
```

Then:

- Web console (bilingual EN/FR, English by default) → http://localhost:3000
- API + OpenAPI → http://localhost:8000/docs
- Ingestion service → http://localhost:8001/docs
- OCR service → http://localhost:8002/docs
- Qdrant dashboard → http://localhost:6333/dashboard
- Ollama (local models) → http://localhost:11434
- MinIO console (attachments) → http://localhost:9001
- MongoDB (audit + CoT) → `mongodb://localhost:27017`

### Switching provider

```bash
SANDBOX_MODE=cloud docker compose up -d api web      # Meta Model API
SANDBOX_MODE=sovereign docker compose up -d api web  # Muse Glimmer on Ollama
```

The switch is recorded in the audit chain as a `provider.switched` event, and
each chain-of-thought step names the mode and model that produced it.

Check a mode before a demo (one short answer, no secret printed, exits non-zero
on failure):

```bash
bun run check:provider            # SANDBOX_MODE
bun run check:provider cloud      # Meta Model API
bun run check:provider sovereign  # Muse Glimmer on Ollama
```

Optional local reranker (TEI, no cloud):

```bash
docker compose --profile rerank up -d      # then set RERANK_URL=http://rerank:80 in .env
```

### Individual services

```bash
docker compose up ollama qdrant ingestion ocr   # knowledge-base plane only
docker compose up api web                        # application plane only
docker compose up ollama qdrant ingestion        # just the KB ingest path
```

Or via the Makefile:

```bash
make up            # full stack
make models        # pull local LLM + embeddings
make up-kb         # ollama + qdrant + ingestion + ocr
make up-app        # api + web
make logs          # follow logs
make down          # stop
make clean         # stop + remove volumes
```

### Dev mode (hot reload + bind mounts)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Contributing

- Branch model and conventions: [`docs/RULES.md`](docs/RULES.md)
- Data model: [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md)
- Roadmap: [`docs/ROADMAP.md`](docs/ROADMAP.md)

## License

- **Code** — Apache-2.0 (see [`LICENSE`](LICENSE)).
- **Knowledge base / docs** — CC BY 4.0 (see [`LICENSE-CONTENT`](LICENSE-CONTENT)); source documents retain their own terms.

See [`docs/LICENSING.md`](docs/LICENSING.md) for the rationale and provenance.

---

<div align="center">

Made with ♥️ by [Djotta](https://djotta.com)

</div>
