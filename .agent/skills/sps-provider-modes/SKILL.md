---
name: SarkiAI provider modes
description: How SANDBOX_MODE selects local, sovereign or cloud inference — Muse Glimmer as the local default, Baseten/Modal open weights, the Meta Model API, and the lexical retrieval backend and depth that follow. Use when changing models, adding a provider, debugging "provider not ready", or documenting keys.
---

# SarkiAI provider modes

Mode is **configuration, never a code path**. Every agent, the coordinator, the
readiness engine and the agentic search receive the same `LanguageModel` handle
from `packages/agents/src/provider.ts`. A switch is audited as
`provider.switched`. **Every model called at runtime is a Meta model.**

## The three modes

| `SANDBOX_MODE` | Serves | Base URL | Key | Residency |
| --- | --- | --- | --- | --- |
| `local` (default) | Ollama, `OLLAMA_MODEL` (**Muse Glimmer 30B**) | `OLLAMA_BASE_URL` | none | on-premise |
| `sovereign` | Modal → Baseten → Ollama, in that order | `MODAL_ENDPOINT_URL` / `BASETEN_BASE_URL` / `OLLAMA_BASE_URL` | `BASETEN_API_KEY` if hosted | cloud or on-premise |
| `cloud` | Meta Model API (Muse Spark, SAM 3.1, Muse Voice Transcribe) | `META_BASE_URL` | `MODEL_API_KEY` | cloud |

- `sovereign` picks **Modal** if `MODAL_ENDPOINT_URL` is set, else **Baseten**
  if `BASETEN_API_KEY` is set, else **Ollama** on-premise with
  `MUSE_GLIMMER_MODEL` (default `muse-glimmer`). `make glimmer` builds the
  `sps-glimmer` tag from `deploy/ollama/Modelfile.glimmer`.
- `cloud` chooses the chat model from Meta's model list in the console and
  stores it as a preference; it is **never** an env var. Only
  `META_SAM_MODEL` and `META_VOICE_MODEL` are configurable.
- A cloud mode without `MODEL_API_KEY` is *selected but not configured*:
  `resolveProvider()` returns `ready: false` with a reason, and the UI shows
  "Not configured" instead of failing later.

## Defaults that must not drift

- `LOCAL_DEFAULT_MODEL = 'muse-glimmer'` in `provider.ts`, mirrored in
  `.env.example`, `docker-compose.yml` and `apps/api/src/config.ts`.
- `BASETEN_DEFAULT_MODEL = 'meta-models/muse-spark-open-1026'`.
- `RUN_BUDGET_USD` is **alert-only**; it never blocks a run.

## Retrieval follows the mode

`RETRIEVAL_BACKEND=auto | atlas | text` (`packages/retrieval/src/types.ts`):

- `auto` → `atlas` in `cloud`, `text` otherwise.
- `atlas` → Atlas Search (`sps_text_index`, BM25) over `kb_chunks`; needs
  `MONGODB_URI` with `mongodb+srv`, and the index is bootstrapped at startup.
- `text` → the MongoDB text index over `kb_chunks`, created at the first
  ingestion. Works in any mode.

An unknown value throws at startup — do not silently fall back.

`RETRIEVAL_DEPTH=lexical | fast | deep` sets the default agentic depth:
`lexical` calls no model, `fast` plans and ranks, `deep` runs parallel
sub-agents with judge loops. The institutional agents and readiness use `fast`,
the assistant and the exploration screen use `deep`.

## Adding or changing a provider

1. Extend `resolveProvider()` and `ProviderDescriptor` in `packages/shared`;
   keep the descriptor secret-free (`ready`, `reason`, `servedBy`, `models`).
2. Update the console badge/labels and **both** locales.
3. Add the keys to `.env.example` as placeholders and document them in
   `README.md` / `deploy/api/README.md`.
4. Keep `local` free of outbound calls (no telemetry, no hosted fallback).
5. Verify: `bun run check:provider <mode>` then one real generation in the
   console, plus `bun test packages/agents`.

## Checks

```bash
bun run check:provider local
bun run check:provider sovereign
bun run check:provider cloud      # needs MODEL_API_KEY
curl -s localhost:8000/health     # reports the active mode and model
```
