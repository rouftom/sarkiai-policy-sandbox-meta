# Roadmap

## Hackathon timeline

| Date | Milestone |
|------|-----------|
| 26 Oct 2026 | Kickoff · baseline tag `pre-hackathon-baseline` · public repository |
| 27 Oct – 3 Nov 2026 | Building period (feature freeze 2 Nov, 20:00 WAT) |
| **4 Nov 2026, 21:00 ET** | **Submission:** public repo + 3-minute demo video |
| 5–8 Nov 2026 | Judging period |
| 9 Nov 2026 | Top 10 announced, live final round |
| 16 Nov 2026 | Community-vote winner announced |

## Sprints (from scaffold to submission)

### Sprint 0: foundations (pre-hackathon baseline)

Everything below existed before the hackathon (tag `pre-hackathon-baseline`).
- `[x]` Monorepo, Docker all-in-one + individual, lens profiles.
- `[x]` Jurisdiction-aware ingestion (adapted, `country`/`jurisdiction`).
- `[x]` Hybrid retrieval + RRF + local TEI rerank (optional).
- `[x]` Agent registry, orchestrator, mandatory-citation prompt.
- `[x]` Progressive scenario engine.
- `[x]` Readiness gap engine (13 dimensions / 6 factors).
- `[x]` 0–5 maturity scoring + weighted composite (`packages/readiness/src/scoring.ts`).
- `[x]` Causal what-if propagation across dimensions (`packages/readiness/src/causal.ts`).
- `[x]` African/regional reference corpus (`data/global/africa/`, `scripts/fetch-corpus.sh`).
- `[x]` Hash-chained audit + persisted CoT traces.
- `[x]` **Local-first / sovereign**: Ollama (qwen3.5:9b) + local bge-m3 embeddings; **all cloud providers removed**; local faster-whisper. See `docs/LOCAL-FIRST-PLAN.md`, `docs/SOVEREIGNTY-AND-MODELS.md`.
- `[x]` **Admin design system** replicated in `@sps/theme` (packs fada/green/ocean/sunset/mono, fada default): assistant uses SarkiAI Compact.
- `[x]` **MinIO** local object bucket (`sps-attachments`) for assistant image attachments.
- `[x]` **SOPS + age** secrets workflow (`docs/SECRETS.md`, `scripts/gen-age-key.sh`).
- `[x]` **Multimodal assistant**: local vision model (`qwen3.5:9b`), image attachments stored in MinIO (content-addressed), untrusted-context guardrails, audit hash. `POST /v1/agents/ask` + `attachments[]`.

### Sprint 1: the Cameroon health corpus
- `[x]` Collect real CM corpus (health law, data-protection law, national AI/digital strategy, cyber strategy) → `data/country/cm/`.
- `[ ]` Collect global best-practice corpus (WHO) → `data/global/standards/`.
- `[x]` Ingest + validate retrieval quality per dimension (8 documents, 2,166 chunks, 1024d; see `docs/KNOWLEDGE-BASE.md`).
- `[ ]` Replace `data/samples/*` placeholders.

### Sprint 2: scenario authoring & coordination
- `[ ]` Author 3 progressive scenarios (health breach, cross-border telehealth, AI triage failure) with asymmetric `visibleTo`.
- `[x]` Coordinator reconciliation step (joint situation report): `packages/agents/src/coordinator.ts`.
- `[x]` `onBeforeRelease` facilitator hook: `POST /v1/scenarios/start` + `/:runId/next` + "Mode facilitateur" in the console.

### Sprint 3: auditability & evidence
- `[x]` Export a run dossier (audit + CoT + reports + citations): `packages/report`, `GET /v1/audit/dossier/:runId`.
- `[x]` Multi-agent coordinator + conflict visualization in the web console.
- `[x]` Surface `verifyChain()` + chain-of-thought trace viewer in the web app (`AuditPanel`).
- `[x]` Readiness 0–5 scoring + causal what-if in the web console.

### Sprint 4: demo & submission
- `[ ]` Record the 3-minute demo video (runbook in `docs/DEMO.md`).
- `[x]` Finalize `HACKATHON.md` (built-during-the-hackathon ledger) and the README.
- `[x]` Publish the repository and the public demo (address in the deployment notes).
- `[ ]` Submit (repo + video) before 4 Nov 2026, 21:00 ET.

### Sprint 5: fine-tuning (post-shortlist)
- `[ ]` **Fine-tuning local (unsloth)**: export (KB context → cited answer) pairs from Mongo (`cot_traces`, `joint_reports`, readiness) → train a LoRA on **Muse Glimmer** with [unsloth](https://github.com/unslothai/unsloth) → merge + convert to GGUF → `ollama create sps-glimmer` → `MUSE_GLIMMER_MODEL=sps-glimmer`. The dataset never leaves the institution.

## Hackathon sprints (27 Oct – 4 Nov 2026)

| # | Feature | Meta model | Day |
|---|---------|-----------|-----|
| N1 | Multi-provider layer (`cloud` / `sovereign` / `local`), provider badge, `provider.switched` audit event | Muse Spark | 27 Oct |
| N2 | Citation validator: a quote absent from the corpus is rejected and the agent retries | Muse Spark | 28 Oct |
| N10 | Demo UI: incident timeline, clickable citations, provider badge, audit-chain check |: | 28 Oct |
| N3 | Scanned gazette ingestion: column segmentation, `sam-3.1` zones, per-zone transcription, clickable provenance | SAM 3.1 + Muse Spark vision | 29 Oct |
| N5 | Sovereign mode on open weights | Muse Glimmer (Ollama) | 30 Oct |
| N4 | WhatsApp channel: joint reports, deadline alerts, human approval buttons |: | 31 Oct |
| N6 | WhatsApp voice notes → timestamped facts | Muse Voice Transcribe | 1 Nov |
| N7 | Impact analysis: new legislation re-evaluates open incidents | Muse Spark | 1 Nov |
| N8 | Crisis exercise mode with timed injects and after-action report | Muse Spark / open weights | 2 Nov |

Cut order if late: N8 → N7 → N6. Never cut N1, N2, N3, N4, N5, N10.

## Open gaps carried from the parent platform

These were identified in the reuse audit and are planned, not inherited:

1. `country` end-to-end: **done** in the ingestion schema + index + retrieval.
2. Legal/policy agent: **done** (mandates + prompt).
3. Citation policy inverted: **done** (citations mandatory).
4. OCR for scanned gazettes: **done** (service + fallback).
5. Planner vs. router: **in progress** (coordinator reconciliation).
6. CoT as a durable artifact: **done** (`cot_traces`).
