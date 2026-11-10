# 13 — Risks and open questions

## 1. Risk register (P = probability, I = impact: L/M/H)
| Id | Risk | P | I | Mitigation |
|---|---|---|---|---|
| R-01 | Geodata licence | L | H | Natural Earth public-domain text verified; no SimpleMaps file; CI attribution check; geoBoundaries unused until read |
| R-02 | World-mode code reaches GitHub before 10 November | L | H | Decision D11: local branches, no push, no PR; keep `make hooks`; verify no remote push in the working copy |
| R-03 | Few grounded countries make the map look empty | M | H | Pilot countries US and FR onboarded in the content track; explicit "Not assessed" state; demo mode |
| R-04 | Ungrounded scores mistaken for measurements | M | H | Coverage/confidence rules, hatch state, ranking gate (`docs/05`) |
| R-05 | Scope creep (map + queue + watch) | H | H | Phasing, acceptance per version, Could items parked |
| R-06 | Single-developer capacity | H | M | Docs, tests, modular packages, content tasks delegated |
| R-07 | Queue complexity (restart recovery, fairness) | M | M | Persisted jobs, stub-engine tests, chaos test |
| R-08 | Model credit/cost blow-up from multi-country runs | M | M | Gate leasing, caps, pre-flight estimate, `RUN_BUDGET_USD` alert, local-mode concurrency 1 |
| R-09 | Local hardware cannot run many countries | H | M | Concurrency default 1 in `local`; per-job timeout; honest queue display |
| R-10 | Legal-watch security (SSRF, injection) | M | H | Guarded fetch, data-only extraction, code verification, human review, test suites |
| R-11 | Rights violations when ingesting web texts | M | H | Rights value mandatory; `to-confirm` needs admin; excerpt-only proposals |
| R-12 | Geopolitical sensitivity of borders/names | M | H | Policy, sensitive list, two reviewers, export notice |
| R-13 | Inconsistent admin-1 levels across countries | H | M | Level policy; visible administrative label; FR aggregated to regions |
| R-14 | Framing and readability of countries with far-flung parts (FR, US) | M | M | `focusBBox`, chips, optional insets (ADR-014) |
| R-15 | Shared scope leaking report content, or an excluded run still visible | L | H | Summary-only projection and the `sharing` filter enforced server-side; tests prove no report text, no operator and no excluded run in `shared` or in insights |
| R-16 | Estimates drift (spec not yet confronted with code) | H | M | Re-estimate after W-03; gates |
| R-17 | Run variance makes comparisons noisy | M | M | Heterogeneity warnings, run history, model ids recorded |
| R-18 | "Simulation" confused with legal advice | M | H | Disclaimers on every result and export |
| R-19 | US/EU law structure (federal vs state; EU-level texts applying to FR) strains the corpus taxonomy | M | M | `subnational` + `subdivision` (D12), reference namespace `eu`, country jobs exclude subnational by default |
| R-21 | The `Jurisdiction` change touches many files (types, schemas, retrieval, index, web labels) | M | M | Ticket T-060 (4 days), optional fields only, tests, index script update |
| R-20 | Natural Earth source typos/defects reach the UI | M | L | Own names files; CI name checks |

## 2. Resolved
| Question | Decision |
|---|---|
| Front/back stack, corpus, settings, agents, audit, hardware | Resolved by the repository analysis (see `docs/14`) |
| 429 gate | Existing and env-configurable; orchestrator adds a queue and runtime-configurable caps (`docs/06` §5) |
| **Q-02** shared summaries | **A select chooses *My reports* (default) or *Shared reports*; shared = summary fields only** (ADR-010) |
| **Q-07** generated geometry | **Committed** (≈ 1 MB, measured), raw sources fetched and git-ignored, never SimpleMaps files (`docs/03` §8) |
| **Q-08** pilot countries | **United States and France** |
| **Q-10** submission rules / timing | **No code on GitHub before 10 November 2026**; work stays local (`docs/12` §2) |
| Natural Earth licence | Public domain, text read from the source repository |
| **Q-02b** run exclusion | **Yes**: per-run `sharing` flag, default shared, owner can exclude (`docs/04` §11) |
| **Q-17** taxonomy | **`subnational` added** to `Jurisdiction` with optional `subdivision`; country jobs exclude subnational documents by default (`docs/04` §10) |
| **Q-18** insets | Explained to the team; recommendation adopted as working assumption H-09: **V1 = mainland framing + chips; inset mode is a Could after V1** (T-064). France stays at 18 regions with departments optional |

## 3. Open questions
| Id | Question | Needed by |
|---|---|---|
| Q-05 | `AuditRecord.lens` is required: use `hybrid` for World-level actions without a lens, or extend `WorkflowLens`? | W-06 |
| Q-11 | May legal watch be enabled on the hosted cloud demo, or only on self-hosted deployments? | V3 |
| Q-12 | Default border policy (`de-facto` or `un-reference`) and exact neutrality wording | W-01 |
| Q-13 | Flags next to country names? | W-04 |
| Q-14 | Which `admin` actions wait for M2 roles? | W-05 |
| Q-15 | Export format/template for battle-test reports (reuse run dossier / `mcp-docx` templates?) | W-08 |
| Q-16 | Should "assessed" require a minimum framework version? | W-03 |
| **Q-19** | Registry fields for `us`/`fr`: proposal in `docs/04` §9 and `data/registry-seeds.example.json` (seat-of-government `timezone`, optional `timezones[]`, per-sector `authorities`, `adminLevel`, activation rule). **Awaiting confirmation of the authority names** | W-00 |
| **Q-20** | Reference corpora per country: today the readiness engine retrieves the global reference by `globalCountry` (default `global`) and `africa` is one namespace in it. Add a per-country `referenceNamespaces` (ticket T-059)? | W-07 |

## 4. Working assumptions until answered
H-01 `hybrid` lens for World-level audit records · H-02 default border policy `de-facto` · H-03 projection Equal Earth (confirm visually) · H-04 no flags on the map · H-05 legal watch off by default everywhere · H-06 France shown as 18 regions with departments optional · H-07 US shown as 51 entities, territories as separate entities · H-08 the specification pack stays local until 10 November · H-09 inset mode deferred after V1 · H-10 existing runs default to `shared`.
