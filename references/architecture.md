# Architecture

## CoRTN Road Traffic Sources (`cortnRoads[]`) — Phases 1–5

Dedicated source type for UK CoRTN (Calculation of Road Traffic Noise) with Australian adjustments. Completely independent of `lineSources[]` — different inputs (AADT/speed/%CV/gradient) and different calculation method.

- **Phase 1**: data structure + UI panel + map drawing + save/load. *(Complete.)*
- **Phase 2**: free-field calculation engine (LA10 + LAeq, all Chart corrections, dual carriageway, NSW 3-source-height). *(Complete — see [calculations.md](./calculations.md#cortn-road-traffic-noise).)*
- **Phase 3**: barrier diffraction (Charts 9/9a) with Shadow/Illuminated polynomial zones + ground correction interaction. *(Complete — see [calculations.md](./calculations.md#barrier-diffraction--cortn-charts-9--9a-phase-3).)*
- **Phase 4**: receiver integration + Predicted Levels pipeline. Per-receiver distance + angle-of-view geometry, energy summation into `calcTotalISO9613`, per-receiver detail block in the Predicted Levels panel. *(Complete.)*
- **Phase 5**: dedicated CoRTN road noise map worker + UI. Broadband LA10/LAeq grid, day/night periods, metric toggle, compliance view. Independent from the ISO 9613-2 grid worker. *(Complete — see [calculations.md](./calculations.md#cortn-grid-computation-phase-5).)*

### Phase 5 CoRTN noise map grid

New worker file [`cortn-worker.js`](../cortn-worker.js) runs alongside the existing [`noise-worker.js`](../noise-worker.js). Both workers can run concurrently (dual map layers overlaid on Leaflet). The CoRTN worker imports `shared-calc.js` via `importScripts` and uses the `SharedCortn` namespace.

#### Worker message contract

Receives:

```js
{
  bounds: { north, south, east, west },
  gridResolutionM: number,
  receiverHeight: number,
  period: 'day' | 'night',
  roads: [  // serialised copies of cortnRoads[] with UI-only fields stripped
    { id, vertices, aadt, speed_kmh, gradient_pct,
      cv_pct_day, cv_pct_night, distFromKerb_m, roadHeight_m,
      surfaceCorrection, surfaceType, carriageway, trafficSplit, laneOffset_m,
      periodConfig, aadtPctDay, aadtPctNight, dayHours, nightHours,
      austAdjDay, austAdjNight, threeSourceHeight,
      groundAbsorption, meanPropHeight_m, reflectionAngle_deg,
      barrier: { enabled, height_m, baseRL_m, distToBarrier_m } }
  ]
}
```

Posts:

```js
{ type: 'progress', percent }                                        // every ~5% of rows
{ type: 'complete',
  gridLaeq: Float32Array, gridLa10: Float32Array,                   // row-major, length = rows*cols
  rows, cols, bounds, dLat, dLng, startLat, startLng, period }
{ type: 'error', message }
```

`Float32Array` cells are `NaN` when no road contributes to the cell (e.g. `perpDist ≤ 0`) — the main-thread renderer treats `NaN` as "no colour / transparent".

#### Main-thread state

New top-level variables in `index.html` next to the existing ISO map state block:

| Variable | Default | Purpose |
|---|---|---|
| `_cortnMapOn` | `false` | Toggle for the dropdown controls + worker |
| `_cortnMapPeriod` | `'day'` | `'day'` \| `'night'` — recompute on change |
| `_cortnMapMetric` | `'laeq'` | `'laeq'` \| `'la10'` — re-render only, no recompute |
| `_cortnMapHeight` | `1.5` | Receiver height used for every cell |
| `_cortnMapGridSize` | `'auto'` | `'auto'` \| `'5'`\|`'10'`\|`'20'`\|`'50'`\|`'100'` |
| `_cortnWorker` | `null` | Active worker instance (terminated on toggle-off) |
| `_cortnCanvasLayer` / `_cortnContourLayer` / `_cortnLegend` | `null` | Leaflet layers + legend control |
| `_lastCortnData` | `null` | Last completion message (used for metric/legend re-render) |
| `_cortnRecomputeTimer` | `null` | Debounce handle (1000 ms) |
| `_cortnLegendMin` / `_cortnLegendMax` / `_cortnLegendInterval` | `35` / `75` / `5` | User-configurable scale |
| `_cortnComplianceMode` / `_cortnComplianceCriterion` | `false` / `null` | Compliance view state |
| `_cortnComplianceCanvasLayer` / `_cortnComplianceContourLayer` / `_cortnComplianceLegend` | `null` | Compliance layers |

#### Main-thread functions (index.html)

| Function | Purpose |
|---|---|
| `computeCortnMap()` | Serialises `cortnRoads[]` → worker message, fires the worker, wires up `onmessage` / `onerror` handlers |
| `renderCortnCanvas(data)` | Rasterises one of `data.gridLaeq` / `data.gridLa10` (selected by `_cortnMapMetric`) to an image overlay, reusing the shared `NOISE_COLOURS` scale, then calls `generateCortnContourLines` |
| `generateCortnContourLines(data)` | Marching-squares contour tracing over the selected grid, using `_cortnLegendMin / Max / Interval` as thresholds. Shares `chaikinSmooth` and the chaining logic with the ISO map contour generator |
| `showCortnLegend()` | Bottom-right Leaflet control; title `CoRTN Day LAeq dB(A)` etc. |
| `renderCortnComplianceMap()` | Compliance Δ = Predicted − Criterion, using the shared `getComplianceColour` / `COMPLIANCE_COLOURS` / `COMPLIANCE_THRESHOLDS` |
| `removeCortnMap()` | Tears down worker + all layers + both legends |
| `debouncedRecomputeCortn()` | 1000 ms debounce wrapper around `computeCortnMap` |

#### Public setters/getters (save/load)

- `window._getCortnMapOn()` → boolean
- `window._getCortnMapSettings()` → `{ period, metric, height, gridSize, legendMin, legendMax, legendInterval, complianceCriterion }`
- `window._setCortnMapSettings(obj)` — restores all fields, resets grid to `'auto'`, never auto-enables the map
- `window._recomputeCortnMap()` — debounced recompute entry point for CoRTN road edits

#### UI layout

Inside `#noiseMapControls`' parent `<div>`, the CoRTN map block is appended directly after the existing `#noiseMapGridWarning` (line ~2188). The structure mirrors `#noiseMapControls` but with:

- **No Eve / LAmax pills** — CoRTN only defines day and night periods.
- **Metric toggle** LAeq (default) / LA10 — instant re-render.
- **Grid selector** has no 1 m / 2 m options — CoRTN's broadband output does not benefit from finer spacing; 5 m is the minimum.
- **Default range** 35–75 dB (road noise is typically higher than industrial).
- **Compliance view** matches the ISO map's Levels/Compliance split but seeds the criterion from whatever the user last entered (or 60 dB(A) if unset).

#### CoRTN road edit → map recompute hook

`window._recomputeCortnMap()` is invoked from three places in `index.html`:

1. `recalcAndRefresh()` inside `attachCortnPanelListeners` — fires on every field change in the CoRTN panel.
2. The `draw:created` handler for the CoRTN polyline tool — fires when a new road is drawn.
3. Both delete paths (panel delete button + context-menu delete) — fires when a road is removed.
4. `window._setCortnRoads` — fires after a load restores `cortnRoads[]` (the map stays off until the user clicks, but the pending recompute is scheduled so it's ready).

Each trigger goes through `debouncedRecomputeCortn` (1000 ms) so bulk edits collapse into a single recompute.

#### Phase 5 simplifications (acknowledged)

- Barrier geometry is per-road (no absolute barrier position). `distToBarrier_m` stays at its UI-configured value for every cell. Cells closer to the road than `distToBarrier_m` correctly fall back to "no screening" via the helper's `applied:false` return.
- No terrain profile screening.
- Reflections forced to zero in grid mode.
- Distance convention: `clone.distFromKerb_m = perpDist − 3.5` (clamped to ≥ 0.5 m) so `d_horiz = perpDist`. Differs from Phase 4's `clone.distFromKerb_m = perpDist` convention by ~1–1.5 dB for short distances; tracked in [uat-tests.md](./uat-tests.md).

### Phase 4 receiver integration

When a CoRTN road is present and a receiver is placed, a new set of helpers compute a per-receiver CoRTN contribution and cache it on the road for display in the Predicted Levels panel:

- `_cortnFlatDistM(lat1, lng1, lat2, lng2)` — flat-earth metres, falls back to `SharedCalc.flatDistM`.
- `_cortnDistanceToPolyline(recvLat, recvLng, verts)` — perpendicular distance from the receiver to each polyline segment using a local flat-earth ENU projection anchored at the receiver. Accurate to <1 m for distances up to a few km.
- `_cortnAngleOfViewFromReceiver(recvLat, recvLng, verts)` — angle (degrees) between the rays from the receiver to the polyline's first and last vertices. Exact for straight roads.
- `cortnBroadbandToSpectrum(laeq)` — converts broadband A-weighted LAeq to an 8-band octave spectrum using the MBS 010 road-traffic shape `[18, 14, 10, 7, 4, 6, 11, 11]` (dB relative, 63..8k Hz) shifted so the per-band energy sum exactly reproduces the input LAeq.
- `calcCortnRoadAtReceiver(road, prefix, receiverIdx)` — the wrapper. Resolves the receiver via `getReceiverLatLng('r' + (idx+1))`, reads `getReceiverHeight(idx)`, computes `perpDist` + `angle`, clones the road with `distFromKerb_m = perpDist` / `angleOfView_deg = angle` / `receiverHeight_m = recvH`, runs `calcCortnRoadPeriod(clone, period)`, and caches the result in `road.receiverResults[rk][period] = {la10, laeq, perpDist, angle}`. Returns the broadband LAeq for energy summing in `calcTotalISO9613`. Only day / night periods produce contributions — eve and lmax return `null`.
- `_cortnClearAllReceiverResults()` — clears stale caches at the top of `render()`.
- `_cortnUpdateAllReceiverResults()` — iterates placed receivers × roads and calls `calcCortnRoadAtReceiver`. Called from `render()` just before `_renderCortnPredDetail()` so the detail panel is always in sync regardless of whether the upstream `calcTotalISO9613` path actually fired.

#### New `receiverResults` cache on each road

```js
cr.receiverResults = {
  r1: { day: {la10, laeq, perpDist, angle}, night: {la10, laeq, perpDist, angle} },
  r2: { day: ..., night: ... },
  r3: { ... },
  r4: { ... }
}
```

Not serialised to save JSON — always rebuilt from scratch on load via `render()`.

#### `calcTotalISO9613` integration

Inside the existing per-receiver aggregator at [index.html:7767](../index.html:7767), a new `cortnRoads.forEach` loop appended after the building-sources loop:

```js
if (typeof cortnRoads !== 'undefined' && typeof calcCortnRoadAtReceiver === 'function'
    && (prefix === 'day' || prefix === 'night')) {
  cortnRoads.forEach(function(cr) {
    var crLaeq = calcCortnRoadAtReceiver(cr, prefix, receiverIdx);
    if (Number.isFinite(crLaeq)) {
      totalLin += Math.pow(10, crLaeq / 10);
      anySrc = true;
    }
  });
}
```

Criteria panels (SA/VIC/NSW) that compare predicted levels against thresholds automatically see CoRTN contributions without any changes — they read from the same `calcTotalISO9613` return value.

#### Predicted Levels panel DOM

New `<div id="cortnPredDetail">` inserted at [index.html:3178](../index.html:3178) after the `vicRuralDistFootnote` badge row. `_renderCortnPredDetail()` builds one block per road with a 7-column per-receiver table:

| Receiver | Dist (m) | Angle (°) | Day LA10 | Day LAeq | Night LA10 | Night LAeq |

- Hidden entirely when `cortnRoads.length === 0`
- Shows "Place receivers on the map to see per-receiver levels." when roads exist but no receivers are placed
- Shows "Enter AADT in the road panel to see contributions." for rows with `aadt == null`

### State

Declared alongside `lineSources[]` in [index.html:6011](../index.html:6011):

```js
var cortnRoads = [];
var _cortnIdCtr = 0;
var _cortnPanel = null;
var _cortnPanelId = null;
```

Helpers:
- `_cortnDefaultRoad(verts)` — returns a fresh road object with spec defaults.
- `_cortnApplyPeriodDefaults(road, preset)` — flips `aadtPctDay/Night + dayHours/nightHours` when `periodConfig` changes between `la10_18h` / `laeq_15h_9h` / `laeq_16h_8h`.

### Data structure

Each entry in `cortnRoads[]`:

| Field | Default | Notes |
|---|---|---|
| `id` | `'cortn_' + idCtr` | Unique per session |
| `name` | `'Road ' + idCtr` | User-editable |
| `vertices` | `[[lat,lng], ...]` | Polyline |
| `aadt` | `null` | Annual Average Daily Traffic (veh/day) |
| `speed_kmh` | `60` | Posted speed |
| `gradient_pct` | `0` | Road gradient |
| `cv_pct_day` / `cv_pct_night` | `5` / `5` | % commercial vehicles |
| `distFromKerb_m` | `4` | Receiver → nearest kerb |
| `roadHeight_m` | `0` | Road elevation (0 = at grade) |
| `surfaceCorrection` / `surfaceType` | `0` / `'DGA'` | See surface presets below |
| `carriageway` | `'dual'` | `'dual'` or `'one-way'` |
| `trafficSplit` | `0.5` | Near-lane fraction (0–1) |
| `periodConfig` | `'la10_18h'` | One of three presets |
| `aadtPctDay` / `aadtPctNight` | `0.94` / `0.06` | Auto-set by `periodConfig` |
| `dayHours` / `nightHours` | `18` / `6` | Auto-set by `periodConfig` |
| `austAdjDay` / `austAdjNight` | `-1.7` / `+0.5` | dB |
| `threeSourceHeight` | `false` | NSW 3-source-height model |
| `groundAbsorption` | `0` | 0 (hard) → 1 (soft) |
| `meanPropHeight_m` | `1` | Mean propagation height |
| `angleOfView_deg` | `180` | Full view default |
| `reflectionAngle_deg` | `0` | No reflection default |
| `receiverHeight_m` | `null` | `null` = use global default |
| `laneOffset_m` | `7` | Near → far lane centre distance (dual carriageway only). **New in Phase 2.** |
| `results.day / results.night` | `{la10, laeq, _breakdown}` | Phase 2 engine populates via `recalcCortnRoad()` |

### Period presets

Applied by `_cortnApplyPeriodDefaults(road, preset)`:

| Preset | `aadtPctDay` | `dayHours` | `nightHours` |
|---|---|---|---|
| `la10_18h` | 0.94 | 18 | 6 |
| `laeq_15h_9h` | 0.90 | 15 | 9 |
| `laeq_16h_8h` | 0.94 | 16 | 8 |

`aadtPctNight` is always `1 - aadtPctDay`.

### Surface presets

Surface type dropdown maps to `surfaceCorrection` (dB):

| Label | Correction |
|---|---|
| DGA | 0 |
| Concrete | +3 |
| OGA | −2 |
| SMA | −1 |
| 14mm Chip Seal | +4 |
| 7mm Chip Seal | +2 |
| Custom | user-entered |

### Map layer

Declared next to `lineSourceLayer` at [index.html:27091](../index.html:27091):

```js
var cortnRoadLayer = L.layerGroup().addTo(map);
var CORTN_STYLE = { color: '#1565C0', weight: 4, opacity: 0.85, dashArray: '8,6' };
```

**Dashed dark blue** to distinguish from the solid-red line sources.

`renderCortnRoadLayer()` clears + re-adds all polylines on every call (same pattern as `renderLineSourceLayer`). Each road gets:
- Polyline with `CORTN_STYLE`
- Tooltip: `R{idx+1} — {name} | L = {len} m | AADT: {aadt} | {speed} km/h`
- Left-click → `openCortnPanel(cr.id)`
- Right-click → context menu (Edit / Duplicate / Delete)
- Midpoint label: `R1`, `R2`, … in `#1565C0` (mirrors the `L1/L2` pattern for line sources)

### Tools menu button

Inserted after the line source button at [index.html:2116](../index.html:2116):

```html
<button class="mp-btn" id="drawCortnRoadBtn"
        title="Draw a CoRTN road traffic source (UK CoRTN method with Australian adjustments)"
        style="border-left:3px solid #1565C0;">
  <svg>...road stripe icon...</svg> Road (CoRTN)
</button>
```

### Draw handler

`drawCortnRoadBtn` click → cancels other active draw modes (line source, barriers) → enables `L.Draw.Polyline` with `CORTN_STYLE`. A dedicated `map.on(L.Draw.Event.CREATED)` listener checks `_cortnDrawHandler` and bails out otherwise — this coexists with the line source CREATED listener, each does nothing unless its own handler is active.

On completion:
1. Extract vertices
2. `newCr = _cortnDefaultRoad(verts)` → push into `cortnRoads`
3. `renderCortnRoadLayer()`
4. `window._undoPushState('Add CoRTN road')`
5. `openCortnPanel(newCr.id)`

### Floating panel `#cortnFloatPanel`

~380px wide, viewport-centred on open (the ONLY panel that centres — src/area/line/building panels still use click-relative positioning per the earlier user revert). Sections from top to bottom: Name + midpoint/length display, Traffic, Commercial vehicles, Time periods, Corrections, Propagation, NSW 3-source-height checkbox, Results placeholder, action buttons (Delete, Close).

- `buildCortnPanelHTML(cr)` generates the markup
- `openCortnPanel(crId)` creates the div, appends to body, positions it centred, calls `attachCortnPanelListeners(cr)`
- `closeCortnPanel()` removes the div and clears refs
- `attachCortnPanelListeners(cr)` wires:
  - Draggable `#cortnPanelHeader`
  - `bindInput(id, prop, cast)` helper for every text/number input
  - Period config dropdown → `_cortnApplyPeriodDefaults` + UI refresh
  - Surface dropdown → auto-map correction + show/hide custom input
  - Carriageway radios → enable/disable traffic-split inputs
  - %AADT day/night inputs mirror each other (one changes → other auto-flips to 100 - near)
  - 3-source-height checkbox
  - Close + Delete buttons

### Save / Load

**Save** — both save code paths ([index.html:16967](../index.html:16967) and [18509](../index.html:18509)) serialise `cortnRoads` with every field from the data structure. Results (`results.day/night`) are NOT saved — they'll be recomputed by Phase 2 on load.

**Load** — at [index.html:18218](../index.html:18218):

```js
if (window._setCortnRoads) {
  window._setCortnRoads(data.cortnRoads || []);
}
```

`window._setCortnRoads(arr)`:
1. Clears `cortnRoadLayer` and empties `cortnRoads.length = 0`
2. For each saved row, runs it through `_cortnDefaultRoad(vertices)` (so any missing field picks up a default) then overlays the saved values
3. Rebuilds `_cortnIdCtr` from the max numeric id in the saved data so new roads don't collide

### Coexistence with line sources

`lineSources[]` and `cortnRoads[]` are fully independent:
- Separate state arrays
- Separate Leaflet layers (`lineSourceLayer` vs `cortnRoadLayer`)
- Separate draw buttons (`drawLineSourceBtn` vs `drawCortnRoadBtn`)
- Separate CREATED listeners (each checks its own `_lsDrawHandler` / `_cortnDrawHandler`)
- Separate panels (`#lsFloatPanel` vs `#cortnFloatPanel`)
- Separate save/load entries (`data.lineSources` vs `data.cortnRoads`)
- No shared helpers beyond the generic utilities (`escapeHTML`, `_showMapCtxMenu`, `window._undoPushState`)

Line sources continue to work exactly as before; CoRTN roads layer on top without touching anything.

## UI Layout — Fixed collapsible LHS side panel + top-right atom buttons

The map area (inside `#map-column`) is flanked by two panels:

- **Left**: `#side-panel` — a fixed 300px-wide column containing Search + Mapping/Tools/Modelling accordions + the drawer toggle. Collapsible via a right-edge button; state persists in `localStorage`. On mobile (<768px) it's an overlay with a backdrop. Injected at runtime by `_resonateSidePanelBoot()` in the inline script at [index.html:1721](../index.html:1721).
- **Right**: `#drawer-panel` — the pre-existing 520px drawer containing the 14 domain panels (Objects, Receivers, Criteria, Noise sources, Predicted levels, Methodology, etc.). Unchanged by this refactor.

```
┌─ #side-panel 300px ──┬─ #map-column (reflowed) ──┬─ #drawer-panel 520px ─┐
│ [«]                  │                           │ (14 panels)           │
│ [?][💡][↶][↷][📷]   │                           │                       │
│ [Search__________]   │                           │                       │
│ ▶ Mapping            │   Leaflet map             │                       │
│ ▶ Tools              │   (clean — only Leaflet   │                       │
│ ▶ Modelling          │    zoom & scale bar)      │                       │
│                      │                           │                       │
│ [Panels] (drawer-tgl)│                           │                       │
└──────────────────────┴───────────────────────────┴───────────────────────┘
```

The 5 atom buttons (?, 💡, ↶, ↷, 📷 = Save JPG) live in `#side-panel-toolbar`
at the top of `#side-panel-inner`, above the search bar. The map area no
longer carries any floating Resonate UI — only the native Leaflet zoom
controls, scale bar, marker status rows, and the empty `map-guide-overlay`.

### DOM structure (post-boot)

```
#app-layout (position: relative; display: block; overflow: hidden)
├── #side-panel (position: absolute; top:0 left:0 bottom:0; width: 300px; box-sizing: border-box)
│   ├── #side-panel-toggle (position: absolute; right: -14px; the « / » chevron)
│   └── #side-panel-inner (flex column; padding 12px 14px; box-sizing: border-box; gap 4px)
│       ├── #side-panel-toolbar (horizontal flex row of 5 icon buttons, 6px gap)
│       │   ├── #mp-help         — ? Quick Reference (moved from #mapPanelContainer)
│       │   ├── #mp-suggest      — 💡 Suggested Sources
│       │   ├── #mp-undo         — ↶ Undo
│       │   ├── #mp-redo         — ↷ Redo
│       │   └── #mp-save-jpg     — 📷 Save JPG (label span hidden inside toolbar)
│       ├── #mapSearchWrapper (moved here from #mapPanelContainer)
│       ├── #mp-mapping (.mp accordion, moved here)
│       ├── #mp-tools (.mp accordion, moved here)
│       ├── #mp-modelling (.mp accordion, moved here)
│       └── #side-panel-footer (margin-top: auto; border-top)
│           └── #mp-toggle-drawer (the Expand/Panels button, moved here)
├── #side-panel-backdrop (display: none; shown only on mobile)
├── #map-column (position: absolute; top:0 right:0 bottom:0; left: 300px)
│   ├── #mapInnerWrapper
│   │   ├── #mapPanelContainer (display: none !important — empty after boot)
│   │   ├── #mapFullscreenSidebar
│   │   ├── #noise-map (Leaflet — only app overlay on the map canvas)
│   │   └── #map-guide-overlay (hidden once sources exist)
│   └── #map-status-row (bottom: 24px; left: 10px)
└── #drawer-panel (position: absolute; top:0 right:0 bottom:0; width: 520px; unchanged)
```

### CSS variables & classes

| Variable / Class | Effect |
|---|---|
| `--side-panel-width: 300px` | Declared on `:root`. Used by the `@media (max-width: 767px)` rule so the collapsed mobile panel retains its width for the `transform: translateX(-100%)` slide, and by `#side-panel-inner.min-width` so content stays laid out during collapse. |
| `#side-panel.collapsed` | `width: 0; border-right: none; box-shadow: none`. Added/removed by `setCollapsed()` in the boot IIFE. |
| `#app-layout.side-panel-collapsed` | Flips `#map-column.left` from `300px` → `0` via `#app-layout.side-panel-collapsed #map-column { left: 0 }` so the map reflows. |
| `#drawer-panel.drawer-closed` | Pre-existing. New atom-button rule `#drawer-panel.drawer-closed ~ #map-column #mapPanelContainer { right: 10px }` moves the atom buttons flush right when the drawer is manually closed. |

### Collapse / expand state machine

`_resonateSidePanelBoot()` in the inline script block in `#mapInnerWrapper`:

1. Creates `#side-panel`, its toggle button (`#side-panel-toggle`), an inner flex column (`#side-panel-inner`), a footer (`#side-panel-footer`), and a sibling `#side-panel-backdrop`.
2. Moves 5 elements out of `#mapPanelContainer`: `#mapSearchWrapper`, `#mp-mapping`, `#mp-tools`, `#mp-modelling`, `#mp-toggle-drawer` (the last goes into the footer).
3. Inserts `#side-panel` and `#side-panel-backdrop` as the first children of `#app-layout` (before `#map-column`).
4. Defines `setCollapsed(collapsed)` which:
   - Toggles `.side-panel-collapsed` on `#app-layout` (drives `#map-column.left`)
   - Toggles `.collapsed` on `#side-panel` (drives `#side-panel.width`)
   - Flips the toggle button text between `«` and `»`
   - Writes `localStorage['sidePanelCollapsed']` = `'true'` / `'false'`
   - Calls `window._map.invalidateSize()` so Leaflet reflows
5. Initial state: on mobile (`matchMedia('(max-width: 767px)').matches`), force-collapse regardless of localStorage; otherwise honour the stored value. A `matchMedia('change')` listener re-collapses if the viewport crosses into mobile later.
6. Clicking `#side-panel-backdrop` calls `setCollapsed(true)` (mobile-only — the backdrop is hidden on desktop).

### Accordion mode (`.mp` + `.mp-body` inside `#side-panel`)

The pre-existing `.mp` markup with its `.mp-hdr` click handler + `.mp-body` content is reused. A scoped CSS override inside `#side-panel` changes how `.mp-body` renders:

| Property | Floating (inside `#mapPanelContainer`) | Accordion (inside `#side-panel`) |
|---|---|---|
| `position` | `absolute` | `static` |
| Layout | Floats out from button edge | Flows inline below `.mp-hdr` |
| `max-height` | Capped, scrollable | Unlimited — `max-height: none !important` |
| Background | Dark card (same as `.mp`) | Translucent white tint to separate from panel |
| Visibility | `display: none` until `.mp-open` | Same (unchanged) |

The `toggleMapPanel(id)` function at [index.html:1820](../index.html:1820) detects `target.closest('#side-panel')` and, when true, simply toggles `.mp-open` on the target without closing sibling accordions (independent accordion behaviour) and without running the max-height measurement logic (which is irrelevant for inline-flowing bodies).

The outside-click handler at [index.html:1857](../index.html:1857) early-returns when the click happens inside `#side-panel` — so clicking the map leaves accordion sections open.

### Atom buttons — top-of-panel toolbar

Five icon buttons (`#mp-help`, `#mp-suggest`, `#mp-undo`, `#mp-redo`, `#mp-save-jpg`) live inside `#side-panel-toolbar` — a horizontal flex row that's the FIRST child of `#side-panel-inner`, above the search bar. Each renders as a 36×36 (38×38 with 1px border) icon-only pill via the scoped rule at [index.html:1180ish](../index.html). The underlying DOM elements keep their original `.mp > .mp-hdr` structure so the existing click handlers (`helpToggleBtn`, `suggestToggleBtn`, `undoBtn`, `redoBtn`, `saveJpgPanelBtn`) are unchanged — only the parent container changed. `_resonateSidePanelBoot()` creates the toolbar and `appendChild`s each button into it before inserting the search wrapper and the three accordions.

The `#mapPanelContainer` element is now empty (all 5 atom buttons moved out) and is set to `display: none !important`, so the map viewport has no floating Resonate UI — only Leaflet's zoom controls, scale bar, and the marker status rows that were already there.

The Save JPG button was the only atom with a text label (`<span>Save JPG</span>`); inside the toolbar the span is hidden via `#side-panel-toolbar #mp-save-jpg .mp-hdr > span { display: none }` so all five buttons read as icon-only.

### Mobile overlay (`@media (max-width: 767px)`)

- `#side-panel` becomes `position: absolute; z-index: 1000` (above everything in the map area)
- `#side-panel.collapsed` uses `transform: translateX(-100%); width: var(--side-panel-width)` — slide out, preserve dimensions so the slide-in feels natural
- `#side-panel-backdrop` gains `display: block` when `#side-panel:not(.collapsed) ~ #side-panel-backdrop` matches — click it to dismiss
- `#map-column.left` is locked to `0` regardless of `.side-panel-collapsed` — the panel overlays, never pushes
- Atom buttons live inside the side panel now, so nothing needs to shift on mobile

## Supabase-backed noise source + Rw library

### Loading pipeline

Four hard-coded libraries in [index.html](../index.html) are the *offline snapshot*:

| Variable | Where | Record count | Shape (per record) |
|---|---|---|---|
| `SOURCE_LIBRARY_GROUPED` | ~line 5210 | 98 (grouped by category) | `{name, lw, spectrum[8], height}` |
| `LINE_SOURCE_LIBRARY` | ~line 5692 | 10 | `{name, category, spectrum_unweighted{63..8000}, lw_m_dba, height_m}` |
| `AREA_SOURCE_LIBRARY` | ~line 5790 | 5 | same shape as line sources but `lw_m2_dba` |
| `BUILDING_LP_LIBRARY` | ~line 6646 | 12 (grouped by category) | `{name, category, lp_dba, spectrum{63..8000}}` — interior Lp inside a building, not Lw |
| `CONSTRUCTION_LIBRARY` | ~line 5747 | 13 (walls/roof/openings) | `{name, rw, octaveR{63..8000}}` nested under 3 kind keys |

On DOMContentLoaded the boot IIFE in index.html calls `window.ResonateLib.load()`, which is defined in [library-loader.js](../library-loader.js). The loader:

1. Reads `window.SUPABASE_CONFIG` from [supabase-config.js](../supabase-config.js) (gitignored; template in [supabase-config.example.js](../supabase-config.example.js)). Missing / placeholder values → no-op, badge stays grey.
2. Issues three `fetch()` calls **in parallel** with `Promise.allSettled` so a missing `reference_constructions` table (pre-migration) doesn't kill the point/line/area path:
   - `GET /rest/v1/reference_noise_sources?select=*`
   - `GET /rest/v1/reference_noise_source_categories?select=id,name`
   - `GET /rest/v1/reference_constructions?select=*`
3. 4-second AbortController timeout on each fetch.
4. Partitions `reference_noise_sources` rows by `source_kind` ∈ {`point`, `line`, `area`, `building`} and maps each row into the app's in-memory shape. Overall `lw`/`lw_m_dba`/`lw_m2_dba`/`lp_dba` is computed client-side via A-weighted octave sum (weights `[-26.2,-16.1,-8.6,-3.2,0,1.2,1.0,-1.1]`). The `building` rows store interior Lp (not Lw); the math is identical for the broadband sum so the same `overallLwA()` helper is reused via `mapBuildingLpRow()`.
5. Sanity check: if all three source buckets are empty, throws "empty libraries" and the catch branch keeps the offline snapshot.
6. On success, overwrites the four `window.*` libraries in place and calls `window.rebuildAllLibraries()`.

The boot IIFE then re-points the outer-scope identifiers back at the window copies (belt-and-braces for scopes where unqualified lookups might have cached the old objects) and runs `normalizeSourceLibraryNames()` on the Supabase data so the in-app "Lw XX dB(A)" name-suffix rule is still enforced.

### rebuildAllLibraries()

Defined in index.html immediately after the four library declarations. Calls, in order:

1. `rebuildSourceLibraries()` — the pre-existing helper that merges `_customSources` from localStorage, recomputes `SOURCE_LIBRARY_ALL`, `SOURCE_LIBRARY` (non-Lmax), `SOURCE_LIBRARY_LMAX`, and the grouped non-Lmax / Lmax variants.
2. `rebuildLineSourceGrouped()` — rebuilds `LINE_SOURCE_LIBRARY_GROUPED` from `window.LINE_SOURCE_LIBRARY`.
3. `rebuildAreaSourceGrouped()` — same for area.
4. `rebuildBuildingLpGrouped()` — rebuilds `BUILDING_LP_LIBRARY_GROUPED` from `window.BUILDING_LP_LIBRARY`. Used by the `#bs-lib-combo` searchable dropdown in the building source floating panel.
5. `rebuildConstructionGrouped()` — rebuilds the `{Walls, Roof, Openings}` display-grouped shape for `window.CONSTRUCTION_LIBRARY`.
6. `refreshAllSourceDropdowns()` if defined — the existing helper that re-populates visible source-type dropdowns without disturbing user selections.

All four rebuild functions use `try/catch` wrappers so an exception in one doesn't prevent the others from running.

### Status badge

`#resonateLibBadge` is a clickable pill added to the `.h1` element in [index.html:1576](../index.html:1576). `library-loader.js` exposes `_updateBadge()` which colours the pill by state:

| State | Colour | Text |
|---|---|---|
| `idle` / no config | grey | `Library: offline snapshot` |
| `loading` | amber | `Library: loading…` |
| `live` (Supabase hot-swap succeeded) | green | `Library: Supabase (live)` |
| `error` (fetch failed / empty DB / timeout) | red | `Library: offline (error)` |

Clicking the badge opens the admin modal.

### Supabase schema extensions

Run [supabase/migration.sql](../supabase/migration.sql) in Supabase Studio → SQL Editor. The file is idempotent (every `CREATE`/`ALTER`/`CREATE POLICY` is guarded via `IF NOT EXISTS` or a `DO $$ … EXCEPTION WHEN duplicate_object` block).

**Extensions to `reference_noise_sources`** (an existing shared table; the extensions are additive and non-destructive for other consumers):
- `source_kind text NOT NULL CHECK (source_kind IN ('point','line','area','building'))` — the `building` value stores interior Lp presets used by the building source panel's library dropdown
- `height_m numeric` — source Z offset above ground (null for `building` rows)
- `display_group text` — dropdown group label used by the UI (falls back to a pretty-printed category name when null)
- `UNIQUE (name, source_kind)` — lets the same physical source (e.g. "Small truck driving slowly") exist as both a point preset and a line preset with different spectra

**New table `reference_constructions`** — `(id uuid PK, kind text CHECK walls|roof|openings, name text, rw numeric, octave_r jsonb, notes text, UNIQUE(kind,name))` with an `updated_at` trigger.

**New table `app_admins`** — `(email text PK, notes text, added_at timestamptz)`. This is the allowlist RLS checks against for writes.

**RLS policies** — every library table has:
- `anon_read` — `FOR SELECT USING (true)` — public reads via the publishable key
- `admin_write` — `FOR ALL USING/WITH CHECK ( exists(select 1 from app_admins where email = auth.jwt() ->> 'email') )`

### Seeded data

The migration inserts (idempotent via `ON CONFLICT (name,source_kind) DO NOTHING`):
- **34 Mechanical units point sources** (exhaust fans, condensers, Braemar evaporative coolers, Carrier/Daikin chillers, cooling tower, Cummins gensets, firepump) — none existed in the DB before.
- **2 Forklift point sources** — Gas forklift & Diesel forklift "typical activity". The Electric variant already existed in the DB.
- **1 Car wash (manual)** — already had the auto variant.
- **10 Line sources** — Small/Medium/Large truck driving slowly + exhaust (`lw_m_dba` per metre), Car < 30 km/h, Electric/Gas/Diesel forklift driving.
- **5 Area sources** — Light vehicle movements, Car park with trolley collection, Restaurant/cafe outdoor area, General loading/unloading, General construction.
- **12 Building Lp presets** (`source_kind='building'`) — interior Lp spectra for Gymnasium (general/amplified), Restaurant/café, Bar/pub (live music), Nightclub, Workshop (light/heavy), Warehouse forklift, Childcare indoor play, Church amplified service, Office open plan, Supermarket. Used by the `BUILDING_LP_LIBRARY` dropdown in the building source panel.
- **13 Rw records in `reference_constructions`** — 5 walls, 3 roof, 5 openings (values sourced from the pre-existing `CONSTRUCTION_LIBRARY` literal).

Also: fixes the pre-existing `Gynmasium` → `Gymnasium` typo in `reference_noise_sources` and backfills `display_group` for all 81 pre-existing rows based on their current `category_id` so they group cleanly in the app's dropdown.

### Admin UI (magic-link)

[supabase-admin.js](../supabase-admin.js) wires a click handler onto `#resonateLibBadge`. Flow:

1. **No token** → modal shows an email input + "Send magic link" button. `POST /auth/v1/otp` with `{email, create_user:false, email_redirect_to: location}` sends the OTP.
2. **Magic link click** → user lands back on the app with `#access_token=...&expires_in=...&type=magiclink&...`. `consumeHashTokens()` parses the fragment, decodes the JWT payload for `email`, stores `{token, email, expiresAt}` in `sessionStorage` under key `resonate_admin_session`, then `history.replaceState` clears the hash so a refresh doesn't re-consume it.
3. **Signed in** → the modal auto-opens (one-shot flag `resonate_admin_opened_after_login`) and shows a 5-tab browser (Point / Line / Area / **Building Lp** / Construction). Each tab is driven by a `LIB_SPECS` entry declaring the REST table, filter, list columns, form fields, field defaults, and which octave keys to use. The Building Lp tab filters `reference_noise_sources` by `source_kind=eq.building` and exposes name, dropdown group, source citation, plus the same 8 octave-band inputs as point sources (representing interior Lp instead of Lw).
4. **CRUD operations** use plain `fetch()` against PostgREST with `Authorization: Bearer ${access_token}`. Writes that RLS rejects (email not in `app_admins`) surface as `HTTP 403` in the form's error box. After any successful write, the loader re-fetches and `rebuildAllLibraries()` re-populates live dropdowns.
5. **Sign out** clears both the in-memory `authState` and `sessionStorage`.

The session key is stored in `sessionStorage` (not `localStorage`) so closing the tab forces re-authentication. No refresh-token flow — when the hour-ish access token expires, the next write fails with 401 and the user re-logs-in.

### Files

| File | Purpose |
|---|---|
| [supabase-config.js](../supabase-config.js) | Local project URL + publishable key (gitignored) |
| [supabase-config.example.js](../supabase-config.example.js) | Committed template with placeholder values |
| [library-loader.js](../library-loader.js) | Fetch + map + hot-swap + badge |
| [supabase-admin.js](../supabase-admin.js) | Magic-link auth + CRUD modal |
| [supabase/migration.sql](../supabase/migration.sql) | One-shot schema + RLS + seed SQL to paste into Supabase Studio |
| [.gitignore](../.gitignore) | Excludes `supabase-config.js` from commits |

## UI Layout — Empty states, initial collapse, and map guide overlay

### Initial collapse state

The drawer opens with ALL panels collapsed on every fresh page load. `setInitialCollapseState()` runs once after `initCollapse()` completes. It handles both drawer collapse mechanisms:

1. **`initCollapse`-managed cards** — `.card-body.collapsed` class (CSS `.card-body.collapsed { display: none }`). Glyph on the `.collapse-btn` flipped to ▼.
2. **Inline-toggle cards** — static HTML has its own `onclick` on a `.collapse-btn` that toggles `innerBodyDiv.style.display`. The 4 known inline-toggle panels are `critBody/critToggleBtn`, `pdcBody/pdcToggleBtn`, `mbs010Body/mbs010ToggleColBtn`, `objectsPanelBody/objectsPanelToggle`. `setInitialCollapseState` sets their body `style.display = 'none'` directly.

After initial collapse, the user has full manual control for the rest of the session. `render()` does NOT touch panel collapse state. `expandAllPanels()` is the symmetric reverse, called after `loadAssessment()` success (800 ms settle).

Both helpers are exposed as `window._setInitialCollapseState` and `window._expandAllPanels`.

### Empty-state guidance messages

Three `.panel-empty-state` divs are inserted into the drawer IIFE after panels move, using `drawerContent.querySelector` (not `document.getElementById` — drawerContent is detached from the document at this point):

| Message ID | Inserted before | Shown when |
|---|---|---|
| `critEmpty` | First child of `#critBody` | No receivers placed |
| `daySourceEmpty` | `#daySrcTable` | No source placed |
| `predEmpty` | `#predTableDay` | Not (source AND receiver AND Lw data) |

CSS: `.panel-empty-state { display: none; ... }` + `.panel-empty-state.show { display: block }`.

### updateEmptyStates() — hooked at end of render()

Computes `hasSource` (via `sourcePins.some(p.lat !== null)`), `hasAnyReceiver` (via `window.getReceiverLatLng('r1'..'r4')`), and `hasSourceData` (via `hasLwForPeriod`). For each rule, `toggle(emptyId, tableEl, show)`:
- Adds/removes `.show` on the empty-state div
- Moves the underlying table off-screen via `position: absolute; left: -9999px` (not `display: none`) when the empty state is shown, so Save/Load and Generate Report still find the table in the DOM

### Map guide overlay

Inserted during the drawer IIFE inside `#mapInnerWrapper`:
```css
#map-guide-overlay {
  position: absolute; top: 50%; left: 40%;
  transform: translate(-50%, -50%);
  z-index: 500;
  pointer-events: none;
  transition: opacity 0.4s ease;
}
#map-guide-overlay.guide-hidden { opacity: 0; pointer-events: none; }
```
`left: 40%` biases the overlay away from the right-side drawer so it's visually centred in the visible map area. `pointer-events: none` lets map clicks pass through. `window._hideMapGuide()` / `window._showMapGuide()` exposed for external hooks. The main trigger is inside `updateEmptyStates()` — when any source or receiver is placed, the `.guide-hidden` class is added.

### Contextual compliance strip empty-state

`updateComplianceStrip()` branches into four distinct messages before the normal per-receiver display:

| Source? | Receivers? | Lw? | Message |
|---|---|---|---|
| No  | No  | —   | "Click the map to place a noise source and receivers" |
| Yes | No  | —   | "Source placed — now add receivers at sensitive locations" |
| No  | Yes | —   | "Receivers placed — now add a noise source" |
| Yes | Yes | No  | "Configure noise sources to see predictions" |
| Yes | Yes | Yes | (normal pred/crit/margin display) |

## UI Layout — Header redesign, construction banner, Methodology access

### Header structure

The `#app-header` is a single flex row (`display: flex; align-items: center; column-gap: 18px`). No wrap, no intro paragraph — one compact row only:

```
#app-header
├── .header-brand
│   ├── <a href="resonate-consultants.com"><img.logo></a>   (36px logo — the image IS the wordmark, no text duplicate)
│   └── .header-brand-text
│       ├── .header-title      ("Environmental Noise Screening Tool", 19px, #1f2937, appended #stateBadge)
│       └── .header-version    ("v2.0 — March 2026", 11px muted)
├── .h1                         (original title — kept in DOM but display:none)
├── #policyRefText              (original intro — kept in DOM but display:none)
├── #collapseAllBtn             (hidden)
└── #app-header-actions         (margin-left: auto → right-aligned)
    ├── #exportJsonBtn          (Save Assessment)
    ├── #importJsonBtn          (Load Assessment)
    ├── #generateReportBtn      (Generate Report, default hidden)
    ├── #shareAssessmentBtn     (Share Assessment)
    └── #gisExportDropdown      (GIS Export dropdown — see below)
        ├── #gisExportHeaderBtn ("GIS Export ▾")
        └── #gisExportMenu.header-dropdown-menu
            ├── [data-action="geojson" data-target="exportGeoJsonBtn"] "GeoJSON"
            ├── [data-action="kml"     data-target="exportKmlBtn"]     "KML"
            └── [data-action="csv"     data-target="exportCsvBtn"]     "CSV"
```

Total header height ≈ 61px on desktop.

### GIS Export dropdown

Each menu item reuses the existing drawer GIS Export button's click handler by dispatching `.click()` on the element with the id in `data-target`:

```js
item.addEventListener('click', function() {
  var target = document.getElementById(item.getAttribute('data-target'));
  if (target) target.click();
  gisMenu.classList.remove('open');
});
```

This avoids duplicating the export logic (which builds GeoJSON feature collections, KML placemarks, and CSV rows) — any future changes to the drawer buttons' handlers automatically flow through to the header dropdown. Toggle is `e.stopPropagation()` + `classList.toggle('open')`; outside click uses a document-level listener that removes `.open`. Menu is absolutely positioned below the button with `top: calc(100% + 4px); right: 0` so it aligns to the button's right edge (never overflows the viewport on typical button positions).

### Construction banner

A standalone `#construction-banner` element is inserted between `#app-header` and `#app-layout`:

```css
#construction-banner {
  flex-shrink: 0;
  padding: 4px 16px;
  font-size: 11px;
  font-weight: 600;
  color: #92400e;
  background: #fef3c7;
  border-bottom: 1px solid #fcd34d;
  text-align: center;
}
#construction-banner::before { content: "⚠"; margin-right: 6px; }
```

Height ≈ 23px. Created in the Phase 1 IIFE by extracting the text from the old `.sheet1` > inner warning div, then inserted into `<body>` via:

```js
body.insertBefore(appHeader, pdfArea);
body.insertBefore(constructionBanner, pdfArea);
body.insertBefore(appLayout, pdfArea);
```

`body.drawer-layout` is a flex column; `#app-layout { flex: 1; min-height: 0 }` fills the remaining viewport below the header + banner with no explicit height calculation.

### Methodology access

The Methodology panel is a `<div class="card" id="methodologyCard">` containing ~24 sections of acoustic methodology reference (propagation, barrier diffraction, terrain screening, conformity, data sources, etc.). The card is still appended to `#drawer-content` (so PDF export and the modal clone path can read it) but is set to `style="display:none"` immediately after being moved there — it is no longer visible when scrolling the RHS drawer, and there is no longer a `Methodology` tab in the jump nav (the `groups` array in `initJumpNav` only contains Setup / Criteria / Sources / Results, and `_insertAllGroupAnchors` no longer inserts `#group-methodology`).

Access is via `#side-panel-methodology-btn` in `#side-panel-footer` (LHS side panel, directly under the Show/Hide-assessment-panel drawer toggle). The button is created in `_resonateSidePanelBoot` and on click calls `showMethodologyModal()`, which:

1. Removes any existing `#methodologyModal` in the DOM (idempotent).
2. Reads `#methodologyCard.innerHTML` (the card stays in place; this is a clone via `insertAdjacentHTML`, not a move).
3. Builds a full-viewport fixed backdrop at `z-index:10000` containing a centred white 800 px-max box with `max-height:85vh`, `overflow-y:auto`, and a sticky top-right `×` close button.
4. Wires close on × click, backdrop click, and `Escape` key (the keydown handler is registered once and self-removes after firing).

The function is exposed on `window.showMethodologyModal` so any future caller can reuse it. Because the card's HTML is only cloned (not moved), the original `#methodologyCard` in the hidden drawer position remains intact — `initCollapse()` has already wrapped its sections before the modal ever opens, so the cloned DOM displays with the same collapsed-by-default section state.

**Focus restoration fallback.** On open, `_methPrevFocus = document.activeElement` captures the opener. On close, the restore block verifies `document.contains(_methPrevFocus)` before calling `.focus()`; if the opener has been removed from the DOM (drawer re-render, `_resonateSidePanelBoot` rebuild, opener hot-swap), focus falls back to `document.getElementById('side-panel-methodology-btn')` on the current DOM. This prevents focus from silently dropping to `document.body` when the opener node is stale. `#side-panel-methodology-btn` is currently the only opener for this modal — if additional openers are added, extend the fallback chain in `closeMethodologyModal` accordingly.

`#side-panel.collapsed #side-panel-methodology-btn { display: none }` hides the button while the side panel is in its collapsed state (matching the other footer controls).

### Pre-existing Phase 1 drawer bug — GIS Export + Methodology stranded

The original Phase 1 IIFE contained:
```js
var sibling = pdfArea.nextElementSibling;
while (sibling && sibling.tagName !== 'SCRIPT') { ... }
```

This expected GIS Export and Methodology to be SIBLINGS of `#pdfArea` but they are actually DESCENDANTS (inside `#pdfArea > .container`). The walk found nothing, so both panels were stranded inside the hidden `#pdfArea` for all of Phase 1–4. Users literally could not see either panel.

Replaced with:
```js
var pdfArea = document.getElementById('pdfArea');
if (pdfArea) {
  pdfArea.querySelectorAll('.card').forEach(function(card) {
    if (card.closest('#drawer-content')) return;
    if (card.id === 'recommendationsCard') return;
    if (card.id === 'methodologyCard') return;
    var h2 = card.querySelector('h2');
    if (h2 && h2.textContent.trim().indexOf('GIS Export') === 0) {
      card.id = card.id || 'gisExportCard';
      drawerContent.appendChild(card);
    }
  });
}
var methCardEl = document.getElementById('methodologyCard');
if (methCardEl) {
  drawerContent.appendChild(methCardEl);
  methCardEl.style.display = 'none';
}
```

GIS Export lands in the Export group (after pdfBtn / recommendationsCard). Methodology is appended to `#drawer-content` but immediately hidden — it has no jump-nav entry and no anchor. The card stays in the drawer DOM only so `showMethodologyModal()` can clone its innerHTML and PDF export can still read it; it is accessed exclusively via `#side-panel-methodology-btn` in the LHS side panel footer (see *Methodology access* above).

## UI Layout — Map toolbar row consolidation

### Container

`#mapPanelContainer` (originally top-right with Save JPG and the `.mp` dropdown buttons) is now the single left-aligned toolbar row at the top of the map:

```css
#map-column #mapPanelContainer {
  position: absolute;
  top: 10px;
  left: 54px;              /* right of Leaflet zoom (30px at left:10px) + 14px gap */
  right: auto;
  z-index: 1000;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  pointer-events: none;     /* passthrough except on real children */
}
#map-column #mapPanelContainer > * { pointer-events: auto; }
```

### Child order

Set in the Phase 1 IIFE by calling `mapPanelContainer.appendChild(el)` in this order (each `appendChild` moves the element to the end, producing the final sequence):

1. `#mp-help` — Quick Reference toggle
2. `#mapSearchWrapper` — search input + button + `#mapSearchResults` dropdown
3. `#mp-mapping` — Mapping layers dropdown
4. `#mp-tools` — Tools dropdown
5. `#mp-suggest` — Suggested noise sources from PDF
6. `#mp-undo` — Undo button
7. `#mp-redo` — Redo button
8. `#mp-modelling` — Noise map controls dropdown
9. `#mp-save-jpg` — Save JPG button
10. `#mp-toggle-drawer` (`#drawerPanelBtn`) — Show/Hide assessment panel drawer toggle. Wraps the old `#mapMaximiseBtn` SVG icon + `#mapMaximiseBtnLabel` span in a `.mp > .mp-hdr` shell. Click handler calls `window.toggleMapFullscreen()` which in turn calls `window._setDrawerOpen(!isOpen)`. `setDrawerOpen()` writes the label text (`Hide assessment panel` when drawer open, `Show assessment panel` when closed). Drawer defaults to collapsed on fresh page load.

### Search bar inside the toolbar

`#mapSearchWrapper` is built in the Phase 1 IIFE (no longer a standalone overlay). Its inline positioning CSS was removed; it now flows as a flex child:

```css
#map-column #mapSearchWrapper {
  position: relative;         /* anchor for #mapSearchResults */
  flex: 1 1 220px;
  min-width: 140px;
  max-width: 280px;
  height: 28px;
  display: flex;
  align-items: stretch;
  background: rgba(26,32,44,0.9);
  border-radius: 7px;
  overflow: hidden;
}
```

`#mapSearchInput` and `#mapSearchBtn` have their inline style attributes stripped in the IIFE after `innerHTML` rebuild so the new dark theme applies cleanly. `#mapSearchResults` stays at `position: absolute; top: 100%; left: 0; right: 0` — anchors to the wrapper so the results dropdown opens directly below the input.

### Dropdown menu anchoring

`.mp-body` used to open with `right: 0; left: auto` (right-anchored to the right-side container). In the new layout every button is left-anchored, so the rule is overridden:

```css
#map-column #mapPanelContainer .mp-body {
  right: auto;
  left: 0;
  border-radius: 0 4px 7px 7px;  /* top-left squared against button, others rounded */
  z-index: 1100;                  /* above the toolbar row (1000) and status row (800) */
}
#map-column #mapPanelContainer #mp-tools .mp-body,
#map-column #mapPanelContainer #mp-mapping .mp-body,
#map-column #mapPanelContainer #mp-modelling .mp-body {
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}
```

### Dynamic max-height (small-viewport fix)

The CSS `max-height: calc(100vh - 120px)` alone doesn't account for the dropdown's actual `top` position on screen (~165px due to the app header + toolbar row). On a 700px viewport the static formula allows 580px but only 519px is actually available below the dropdown top, clipping the bottom of long menus.

`toggleMapPanel(id)` (defined near the top of `#mapInnerWrapper`) now re-measures after toggling the `mp-open` class:

```js
var opened = document.getElementById(id);
if (opened && opened.classList.contains('mp-open')) {
  var body = opened.querySelector('.mp-body');
  if (body) {
    body.style.maxHeight = '';  // clear prior inline so rect reads cleanly
    var rect = body.getBoundingClientRect();
    var avail = window.innerHeight - rect.top - 16;
    body.style.maxHeight = Math.max(200, avail) + 'px';
  }
}
```

Runs every time a dropdown opens, so browser resizes are handled on next open without needing a resize listener. `Math.max(200, ...)` guards against absurdly small viewports. The static CSS rule stays as a fallback for the first paint before JS runs. Verified at simulated 700px viewport: Tools menu's last item "Clear All" is reachable by scrolling.

The three biggest menus (Tools with ~23 items, Mapping, Modelling) scroll internally instead of clipping. The `.mp-open` class mechanism is unchanged.

### Marker status row

```css
#map-column .map-status-row {
  position: absolute;
  bottom: 24px;                /* above the Leaflet attribution strip */
  left: 10px;
  top: auto !important;        /* override any prior top */
  right: auto !important;
  z-index: 800;
}
```

Moved to the bottom-left of the map so it doesn't clip toolbar dropdowns. The Leaflet attribution strip sits at bottom-right and no `L.control.scale` is configured, so bottom-left is clear.

### Show/Hide assessment panel button in toolbar

The Phase 4 `#drawerPanelBtn` / `#mp-toggle-drawer` wrapper remains in the toolbar as the LAST item (after Save JPG). It reuses the SVG icon and label span that originally belonged to the hidden `#mapCard`'s `#mapMaximiseBtn`. Click handler calls `window.toggleMapFullscreen()` which delegates to `window._setDrawerOpen(!isOpen)`. `setDrawerOpen()` syncs the label: "Hide assessment panel" when the drawer is open (click to close), "Show assessment panel" when closed (click to re-open). The drawer defaults to collapsed on fresh page load so the map is unobstructed until the user opts in. Both this button and the drawer's own edge triangle (`#drawer-toggle`) work — they're kept as parallel discovery surfaces.

## UI Layout — Phase 4: Expand button cleanup + Esc priority + responsive fallback

### Expand button repurposed

- `#mapMaximiseBtn` (the old "Expand" button) was originally in `#mapCard`'s card header, which is hidden in Phase 1. During the Phase 1 IIFE it is now physically moved into `#mapPanelContainer` (the top-right map toolbar) and wrapped in a new `.mp#mp-toggle-drawer > .mp-hdr#drawerPanelBtn` structure so it visually matches Save JPG, Mapping, Tools, and Modelling.
- Inline `onclick="toggleMapFullscreen()"` is removed; a click listener is attached to the new `.mp-hdr` wrapper calling `window.toggleMapFullscreen()`.
- `window.toggleMapFullscreen()` is rewritten: it now calls `window._setDrawerOpen(!drawer.classList.contains('drawer-open'))`. The old `_enter()` / `_exit()` helpers and the `.map-fullscreen` CSS remain in the file as dead code (no call sites) to minimise risk — they can be removed in a later cleanup pass.
- Button label syncs with drawer state inside `setDrawerOpen()`: `#mapMaximiseBtnLabel` shows `Hide assessment panel` when the drawer is open and `Show assessment panel` when it's closed. The drawer initialises collapsed on fresh page load (opens only if `resonate_drawer_open === 'true'` in localStorage).
- The `E` keyboard shortcut continues to call `toggleMapFullscreen()` — it now toggles the drawer.

### Esc key priority chain

- A capture-phase `keydown` listener is added on `window` inside the drawer IIFE. It fires BEFORE any bubble-phase listener.
- If the key is `Escape` AND the drawer has class `drawer-open` AND the event target is not an `<input>/<select>/<textarea>`: it calls `setDrawerOpen(false)`, `stopPropagation()`, and `stopImmediatePropagation()`.
- If the drawer is closed, the listener is a no-op and existing Esc handlers run normally (draw-mode cancel, modal close, context menu dismiss, etc.).
- User experience: first Esc closes the most recent overlay (the drawer), second Esc dismisses the next layer (modal, draw mode, etc.).

### Quick Reference update

- The keyboard shortcuts modal (`#helpFloatPanel`) now has a dedicated `Layout` subsection:
  - `]` — Toggle side panel
  - `E` — Toggle side panel
  - `Esc` — Close side panel (if open)
- The old `E — Expand/restore map` and `Esc — Exit maximised mode` entries were removed from the Tools and Editing sections since they no longer describe the current behaviour.

### Responsive breakpoints

| Width | Behaviour |
|---|---|
| > 1024px | Default (Phase 1–3): drawer starts at 520px, resizable via handle with saved `resonate_drawer_width` |
| ≤ 1024px | `#drawer-panel { width: 420px; min-width: 320px; }` — compact desktop / tablet landscape |
| ≤ 767px | `#drawer-panel { width: 100%; }` — drawer becomes full-width overlay; resize handle hidden (`display: none`); `#drawer-toggle` moves from top-right to `bottom: 8px; left: 8px` with a box-shadow so it remains reachable when the full-width drawer is open |

Note: The Phase 3 JS clamp (`min 360px, max 85vw`) still applies at all viewports when the user drags the handle. The responsive CSS uses `!important` on `width` at the 767px breakpoint to override any inline width set by the drag handler or localStorage restore.

## UI Layout — Phase 3: Drawer resize handle

### Element

- `#drawer-resize-handle` — 6px-wide vertical bar absolutely positioned at `left: -3px` on `#drawer-panel`, spanning the full height. `cursor: col-resize`. First child of `#drawer-panel` (inserted before `#drawer-toggle`, `#drawer-header`, `#drawer-content`).

### Drag behavior

- Pointer events (`pointerdown` / `pointermove` / `pointerup` / `pointercancel`) with `setPointerCapture` so the drag follows the pointer even when it moves over the map (no event loss).
- On drag start: records `startX` and `startWidth`, sets `.dragging` class for blue highlight, applies `cursor: col-resize` and `user-select: none` to `body` (prevents text selection during drag).
- On drag move: `dx = startX - clientX` (inverted because handle is on LEFT edge of drawer); `newWidth = startWidth + dx`. Assigns `drawer.style.width = clampWidth(newWidth) + 'px'`.
- On drag end: persists final width to localStorage and calls `window._map.invalidateSize()` so the map rescales.

### Clamp constraints

`clampWidth(px)` returns `Math.max(360, Math.min(Math.round(window.innerWidth * 0.85), px))`:
- **Min**: 360px — wide enough to show the compliance strip and jump nav legibly
- **Max**: 85% of viewport width — always leaves at least 15vw of map visible

Clamping is applied in three places:
1. During drag (`pointermove`)
2. On init, when restoring the saved width from localStorage
3. On `window.resize` — if the viewport shrinks and the saved width exceeds 85vw, re-clamps automatically and invalidates map size

### localStorage

| Key | Values | Purpose |
|-----|--------|---------|
| `resonate_drawer_width` | Width string with `px` suffix (e.g. `"620px"`) | Persists drawer width across reloads |

### PDF export round-trip

The handle lives on `#drawer-panel` (not `#drawer-content`). Both `_restoreForPdfExport()` and `_restoreDrawerLayout()` only move children of `#drawer-content`, so the handle survives the round-trip without re-creation. Drag functionality continues to work after a Generate Report cycle.

## UI Layout — Phase 2: Sticky compliance strip + jump nav

### Layout elements added in Phase 2

| Element | Purpose |
|---------|---------|
| `#drawer-header` | Sticky container between `#drawer-toggle` and `#drawer-content`. `flex-shrink: 0` keeps it visible while the drawer scrolls. Holds the compliance strip and jump nav. |
| `#compliance-strip` | Per-receiver compliance summary. Empty state shows `<div class="cs-empty">`. Populated by `updateComplianceStrip()`. |
| `.cs-recv` | One row per placed receiver. Clickable — scrolls drawer to Criteria derivation. |
| `.cs-recv-header` | Top line: `<span class="cs-name">R1 name</span> · zone · basis · clause` |
| `.cs-periods` | Flex row of period cells |
| `.cs-cell.cs-ok` | Green badge: compliant (predicted ≤ criterion) |
| `.cs-cell.cs-bad` | Red badge: exceeded (predicted > criterion) |
| `.cs-cell.cs-na` | Grey badge: missing pred or crit |
| `#jump-nav` | Flex row of `.jump-btn` pills: Setup / Criteria / Sources / Results / Export |
| `.jump-btn.jump-active` | Highlighted state (blue) for current scroll section |
| `.drawer-group-anchor` | Zero-height `<div>` inserted before panel groups in `#drawer-content` — scroll targets for jump nav |

### Group anchor IDs and their targets

Anchors are inserted **inside** the drawer content structure, immediately before the `.grid2` ancestor of each target element. Because the drawer contains one giant wrapper `.grid2` holding Receivers & criteria + Propagation + Custom sources + Predicted levels etc., the helper walks up to the nearest `.grid2` (inner, not outer) and inserts the anchor as its previous sibling. `#drawer-content` has `position: relative` so `anchor.offsetTop` resolves against drawer-content regardless of nesting depth.

| Anchor ID | Target element | Group contents |
|---|---|---|
| `group-setup` | `#devInfoCard` | Development info, Objects, P&D Code, MBS 010 |
| `group-criteria` | `#critBody` | Receivers & criteria, VIC/NSW params, SA/NSW Derivation, Emergency/Music/Childcare criteria |
| `group-sources` | `#customSrcBody` | Custom sources, Propagation method, (hidden noise sources panel) |
| `group-results` | `#predTableDay` | Assessment cases, Source contribution, Characteristic penalties, Predicted noise levels, Recommendations |
| `group-export` | `#pdfBtn` | PDF/Report buttons, GIS Export, Methodology |

> Note: `#sourcePanel` has `display: none` in most states, so it's not a reliable jump target. `#customSrcBody` is always visible and serves as the "Sources" anchor.

### Data flow: strip rendering

1. `render()` (line ~12804) iterates receivers and computes criteria + predictions as usual.
2. At the top of each iteration, `var _recCrit = null;` is declared. Each conditional branch (OTHER / NSW / VIC / SA) sets `_recCrit = crit;` so the `.cl54` and `.cl6` flags survive the branch boundary.
3. At the bottom of the iteration, per-receiver strip data is written into `window._stripData[i]`:
    ```js
    { id, placed, name, zone, basis, clause, day: {pred, crit}, eve, night, lmax }
    ```
    - `placed` uses `window.getReceiverLatLng(id)` (the `latlngs` object is scoped inside `initMap`'s closure and not globally accessible)
    - Zone/basis/clause are constructed per state — see below
4. After the loop, `render()` calls `updateComplianceStrip()` which reads `window._stripData` and rebuilds `#compliance-strip` HTML.

### Zone / basis / clause strings by state

| State | Zone | Basis | Clause |
|---|---|---|---|
| SA | `document.getElementById(rid).options[.selectedIndex].text` | `#{rid}_recvtype_disp.textContent` → `INL-5` or `INL` | `_cl6Cache[rid].applies` → `Cl 5(6)`; else `_recCrit.cl54` → `Cl 5(4)`; else `Cl 5(5)` |
| VIC | `_lastDetectedZoneLabels[rid]` ‖ dropdown text | `EPA 1826.5` | `vicAreaType === 'rural' ? 'Rural' : 'Urban'` |
| NSW | `_lastDetectedZoneLabels[rid]` ‖ dropdown text | `NPI` | `''` |
| OTHER | `''` | `Manual` | `''` |

### Period visibility

`periodCell()` in `updateComplianceStrip()` naturally hides a period when both `pred` and `crit` are missing (returns empty string). Cases handled:
- OTHER state with period checkbox off → `dayCrit/eveCrit/...` is `''` → period hides
- SA evening → `eveCrit = ''` → evening hides
- No source data for period → `pred = ''` → cell shows as `—/crit` (grey) if crit exists

### Jump nav + scroll spy

Defined inside the drawer IIFE (after `_restoreDrawerLayout`). Uses `dc.scrollTo({ top: anchor.offsetTop - headerH - 4, behavior: 'smooth' })`. The scroll spy adds `headerH + 10` to `scrollTop` and marks the last anchor whose `offsetTop <= scrollTop + headerH + 10` as active. `window._scrollDrawerTo(anchorId)` is exposed for the auto-scroll-on-receiver-placement handler and the strip row click handler.

### Auto-scroll on receiver placement

In the map click handler (~line 20713), after `placeMarker()` is called for non-source modes:
- Opens the drawer if closed via `window._setDrawerOpen(true)`
- 350ms later calls `window._scrollDrawerTo('group-criteria')` (delay covers drawer transition + zone-detection render)

### PDF export round-trip

`_restoreDrawerLayout()` re-calls `_insertAllGroupAnchors()` and `updateComplianceStrip()` after moving content back to the drawer, so Phase 2 structures survive PDF export cycles.

### localStorage keys (Phase 2 adds none)

Phase 2 does not add new localStorage keys — strip state is derived fresh from `window._stripData` on every render.

## UI Layout — Phase 1: Full-viewport map with drawer

### DOM restructuring

The page loads with the original HTML structure intact, then an inline `<script>` block (before `shared-calc.js`) restructures the DOM synchronously before `DOMContentLoaded` fires. This ensures Leaflet's `initMap()` initialises `#noise-map` in its new position.

### Layout elements

| Element | Purpose |
|---------|---------|
| `#app-header` | Compact header: logo + title + action buttons (row 1), under-construction notice + intro text (row 2) |
| `#app-header-row1` | Horizontal flex row for logo, `.h1` title, Collapse All btn, Save/Load/Report/Share buttons |
| `#app-layout` | Flex child that fills remaining viewport height below header |
| `#map-column` | Absolutely positioned, fills `#app-layout`. Contains `#mapInnerWrapper` (with `#noise-map`, toolbars, fullscreen sidebar), search bar overlay (`#mapSearchWrapper`), and status row |
| `#drawer-panel` | 520px right-side overlay on top of map. Classes: `drawer-open` / `drawer-closed` |
| `#drawer-toggle` | Button docked to left edge of drawer, toggles open/closed |
| `#drawer-content` | Scrollable container inside drawer, holds all panels in original order |

### Body class

- `body.drawer-layout` — Activates the full-viewport flex layout (`display: flex; flex-direction: column; height: 100vh; overflow: hidden`)

### localStorage keys

| Key | Values | Purpose |
|-----|--------|---------|
| `resonate_drawer_open` | `"true"` / `"false"` | Persists drawer open/closed state (default: collapsed — only opens if value is exactly `"true"`) |
| `resonate_disclaimer_accepted` | `"true"` | Hides disclaimer banner on subsequent visits |

### Keyboard shortcut

- `]` — Toggles drawer open/closed (ignored when focus is in input/select/textarea)

## Hotkey reference

The global keyboard shortcut switch lives at [`index.html:34233`](../index.html:34233). All cases are gated by an early return when `e.target.tagName` is `INPUT`/`TEXTAREA`/`SELECT` or when the element is `contentEditable`, and by a second early return when any of `ctrlKey`/`metaKey`/`altKey` is down (so that `Ctrl+Z` / `Ctrl+Y` continue to be handled by the undo manager at [`index.html:19455`](../index.html:19455)).

### Full hotkey table

| Key | Action | Target element / handler | Notes |
|-----|--------|--------------------------|-------|
| `P` | Place point source | `mapMode-addSource` | |
| `L` | Draw line source | `drawLineSourceBtn` | |
| `A` | Draw area source | `drawAreaSourceBtn` | |
| `K` | Draw building source | `drawBuildingSourceBtn` | |
| `1` / `2` / `3` / `4` | Place Receiver 1–4 | `mapMode-r1` … `mapMode-r4` | |
| `B` | Draw barrier | `drawBarrierBtn` | |
| `N` | Draw new building | `drawBuildingBtn` | |
| `G` | Draw ground absorption zone | `drawGroundZoneBtn` | |
| `T` | Toggle terrain | `terrainToggleBtn` | |
| `C` | Toggle terrain contours | `terrainContourBtn` | requires Terrain ON |
| `O` | Toggle OSM buildings layer | `buildingsToggleBtn` | |
| `F` | Toggle reflections | `reflectionsBtn` | ISO 9613-2 §7.5 |
| `R` | Ruler (distance measure) | `rulerBtn` | |
| `W` | Toggle CoRTN road-draw mode | `drawCortnRoadBtn` | UK CoRTN method with Australian adjustments; `W` = "Way" |
| `M` | Toggle noise map | `noiseMapBtn` | |
| `H` | Show/hide all modelling objects | `pinsToggleBtn` | |
| `Z` | Toggle zoning overlay | `zoneToggleBtn` | |
| `S` | Focus map search input | `mapSearchInput` | focuses + selects |
| `E` | Maximise/restore map | `toggleMapFullscreen()` | also toggles the drawer |
| `?` | Open keyboard/help panel | `helpToggleBtn` | |
| `]` | Toggle assessment drawer open/closed | `drawerPanel` | capture-phase handler at [`index.html:3848`](../index.html:3848) |
| `Esc` | Exit fullscreen / close drawer / close source panel / hide context menu / cancel area-source edit / cancel line-source edit | multiple | multiple listeners; drawer Esc at [`index.html:3859`](../index.html:3859) runs in capture phase so it fires first |
| `Delete` | Delete the currently-selected barrier | `_selectedBarrier` | only when a barrier popup is open and `_drawingActive` is false |
| `Enter` | Submit search / confirm receiver-height input | `mapSearchInput`, per-receiver height `<input>`s | |
| `Ctrl+Z` / `Cmd+Z` | Undo | undo manager at [`index.html:19455`](../index.html:19455) | |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` / `Ctrl+Y` / `Cmd+Y` | Redo | undo manager | |

### Orphan UI hints (button shows a `<span class="mp-kbd">` but no handler is wired)

These are pre-existing reservations in the Mapping panel at [`index.html:2082`](../index.html:2082) that were never wired into the global switch. They are surfaced here so that any future hotkey assignment avoids silent conflicts with the visual promise to users, and so that the hints can be wired up (or relabelled) in a future pass.

| Key | Reserved for | Button |
|-----|--------------|--------|
| `D` | Cadastral layer | `cadastreToggleBtn` |
| `I` | Aerial imagery layer | `aerialToggleBtn` |
| `U` | Urban area boundary | `urbanBoundaryToggleBtn` |
| `X` | MBS 010 screening overlay | `mbs010ToggleBtn` |

### Map invalidation

`window._map.invalidateSize()` is called:
- 200ms after `DOMContentLoaded` (initial layout settle)
- 350ms after drawer toggle click (after CSS transition completes)

### PDF export compatibility

`window._restoreForPdfExport()` and `window._restoreDrawerLayout()` temporarily move content back to the original `#pdfArea > .container > .sheet` structure for html2canvas capture, then restore the drawer layout.

### What stayed intact

- `#mapFullscreenSidebar` and `#mapFullscreenSidebarTab` remain inside `#mapInnerWrapper` (the Objects sidebar for fullscreen mode)
- `#objectsPanelSection` (the Objects panel for normal mode) moved to drawer
- All panel collapse/expand wrappers preserved
- Save/Load uses element IDs — unaffected by DOM position
- Generate Report (Word) uses global `document.querySelectorAll('.card')` — unaffected
- Collapse All uses global `document.querySelectorAll('.card-body')` — unaffected

### Disclaimer banner

- **Element:** `#disclaimer-banner` — fixed-position banner at bottom of viewport (z-index: 10000)
- **Visibility:** Controlled via `localStorage` key `resonate_disclaimer_accepted`
- **CSS class:** `.hidden` for slide-down/fade-out transition; `body.disclaimer-visible` adds bottom padding
- **JS:** Self-executing function at end of `<body>` — checks `localStorage`, removes banner if accepted
- **Responsive:** At `max-width: 600px`, content stacks vertically and button becomes full-width
