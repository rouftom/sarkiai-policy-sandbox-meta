# Data and model sovereignty

The engine runs on three interchangeable provider modes. They differ in where
the model calls go, not in what the engine does: the same agents, citation
validator, gap engine and audit chain sit on top.

| Mode | Reasoning | Retrieval | Data leaving the institution |
|------|-----------|-----------|-----------------------------|
| `cloud` | Meta Model API (Muse Spark 1.1, 1.2 and 1.3, Muse Wonder 1.0 selectable; default the newest Muse Spark), with SAM 3.1 for gazette vision and Muse Voice Transcribe for voice notes | Voyage embeddings + MongoDB Atlas Vector Search | prompts, retrieved passages, answers, audio |
| `sovereign` | Muse Glimmer 30B on Ollama, open weights | `bge-m3` + Qdrant | nothing |
| `local` | any Ollama model (`qwen3.5:9b` by default) | `bge-m3` + Qdrant | nothing |

The mode is a single environment variable (`SANDBOX_MODE`), recorded in the audit
chain as `provider.switched`, and each chain-of-thought step names the mode and
model that produced it. The console badge always shows which one is answering.

## 1. Why it matters here

- **Sensitive data**: the domain is health — patient records and inferred signals.
- **Regulatory context**: personal-data protection law, the telecom regulator and
  the data-protection authority all constrain where records may travel.
- **Institutional argument**: a system that runs **without depending on foreign
  APIs** is a strong argument in front of a ministry.
- **Locked-down sandbox**: an isolated or air-gapped deployment cannot rely on
  external endpoints at all.

## 2. What is sovereign in each mode

| Component | Technology | Egress |
|-----------|------------|--------|
| Vector store | Qdrant (self-hosted) or Atlas (cloud mode) | none / Atlas-hosted |
| Operational store (audit, CoT) | MongoDB (self-hosted or Atlas) | none / Atlas-hosted |
| OCR | Tesseract, local | none |
| Chunking / ingestion | local Python service | none |
| Embeddings | `bge-m3` locally, Voyage in cloud mode | none / provider |
| Reasoning | Ollama locally, Meta Model API in cloud mode | none / provider |
| Transcription | faster-whisper locally, Muse Voice Transcribe in cloud mode | none / provider |

In `local` and `sovereign` modes the boundary is the machine: nothing leaves it.
In `cloud` mode the boundary is the model and embedding provider, and the console
says so on every screen through the provider badge.

## 3. Sovereignty spectrum

| Level | Model | Egress | Quality | Cost | Ops |
|-------|-------|--------|---------|------|-----|
| 0 | Public global API | Total | ★★★★★ | per token | none |
| 1 | Regional / EU cloud API | Regional | ★★★★ | paid | low |
| 2 | Self-hosted open weights (Ollama, vLLM) | None | ★★★ | infra (GPU/RAM) | medium |
| 3 | Dedicated on-premise / air-gapped open weights | None | ★★★ | infra | high |
| 4 | Local fine-tuning of open weights (LoRA/QLoRA) | None | ★★★★ | infra + time | high |

The project ships levels 2 and 4 (documented), and calls level 0 only when the
operator explicitly chooses cloud mode.

## 4. Options considered

### A. Local inference through Ollama
- LLM: `qwen3.5:9b` (multimodal), `qwen2.5:14b`, `llama3.1:8b`, `gemma3:12b`, `mistral`.
- Embeddings: `bge-m3` (multilingual, strong in French), `nomic-embed-text`.
- Pros: zero egress, free, offline, deployable in a locked-down sandbox.
  Cons: ~10–32 GB of RAM, latency, quality below frontier models, operations.

### B. Self-hosted serving at scale
- **vLLM**, **TGI** or **llama.cpp** for multi-user throughput on GPU.
- Relevant when the demo serves several delegates at once.

### C. Managed sovereign inference
- A regional or EU provider (Mistral, OVHcloud AI, Scaleway, an African regional
  cloud). Quality close to frontier, egress limited to an acceptable
  jurisdiction — to be validated against the applicable legal framework.

### D. Hybrid routing by sensitivity
- A **policy router**: sensitive data → local; open data (global good practice)
  → cloud when allowed.
- Consistent with the engine: sensitivity is already an attribute of the corpus
  (`country`, `docType`).

### E. Open-weight models with permissive licences
- Qwen, Llama, Mistral, Gemma, Aya, BGE-M3. Embeddings served by Ollama or
  **TEI** (Text Embeddings Inference).

### F. Fine-tuning without exfiltration
- **LoRA/QLoRA** on self-hosted open weights (`unsloth`, `peft`). The dataset
  stays on-premise; only the public base weights and the adapter move.

## 5. Decision implemented

Three modes, one engine, one switch:

| Element | Decision |
|---------|----------|
| `cloud` | Meta Model API for reasoning, vision and voice; Voyage `voyage-4` + `rerank-2` with Atlas Vector Search. Used by the public demo. |
| `sovereign` | **Muse Glimmer 30B** on Ollama: same behaviour, nothing leaves the host |
| `local` | `qwen3.5:9b` (or any Ollama model) for development and air-gapped demos |
| Reranking | provider reranker in `cloud`; TEI locally, or plain RRF |
| Persistence | Mongo for audit and traces; Qdrant in local modes, Atlas chunks in cloud |
| Fine-tuning | local LoRA/QLoRA, documented in [`LOCAL-FIRST-PLAN.md`](LOCAL-FIRST-PLAN.md) |

| Data sensitivity | Target | Choice |
|------------------|--------|--------|
| Health / PII | On-premise / locked-down sandbox | `local` or `sovereign` |
| Public global good practice | Cloud allowed | `cloud` |
| Mixed documents | Hybrid | sensitivity router (option D, not shipped) |

Direct effect on the assessed metrics: **D10 `d10_m10` Data Sovereignty** and
**D11 `d11_m06` Edge Privacy** can be answered with the deployed mode and the
audit trail, not with a claim.
