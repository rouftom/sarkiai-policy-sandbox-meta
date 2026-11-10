# 14 — Repository alignment

Analysed state: repository `main` (fbeb652), tree identical to the submission mirror (tree `8d43425`); the previous commit differs by one UI file (`conversation-shimmer.tsx`) and is irrelevant here.

## 1. Reuse map
| Need | Existing piece | World mode does |
|---|---|---|
| Country list, sectors, languages | `countries.ts`, `/v1/countries`, `lib/workspace.tsx` | Reads; adds optional `adminLevel`, `groups` |
| Scoring framework | `READINESS_DIMENSIONS` (13), `ReadinessFactor` (6), `computeComposite`, `computeGapAnalysis`, `maturityLabel` | Displays; exposes pure scoring through a subpath |
| Assessment | `ReadinessEngine.assess`, `/v1/readiness/*` (stream, batches, resume, localize, what-if) | Orchestrates in-process |
| Crisis simulation | `ScenarioEngine`, `PolicyOrchestrator`, `/v1/scenarios/*` | Orchestrates in auto-release mode |
| Table-top exercise | `@sps/exercise` | Orchestrates |
| Live web in an assessment | `WebSearch` (`@sps/agents`), `useWeb`, `webSources` | Unchanged; legal watch reuses `WebSearch` for discovery |
| Corpus and search | `@sps/retrieval` (`AtlasIngestor`, agentic BM25 search), `/v1/kb/*`, manifests | Ingests accepted proposals through it |
| Audit | `@sps/audit` hash chain, `/v1/audit/dossier/:runId` | Appends World actions; dossiers reused |
| Concurrency/rate | `WorkGate`, `config.concurrency`, `config.rateLimit`, `EXPENSIVE_ROUTES` | Leases from the gate; adds queue; registers launch routes as expensive |
| Auth/roles | `@sps/auth` (`operator`, `admin`), session guard, `public-routes.ts` | Authenticated routes only; admin-only settings |
| UI | `@sps/ui`, `@sps/theme`, Tailwind v4 tokens, `recharts`, `@xyflow/react`, `react-resizable-panels`, `react-virtuoso` | Builds the page from them |
| i18n | flat typed keys (`lib/i18n.tsx`) | Adds `world.*` to EN and FR |
| Word export | `services/mcp-docx` | Reused for reports |
| Configuration | `config.ts`, `.env.example`, SOPS | New `config.world.*` |

## 2. New pieces
`@sps/worldmap`, `@sps/worldmap-geo`, `@sps/world`, `world-routes.ts` and stores, five Mongo collections plus `world_settings`, queue and orchestrator, safe fetcher, legal-watch pipeline, World page and components, scripts (`geo-build`, `backfill-readiness-summary`, `export-manifest`).

## 3. Small changes to existing code
1. Readiness run summaries gain `groundedDimensions`, `meanConfidence` (+ backfill script).
2. `@sps/readiness` adds a `./scoring` subpath export (pure functions).
3. `CountryRecord` gains optional `adminLevel` and `groups`.
4. `EXPENSIVE_ROUTES` gains `POST /v1/world/battle-tests` and `POST /v1/world/watch/jobs`.
5. `WorkGate` optionally gains `setLimits()` (W-09, optional).
6. `@sps/theme` gains a `maturityRamp` slot, adopted by readiness charts.
7. `lib/audit-labels.ts` gains World action labels (EN+FR).
8. A per-country `referenceNamespaces` setting (small retrieval filter extension, T-059) so that France can use an `eu` reference instead of the single global reference.
9. Registry seeds for `us` and `fr` (data change) with optional `authorities`, `timezones`, `adminLevel` on the registry record, and a `scripts/check-country-onboarding.ts` checker.
10. **`Jurisdiction` gains `subnational`** across `@sps/shared`, zod schemas in `apps/api/src/openapi/schemas.ts`, `@sps/kb`, `@sps/retrieval` (filter accepting several jurisdictions + `subdivision`), agents prompts that print jurisdiction, the web labels `*.jurisdiction.*` (EN+FR) and the Atlas index definitions; the stable-API rule in `docs/RULES.md` is respected because the new fields are optional and existing values unchanged.
11. `sharing` flag on readiness and scenario run summaries; `readinessRuns.byCountry`, `scenarioRuns.byCountry` and `/v1/countries/:code/insights` skip excluded runs of other operators.

## 4. Conventions checklist (from `AGENTS.md`, `docs/RULES.md`)
- [ ] English for code, comments, docs, commits, PRs.
- [ ] Packages `@sps/<name>`, entry `src/index.ts`, ESM; files kebab-case; each file starts with a role header comment.
- [ ] Bun and TypeScript only; no Python toolchain.
- [ ] Branches `feat/world-*` from `develop`, PR only, merge commits; Conventional Commits with scope (`feat(world): …`).
- [ ] Both locales updated at once; never render localized objects directly.
- [ ] Tailwind v4 tokens, theme packs, compact density, z-index scale.
- [ ] `local` mode stays fully offline-capable; no hosted-only service in the critical path.
- [ ] No secrets, no `.env*` handling; placeholders in `.env.example`; docs use `<api-host>`/`<web-host>`.
- [ ] `bun run typecheck` and `bun run test` green; `bun run build` when `apps/web` or a package changes; docs updated in the same PR.
- [ ] MCP sidecar contracts changed on both sides together, if ever.

## 5. Implementation progress

Applied in the repository, one reviewable slice per item group:

| Item | Where |
|---|---|
| 10 · `subnational` + `subdivision` | `@sps/shared`, `@sps/retrieval`, API schemas, console labels, both index definitions |
| 2 · `./scoring` subpath | `packages/readiness/package.json` (`@sps/readiness/scoring`) |
| 1 · `groundedDimensions`, `meanConfidence` | `readiness-runs.ts`, `scripts/backfill-readiness-summary.ts` (`bun run runs:backfill-summary`) |
| 3 · `adminLevel`, `groups` | `apps/api/src/countries.ts`, country schema and console DTO |
| 5 · `WorkGate.setLimits()` | `apps/api/src/concurrency.ts` |
| 6 · `maturityRamp` | `@sps/theme` (`packages/theme/src/maturity.ts`), adopted by the readiness bars |
| 7 · World audit labels | `apps/web/src/lib/audit-labels.ts` and `i18n.tsx` (EN + FR) |
| 11 · run `sharing` | both run stores, `run-sharing.ts`, `PATCH /v1/world/runs/:kind/:runId/sharing`, country insights |

Still open: 4 (`EXPENSIVE_ROUTES` entries land with the World launch routes),
8 (`referenceNamespaces`, ticket T-059) and 9 (US/FR seeds, pending the
authority names in Q-19).
