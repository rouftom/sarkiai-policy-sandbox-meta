---
name: SarkiAI provider modes
description: How SANDBOX_MODE selects local, sovereign or cloud inference — Muse Glimmer as the local default, the qwen fallback, Baseten/Modal open weights, the Meta Model API and the retrieval backend that follows. Use when changing models, adding a provider, debugging "provider not ready", or documenting keys.
---

# SarkiAI provider modes

Mode is **configuration, never a code path**. Every agent, the coordinator and
the readiness engine receive the same `LanguageModel` handle from
`packages/agents/src/provider.ts`. A switch is audited as `provider.switched`.

## The three modes

| `SANDBOX_MODE` | Serves | Base URL | Key | Residency |
| --- | --- | --- | --- | --- |
| `local` (default) | Ollama, `OLLAMA_MODEL` (**Muse Glimmer**) + `bge-m3` | `OLLAMA_BASE_URL` | none | on-premise |
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
- `qwen3.5:9b` is an **explicit fallback** for machines with 16–32 GB of RAM,
  never the default. It must be set before `make models`.
- `BASETEN_DEFAULT_MODEL = 'meta-models/muse-spark-open-1026'`.
- `RUN_BUDGET_USD` is **alert-only**; it never blocks a run.

## Retrieval follows the mode

`RETRIEVAL_BACKEND=auto | qdrant | atlas` (`packages/retrieval/src/types.ts`):

- `auto` → `atlas` in `cloud`, `qdrant` otherwise.
- `qdrant` → `bge-m3` + Qdrant, works in any mode (useful for a Meta key with a
  local corpus: `SANDBOX_MODE=cloud` + `RETRIEVAL_BACKEND=qdrant`).
- `atlas` → Voyage embeddings + Atlas Vector/Search (`VOYAGE_API_KEY`,
  `MONGODB_URI` with `mongodb+srv`, indexes bootstrapped at startup).

An unknown value throws at startup — do not silently fall back.

## Adding or changing a provider

1. Extend `resolveProvider()` and `ProviderDescriptor` in `packages/shared`;
   keep the descriptor secret-free (`ready`, `reason`, `servedBy`, `models`).
2. Update the console badge/labels and **both** locales.
3. Add the keys to `.env.example` as placeholders and document them in
   `README.md` / `deploy/api/README.md`.
4. Keep `local`/`sovereign` free of outbound calls (no telemetry, no hosted
   fallback).
5. Verify: `bun run check:provider <mode>` then one real generation in the
   console, plus `bun test packages/agents`.

## Checks

```bash
bun run check:provider local
bun run check:provider sovereign
bun run check:provider cloud      # needs MODEL_API_KEY
curl -s localhost:8000/health     # reports the active mode and model
```
