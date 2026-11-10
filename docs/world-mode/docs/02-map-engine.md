# 02 — Map engine (`@sps/worldmap`)

Contract: `api/worldmap.d.ts`. Budgets: `docs/11`. Package location: `packages/worldmap` (ESM, `src/index.ts`, `"type": "module"`, tests next to sources as `*.test.ts`, run by `bun test`).

## 1. Requirements

| Id | Requirement |
|---|---|
| REQ-M01 | Render the world (≥ 250 entities) and every admin-1 region of a selected country in **one coordinate space**. |
| REQ-M02 | Recolour all visible entities in ≤ 8 ms (250 entities, reference device). |
| REQ-M03 | Zoom/pan ≥ 55 fps with no relayout; wheel, pinch, keyboard. |
| REQ-M04 | Single, multiple and rectangle selection; full state styling. |
| REQ-M05 | Declarative layers: choropleth, markers, flows, labels. |
| REQ-M06 | WCAG 2.2 AA: complete keyboard path, screen-reader semantics, equivalent table view. |
| REQ-M07 | No `innerHTML`, no runtime dependency, strict-CSP compatible. |
| REQ-M08 | Clean lifecycle (`mount`/`update`/`destroy`); no leak over 1,000 cycles. |
| REQ-M09 | Export SVG/PNG/JSON of the current state, with attribution. |
| REQ-M10 | Safe to import server-side (Next.js SSR): no `window` access at import; `toSVGString()` available. |

## 2. Scene model

```
Scene → Viewport (scale, translate, limits)
      → Layers: base · fills · mesh · patterns · markers · flows · labels · overlay
      → Interaction: hover · focus · selection · mode (navigate | select)
```

### 2.1 Levels of detail
| Level | Content | Loaded | Used |
|---|---|---|---|
| L0 | countries, heavily simplified | at start | world view |
| L1 | countries, medium detail | on demand (zoom ≥ 3× or country opened) | finer borders |
| L2 | admin-1 regions of one country (`adm1/<ISO2>`) | on demand, prefetched when idle | drill-down |

Other countries stay visible but dimmed when a country is open. L0→L1 swaps happen at rest, never mid-gesture. Countries without meaningful admin-1 (micro-states) are a single region.

### 2.2 Entities
`id` stable (`CM`, `CM-OU`), `kind`, `status`, `parentId`, multilingual `names`, `bbox`, `centroid`, `labelAnchor`, `area`, `parts`. Multi-part entities share a logical `id` across several `<path data-id>`; the DOM `id` is `wm-<instance>-<entityId>-<part>` (never duplicated).

The map's **country ids are ISO 3166-1 alpha-2 in upper case**; the repository registry stores them lower-cased (`CountryRecord.code`). The binding layer normalises at the boundary (single helper, unit-tested).

### 2.3 Outlying parts
Each country entity may carry `focusBBox` (bounding box of the mainland) and `outlying[]` (entity ids or part indexes of far-flung parts). Framing (`flyTo`, `openCountry`, `fitBounds` on a country) uses `focusBBox`; the UI offers one chip per outlying part that flies to it. Inset mode (`insets: true`, Could-have, after V1) redraws outlying parts in fixed boxes at the country's view and keeps hit-testing on the redrawn shapes. Countries without `focusBBox` are framed on their full bbox.

## 3. SVG rendering

```html
<div class="wm-root" role="application" aria-label="World map">
  <svg class="wm-svg" viewBox="0 0 2000 1000" preserveAspectRatio="xMidYMid meet">
    <defs><!-- hatch patterns --></defs>
    <g class="wm-viewport">           <!-- only target of the zoom transform -->
      <g class="wm-layer wm-layer--fills">…<path data-id="CM"/></g>
      <path class="wm-mesh" vector-effect="non-scaling-stroke"/>
      <g class="wm-layer wm-layer--markers"/>
      <g class="wm-layer wm-layer--flows"/>
      <g class="wm-layer wm-layer--labels"/>
      <g class="wm-layer wm-layer--overlay"/>
    </g>
  </svg>
  <div class="wm-controls"/> <div class="wm-legend"/>
  <div class="wm-tooltip" role="tooltip" hidden/>
  <div class="wm-live sr-only" aria-live="polite"/>
</div>
```

