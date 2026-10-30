# Deployment hardware requirements

The sizing resource depends on the provider mode. In `local` and `sovereign`
modes, **Ollama** (LLM + embeddings) dominates; Qdrant, MongoDB, MinIO,
ingestion, the API and the web console are light. In `cloud` mode no model runs
locally at all. OCR, the reranker and transcription are **optional** Compose
profiles.

## 1. Component cost

| Component | Disk | RAM/VRAM warm | CPU | Optional |
|-----------|------|---------------|-----|----------|
| **Ollama: qwen3.5:9b** (Q4, multimodal) | **~6.6 GB** | **~8–10 GB** | yes | no (default LLM) |
| Ollama: qwen2.5:14b (Q4, text) | ~9 GB | ~11–16 GB | yes | alternative |
| Ollama: qwen2.5:7b (Q4) | ~5 GB | ~6–8 GB | yes | light alternative |
| Ollama: Muse Glimmer 30B (sovereign) | ~18–20 GB | ~24–32 GB | yes | alternative |
| **Ollama: bge-m3** (embeddings) | **~1.2 GB** | ~1–2 GB | yes | no in local/sovereign |
| Qdrant (vector KB) | < 1 GB | ~1–2 GB | no | no |
| MongoDB (audit + CoT) | < 1 GB | ~0.5–1 GB | no | no |
| MinIO (image attachments) | ~0.2 GB | ~0.5 GB | no | no |
| ingestion (FastAPI + PyMuPDF + fastembed) | ~0.5 GB | ~1–2 GB | yes | no |
| API (Bun/Fastify) | — | ~0.25–0.5 GB | no | no |
| Web (Next.js) | — | ~0.5–1 GB | no | no |
| OCR (Tesseract) | — | ~1–2 GB | yes (peaks) | yes (`ocr`) |
| Reranker TEI (bge-reranker-v2-m3) | ~2.3 GB | ~2–4 GB | yes | yes (`rerank`) |
| Transcription (faster-whisper large-v3) | ~3 GB | ~4–6 GB | yes (slow) | yes (`media`) |
| Docker images (ollama, qdrant, mongo, minio, python, node, tei) | ~7–9 GB | — | — | — |

## 2. Deployment profiles

### A. Minimal (cloud mode, cheap demo)
- **CPU**: 2 cores · **RAM**: **2–4 GB** · **Disk**: **5 GB** · **GPU**: none
- No local model: reasoning, vision and voice go to the Meta Model API, retrieval
  to Atlas + Voyage. The API, the web console and the ingestion service are the
  only processes.

### B. Recommended (full local demo, CPU)
- **CPU**: 8–16 cores · **RAM**: **16–32 GB** · **Disk**: **30–40 GB** SSD · **GPU**: none
- `qwen3.5:9b` + `bge-m3`, optional TEI rerank; multimodal (text + image) enabled
- Text alternative: `OLLAMA_MODEL=qwen2.5:14b`

### C. Comfortable / production (sovereign, GPU)
- **NVIDIA GPU**: **12–24 GB VRAM** (RTX 3060 12 GB, 4070 Ti/4080 16 GB, 4090/L4/A10 24 GB)
- **CPU**: 8+ cores · **RAM**: **32–64 GB** · **Disk**: **100 GB** NVMe
- `qwen3.5:9b`, or Muse Glimmer 30B with 32 GB+ of VRAM for the sovereign mode;
  fast inference, GPU TEI reranker

### Apple Silicon (unified memory)
- **16 GB**: `qwen3.5:9b` comfortably
- **48 GB+**: Muse Glimmer 30B comfortably

## 3. Disk detail (profile B, first run)

| Item | Size |
|------|------|
| `qwen3.5:9b` | ~6.6 GB |
| `bge-m3` | ~1.2 GB |
| Docker images | ~7–9 GB |
| Build cache + CM corpus | ~5–10 GB |
| **Total** | **~20–27 GB** (plan for 30 GB) |

## 4. Reducing the footprint (environment variables)

| Goal | Setting |
|------|---------|
| Cloud mode, no local model at all | `SANDBOX_MODE=cloud` |
| Lighter LLM | `OLLAMA_MODEL=qwen2.5:7b` |
| Text-only LLM | `OLLAMA_MODEL=qwen2.5:14b` |
| No rerank | do not enable the `rerank` profile (`RERANK_URL=` empty) |
| No transcription | do not enable the `media` profile |
| Lighter Whisper | `WHISPER_MODEL=small` |

## 5. Readiness dimensions concerned

This frugality is an argument in itself: it feeds **D13 Digital Infrastructure**
(compute and energy) and **D11 Edge Privacy** (deployment at the edge, without
egress), and shows that a sovereign deployment can run without a GPU on ordinary
hardware.
