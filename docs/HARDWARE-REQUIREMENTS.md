# Deployment hardware requirements

The sizing resource depends on the provider mode. In `local` and `sovereign`
modes **Ollama** serves **Muse Glimmer 30B**, the only local model, and it
dominates the footprint; MongoDB, MinIO, the API and the web console are light.
In `cloud` mode no model runs locally at all: reasoning, vision and voice go to
the Meta Model API.

Ingestion runs inside the API process, and the corpus is searched by the
agentic search on the Meta model of the mode, so there is no separate ingestion,
OCR, reranker or transcription service to size.

## 1. Component cost

| Component | Disk | RAM/VRAM warm | CPU | Mode |
|-----------|------|---------------|-----|------|
| **Ollama: Muse Glimmer 30B** (Q4, multimodal, Apache-2.0) | **~18–20 GB** | **~24–32 GB VRAM**, or **48 GB+ unified memory** | yes | `local`, `sovereign` |
| MongoDB (corpus `kb_chunks`, audit, CoT) | < 1 GB | ~0.5–1 GB | no | all |
| MinIO (image attachments) | ~0.2 GB | ~0.5 GB | no | all |
| API (Bun/Fastify: ingestion, agentic search, agents) | — | ~0.5–1 GB | no | all |
| Web (Next.js) | — | ~0.5–1 GB | no | all |
| Docker images (ollama, mongo, minio, node) | ~5–7 GB | — | — | all |

The corpus itself is text: 22 documents and 6 096 active chunks take a few
megabytes in `kb_chunks`. The footprint comes from the model, not the data.

## 2. Deployment profiles

### A. Minimal (cloud mode)
- **CPU**: 2 cores · **RAM**: **2–4 GB** · **Disk**: **5 GB** · **GPU**: none
- No local model: Muse Spark, SAM 3.1 and Muse Voice Transcribe go to the Meta
  Model API, and the corpus lives in MongoDB Atlas. The API and the web console
  are the only processes.

### B. Local / sovereign (full demo, GPU)
- **NVIDIA GPU**: **24–32 GB VRAM** (RTX 3090/4090 24 GB, L4 24 GB, A10 24 GB, A100 40 GB)
- **CPU**: 8+ cores · **RAM**: **32–64 GB** · **Disk**: **100 GB** NVMe
- Muse Glimmer 30B on Ollama; nothing leaves the host

### Apple Silicon (unified memory)
- **48 GB+**: Muse Glimmer 30B comfortably (`muse-glimmer:30b-mlx` as the base tag)
- **Below 48 GB**: run profile A (cloud mode); there is no smaller local model,
  because every model the engine calls at runtime is a Meta model.

## 3. Disk detail (profile B, first run)

| Item | Size |
|------|------|
| Muse Glimmer 30B | ~18–20 GB |
| Docker images | ~5–7 GB |
| Build cache + corpus payloads | ~5–10 GB |
| **Total** | **~30–37 GB** (plan for 40 GB) |

## 4. Reducing the footprint (environment variables)

| Goal | Setting |
|------|---------|
| No local model at all | `SANDBOX_MODE=cloud` |
| Keep the corpus on the host but reason in the cloud | `SANDBOX_MODE=cloud` with a local `MONGODB_URI` |
| Smaller model cache | prune unused tags in Ollama (`ollama rm <tag>`) |
| Lighter corpus read cost | `RETRIEVAL_DEPTH=fast` instead of `deep` |

## 5. Readiness dimensions concerned

This frugality is an argument in itself: it feeds **D13 Digital Infrastructure**
(compute and energy) and **D11 Edge Privacy** (deployment at the edge, without
egress), and shows that a sovereign deployment can run on a single GPU — or on
none at all in cloud mode.