### Performance rules
1. Create elements once; update only changed entities (`setAttribute`/`classList`).
2. One `requestAnimationFrame` scheduler batches writes; no layout reads in the hot loop (everything precomputed).
3. Zoom/pan = `transform` on `.wm-viewport`; `will-change: transform` only during a gesture.
4. No path recomputation during gestures; constant stroke via `vector-effect` on the **mesh** only.
5. Event delegation: one listener set on the root; entity from `event.target.dataset.id`.
6. Hover = a CSS class; tooltip positioned with `transform`.
7. Geometry parsed in a **Web Worker**; transferable buffers.
8. Layer values in `Float32Array` by entity index; colour scale pre-sampled in a 256-entry table.
9. Idle prefetch of likely admin-1 chunks (selected, hovered, then African countries).
10. Off-screen regions hidden by bbox culling at rest.
11. No SVG filters or shadows on paths; selection halo = duplicated stroke path.
12. Element pools for markers and flows.

Canvas fallback when visible elements > 3,000, for a minimap, or for raster export; hit-testing then uses a uniform grid index.

## 4. Zoom and pan
Limits `minScale 1`, `maxScale 64`, translation bounded (10 % margin). Wheel zoom around the cursor (factor 1.15 per notch); trackpad pinch via `ctrl+wheel`; two-pointer pinch; drag with inertia (disabled under `prefers-reduced-motion`). Keyboard: `+ − 0`, arrows, `Enter` open, `Esc` up one level. Programmatic: `fitBounds`, `flyTo`, `zoomBy` (matrix interpolation, cancellable). Country framing: bbox ≤ 80 % of the viewport, antimeridian-aware (Russia, Fiji).

## 5. Interaction and states
States (non-exclusive, CSS classes): `hover focus selected participating running succeeded failed no-data disputed dimmed loading`. Selection: click = replace; modifier-click = toggle; `Alt`-drag or "select" mode = rectangle (centroid in rectangle or ≥ 30 % of bbox); `selectGroup('CEMAC')` from the group registry; `maxSelection` default 60. Selection is serialisable and restorable. Micro-states render as markers (≥ 24×24 px hit area, 44 px on touch). Tooltip ≤ 3 lines: name, active-layer value, confidence indicator.

## 6. Layers
Choropleth (`accessor(id) → number | null`, `null` = hatched "no grounded data"; optional `confidence(id)` dims opacity and dots the border), markers (badges: runs, alerts), flows (arcs between centroids, animated unless reduced motion), labels (priority by area, grid-based collision avoidance, progressive by zoom). Colour scales: colour-blind-safe sequential by default, diverging and categorical available; never red/green alone. Legend interactive (hover highlights a class, click filters). At most one choropleth plus marker/flow layers; transitions ≤ 250 ms.

For readiness the scale domain is **fixed 0–5** with the six maturity classes already defined in `@sps/readiness` (`MATURITY_LEVELS`), so colours mean the same thing everywhere.

## 7. Accessibility
Roving `tabindex`; arrow keys follow a precomputed adjacency graph; `role="button"` with an `aria-label` such as "Cameroon, composite 2.8, confidence medium, selected"; **table view** synchronised with the map (sort, filter, CSV); live-region announcements; contrast ≥ 4.5:1 text and ≥ 3:1 outlines; `forced-colors` support; information never by colour alone (patterns, icons, text); focus ring ≥ 3 px two-tone; every gesture has a keyboard alternative; names carry `lang`.

## 8. Theming
Tokens `--wm-ocean`, `--wm-land-nodata`, `--wm-border`, `--wm-border-selected`, `--wm-focus`, `--wm-scale-0..5`, `--wm-participating`, `--wm-running`, `--wm-failed`, `--wm-succeeded`, mapped in `apps/web` through `@theme inline` onto `@sps/ui` tokens (`packages/ui/src/styles/tokens.css`) and theme packs (`html[data-theme-pack]`, `.dark`). No colour hard-coded in the core.

## 9. Public API (summary)
```ts
const map = createWorldMap(el, { manifestUrl, locale: 'fr', selectionMode: 'multi' })
map.setLayers([readinessLayer]); map.on('selectionchange', e => …)
await map.openCountry('CM'); map.exportSVG(); map.destroy()
```
Events: `ready entityhover entityclick entityfocus selectionchange viewchange levelchange layerchange geometryloading geometryloaded error`. Full contract: `api/worldmap.d.ts`.

## 10. Lifecycle, errors, degradation
Immediate skeleton, `ready` once L0 is drawn. A failed admin-1 chunk marks the country with an error badge and a retry action; the rest keeps working. No Worker/`crypto.subtle` (insecure origin): main-thread fallback with a console warning. `destroy()` removes listeners/observers, aborts fetches, terminates the worker. `ResizeObserver` keeps the centre.

## 11. Export
SVG (inlined styles, title, date, data version, attribution, border policy), PNG (1–4×, legend included), JSON state, CSV from the table view. Every export carries the geometry attribution and the neutrality notice.
