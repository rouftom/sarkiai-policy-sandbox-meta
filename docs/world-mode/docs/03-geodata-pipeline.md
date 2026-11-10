# 03 — Geodata pipeline (world and regions)

Package: `packages/worldmap-geo` (`@sps/worldmap-geo`): build scripts, crosswalk tables, **generated artifacts committed to the repository** (decision, §8), static serving by `apps/web`. Raw sources are **not** committed.

## 1. Requirements
| Id | Requirement |
|---|---|
| REQ-G01 | All 193 UN members, observers, and Kosovo, Taiwan, Palestine, Western Sahara and the main territories. |
| REQ-G02 | Admin-1 for every country where it makes sense. |
| REQ-G03 | One coordinate space for world and regions. |
| REQ-G04 | Stable normalised ids: ISO 3166-1 alpha-2 (countries), ISO 3166-2 (regions). |
| REQ-G05 | Light, deterministic, reproducible geometry (budgets in §7). |
| REQ-G06 | Licences compatible with the public Apache-2.0 repository; automated attribution. |
| REQ-G07 | Explicit, configurable, documented border policy. |
| REQ-G08 | Countries with far-flung parts (France, USA) stay usable: framing on the mainland, outlying parts reachable. |

## 2. What was measured

### 2.1 Supplied SimpleMaps-derived data (QA reference only)
`World.ts`: 211 entries, 315 paths, **11 UN members missing**. Regional files: 211 files, **4,299 regions**, each in its own coordinate frame, region codes mostly non-ISO (92 files 4-letter), uneven granularity (GB 232, Uganda 135, Cameroon 10), heavy files (Uganda 1.6 MB source). The supplied Cameroon SVG has 10 regions, an old SVG.js dependency, a `viewBox` narrower than its coordinates, unknown provenance. See `analysis/`.

