---
name: SarkiAI onboarding
description: Fast takeover of the SarkiAI Policy Sandbox repository — what the product does, the service map and ports, the golden commands, the three runtime modes and the traps that waste time. Use at the start of a session, for "how do I run this", "where does X live", "what is this repo", or before exploring unfamiliar code.
---

# SarkiAI onboarding

## In one paragraph

A policy-grounded, multi-agent decision engine for the Meta Global AI Developer
Hackathon (Cameroon). It ingests national policy corpora, retrieves citations,
runs **scenarios** (simulation lens) and **readiness** assessments
(decision lens) with Meta / open-weight models, and records every step in a
hash-chained audit log plus chain-of-thought traces. Everything runs offline in
`local` mode; the same engine switches to hosted models by configuration only.

## Golden commands

```bash
bun install                       # workspace install (bun >= 1.4.2)
cp .env.example .env              # placeholders; never commit .env
make up                           # full stack, detached (Docker)
make models                       # pull $OLLAMA_MODEL (Muse Glimmer) + bge-m3
bun run dev                       # api + web with hot reload (no containers)
bun run typecheck                 # turbo, every package
bun run test                      # turbo unit tests
bun test                          # everything; gated suites skip
bun run build                     # turbo build (web included)
make ps / make logs / make down   # stack operations
make hooks                        # install the pre-push branch guard
```

First visit: <http://localhost:3000/setup> creates the root operator. Without
an e-mail key on a local host, the one-time password is shown once on the page.

## Service map

| Service | Port | Role |
| --- | --- | --- |
| `web` | 3000 | Next.js console |
| `api` | 8000 | Fastify API (agents, runs, auth, metering) |
| `ingestion` | 8001 | Python chunker + embedder + Qdrant writer |
| `ocr` | 8002 | document OCR |
| `transcription` | 8003 | faster-whisper |
| `mcp-charts` | 8010 | chart MCP sidecar |
| `mcp-docx` | 8011 | DOCX MCP sidecar |
| `ollama` | 11434 | local LLM + embeddings |
| `qdrant` | 6333 (6334 gRPC) | vector knowledge base |
| `mongo` | 27017 | audit, CoT, runs, operators |
| `minio` | 9000 (9001 console) | image attachments |
| `rerank` | 8080 | optional TEI reranker (compose profile) |

## Where to look

| Question | File |
| --- | --- |
| Why this design | `docs/ARCHITECTURE.md` |
| Collections, payloads, indexes | `docs/DATA-MODEL.md` |
| Knowledge base pipeline | `docs/KNOWLEDGE-BASE.md` |
| Test levels and CI | `docs/TESTING.md` |
| Env vars and their meaning | `.env.example` |
| Provider modes | `packages/agents/src/provider.ts`, `apps/api/src/config.ts` |
| API surface | `apps/api/src/routes/index.ts` |
| UI strings | `apps/web/src/lib/i18n.tsx` |
| Branch and PR procedure | `docs/agent-workflow.md` |

## Runtime modes

`SANDBOX_MODE=local | sovereign | cloud`, default `local`.

- `local` — Ollama, **Muse Glimmer by default** (`OLLAMA_MODEL`), `bge-m3`
  embeddings, Qdrant. No key, no network.
- `sovereign` — the same engine on Muse Glimmer (Ollama `sps-glimmer`) or
  Muse Spark Open on Baseten (`BASETEN_API_KEY`).
- `cloud` — Meta Model API (`MODEL_API_KEY`), Voyage embeddings + Atlas
  retrieval unless `RETRIEVAL_BACKEND=qdrant`.

Mode is configuration, never a code path: every agent receives the same
`LanguageModel` handle. A switch is audited as `provider.switched`.

## Traps

- **VRAM**: Muse Glimmer 30B needs ~32 GB. Without it, set
  `OLLAMA_MODEL=qwen3.5:9b` in `.env` **before** `make models`.
- `.env` is git-ignored; never print it, never commit it. `.env.example` only.
- `NEXT_PUBLIC_*` values are inlined at build time: rebuild the web app after
  changing them.
- The API is not serverless: it keeps a process and SSE streams open.
- Ports are remappable (`API_PORT`, `WEB_PORT`, …); do not hard-code 8000/3000
  in new code.
- `make models` is required once per machine; `make up` alone does not pull
  weights.

## Next skills

`@sps-architecture` before cross-cutting work, `@sps-backend` for the API,
`@sps-web-console` for the UI, `@sps-data` for stores, `@sps-quality-gates`
before a PR, `@sps-git-release` for the branch flow.
