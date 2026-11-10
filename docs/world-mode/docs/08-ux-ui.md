# 08 — UX / UI

Follows the **SarkiAI Compact** charter from `docs/RULES.md`: Tailwind v4 CSS-first tokens (`packages/ui/src/styles/tokens.css`), theme packs (`html[data-theme-pack]`, `--portal-dark`, `.dark`), compact density (inputs `h-7`, buttons `h-8`, labels `text-[10px] font-black tracking-widest`), premium surfaces (`backdrop-blur-sm`, `rounded-xl`, light/dark border parity), z-index scale (assistant backdrop 105, panel 110, popovers 130, dialogs 150). Components come from `@sps/ui` first; new generic ones are added there, World-specific ones in `apps/web/src/components/world/`.

## 1. Information architecture
New route `apps/web/src/app/(app)/world/page.tsx`, entry added to the existing navigation (behind `NEXT_PUBLIC_WORLD_MODE` until V1 is accepted).
```
World
 ├─ Map (default)  : top bar · left panel · map · right sheet · bottom dock
 ├─ Battle tests   : list, composer, monitor, results, compare, presets
 ├─ Legal watch    : proposals queue, jobs, offline import
 └─ Settings       : border policy, thresholds, caps, watch flags (admin)
```
It reuses the **workspace context** (`lib/workspace.tsx`): the current `country` and `domains` drive the initial focus and sector. The map's selected countries are a separate World-local state (selection for a battle test), persisted in `sessionStorage`, never overwriting the workspace country unless the user clicks "Use as workspace country".

## 2. Layout (≥ 1280 px)
```
┌ top bar: search (Ctrl+K) · layer ▾ · sector ▾ · reports ▾ (My | Shared) · weights ▾ · Map|Table · provider badge ┐
├─ left (resizable) ─┬──────────────── map ───────────────────┬─ right sheet ──────────────┤
│ Layers & filters   │  hatched = no grounded data             │ Country · region ▾           │
│ Groups             │  dotted border = low confidence         │ Composite 2.8 · cov · conf  │
│ Selection (chips)  │  badge = running / stale / alerts       │ tabs: Overview · Corpus ·    │
│ [Launch ▶]         │  + − ⌂ ⤢   legend                       │ Readiness · Runs · Watch     │
├────────────────────┴─────────────────────────────────────────┴─────────────────────────────┤
│ dock: battle-test progress · pending proposals · queue position                             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```
Panels use `react-resizable-panels` (already a dependency); tables use `react-virtuoso`; comparison charts use `recharts`; the readiness causal view reuses `@xyflow/react`.

## 3. Key screens
**Country sheet.** Header: names (EN/FR per locale), authority, languages, sectors enabled. Overview: composite per sector with band label, **coverage**, **confidence**, freshness, run history sparkline (existing `/insights` trend). Corpus: manifest documents with status and rights, chunk count, critical documents missing. Readiness: 13-dimension bars (0–5), factors, HIGH/MEDIUM gaps, "open full report" (existing readiness page), what-if. Runs: readiness and scenario runs for this country; each of **your** runs has a **Shared / Excluded** toggle (excluded runs disappear from the shared scope and from other operators' insights). Watch: pending proposals, last check, "Check for updates".

**Battle-test composer** (drawer, 5 steps): Type → Participants → Settings (cascade with inherited/overridden badges) → Pre-flight → Launch. Settings fields for readiness mirror the existing readiness page controls so users recognise them.

**Monitor.** One row per job: state, progress (dimensions scored or ticks), elapsed, model, cost; queue position when waiting; actions pause/cancel/retry; live log from SSE. Survives reload (state from the API, stream resumed with `Last-Event-ID`).

**Results.** Matrix with sortable columns, heterogeneity warnings banner, divergence view, map metric layer, A/B compare, export.

**Proposals queue.** Cards as in `docs/07` §4.

## 3 bis. Report scope select
A select in the top bar (`world.scope.mine` / `world.scope.shared`), default **My reports**, persisted per operator. In *Shared reports* the map shows a visible "Shared reports" badge, tooltips and the sheet show summary fields only, and "open report" is available only for the operator's own runs. Exports print the scope.

## 4. Interaction rules
Hover = tooltip (name, value, confidence). Click = select + fly to + open sheet + load regions. `Esc` = up one level. `Ctrl+K` = palette (countries, regions, groups, actions). Selection mode toggle for rectangle selection. Legend hover highlights, click filters. Table view mirrors the map layer.

## 5. States
| Situation | Treatment |
|---|---|
| Loading | Silhouette skeleton, then L0; summary arrives later and colours fade in (≤ 250 ms) |
| No corpus | Explanatory empty state with the onboarding checklist (manifest, ingest) |
| Admin-1 chunk failed | Error badge + Retry; map keeps working |
| API asleep (free tier) | Reuses the existing wake-up messaging pattern |
| `local` mode | Web buttons disabled with "Local mode: no outbound access"; offline import offered |
| Caps reached | Jobs show "Queued (n ahead)", never an error |
| Failed job | Provider's words (existing `failure.ts` helper), Retry/Resume |

## 6. Accessibility
Everything on the page is reachable without the map (table view, palette, lists). WCAG 2.2 AA targets in `docs/02` §7; status = colour + icon + text; reduced motion respected; announcements via the live region; focus management when drawers open/close; keyboard shortcuts documented in the page help (`?`).

## 7. Internationalisation
The console i18n is a flat key → string map (`lib/i18n.tsx`) typed so a missing key is a type error. Add a `world.*` namespace to **both** `en` and `fr` in the same change. Dates/numbers via `lib/format.ts`. Country/region names come from the geometry `names.<locale>` files and the registry (`name`, `nameFr`). Never render a localized object directly (charter rule). Draft key groups: `world.map.*`, `world.layer.*`, `world.state.*` (not-assessed, no-grounded-data, low-confidence, stale), `world.battle.*`, `world.preflight.*`, `world.watch.*`, `world.settings.*`, `world.a11y.*`.

## 8. Theme
Map tokens map onto the active theme pack; the six maturity classes use a colour-blind-safe ramp defined once in `@sps/theme` (new slot `maturityRamp`) and read by both the map and the existing readiness charts, so colours mean the same everywhere.

## 9. Demo mode
Guided tour (6–8 steps): map → readiness layer → Cameroon regions → sheet → launch with the Cameroon health preset → monitor → results. Uses the existing demo reset conventions (`demo:reset`); synthetic data labelled "Demo".

## 10. Responsive
≥ 1280 px three columns + dock; 768–1279 px drawers for side panels; < 768 px table/list first, map on demand, composer as paged steps, no rectangle selection. The existing mobile-responsive layout work (`feat/mobile-responsive-layout` branch) is the baseline to follow.

## 11. Extra features retained
Country comparison (S) · freshness alerts (S) · annotations on dimension scores (S) · presentation mode (S) · shareable view link (C) · timeline of a country's composite across runs (C) · full-text search in the corpus from the map (C) · cross-border flows (C).

## 12. UX requirements
REQ-U01 every main function reachable by keyboard and without the map · REQ-U02 no score without coverage and confidence beside it · REQ-U03 states readable without colour · REQ-U04 visual feedback ≤ 100 ms on any click · REQ-U05 offline/local clearly signalled · REQ-U06 simulation and border-neutrality notices present in the relevant views and exports.
