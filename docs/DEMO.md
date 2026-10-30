# Demo sheet: 3 minutes, one operator

A recording plan that shows the engine, not the slides: a policy-grounded joint
report, the RAG that backs it, and the human decision loop on WhatsApp. Everything
below runs on the public deployment; nothing is mocked, and every number on
screen comes from the live corpus.

Judging weights this sequence targets: **Impact 30%** (a decision cell gets a
cited answer in seconds), **Meta tooling 25%** (Meta Model API, WhatsApp Cloud
API, approved templates), **Depth 20%** (chunking, hybrid retrieval, citation
validation, audit chain), **Demo 25%** (a story with a visible causality).

## Before recording (T-15 min)

The hosted console is <https://sps.djotta.com>; signing in for the first time
(account, password change, TOTP, workspace) is described in
[the README](../README.md#first-connection). The API is addressed below through a
placeholder: substitute the host of the deployment under test.

```bash
API=https://<api-host>
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
      Light theme on the default `meta` pack (Meta blue).
- [ ] A second device with WhatsApp open, if the approval segment is recorded
      live; otherwise use `dryRun` and show the payload.
- [ ] API warm: hit `/health` once, 40 s before recording (free plan cold start).

Cold start is the only real failure mode. If the first click spins, keep talking
over the provider badge; it recovers.

## What must not appear on screen

- Passwords, TOTP codes, recovery codes, API keys, environment values, database
  URIs or host credentials.
- Real patient data or any nominal health record. The scenario, its people and
  its institutions are fictional; the corpus is regulatory.
- Third-party documents whose manifest entry is `quotation-only` or
  `to-confirm`. Cite them only as short quotations with the issuer and the
  source URL; do not open the payload on screen. See
  [`LICENSING.md`](LICENSING.md).

## Shot list

No narration to read: each segment lists what to open, what to click and the
proof the viewer should see.

### 0:00–0:20: Framing (overview)

- Open `/`.
- Point at the provider badge (**Meta Model API · cloud**) and the corpus counter.
- Proof shown: a live deployment on the Meta Model API with a real corpus, not a
  slide.

Do not tour the menu.

### 0:20–1:35: Joint report that cites the law

`/console` → **Simulation**.

1. Pick the country/domain in the workspace bar (Cameroon · health).
2. Start the scenario, then release the next tick.
3. Let the mandated agents answer (the assistant streams its draft behind a
   processing bar, then swaps in the validated answer), then the coordinator.
   Open one institution card and then the **joint report**.
4. Click a citation: it opens the chunk, with filename, article and heading path.
5. Touch the audit chain: the run is hash-chained, and an agent whose quote is
   absent from the corpus is rejected and retried (`@sps/citations`).

Proof shown: every claim resolves to a provision, and the chain of custody is
visible. Keep this segment to one tick; resist scrolling the whole report.

### 1:35–2:25: The RAG is real (knowledge base)

`/knowledge`.

1. **Corpus**: the documents, active chunks, vector dimension and both Atlas
   indexes `READY` (read the live counters, do not assume a number).
2. **Retrieval**: ask `protection des donnees personnelles sante`, country
   Cameroon. Then switch the stage chips:
   - **Dense · vector**: candidates with `vectorSearchScore`;
   - **Sparse · BM25**: candidates, accent-folded analyser;
   - **Fusion · RRF**, then **Rerank · Voyage**: the final context.
3. Point at the timings and the filter (`isActive`, `country`, `docType`).
4. **Vectorise** shows the six-step journal, content hashes, and why re-running
   is free.

Proof shown: hybrid retrieval, RRF and cross-encoder rerank are inspectable
rather than asserted.

### 2:25–2:55: The decision stays human (WhatsApp)

`/console` → **Communications** (or the run's WhatsApp action).

1. Send the **approval request** template (or `dryRun` payload on screen).
2. Open `/approve/:token` on the phone: the signed link shows the summary, one
   approve/reject, one note. Decide.
3. Return to `/audit`: the decision is written once to `whatsapp_approvals`, the
   event is appended to the chain, and the link cannot be replayed.

Proof shown: a human decision, with a single-use signed link and an audit event.

### 2:55–3:00: Close

`/audit`: the chain is valid, and the last events are the run, the retrieval
calls and the approval. End on the deployed mode and the same engine on open
weights, with no data leaving the institution.

## What to say if asked

| Question | Answer |
|---|---|
| Is the corpus real? | The manifest is the Cameroon national corpus; scanned instruments without a text layer are routed through the Gazette screen, never silently ingested. |
| Why Voyage for embeddings? | Cloud mode pairs the Meta reasoning, vision and voice models with Voyage `voyage-4` + `rerank-2` over Atlas Vector Search. The corpus contract is backend-neutral, so `bge-m3` + Qdrant replaces it unchanged in `local` and `sovereign` modes. |
| What happens if Atlas is down? | Ingestion and search surface the error; the badge and `/knowledge` show the index state; the rest of the console still boots. |
| Is the audit tamper-proof? | It is hash-chained and verifiable (`/audit`), with legacy hashes accepted so old records stay valid; it is not a blockchain. |
| Two lenses or three? | Two lenses: error-scenario simulation and AI-readiness assessment. `hybrid` is a third workflow profile that composes them; WhatsApp, voice, impact analysis and the table-top exercise are capabilities of the same engine, not separate lenses. |
| Are you allowed to use the corpus? | The repository does not redistribute source documents: third-party payloads are git-ignored, and only manifests plus our own samples are versioned. Laws, decrees and regulations are official texts, generally outside copyright; other works keep their own terms and are used under their licence, by permission, or as short attributed quotations. Each manifest entry carries a `rights` status. |
| Could the demo be mistaken for a generic RAG app? | The product is a multi-agent policy engine with mandated institutions, citation validation, a readiness gap engine and an audited human decision loop; retrieval is a component, not the product. |

## After the take

```bash
curl -s $API/v1/kb/status | jq '.totals, .embedding'
git status --short     # should be clean
```

Check the API host's logs for the run (last 200 lines): bootstrap messages and
index state, no stack traces. Keep the take that shows a real score, not a
sped-up one.

To return the demo to a clean slate without touching the corpus:

```bash
bun run demo:reset -- --dry-run
bun run demo:reset -- --yes
```

When the database is unreachable from your shell, run the same wipe from the
service itself: commit `apps/api/scripts/reset-on-boot.flag`, wait for the
deploy to go live, then delete the flag and deploy again. The API logs
`demo reset executed at boot` with the total deleted.