### 2.2 Natural Earth (downloaded and measured; `analysis/natural-earth-measurements.csv`)
| Finding | Value |
|---|---|
| Licence | The source repository states "Everything here is public domain" and that no permission is needed (text read from the repository's licence file) |
| Admin-0 50 m | 242 features; **all 193 UN members present**; ISO code `ISO_A2_EH` clean for all but 3 disputed features (Somaliland, Northern Cyprus, Siachen Glacier have none) |
| Admin-1 10 m | **4,596 features, 241 countries**; field `iso_3166_2` clean for all but 12; French names available |
| Cameroon | **10 regions, codes `CM-AD … CM-SW` identical to the pilot crosswalk** |
| United States | 51 entities (50 states + DC), clean `US-XX` codes; territories are separate admin-0 entries |
| France | **101 entries = departments** (incl. overseas); the `region` field gives **18 regions** (13 metropolitan including Corsica + 5 overseas) |
| Largest admin-1 counts | GB 232, SI 193, LV 119, PH 118, UG 112, IT 110, FR 101, RU 86, MK 84, TR 81 |
| Source data defects | e.g. "Seien-et-Marne", "Haute-Rhin" → display names come from our own names files, never straight from the source |
| Measured sizes (Equal Earth, quantised TopoJSON, brotli) | world countries 5 % simplification: **19 KB** (5.4 k points); 10 %: 27 KB; 40 %: **77 KB** (34 k points); full 50 m: 129 KB. All 4,596 admin-1 features at 8 %: **268 KB** (96 k points). US 51 entities: 10 KB (8 %) / 19 KB (20 %). FR 101 departments: 6 / 8 KB. CM: 1 / 2 KB |

Consequences: everything fits in about **1 MB** compressed, far below the budgets first assumed; micro-state geometry exists at 50 m (markers are still needed for visibility); the Cameroon pilot is confirmed; France needs an explicit department→region step; the 12 admin-1 entries without a clean code and the 3 coded-less disputed features need explicit handling.

## 3. Sources and licences
| Source | Use | Licence |
|---|---|---|
| **Natural Earth** admin-0 (50 m) and admin-1 (10 m) | Production source | Public domain (verified from the source text, see §2.2) |
| geoBoundaries | Cross-check and gaps only, later | Not yet verified — do not use until read |
| ISO 3166 code lists | Id normalisation | Codes are public; prefer an open derivative; check name conditions |
| SimpleMaps-derived files | Private visual reference only, never committed | SimpleMaps SVG licence (no raw redistribution); full licence in `svg-world-maps-data` not read |
| Supplied Cameroon map | QA reference | Unknown |

The build writes `ATTRIBUTION.md` (source, version/commit, licence, URL, retrieval date, hash); CI fails on an undeclared source. Third-party terms stay as in `docs/LICENSING.md`.

## 4. Identifiers
| Level | Primary key | Aliases | Example |
|---|---|---|---|
| Country | ISO 3166-1 alpha-2 (upper case in geometry; lower case in the registry) | alpha-3, numeric, M49, EN/FR/local names | `CM` ↔ `cm` |
| Region | ISO 3166-2 | native code, EN/FR names | `CM-OU`, `US-CA`, `FR-IDF` |
| No ISO code | `X-<ISO2>-<slug>` | — | `X-CM-bamenda` |

A **crosswalk** (source code → normalised code) is mandatory and validated against the ISO list; the build fails on an unknown code. Region codes of aggregated levels (French regions) come from a reviewed crosswalk (`data/crosswalk-france-departments-to-regions.csv`; region codes marked "to validate" until checked against the ISO list). Ids are immutable; an official change creates a new id with `replacedBy`.

## 5. Entity taxonomy
`kind`: `country | territory | region`. `status`: `un-member | un-observer | partially-recognized | dependency | special-region | disputed`. `sovereignParent` for territories. `adminLevelName` per language. Option `groupTerritoriesWithParent`.

## 6. Build pipeline (reproducible, deterministic)
Tools: Bun, `mapshaper` (version pinned; 0.7.x used for the measurements), build-time-only projection, brotli. Inputs fetched by `scripts/fetch-geodata.sh` into a git-ignored folder.
```
fetch (hash) → normalise → crosswalk + validate → border policy + disputed handling
→ aggregation (adm1-policy: e.g. FR departments → regions) → topology (shared arcs)
→ simplification per level → antimeridian cut → projection → quantise
→ SVG paths (relative) + border mesh → bbox, centroid, label anchor, focusBBox, area, adjacency
→ micro-state markers → compressed outputs → manifest.json (SHA-256) + ATTRIBUTION.md
```
Determinism: stable ordering, fixed quantisation, pinned tool versions, no timestamps in artifacts (the build date lives in the manifest only), so regenerating without a source change produces **byte-identical** files and an empty diff.

**Levels and settings (starting points, tuned visually):** L0 = 50 m at ≈ 5 % Visvalingam (`keep-shapes`); L1 = 50 m at ≈ 40 %; L2 per country at ≈ 20 % of the 10 m source (≈ 8 % for countries with very many entities), with a per-country point budget.

**Special cases:** antimeridian (Russia, Fiji, Kiribati, USA/Aleutians), exclaves, archipelagos, micro-states, overseas territories, disputed zones, the 12 admin-1 entries without clean codes, the 3 coded-less admin-0 features, maritime borders (not drawn).

## 7. Files and budgets (revised by measurement)
```
packages/worldmap-geo/artifacts/
  manifest.json · world.l0.json.br (≤ 40 KB) · world.l1.json.br (≤ 120 KB)
  adm1/<ISO2>.json.br (median ≤ 15 KB, cap 60 KB) · names.en|fr.json.br (≤ 40 KB each)
  adjacency.json.br · groups.json · ATTRIBUTION.md
```
Targets: total committed artifacts **≤ 3 MB** (expected ≈ 1 MB: L0 19–40 KB, L1 ≈ 77–120 KB, all admin-1 ≈ 270–700 KB depending on detail, names/adjacency ≈ 100 KB); bytes before interactive (core + L0 + names) ≤ 120 KB; L0 parse ≤ 15 ms. Manifest schema: `schemas/geometry-manifest.schema.json`. The loader verifies the manifest and chunk hashes before use.

## 8. Repository policy for generated geometry (decision)
| Item | Committed? | Why |
|---|---|---|
| `manifest.json`, `world.l0`, `world.l1` | **Yes** | Needed offline; < 200 KB |
| `adm1/<ISO2>` for **all** countries | **Yes** | ≈ 270–700 KB in total, measured; a clean clone and the on-premise image work with no build or network |
| `names.*`, `adjacency`, `groups`, `ATTRIBUTION.md` | **Yes** | Small, reviewed data |
| Raw sources (Natural Earth downloads: 3 MB + 41 MB) | **No** (git-ignored, fetched by script) | Same pattern as corpus payloads (`data/country/*/*` ignored, manifests versioned) |
| Intermediate build files | No | Rebuildable |
| Any SimpleMaps-derived file | **Never** | Licence |

Rules: regenerate only when a source version, the pipeline or a policy file changes; every regeneration PR includes the diff report (entities added/removed/modified, area drift, size per file); `bun run geo:verify` fails CI if committed artifacts differ from a fresh build or from the manifest hashes; if artifacts exceed 3 MB the decision is reopened (e.g. release assets).

## 9. Regions and provinces

**Level policy.** Default admin-1; target 3–60 entities per country; above 60 the pipeline aggregates to the next level up using the policy file; below 3 the country is one region. Examples in `data/adm1-policy.example.json`.

**Order of work.** Cameroon pilot (10 regions) → **France and USA pilots** (decision) → 54 African countries → rest of the world.

| Country | Source entities | Policy | Result |
|---|---|---|---|
| Cameroon | 10 regions | keep | 10, codes `CM-AD, CM-CE, CM-ES, CM-EN, CM-LT, CM-NO, CM-NW, CM-OU, CM-SU, CM-SW` |
| France | 101 departments (incl. 5 overseas) | **aggregate to regions** via `region`; departments kept as an optional deeper level | 18 regions (13 metropolitan + Guadeloupe, Martinique, Guyane, La Réunion, Mayotte) |
| USA | 50 states + DC | keep | 51 entities |
| GB, SI, LV, PH, UG, IT | > 100 | aggregate (to decide per country) | ≤ 60 |

**Cameroon acceptance:** 10 regions, EN/FR names, no gap or overlap, area ± 3 % of reference, outer border coincident with the country at world level, visual comparison with the supplied map.

**Outlying parts (France, USA, others).** In one coordinate space, the full extent of France or the USA spans the globe. Each entity therefore carries `focusBBox` (mainland: the largest connected parts) used for framing and `outlying[]` (overseas departments/regions, Alaska, Hawaii, territories). The country view frames the mainland; outlying parts appear as **chips** that fly to them. An optional **inset mode** (Could, after V1; ticket T-064) redraws outlying parts in side boxes at the country view, the way printed maps draw Alaska and Hawaii or French overseas territories in small frames; V1 relies on the chips only. Territories with their own ISO 3166-1 code (e.g. Puerto Rico) remain distinct entities with `sovereignParent`, and `groupTerritoriesWithParent` controls whether they are painted with the parent. Policy file: `data/outlying-parts.example.json`.

**Region sheets** are light (names, parent, regional figures if any, corpus items that mention it, battle-test participation). Regional values are **never inferred** from the country's.

## 10. Geopolitical neutrality
`borderPolicy`: `de-facto` (default), `un-reference`, `custom`. Chosen in settings, printed on every export. Sensitive entities (Western Sahara, Kosovo, Palestine, Taiwan, Crimea, Kashmir, Golan, Abyei, Hala'ib, plus the three coded-less Natural Earth features) are in `data/sensitive-entities.json`; disputed areas get a dedicated hatch; distinct entities where an ISO code exists; neutral, validated labels. Legend and exports say that borders and names imply no position by the project (wording to validate). Changes to the list need two reviewers and are audited.

## 11. Data QA in CI
ISO coverage 100 % (193 UN members + observers + listed territories) · unique ids · crosswalk validated · valid geometries · gaps/overlaps < 0.1 % of area · area drift vs source ≤ 2 % (L0), ≤ 1 % (L2) · size budgets · byte-identical rebuild · visual snapshots < 0.1 % pixel diff · licences declared. Update cadence: yearly or on event, with a diff report and a new `geoVersion`. Profiles and runs reference ids, not geometry.
