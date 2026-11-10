# 10 — Security, compliance and audit

## 1. Threat model
| Id | Threat | Control |
|---|---|---|
| TM-01 | XSS through names or data | No `innerHTML`; `textContent`/attributes only; schema validation; existing CSP posture kept |
| TM-02 | Supply chain | Zero runtime dependencies in `@sps/worldmap`; pinned build tools; lockfile (`bun.lock`); CI dependency audit already runs per lockfile |
| TM-03 | Altered geometry | Manifest + chunk SHA-256 verified before use |
| TM-04 | SSRF via legal watch | Guarded fetcher (`docs/07` §3) |
| TM-05 | Prompt injection through fetched text | Data-only blocks, no tools, schema output, code-side excerpt check, human review |
| TM-06 | Audit tampering | Existing hash chain; World actions appended through `AuditService`; chain verification reused |
| TM-07 | Data leakage through queries | Template-only queries; never corpus or incident text |
| TM-08 | Resource exhaustion | Queue bounds, per-job timeout, participant cap, geometry caps, worker thread |
| TM-09 | Invented citations | Existing grounding post-condition (an answer with zero citations is invalid) applies to every job; watch excerpts verified in code |
| TM-10 | Misuse of the border/neutrality settings | Two-reviewer rule, audit |
| TM-11 | Secret exposure | Secrets stay in env/SOPS; never printed in logs, SSE, exports |
| TM-12 | Cross-operator exposure | Reports and settings operator-scoped; the *Shared reports* scope returns summary fields only and omits runs excluded by their owner, enforced and tested server-side (ADR-010) |
| TM-13 | Privilege misuse | `admin` required for settings, groups, `to-confirm` rights; RBAC-ready for roadmap M2 |

## 2. Audit
All World actions go through `AuditService.logAction` (hash-chained record: `id, runId, userId, ts, actor, action, target, lens, citations, hash, prevHash`). The canonical hash payload and its key order are a contract of `@sps/audit`; World mode **does not alter it**. New actions: `world.battle.*`, `world.job.*`, `world.settings.changed`, `world.group.change`, `world.watch.*`, `world.proposal.*`, `world.run.sharing.changed`. `runId` = battle-test id or underlying run id; `target` = `<country>[/<region>]`. Payload detail stays in the owning collection; the chain stores the reference. Console "Audit" page needs only new action labels in `lib/audit-labels.ts` (EN+FR).

## 3. Privacy
No personal data collected by World mode. Scenario data is synthetic. Operator e-mail appears only as `userId` already used by the audit log. Notification channels are not touched by World mode.

## 4. Rights and licences
| Item | Rule |
|---|---|
| Code | Apache-2.0 headers as elsewhere; every source file carries a role header comment (repository rule) |
| Project content | CC BY 4.0 (`LICENSE-CONTENT`) |
| Geodata | `ATTRIBUTION.md` generated; **no SimpleMaps file committed**; licences of Natural Earth/geoBoundaries verified before the first build |
| Corpus documents | Per-document `rights` (`official-text`, `open-licence`, `quotation-only`, `to-confirm`); watch obeys `docs/LICENSING.md` |
| Documentation | Generic: no hosted project names, team slugs, deployment ids, private hosts or credentials (`docs/RULES.md`) — use `<api-host>`/`<web-host>` placeholders |

## 5. AI governance
Disclaimers: "simulation, not legal advice" on results and exports; "no grounded data" never shown as a score; web-sourced material labelled "unverified" until reviewed. Model ids are recorded per job (and per step in the chain). Humans decide before anything web-sourced enters the corpus.

## 6. Requirements
REQ-S01 CSP-compatible, lint rule banning `innerHTML`/`eval` in `@sps/worldmap` · REQ-S02 geometry hash verification · REQ-S03 chain verifiable after World actions (test) · REQ-S04 zero runtime deps in the core · REQ-S05 SSRF/injection/oversize test suites · REQ-S06 no outbound request in `local` mode (test) · REQ-S07 no secrets in repo (existing git guard `make hooks`) · REQ-S08 admin-only settings and rights confirmation · REQ-S09 docs free of private hosts and names.
