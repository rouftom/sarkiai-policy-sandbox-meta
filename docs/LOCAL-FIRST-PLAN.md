# Local and sovereign mode: build and operate

`local` and `sovereign` run the whole engine on the institution's own hardware:
reasoning, embeddings, reranking and transcription included. No prompt, passage
or answer leaves the network. This is the mode to show a ministry or a hospital,
and the one that scores **D10 Data Sovereignty** (`d10_m10`) and **D11 Edge
Privacy** (`d11_m06`) on evidence rather than on promises.

The `cloud` mode is documented in the README: it swaps the same engine onto the
Meta Model API and Atlas retrieval. Both modes share the `KbChunk` contract, the
citation validator and the audit chain.

## 1. Principle

Every model call goes to a local endpoint. The sandbox keeps working with the
network cable unplugged, which is what a locked-down deployment requires.

## 2. Runtime layout

```
                    ┌──────────────────────────┐
   browser ────────►│  apps/web (Next.js)      │
                    └────────────┬─────────────┘
                                 │ REST + SSE
                    ┌────────────▼─────────────┐
                    │  apps/api (Fastify)      │
                    └───────┬──────────┬───────┘
                            │          │
                Qdrant ─────┘          └───── MongoDB (audit, CoT)
                    │
        ┌───────────┴────────────┐
        │  Ollama                │
        │  · qwen3.5:9b          │
        │  · bge-m3              │
        └───────────┬────────────┘
                    │
        ┌───────────┴──────────────┐   ┌────────────────────┐
        │ services/ingestion       │   │ services/ocr       │
        │ embeddings, chunking     │   │ Tesseract, local   │
        └──────────────────────────┘   └────────────────────┘
        ┌──────────────────────────┐
        │ services/transcription   │   optional, `media` profile
        │ faster-whisper, local    │
        └──────────────────────────┘
   optional: TEI reranker `bge-reranker-v2-m3`, `rerank` profile
```

`ollama` is the only model provider in these modes.

## 3. Models

| Role | Model | Why |
|------|-------|-----|
| Reasoning (`local`) | **`qwen3.5:9b`** (Ollama) | multimodal (text + image), 201 languages, 256K context, ~6.6 GB on disk |
| Reasoning (`sovereign`) | **Muse Glimmer 30B** (Ollama) | open weights (Apache-2.0), dense, multimodal, the same engine as cloud |
| Light LLM (option) | `qwen2.5:7b` through `OLLAMA_MODEL` | runs on a GPU-less sandbox |
| Embeddings | **`bge-m3`** (Ollama) | multilingual, 1024 dense dimensions — the Qdrant dimension, so no schema change |
| Sparse (hybrid) | BM25 in Qdrant | unchanged |
| Rerank (option) | `BAAI/bge-reranker-v2-m3` through local **TEI** | replaces the cloud reranker; without it the engine uses raw RRF |
| Transcription (option) | `faster-whisper` (`large-v3` / `small`) | local voice notes |

`bge-m3` is 1024-dimensional, exactly the Qdrant configuration the cloud mode
also uses for its chunks: switching modes needs no vector migration.

## 4. Environment

```env
# Local models (default in local/sovereign)
SANDBOX_MODE=local
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=qwen3.5:9b
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=bge-m3
EMBEDDING_DIMENSION=1024
# Optional local rerank (TEI)
RERANK_URL=            # e.g. http://rerank:80 ; empty => RRF only
# Optional local transcription
WHISPER_MODEL=large-v3
```

Sovereign mode adds `MUSE_GLIMMER_MODEL=sps-glimmer` and uses
`deploy/ollama/Modelfile.glimmer`.

## 5. Docker

- The **`ollama`** service, with an `ollama-data` volume and optional NVIDIA GPU.
- **`make models`** pulls `qwen3.5:9b` + `bge-m3`; **`make glimmer`** builds the
  tuned Muse Glimmer tag.
- The **`rerank`** service (TEI) behind the `rerank` profile.
- `transcription` runs faster-whisper under the `media`/`full` profiles.
- `depends_on`: `ingestion` and `api` wait for `ollama` to be healthy.

## 6. Fine-tuning (documented, not part of the shipped build)

A fully local chain; the dataset is never exported:

1. **Export** (context, question → cited answer) pairs from MongoDB
   (`cot_traces`, `joint_reports`, readiness outputs).
2. **Train** a LoRA/QLoRA adapter with `peft` + `trl` (or `unsloth`) on the
   open-weight base model.
3. **Convert**: merge the adapter, then `llama.cpp` → **GGUF**.
4. **Serve**: `ollama create sps-qwen` then `OLLAMA_MODEL=sps-qwen`.
5. **Locked-down variant**: train *inside* the sandbox with its credits, so the
   dataset never leaves it.

See [`ROADMAP.md`](ROADMAP.md) for the status; no code ships until it is needed.

## 7. Impact and risks

| Risk | Mitigation |
|------|-----------|
| ~10 GB RAM for the 9B model | `OLLAMA_MODEL=qwen2.5:7b`, documented above |
| First pull of 5–9 GB | `make models`, persistent volume |
| `generateObject` is less reliable locally | JSON mode + retry + fallback; covered by tests |
| Quality below frontier models | acceptable for the demo; fine-tuning stays possible |
| No cloud reranker | RRF is already strong; optional local TEI |

## 8. Readiness dimensions strengthened

- **D10 `d10_m10` Data Sovereignty**: ownership and movement of data — nothing
  crosses the infrastructure boundary.
- **D11 `d11_m06` Edge Privacy**: autonomous edge inference with no leak.

Both metrics are surfaced explicitly in the readiness engine, with evidence and
score.
