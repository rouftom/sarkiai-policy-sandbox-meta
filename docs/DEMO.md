# Demo video: shot list

**Watch it:** https://youtu.be/yAD7Qp7JQHQ (2:30, English voice-over and subtitles).

The video shows **only what was built during the hackathon** (see
[`HACKATHON.md`](../HACKATHON.md)) and the Meta models doing real work: Muse
Spark, Muse Spark Open on Baseten, SAM 3.1, Muse Voice Transcribe and the Meta
`web_search` tool. The retrieval playground is not in the video. A 2:18 cut
without section cards and without the live-demo end card is used for X.

## The story

A health-data leak at a fictional regional hospital in Cameroon. Four
institutions must respond under their own laws. A new decree arrives on paper.
The same agents move to open weights. The ministry measures its AI readiness and
rehearses the next crisis. The focal point is notified on WhatsApp.

## Shot list

Timecodes are those of the YouTube chapters. Each sequence opens with a
one-second section card. Waiting time is sped up in the edit; nothing displayed
by the application is altered.

| Time | Sequence | What is on screen | Hackathon work | Meta models |
|---|---|---|---|---|
| 0:00 | Title | Project name and one-line pitch | | |
| 0:10 | 1 · A crisis cell, on Muse Spark | Crisis scenario: live process graph of the mandated agents, a cited source opened, the joint report with conflicting mandates | N1, N2, N10 | Muse Spark |
| 0:36 | 2 · A new decree, on paper | Gazette tab: sample page segmented into columns and zones, SAM 3.1 artefacts (stamp 0.855, table 0.816) shown in a zoom, per-zone transcription, page added to the corpus, impact analysis on the open incidents | N3, N7 | SAM 3.1, Muse Spark |
| 0:59 | 3 · Same engine, open weights | Model menu: Muse Spark Open (Baseten) selected; audit trail records the change; a question dictated in French; answer with citations, an unfound quote reported as a gap | N5, N6, N2 | Muse Spark Open, Muse Voice Transcribe |
| 1:21 | 4 · AI readiness, live | New assessment: web search on Muse Spark, evaluation and synthesis on Muse Spark Open; two sectors assessed with live agent graphs; sector comparison | N12 | Muse Spark, Muse Spark Open, `web_search` |
| 1:44 | 5 · Rehearse the next crisis | Timed injects, actions logged by the team, rule-based score, after-action report | N8 | Muse Spark |
| 2:03 | 6 · The focal point is notified | Split screen: approval request sent from the console, WhatsApp message received on the phone; audit trail with integrity verified | N4 | WhatsApp Cloud API |
| 2:19 | End card | Meta models used, live demo, repository | | |

Two honest notes on the cut:

- **Impact analysis (sequence 2).** The sample decree cites no instrument used by
  the open simulation, so the panel answers *"No open incident is affected by
  this provision"*. The voice-over presents it as such: the agent flags only the
  runs that cite the same law, and invents no impact.
- **Approval (sequence 6).** The cut stops at the reception of the WhatsApp
  message. The signed, single-use approval page is part of N4 and can be tested
  in the console; it is not filmed.

The phone number of the recipient is blurred in the edit.

## Voice-over

Generated with ElevenLabs (voice "Chris"), about 330 words. Music: "Business
Marketing" by atlasaudio (Pixabay licence).

| Sequence | Text |
|---|---|
| Title | When patient records leak from a public hospital, four institutions must act, each under its own law. |
| 1 | SarkiAI Policy Sandbox turns that moment into a crisis cell. Each institution is an agent with a legal mandate, running on Muse Spark. As the incident unfolds, every claim must quote the law, and a quote that is not in the corpus is rejected. The coordinator then merges the four views into one joint report, and flags where mandates collide: who notifies the patients, and by when. |
| 2 | Much of African law still lives on scanned paper. SAM 3.1 finds the stamps, signatures and tables, so they never pollute the text, and Muse Spark transcribes each zone. Once the decree joins the corpus, the system checks the running incidents, and only flags those that cite the same law. No false alarms. |
| 3 | A ministry cannot always send an incident to the cloud. One switch, and the same agents run on Muse Spark Open, Meta's open-weight model, served by Baseten. The audit trail records the change. Officials can simply ask, in French, by voice, and every answer is checked against the law. |
| 4 | Before the next crisis, how ready is the country? One agent per dimension assesses thirteen dimensions, sector by sector, live. Muse Spark searches the web for current evidence, Muse Spark Open scores and writes the synthesis, and the sectors are compared side by side. |
| 5 | Teams can also rehearse. Injects arrive on a clock, the team logs what it does, and the score is computed by rules, not by the model: addressed, late, or missed. The model only writes the after-action report. |
| 6 | When a joint report is ready, the focal point is notified on WhatsApp, with the request and a signed, single-use link. Every send lands in the same hash-chained audit trail as every agent step. |
| End | Laws, institutions, open weights, and a trail anyone can verify. Built for Cameroon. Ready for the next country. |

## Re-taking a sequence

### Pre-flight checks

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

Record each segment as a separate take. Waiting time can be sped up in the edit.

## What must not appear on screen

- Passwords, TOTP or recovery codes, API keys, environment values, database URIs.
- Any real phone number other than the operator's own test device, and no real
  person's data. The scenario, people and hospital are fictional.
- Third-party documents marked `quotation-only` or `to-confirm` in the manifest.

## What to say if asked

| Question | Answer |
|---|---|
| What was built during the hackathon? | Everything in [`HACKATHON.md`](../HACKATHON.md), with commits and times. The engine is imported as the first commit; N1 to N12 are the hackathon work (N9 dropped, as stated). |
| Where does the open-weight model run, and what does it do? | Muse Spark Open runs on Baseten and takes over all reasoning (agents, coordinator, citation retries, impact analysis, exercise narrative). Muse Glimmer runs on the institution's hardware through Ollama. See the README section *Open weights*. |
| Why Voyage for retrieval? | Meta publishes neither an embedding nor a reranking model. `voyage-4` and `rerank-2` only rank passages: they generate no text and take no decision. Every reasoning, vision, segmentation and speech step runs on Meta, and the citation validator checks every quote against the corpus anyway. |
| Is the corpus real? | The manifest is the Cameroon national corpus. Laws and decrees are official texts; other works keep their own terms, and each manifest entry carries a `rights` status. The demo gazette page is a generated sample. |
| Is this a RAG app? | No: retrieval is a component. The product is mandated agents, a coordinator that detects conflicts, a citation validator, legislative impact analysis, a scored exercise, a live AI-readiness assessment and an audited WhatsApp notification. |
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
