# 12 — Roadmap and work packages

## 1. Capacity assumptions
- **One main developer**, assisted by AI tools for code and tests. Estimates are developer-days, **± 40 %**, and exclude a 15–25 % buffer.
- Non-code work is carried by the other team members: **onboarding the United States and France** (corpus manifests with `docType`, `jurisdiction`, `pillar`, `status`, `rights`, `priority`, files; an EU reference namespace for France), `watch-sources.json` per country, EN/FR copy review, neutrality review of border policy and sensitive entities.
- World mode is a **parallel track** to the repository roadmap: it provides the content decision for **M6 (second country → now United States and France)** and implements the World-facing part of **M4 (legal watch)**. It benefits from M2 (RBAC) but does not wait for it.

## 2. Repository handling (decision)
- **No code is pushed to GitHub before 10 November 2026.** Until then everything stays local: local `feat/world-*` branches cut from the local `develop`, local commits, no remote push, no pull request, no CI run. Keep the pre-push guard installed (`make hooks`). Run `bun run typecheck` and `bun run test` locally, as CI is unavailable.
- Assumption: this specification pack is also kept local until then.
- After the 10th: PRs into `develop` only, merge commits, promotion `develop → main`, mirror policy as in `docs/RULES.md`. New code stays behind `NEXT_PUBLIC_WORLD_MODE` and server flags until a version is accepted. Whether the `meta-hackathon` mirror should ever receive World mode is for the maintainers to decide afterwards.

## 3. Work packages (from `backlog.csv`: 64 tickets, 148 days)
| WP | Content | Days |
|---|---|---|
| W-00 | Decisions, package/docs scaffolding | 2 |
| W-01 | Geodata: sources and scripts, crosswalk, world, Cameroon, **France and USA pilots**, Africa, border policy, QA, rest of world | 22 |
| W-02 | Map engine: loader/worker, renderer, camera, interaction, layers, accessibility, export, **outlying parts and chips**, optional insets | 22 |
| W-03 | Read model: run-summary fields, scoring subpath, summary and sheet routes, **report scope**, **run sharing flag**, **onboarding checker**, **`subnational` jurisdiction**, **registry seeds** | 16 |
| W-04 | World page: binding, layers/weights, sheets, palette, i18n, theme ramp, demo, **scope select**, **sharing toggle** | 16 |
| W-05 | Groups and World settings stores | 4 |
| W-06 | Queue, stores, WorkGate leasing, recovery, **configurable caps** | 12 |
| W-07 | Battle-test adapters (readiness, simulation/hybrid, exercise), manifest, replay, audit, **per-country reference namespaces** | 9 |
| W-08 | Composer, pre-flight, monitor, results UI | 14 |
| W-09 | Optional live gate limits (`WorkGate.setLimits`) | 2 |
| W-10 | Legal-watch backend: safe fetch, discovery, extraction, verification, proposals, mode gating | 12 |
| W-11 | Proposals UI, offline import, ingest/manifest export/re-assess | 7 |
| W-12 | Hardening: benches, accessibility, security passes, docs | 8 |
| W-13 | Optional web-component wrapper | 2 |
| **Total** | Must 125 · Should 17 · Could 6 | **148** |

## 4. Phasing by value
| Version | Goal | WPs | Days | ≈ weeks (1 dev, full time) |
|---|---|---|---|---|
| V0 | Decide | W-00 | 2 | 0.5 |
| **V1 — Living map** | World map with regions (CM, FR, US first), readiness layers with coverage/confidence, report-scope select, country sheet, table view, demo, offline | W-01…W-05 | 80 | 16 |
| **V2 — Multi-country battle tests** | Queue, per-country settings, monitor, results, replay, audit, configurable caps | W-06…W-09 | 37 | 7 |
| **V3 — Legal watch** | Discover → verify → validate → ingest → re-assess | W-10, W-11 | 19 | 4 |
| Hardening | Benches, a11y, security, docs, optional wrapper | W-12, W-13 | 10 | 2 |
| **Total** | | | **148** | **≈ 30** (≈ 14 months half-time) |

Why this order: the map and read model are the foundation; battle tests need summaries and the queue; legal watch is the riskiest (security, rights, sovereignty) and comes last on a sound base. W-06 can start in parallel with the late part of V1 with a second developer.

**Reduced early teaser (option B)** — only if explicitly wanted and only after the embargo: W-01 up to the pilots, the minimal renderer and camera, the summary route, a two-layer page behind a disabled flag (≈ 22–25 days). Recommended instead: develop locally, demo after V1.

## 5. Content track (non-developers)
| Task | Needed for |
|---|---|
| Onboard **`us`** and **`fr`**: registry records (`authority`, `currency`, `languages`, `timezone`, `sectors`; both countries span several time zones — decide the registry convention), corpus manifests with rights, files | V1 demo value: Cameroon + France + USA = three grounded countries |
| France: an **EU reference namespace** (`data/global/eu`, jurisdiction `regional`) for the engine's reference corpus | V2 comparisons; ticket T-059 |
| USA: state-level documents use `subnational` + `subdivision` (D12); the content team tags them | V1/V2 |
| `watch-sources.json` for `us`, `fr` and `cm` (tier-1/2 domains), two reviewers | V3 |
| Review of sensitive entities and border-policy wording | V1 |
| EN/FR copy for `world.*` keys and disclaimers | V1 |
| Presets such as "Cameroon health readiness", "CM–FR–US health readiness" | V2 |

## 6. Acceptance per version
**V1**: all UN members and listed territories shown; Cameroon 10 regions, France 18 regions (+ departments as optional deeper level), USA 51 entities, 54 African countries with regions; mainland framing and chips for France/USA; hatch/low-confidence/not-assessed states correct per `docs/05`; every score with coverage and confidence; report-scope select working, shared scope proven to return summary fields only; PB-01…PB-14 and PB-17/18; keyboard path and table view; works with `SANDBOX_MODE=local` offline from a clean clone; no SimpleMaps file; both locales complete; typecheck and tests green locally.
**V2**: launch from the map in ≤ 5 clicks; cascade with provenance; blocking pre-flight; queue persists and recovers after API restart; jobs never get 429; caps configurable with the documented precedence (tests); results link to native runs; manifest + replay; audit chain verified after a test.
**V3**: nothing enters the corpus without a human decision and a rights value; no outbound request in `local` mode (test); SSRF/injection suites green; accepted text searchable and a manifest diff produced.

## 7. Go/no-go gates
End W-00: ADR-002 confirmed, Q-19 (registry authority names) confirmed. After the CM/FR/US pilots (T-006, T-053): geometry quality and framing of outlying parts. End V1: demo on Cameroon, France and USA. End V2: queue behaviour under restart and caps. End V3: security and licence review before any wider release.
