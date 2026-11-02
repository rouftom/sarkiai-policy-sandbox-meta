# Data and model sovereignty

The engine runs on three interchangeable provider modes. They differ in where
the model calls go, not in what the engine does: the same agents, citation
validator, gap engine and audit chain sit on top. **Every model the system calls
at runtime is a Meta model**, in every mode.

| Mode | Reasoning and retrieval | Voice | Data leaving the institution |
|------|-------------------------|-------|-----------------------------|
| `cloud` | Meta Model API: the newest Muse Spark the key lists (`muse-spark-1.3` today), or `muse-wonder-1.0`; the agentic corpus search runs on that same model. SAM 3.1 handles scanned-gazette vision | Muse Voice Transcribe | prompts, retrieved passages, answers, audio |
| `sovereign` | **Muse Spark Open** on Baseten, or **Muse Glimmer 30B** on Ollama; the agentic corpus search runs on that same model | Muse Voice Transcribe (Meta Model API) | prompts and passages (Baseten) or nothing (Ollama) |
| `local` | **Muse Glimmer 30B** on Ollama; the agentic corpus search runs on that same model | Muse Voice Transcribe (Meta Model API) | nothing from reasoning; audio only if dictation is used |

The mode is a single environment variable (`SANDBOX_MODE`), recorded in the audit
chain as `provider.switched`, and each chain-of-thought step names the mode and
model that produced it. The console badge always shows which one is answering.

The model is one per mode: there is no separate embedding, reranking or
transcription model to pick. The corpus is searched lexically (BM25) and the
reasoning model plans the search, runs the sub-agents and ranks the result — see
[Agentic corpus search](../README.md#agentic-corpus-search).

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
| Corpus store | MongoDB: Atlas Search in `cloud`, a MongoDB text index in `local` and `sovereign` | Atlas-hosted / none |
| Operational store (audit, CoT) | MongoDB (self-hosted or Atlas) | none / Atlas-hosted |
| Chunking / ingestion | `packages/retrieval/src/atlas-ingest.ts`, inside the API process | none / Atlas-hosted |
| Search | Agentic lexical search (`packages/retrieval/src/agentic.ts`) on the model of the mode | none / provider |
| Reasoning | Muse Glimmer or Muse Spark Open locally; Muse Spark in cloud mode | none / provider |
| Vision (gazette pages) | SAM 3.1 on the Meta Model API | provider |
| Voice notes | Muse Voice Transcribe on the Meta Model API | provider |

In `local` mode the boundary is the machine: reasoning and retrieval never leave
it, and no key is required. In `sovereign` mode the reasoning model is either
local (Ollama) or an open-weight Meta model on Baseten. In `cloud` mode the
boundary is the Meta Model API, and the console says so on every screen through
the provider badge.

## 3. Sovereignty spectrum

| Level | Model | Egress | Quality | Cost | Ops |
|-------|-------|--------|---------|------|-----|
| 0 | Public global API | Total | ★★★★★ | per token | none |
| 1 | Regional cloud API | Regional | ★★★★ | paid | low |
| 2 | Self-hosted open weights (Ollama, vLLM) | None | ★★★ | infra (GPU/RAM) | medium |
| 3 | Dedicated on-premise / air-gapped open weights | None | ★★★ | infra | high |
| 4 | Local fine-tuning of open weights (LoRA/QLoRA) | None | ★★★★ | infra + time | high |

The project ships levels 2 and 4 (documented), and calls level 0 only when the
operator explicitly chooses cloud mode.

## 4. Options considered

### A. Local inference through Ollama
- **Muse Glimmer 30B**, Apache-2.0, multimodal, served by Ollama.
- Pros: zero egress, free, offline, deployable in a locked-down sandbox.
  Cons: ~32 GB of VRAM (or 48 GB+ unified memory), latency, operations.

### B. Self-hosted serving at scale
- **vLLM** or **llama.cpp** for multi-user throughput on GPU, serving the same
  Muse Glimmer weights.
- Relevant when the demo serves several delegates at once.

### C. Managed open-weight inference
- **Baseten** serves **Muse Spark Open** (`meta-models/muse-spark-open-1026`):
  open weights, managed infrastructure, same engine and audit trail.

### D. Hybrid routing by sensitivity
- A **policy router**: sensitive data → local Muse Glimmer; open data (global
  good practice) → Muse Spark when allowed.
- Consistent with the engine: sensitivity is already an attribute of the corpus
  (`country`, `docType`).

### E. Fine-tuning without exfiltration
- **LoRA/QLoRA** on Muse Glimmer. The dataset stays on-premise; only the public
  base weights and the adapter move.

## 5. Decision implemented

Three modes, one engine, one switch:

| Element | Decision |
|---------|----------|
| `cloud` | Meta Model API for reasoning, vision and voice; corpus in MongoDB Atlas with Atlas Search. Used by the public demo. |
| `sovereign` | **Muse Spark Open** on Baseten, or **Muse Glimmer 30B** on Ollama: same behaviour, reasoning on open weights |
| `local` | **Muse Glimmer 30B** on Ollama, no key, nothing leaves the host |
| Search | Agentic lexical search on the model of the mode; `RETRIEVAL_DEPTH` sets `lexical`, `fast` or `deep` |
| Persistence | MongoDB for the corpus, the audit chain and the traces |
| Fine-tuning | local LoRA/QLoRA on Muse Glimmer |

| Data sensitivity | Target | Choice |
|------------------|--------|--------|
| Health / PII | On-premise / locked-down sandbox | `local` or `sovereign` |
| Public global good practice | Cloud allowed | `cloud` |
| Mixed documents | Hybrid | sensitivity router (option D, not shipped) |

Direct effect on the assessed metrics: **D10 `d10_m10` Data Sovereignty** and
**D11 `d11_m06` Edge Privacy** can be answered with the deployed mode and the
audit trail, not with a claim.
