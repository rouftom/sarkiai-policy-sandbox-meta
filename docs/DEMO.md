# Demo sheet: 3 minutes, one operator, one voice-over

The video shows **only what was built during the hackathon** (see
[`HACKATHON.md`](../HACKATHON.md)) and the Meta models doing real work: Muse
Spark, SAM 3.1, Muse Voice Transcribe, and **Muse Spark Open on Baseten**.
The retrieval playground and the readiness lens are not in the video.

Judging weights this sequence targets: **Impact 30%** (a real institutional
problem, a real country, a real legal corpus), **Meta tooling 25%** (five Meta
models, each with a visible job), **Depth 20%** (citation validator, deterministic
scores, hash-chained audit), **Demo 25%** (one story, told end to end).

## The story

A health-data leak at a fictional regional hospital in Cameroon. Four
institutions must respond under their own laws. A new decree arrives mid-incident.
The ministry rehearses the next one on open weights. A human signs off on WhatsApp.

## Before recording (T-30 min)

The hosted console is `https://<web-host>`; sign-in is described in the
[README](../README.md#first-connection). Replace `<api-host>` below.

```bash
API=https://<api-host>
curl -s $API/health
curl -s $API/v1/provider | jq '{mode, models, ready}'
curl -s $API/v1/notifications/status | jq
```

- [ ] `health.status = ok`, `provider.mode = cloud`, `ready = true`.
- [ ] The model menu (assistant **+** menu) lists a Muse Spark model **and**
      `meta-models/muse-spark-open-1026` (Baseten). Select Muse Spark before the take.
- [ ] WhatsApp templates `meta_hackathon_*` are **APPROVED**. If not, record the
      approval segment as a session reply: the focal-point phone writes to the
      number first, then the approval link is sent as free text (24-hour window).
- [ ] **One simulation run already exists** for Cameroon · health, with at least one
      released tick, started under Muse Spark. The impact segment needs it.
- [ ] One exercise is authored on `/exercise`, not started.
- [ ] **Nobody else is signed in.** The model choice is global to the engine: another
      operator changing it during the take changes it for you. Record outside demo
      hours, or on a deployment where public sign-up is off.
- [ ] Browser: one window, zoom 110%, bookmarks bar and notifications off, light
      theme, `meta` pack. Phone: WhatsApp open, do-not-disturb on.
- [ ] API warm: hit `/health` 40 s before recording (free plan cold start).

Record each segment as a separate take and cut them together. Speed up waiting
time (×4 max) and say so on screen ("sped up").

## What must not appear on screen

- Passwords, TOTP or recovery codes, API keys, environment values, database URIs.
- Any real phone number other than the operator's own test device, and no real
  person's data. The scenario, people and hospital are fictional.
- Third-party documents marked `quotation-only` or `to-confirm` in the manifest.

## Shot list and voice-over

The voice-over is generated (ElevenLabs, English, calm documentary tone) from the
lines below: about 330 words, which leaves room for pauses in 3 minutes. Each
paragraph is timed to its segment.

### 0:00–0:15 · Hook

Screen: overview page, provider badge **Meta Model API**. On-screen text:
*Everything shown was built during the hackathon.*

> When patient records leak from a public hospital in Cameroon, four institutions
> share the response: health, data protection, telecoms and cyber security. The
> deadlines are in the law, but nobody has the full picture. We built a crisis cell
> that runs on Meta models and answers with the law itself.

### 0:15–0:55 · Joint report on Muse Spark (N1, N2, N10)

Screen: `/scenarios` → the prepared run → **release the next tick**.

1. The mandated agents stream their assessments; the badge reads Muse Spark.
2. Show one **rejected citation** and the agent's retry.
3. Open the **joint report**: obligations, deadlines, the **conflicts** block.
4. Click one citation: the provision opens.

> Each institution is an agent with a legal mandate, running on Muse Spark. Every
> claim must quote the law. Here, a quote that does not exist in the corpus is
> rejected, and the agent has to try again. The coordinator merges the four views
> into one joint report, and flags where mandates collide: who notifies the
> patients, and by when.

### 0:55–1:35 · A new decree on paper (N3, N7)

Screen: `/knowledge` → **Gazette** tab → **Sample page** → **Analyze**.

1. The overlay: columns, zones, and the **SAM 3.1** artefacts (stamp, signature,
   table) circled in green. Hover one artefact to show its label.
2. Open two zones: the per-zone transcription.
3. **Add to corpus**, then **Analyze impact**: the open run is listed with its
   severity, the reason, the action and the deadline change.

> Much of African law still lives on scanned paper. SAM 3.1 finds the stamps,
> signatures and tables on the page, so they never pollute the text, and Muse Spark
> reads each zone separately. Once the decree joins the corpus, the system checks
> the incidents already running. It finds ours, and tells us which deadline just
> changed and what has to be redone.

### 1:35–2:05 · Same engine, open weights (N5, N6)

Screen: assistant **+** menu → select **Muse Spark Open (Baseten)**.

1. The badge changes. Release the next tick on the same run: the agents now answer
   on Muse Spark Open.
2. Open `/audit`: the `model.selected` event and the reasoning steps carry
   `meta-models/muse-spark-open-1026`.
3. In the assistant, **dictate a question in French** (microphone): Muse Voice
   Transcribe writes it, Muse Spark Open answers with citations.

> A ministry cannot always send an incident to a cloud. One switch, and the same
> agents run on Muse Spark Open, Meta's open-weight model, served by Baseten, or on
> Muse Glimmer on the institution's own hardware. The audit chain records which model
> produced every step. And officials can simply speak, in French.

### 2:05–2:30 · Rehearse the next crisis (N8)

Screen: `/exercise` → start the authored exercise → release two injects → log one
action → **end** → after-action report.

> Before the next crisis, the team trains on its own scenarios. Injects arrive on a
> clock, the team logs what it does, and the score is computed by rules, not by the
> model: addressed, late or missed, against the legal deadlines. The model only
> writes the narrative. It cannot change the score.

### 2:30–2:52 · A human decides (N4)

Screen: `/communications` → WhatsApp → **approval request** for the run → phone:
the template arrives → tap the link → `/approve/:token` → **Approve** with a note →
back to `/audit`.

> Nothing is published without a person. The focal point gets the request on
> WhatsApp, opens a signed link that works once, and decides. The decision lands in
> the same hash-chained audit trail as every agent step.

### 2:52–3:00 · Close

Screen: `/audit` → **chain valid**. End card: the five Meta models, the repository URL.

> Laws, institutions, open weights, and a trail anyone can verify. Built for
> Cameroon, ready for the next country.

## What to say if asked

| Question | Answer |
|---|---|
| What was built during the hackathon? | Everything in [`HACKATHON.md`](../HACKATHON.md), with commits and times. The baseline engine is the first commit. |
| Where does the open-weight model run, and what does it do? | Muse Spark Open runs on Baseten and takes over all reasoning (agents, coordinator, citation retries, impact analysis, exercise narrative). Muse Glimmer runs on the institution's hardware through Ollama. See the README section *Open weights*. |
| Why Voyage for retrieval? | Meta publishes neither an embedding nor a reranking model. `voyage-4` and `rerank-2` only rank passages: they generate no text and take no decision. Every reasoning, vision, segmentation and speech step runs on Meta, and the citation validator checks every quote against the corpus anyway. |
| Is the corpus real? | The manifest is the Cameroon national corpus. Laws and decrees are official texts; other works keep their own terms, and each manifest entry carries a `rights` status. The demo gazette page is a generated sample. |
| Is this a RAG app? | No: retrieval is a component. The product is mandated agents, a coordinator that detects conflicts, a citation validator, legislative impact analysis, a scored exercise and an audited human decision. |
| Is it medical advice? | No. The scenario is a data breach; the system never advises on care. |

## After the take

```bash
git status --short     # should be clean
```

Switch the model back to Muse Spark. To return the demo to a clean slate without
touching the corpus:

```bash
bun run demo:reset -- --dry-run
bun run demo:reset -- --yes
```
