# Demo runbook — 3 minutes, one operator

A recording plan that shows the engine, not the slides: a policy-grounded joint
report, the RAG that backs it, and the human decision loop on WhatsApp. Everything
below runs on the public deployment; nothing is mocked, and every number on
screen comes from the live corpus.

Judging weights this sequence targets: **Impact 30%** (a decision cell gets a
cited answer in seconds), **Meta tooling 25%** (Meta Model API, WhatsApp Cloud
API, approved templates), **Depth 20%** (chunking, hybrid retrieval, citation
validation, audit chain), **Demo 25%** (a story with a visible causality).

## Before recording (T-15 min)

```bash
API=https://sps-api-sbn6.onrender.com
curl -s $API/health
curl -s $API/v1/kb/status | jq '{totals, indexes: [.indexes.indexes[] | {name, status, queryable}]}'
curl -s $API/v1/provider | jq '{mode, models, ready}'
```

- [ ] `health.status = ok`, `provider.mode = cloud`, `ready = true`.
- [ ] `totals.activeChunks > 0` and **both** indexes `READY` + `queryable`. If one
      is `BUILDING`, wait; if missing, press **Create / repair indexes** on
      `/knowledge`.
- [ ] Signed in **before** recording: password + TOTP are not part of the story.
      Keep the recovery codes out of frame. If you need a fresh account,
      `/signup` (cloud mode) creates one and walks straight into TOTP enrolment.
- [ ] Lost the password? `/forgot-password` mails a single-use 30-minute link
      (requires `AUTH_RESEND_KEY`); TOTP stays enrolled.
- [ ] Browser: one window, zoom 110%, bookmarks bar hidden, notifications off.
      Light theme (the default "Défaut" pack, blue) is the default.
- [ ] A second device with WhatsApp open, if the approval segment is recorded
      live; otherwise use `dryRun` and show the payload.
- [ ] API warm: hit `/health` once, 40 s before recording (free plan cold start).

Cold start is the only real failure mode. If the first click spins, keep talking
over the provider badge; it recovers.

## The script

### 0:00–0:20 — Framing (overview)

Open `/`. Say what the product is in one sentence: *a policy sandbox where
mandated institutions must answer from the national corpus, and every claim is
citable and audited.*

Point at the provider badge: **Meta Model API · cloud**, and at the corpus
counter. Do not tour the menu.

### 0:20–1:35 — Use case 1: a joint report that cites the law

`/console` → **Simulation**.

1. Pick the country/domain in the workspace bar (Cameroon · health).
2. Start the scenario, then release the next tick.
3. Let the mandated agents answer (the assistant streams its draft behind a
   processing bar, then swaps in the validated answer), then the coordinator.
   Open one institution card and then the **joint report**.
4. Click a citation: it opens the chunk, with filename, article and heading path.
5. Say the differentiator: *an agent whose quote is absent from the corpus is
   rejected and retried* (`@sps/citations`), and the run is hash-chained.

Keep this segment to one tick. Resist scrolling the whole report.

### 1:35–2:25 — Use case 2: the RAG is real (knowledge base)

`/knowledge`.

1. **Corpus**: 25 documents, ~4,900 active chunks, 1024-dimension vectors, both
   Atlas indexes `READY`. One line: *this is the corpus the previous answer cited.*
2. **Retrieval**: ask `protection des donnees personnelles sante`, country
   Cameroon. Then switch the stage chips:
   - **Dense · vector** — 100 candidates with `vectorSearchScore`;
   - **Sparse · BM25** — 100 candidates, accent-folded analyser;
   - **Fusion · RRF**, then **Rerank · Voyage** — the final context.
3. Point at the timings and the filter (`isActive`, `country`, `docType`).
4. One sentence on ingestion: **Vectorise** shows the six-step journal, content
   hashes, and why re-running is free.

This is the depth segment: hybrid retrieval, RRF, cross-encoder rerank, all
inspectable rather than asserted.

### 2:25–2:55 — Use case 3: the decision stays human (WhatsApp)

`/console` → **Communications** (or the run's WhatsApp action).

1. Send the **approval request** template (or `dryRun` payload on screen).
2. Open `/approve/:token` on the phone: the signed link shows the summary, one
   approve/reject, one note. Decide.
3. Say: *the decision is written once to `whatsapp_approvals`, appended to the
   audit chain, and the link cannot be replayed.*

### 2:55–3:00 — Close

`/audit`: the chain is valid, and the last events are the run, the retrieval
calls and the approval. One sentence: *same engine on open weights, nothing
leaves the institution.*

## What to say if asked

| Question | Answer |
|---|---|
| Is the corpus real? | The manifest is the Cameroon national corpus; scanned instruments without a text layer are routed through the Gazette screen, never silently ingested. |
| Why Voyage and not a Meta embedding model? | Meta publishes no embedding model; reasoning/vision are Meta, embeddings are Voyage, and the corpus contract is backend-neutral so `bge-m3`/Qdrant replaces it on-premise. |
| What happens if Atlas is down? | Ingestion and search surface the error; the badge and `/knowledge` show the index state; the rest of the console still boots. |
| Is the audit tamper-proof? | It is hash-chained and verifiable (`/audit`), with legacy hashes accepted so old records stay valid; it is not a blockchain. |

## After the take

```bash
curl -s $API/v1/kb/status | jq '.totals, .embedding'
git status --short     # should be clean
```

Check Render logs for the run (`render logs -r srv-dbfvq1e1egvs73a6j4eg --limit 200`)
— bootstrap index messages, no stack traces. Keep the take that shows a real
score, not a sped-up one.

To return the demo to a clean slate without touching the corpus:

```bash
bun run demo:reset -- --dry-run
bun run demo:reset -- --yes
```

From a machine that cannot reach the cluster (or a Render free instance, where
SSH and one-off jobs are refused), commit `apps/api/scripts/reset-on-boot.flag`,
wait for the deploy to go live, then delete the flag and deploy again.
