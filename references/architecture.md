# Architecture

## Documentation surfaces

The tool has three help-adjacent surfaces. Every meaningful feature must appear in all three, with audience-appropriate framing. UI chrome (buttons, keyboard shortcuts) is N/A in Methodology.

| Surface | Audience | Content focus | File |
|---|---|---|---|
| **Methodology** | Regulator / report reader | WHAT is calculated and HOW — formulas, standards, assumptions, limitations | `index.html` `#methodologyCard` |
| **Quick Reference** | Tool user inside the app | WHERE features live, keyboard shortcuts, capability summary | `index.html` `#helpFloatPanel` |
| **Help Assistant** | New user who is lost | HOW to do specific tasks, step-by-step with UI highlighting | `help-assistant-kb.js` |

### Canonical panel names

| Label | DOM element | Notes |
|---|---|---|
| Planning & modelling | `spNametag` (JS-injected) | LHS sidebar label |
| Criteria & compliance | `#drawer-panel-label` (JS-injected) | RHS sidebar label |
| Tools menu | `#mp-tools .mp-hdr` | Dropdown, click to open |
| Mapping menu | `#mp-mapping .mp-hdr` | Dropdown, click to open |
| Modelling menu | `#mp-modelling .mp-hdr` | Dropdown, click to open |
| Propagation panel | `#mp-propmethod .mp-hdr` | Dropdown, click to open |
| Receivers & criteria | `[data-help="receivers-criteria-card"]` | RHS card |
| VIC assessment parameters | `[data-help="vic-assessment-card"]` | RHS card, VIC only |
| NSW assessment parameters | `[data-help="nsw-assessment-card"]` | RHS card, NSW only |
| Noise sources | `#sourcePanel` | RHS card |
| Predicted noise levels | `#predNoiseSection` | RHS card |
| Characteristic penalties (SA) / Characteristic adjustments (VIC) / Modifying factor corrections (NSW) | `#charPenaltySection` | RHS card, dynamic heading |
| Objects | `#objectsFloatPanel` | LHS floating panel |
| Quick Reference | `#helpFloatPanel` | LHS floating panel |

### Canonical standard references

Use these forms consistently across all three surfaces:

| Abbreviated (QR / HA) | Full (Methodology first mention) |
|---|---|
| ISO 9613-2 | ISO 9613-2:1996 |
| ISO 9613-2 §7.5 | ISO 9613-2:1996 §7.5 |
| ISO 9613-1 | ISO 9613-1 |
| ISO/TR 17534-3 | ISO/TR 17534-3:2015 |
| EPA Publication 1826.5 | EPA Publication 1826.5 (VIC) |
| NSW NPI | Noise Policy for Industry (NSW EPA, 2017) |
| SA Noise Policy | Environment Protection (Commercial and Industrial Noise) Policy 2023 |
| CoRTN | UK Calculation of Road Traffic Noise, with Australian +2.5 dB adjustment |

---

## Help Assistant

A rule-based, session-only guided chat panel. No LLM, no API calls.

### Files

| File | Purpose |
|---|---|
| `help-assistant-kb.js` | Knowledge base. Exposes `window.HELP_ASSISTANT_KB` — 6 suggestion chips and 42 curated topics, each with intent patterns, answer text, action sequences, and related topic IDs. Includes a `/* CANONICAL TERMS */` block at the top documenting panel names and standard reference formats. |
| `help-assistant.js` | Intent matcher + UI highlight engine. IIFE on DOMContentLoaded. Injects `#ha-launcher` (fixed button, bottom-right) and `#ha-panel` (chat panel) into `document.body`. Session-only state — not written to saved JSON. |
| `help-assistant.css` | Styles for launcher, panel, message bubbles, and highlighting system. |

### Selector convention

Elements lacking stable IDs use `data-help="<id>"` attributes added to `index.html`:

| Attribute | Element |
|---|---|
| `data-help="receivers-criteria-card"` | Receivers & criteria card (`.card.span2[data-section="criteria"]`) |
| `data-help="vic-assessment-card"` | VIC assessment parameters card |
| `data-help="nsw-assessment-card"` | NSW assessment parameters card |

### Key functions (help-assistant.js)

| Function | Purpose |
|---|---|
| `matchIntent(query, kb)` | Scores topics by pattern substring match (+3), token match (+1), title match (+0.5). Min threshold 2. Tokens < 3 chars excluded from per-token scoring. |
| `runActionSequence(actions, btn)` | Runs highlight / open-panel / tip steps in sequence. Returns cancel function. Cancelled by Escape, outside-click, or panel close. |
| `sendQuery(text)` | Resolves intent, renders message, hides suggestion chips. |

### Save/load isolation

The Help Assistant DOM is injected into `document.body` outside any project state container. It holds no project data and writes nothing to the assessment JSON.

## Custom Source Entry Wizard

Custom sources are entered via a metric-selector wizard launched from the "Custom sources" floating panel. The wizard determines which data structure the source becomes:

| Metric | Stores into | Notes |
|--------|-------------|-------|
| **Lw** (point source) | `_customSources[]` → `SOURCE_LIBRARY_GROUPED['Custom sources']` | Appears in all point-source dropdowns; persisted in `localStorage('customSources')` and serialised in assessment JSON |
| **Lw/m** (line source) | `lineSources[]` | Created as unplaced (empty `vertices[]`); user draws line on map after saving |
| **Lp** (building interior) | `buildingSources[]` | Created as unplaced; requires construction selection; user draws polygon after saving |

Spectrum input is **dB(Z)** per band (63 Hz – 8 kHz). Broadband input is **dB(A)**. Stored values match the engine input convention exactly — no conversion at save or load. A-weighting is applied by the engine during propagation (`A_WEIGHTS_BANDS` in `shared-calc.js`).

Wizard functions: `openCustomSourceWizard()`, `closeCustomSourceWizard()`, `cswSelectMetric(metric)`, `cswGoBack()`, `cswSave()`. Wizard modal HTML: `#customSrcWizardOverlay`.

Flat dB(Z) spectrum derivation when bands are left blank: `_cswFlatSpectrumZ(lwA)` computes equal-energy-per-band values from the broadband dB(A) total using `X = Lw_A − 10·log10(Σ 10^(AW[i]/10))`.

## PlanSA Planning Layers (display only)

Three display-only map layers sourced from SA Government open data (CC-BY 4.0). **No calculation impact.** Zone identification for criteria derivation now uses offline point-in-polygon against the local GeoJSON — no SAPPA API call is made for zone lookup at a point.

### Frontend files

| File | Purpose |
|---|---|
| Planning layers IIFE (inline `<script>` in `index.html`) | Toggle logic, lazy-loading, legend, attribution, save/load API |

No external CDN dependencies for planning layers — all three layers use Leaflet's built-in `L.geoJSON` + `L.canvas()` renderer.

Zone styling reuses the existing `ZONE_COLOURS` table and `getZoneColour(name)` function from the map IIFE (sourced from SAPPA MapServer layer 114 symbology). Exposed via `window._getZoneColour`, `window._getZoneLegendControl()`, and `window._populateZoneLegend(names)`.

### Data files (produced by GitHub Action)

| File | Contents |
|---|---|
| `data/zones/sa-zones.geojson` | Statewide zone polygons, ~5,400 features, properties: `zone_name` (title-case), `subzone_name` (optional). Served as GeoJSON (~15–20 MB uncompressed, ~5–7 MB gzipped). Canvas renderer required for performance at this feature count. |
| `data/overlays/noise-air-emissions.geojson` | Noise & Air Emissions overlay polygons, property: `overlay_name` |
| `data/overlays/aircraft-noise.geojson` | Aircraft Noise (ANEF) overlay polygons, properties: `overlay_name`, `anef_contour` |
| `data/metadata.json` | `fetched_utc`, feature counts, `geojson_mb`, `distinct_zone_names_count`, field name mapping |
| `data/_discovery.json` | Written by discover mode — distinct zone/overlay names for reference |

### Data pipeline

`scripts/update-planning-data.js` — Node ESM script, two modes:

| Mode | What it does |
|---|---|
| `MODE=discover` (default) | Downloads both zips, logs all distinct property keys + values, writes `data/_discovery.json`. Windows-safe. |
| `MODE=build` | Downloads, filters overlays by substring match, simplifies all three layers with mapshaper (Visvalingam 10%), writes `data/metadata.json`. No external build tools required. |

devDependencies: `adm-zip`, `mapshaper`, `JSONStream`. All run on Node 20 cross-platform.

**Institutional decision:** Both zone zips contain GDA2020 and GDA94 projections of the same features. Always filter to GDA2020 only — never re-include GDA94 thinking it's missing data; it's duplicate geometry.

### GitHub Action

`.github/workflows/update-planning-data.yml` — scheduled weekly (Sun 18:00 UTC), manual dispatch with `mode` and `test_slack_notification` inputs. Runs `npm install` then `node scripts/update-planning-data.js`. Auto-commits `data/**` via `stefanzweifel/git-auto-commit-action@v5`. Action runtime ~1–2 min (no native build step).

**Failure notifications:** On any step failure, `slackapi/slack-github-action@v2.1.1` posts to `#resonate-lab` with a link to the run logs. Requires repo secret `SLACK_WEBHOOK_URL` — create an Incoming Webhook in the Resonate Slack app targeting `#resonate-lab`, then add the URL at Settings → Secrets and variables → Actions → `SLACK_WEBHOOK_URL`. GitHub also emails repo watchers with Actions failure notifications enabled (user setting at github.com/settings/notifications → Actions → "Only notify for failed workflows"). Use the `test_slack_notification=true` dispatch input to force a test failure and verify the Slack message end-to-end.

### UI

One button in Mapping▼ panel:
- `#planningZonesBtn` — Zones (PlanSA)

Noise & Air Emissions and Aircraft Noise (ANEF) overlays are now loaded by the **MBS 010 Screening** toggle (`#mbs010ToggleBtn`) via `loadMBS010Layers()` in the map IIFE — not by the planning IIFE.

Zones legend: the shared "P&D Code Zones" `zoneLegendControl` (defined in the map IIFE, accessible via `window._getZoneLegendControl()`). Shows only when Zones layer is on. Populated by `window._populateZoneLegend(names)` from the visible GeoJSON features (refreshed on `moveend`+`zoomend`, debounced 150 ms). Capped at 40 distinct zones — "Zoom in for zone legend" placeholder shown when exceeded. Colours from `ZONE_COLOURS` via `window._getZoneColour`.

Attribution: added/removed via `map.attributionControl.addAttribution/removeAttribution` — shows when Zones layer is on; date from `metadata.json fetched_utc`.

### Save/load

`planningLayers: { zones: bool }` serialised in both export and undo `serialiseState()`. Loaded in `loadAssessment()` step 15c via `window._setPlanningLayers(state)`. Defaults false when key absent (old files load clean). Old saves with `noiseAirEmissions`/`aircraftNoise` keys are silently ignored. `_version` not bumped.

### Global API

| Function | Purpose |
|---|---|
| `window._getPlanningLayers()` | Returns `{ zones: bool }` |
| `window._setPlanningLayers(state)` | Applies zones toggle state (used by loadAssessment) |
| `window._anefStyle(feature)` | Returns Leaflet style object for an ANEF GeoJSON feature; graduated by `anef_contour`. Used by `loadMBS010Layers()` in the map IIFE. |
| `window._getZoneColour(name)` | Returns zone fill colour from `ZONE_COLOURS` table (map IIFE) |
| `window._getZoneLegendControl()` | Returns the shared `zoneLegendControl` singleton |
| `window._populateZoneLegend(names)` | Populates legend from array of zone names; `null` → "Zoom in for zone legend"; `[]` → "No zones in view" |
| `window._findZoneAtPoint(lat, lng)` | Async PIP against `data/zones/sa-zones.geojson` cache. Returns `{zone, subzone}\|null`. Used by `queryZoningAtPoint` in the map IIFE for offline zone detection at receiver/source placement. |
| `window._planDataDate()` | Returns formatted metadata date string (e.g. "23 Apr 2026") from last `data/metadata.json` fetch, or `''` if not yet loaded. Used in `updateZoneDescText()`. |

### Zone identification data flow

1. User drops a pin (SA state) → `queryAndSetZone(mode, latlng)` called
2. → `queryZoningAtPoint(lat, lng)` → calls `window._findZoneAtPoint(lat, lng)`
3. → planning IIFE: `_ensureZoneCache()` (lazy-fetches `sa-zones.geojson` once), bbox prefilter, ray-casting PIP
4. Returns `{zone, subzone}` (same shape as former SAPPA API response)
5. → `matchZoneToKey(zone, subzone)` → sets dropdown → `render()` → criteria derived
6. Network calls: zero SAPPA API calls for zone identification. One `fetch(sa-zones.geojson)` on first lookup (shared with the Zones display layer if that's already loaded).

## GIS Import

Single-file module (inline `<script>` at end of `index.html`, wrapped in an IIFE).

**Entry points (on `window._gisImport`):**
- `importGis(fileOrList)` — accepts a single `File` (zip/geojson/kml) or a `FileList`/array of loose shapefile components
- `importGisFiles(fileOrList)` — alias for `importGis`
- `parseGisFile(fileOrList)` — exposed for testing
- `closeModal()` — close the assignment modal programmatically

**File input** (`#gisFileInput`): `accept=".zip,.shp,.dbf,.shx,.prj,.cpg,.geojson,.json,.kml"` with `multiple`. **Drag-and-drop** also wired on `#gisImportBtn` and the Leaflet map container.

### External libraries (CDN, lazy-loaded)

| Library | Version | Purpose |
|---|---|---|
| proj4.js | 2.11.0 | CRS reprojection (loaded first; AU CRS defs registered before shpjs) |
| shpjs | 6.1.0 | Shapefile `.zip` buffer → GeoJSON |
| JSZip | 3.10.1 | Reads `.prj` files from zip; also used to assemble virtual zips from loose files |
| @mapbox/togeojson | 0.16.0 | KML → GeoJSON |

All four libraries loaded via `loadScriptOnce(url)` (Promise-caching). Load order dependency: proj4 → `registerAuCrs()` → shpjs (sequential). JSZip loaded in parallel.

### External API

| API | Purpose |
|---|---|
| `https://epsg.io/{code}.proj4` | Fetch proj4 definition for user-entered EPSG codes not in the bundled list. Responses cached in `localStorage` under key `noiseTool.epsgCache`. |

---

## Locked-in design decisions

These are explicit product decisions. Do not revisit them without a product discussion.

**Discoverability redundancy:** Critical features are exposed via at least two surfaces — Methodology via toolbar button AND sidebar footer; Compliance drawer via the labelled tab AND auto-open on first results; Propagation method via the map indicator AND the sidebar accordion. This is deliberate — first-time users and regulators do not navigate the same paths as power users.

| Decision | Rationale |
|---|---|
| **Mobile is not supported.** No responsive layout is planned. | The tool requires a mouse, keyboard shortcuts, a multi-panel layout, and large-screen map interaction. Acoustic consultants work at desktops or laptops; regulatory reviewers receive shared links via email and open on desktop. A `.mobile-not-supported` banner (amber, persistent, `role="alert"`) is shown at &lt;768 px to set expectations. |
| **No auto-save.** Users save manually via the "Save" button. | Auto-save to browser storage risks overwriting a named assessment with an in-progress exploratory edit. Consultants frequently open a saved assessment, make changes to test a scenario, and then want to discard without overwriting the original. Manual save preserves that workflow. |

---

## UI / Accessibility conventions

These conventions apply to all new UI elements. Do not deviate without updating this section.

### Compliance cells (predicted noise levels table)

Compliance state (pass/fail) must always be conveyed by **both colour and text** — never colour alone. This applies to WCAG SC 1.4.1 (use of colour), to B&W PDF exports, and to colour-blind users.

Pattern A (compact, used in `makeRow()`): prefix the predicted L<sub>p</sub> value with ✓ (U+2713) for compliant or ✗ (U+2717) for non-compliant, plus a non-breaking thin space. Also set `aria-label="NNN dB—compliant"` / `"NNN dB—non-compliant"` on the cell for screen readers.

```javascript
var compMark = cmp.ok === '' ? '' : (cmp.ok ? '✓ ' : '✗ ');
var ariaLabel = cmp.ok === '' ? '' :
  (cmp.ok ? predFmt + ' dB—compliant' : predFmt + ' dB—non-compliant');
```

The assessment cases summary table (`_acRenderSummaryTable`) uses &#10003;/&#10007; HTML entities with coloured text — already colour+text, no change needed.

### --ok / --bad CSS variables

| Variable | Value | WCAG AA contrast vs its bg | Background variable |
|---|---|---|---|
| `--ok` | `#166534` | 6.39:1 | `--okbg` = `rgba(22,163,74,.10)` on white ≈ `rgb(232,246,237)` |
| `--bad` | `#b91c1c` | 5.53:1 | `--badbg` = `rgba(220,38,38,.10)` on white ≈ `rgb(252,233,233)` |

Do not lighten `--ok` below `#166534` — it would fall back below the WCAG AA 4.5:1 threshold.

### Accordion section headers (`.mp-hdr`)

All accordion headers that call `toggleMapPanel()` carry:
- `role="button"` (the div is not a native button)
- `aria-expanded="false"` (initial; updated by `toggleMapPanel()`)
- `aria-controls="<section-id>-body"` (points to the matching `.mp-body` div)

The corresponding `.mp-body` div carries the matching `id="<section-id>-body"`.

`toggleMapPanel()` must update `aria-expanded` on toggle in both code paths (sidebar-accordion and legacy floating-dropdown). The selector used is `.mp-hdr[aria-expanded]` so non-ARIA headers (toolbar icons, drawer toggle) are not affected.

### Propagation method indicator (`#prop-method-indicator`)

`position: fixed; top: 56px; right: 8px` — white chip, `z-index: 1000`. Shows `Simple method` / `ISO 9613-2:1996` / `CONCAWE` based on the `.active` button in `#propMethodGroup`. Updated by `_updatePropIndicator()`, called on page load and in the prop-method button click handler. Click opens `#mp-propmethod` accordion in the sidebar.

### Background fetch indicator (`#bgFetchIndicator`)

`position: fixed; top: 90px; right: 8px` — below the prop-method indicator; `z-index: 500`. Hidden when idle (`hidden` attribute). Shows a spinner + label like "Loading: terrain, zones" when fetches are in-flight.

**Reference-counted pattern:** `startBgFetch(label)` increments a counter; `endBgFetch(label)` decrements; `_updateBgFetchIndicator()` reconciles. Multiple concurrent fetches of the same type (e.g. 5 terrain tiles) show one label, not five. Defined near `showToast` at the main script scope so they are accessible from the DemCache IIFE (which runs during parse but fetches only execute at runtime) via `window.startBgFetch`.

**Hooked fetch types:**
- `'terrain'` — `fetchWCSTile` (GA LiDAR), `fetchOETile` (OE sequential grid), `fetchFromOE` (OE parallel points)
- `'buildings'` — `fetchWithBackoff` outer call (Overpass OSM)
- `'zones'` — `fetchWithRetry` (SAPPA; `_outer` flag prevents double-counting on retry recursion), `queryVicZoningAtPoint` (VicPlan), `queryNSWZoningAtPoint` (NSW Planning Portal)

**Not hooked:** hover tooltip zone queries, startup one-time JSON loads (`vic_zone_types.json`), geocode lookups, overlay GeoJSON — these are either too transient or not user-initiated in a way that needs feedback.

### Error toasts (`showErrorToast`)

`showErrorToast(message, durationMs)` — red background (`#7f1d1d`), 8 s default dwell, dismissible `×` button, `pointer-events: auto`. Distinct from `showToast` (dark, 3 s, pointer-events none). Error messages state the specific service AND the acoustic consequence (e.g. "predictions will run without terrain insertion loss"). Existing `console.warn` calls retained alongside toasts.

### Floating panel accessibility (R13)

`#helpFloatPanel`, `#objectsFloatPanel`, `#suggestFloatPanel` carry `role="dialog"`, `aria-labelledby="<titleId>"`, `aria-modal="false"`. They are **non-modal** — `aria-modal="false"` because keyboard interaction elsewhere remains available while a panel is open. `showPanel()` stores `document.activeElement` as `panel._returnFocusTo`; `hidePanel()` restores focus. Esc key closes each panel via a `keydown` listener on the panel element (`stopPropagation()` prevents conflict with map / context-menu Esc handlers).

### Drawer auto-open (`_maybeAutoOpenDrawer`)

`_drawerAutoOpenedThisSession` flag + `_maybeAutoOpenDrawer()` inside the drawer layout IIFE (near `setDrawerOpen`). A `MutationObserver` on `#compliance-strip` triggers the function whenever compliance content changes. Opens the drawer once per session on first results; won't re-open after the user manually clicks the toggle or presses `]`.

### Unsaved-changes indicator

`window._setUnsaved()` / `window._clearUnsaved()` live in a dedicated IIFE immediately after the undo manager IIFE (search `R3: Unsaved-changes indicator`).

- **Set trigger:** `window._undoPushState` is wrapped so every successful `pushState()` call also calls `_setUnsaved()`. This covers all user-initiated state mutations (place marker, change input, clear all, etc.).
- **Clear triggers:** (a) Save — blob path after `a.click()`; File System Access path inside the `.then` after `w.close()`. (b) Load — inside `loadAssessment`'s `setTimeout`, guarded with `!window._undoRestoring` so undo/redo loads do not false-clear the flag.
- **Visual indicators:** `#exportJsonBtn.unsaved` → red border + `●` dot (CSS `::after`); `document.title` gets a `* ` prefix.
- **Navigation guard:** `beforeunload` listener warns on page close/refresh when unsaved.

### Active drawing mode banner

`<div id="mode-banner" role="status" aria-live="polite">` — fixed-positioned, centered, blue pill badge, `pointer-events:none`. Toggled by `setMode()` inside the map IIFE.

Two mechanisms drive the banner (they are mutually exclusive — draw buttons cancel `currentMode` first):

**1. `setMode()` hook** (placement modes — point in the map IIFE):
| `currentMode` value | Banner text |
|---|---|
| `null` | Hidden |
| `'addSource'` | "＋ Click the map to add a new source" |
| `'source'` or `'source_N'` | "✛ Click the map to place Source S{N+1}" |
| `'r1'`–`'r4'` | "✛ Click the map to place Receiver R{N}" |

**2. MutationObserver on draw buttons** (Leaflet.Draw modes — after the unsaved IIFE, in a `DOMContentLoaded` listener):

Draw buttons (`drawBarrierBtn`, `drawBuildingBtn`, `drawGroundZoneBtn`, `drawBuildingSourceBtn`, `drawAreaSourceBtn`, `drawLineSourceBtn`, `drawCortnRoadBtn`) manage their own `.active` class rather than going through `setMode()`. A `MutationObserver` (attribute filter `class`) watches each button. When any button gains `.active`, the banner shows the draw-mode label. When it loses `.active` and no other draw button is active and `_isPlacementActive()` is false, the banner hides. The observer skips updating the banner if `_isPlacementActive()` is true so it doesn't interfere with placement-mode banners.

### AU CRS pre-registration (`AU_CRS_DEFS`)

26 EPSG codes registered into `proj4` at startup:

| Group | EPSG codes |
|---|---|
| Geographic | 4326 (WGS84), 4283 (GDA94), 7844 (GDA2020), 3857 (Web Mercator) |
| GDA94 MGA | 28349–28356 (zones 49–56) |
| GDA2020 MGA | 7849–7856 (zones 49–56) |
| SA Lambert | 3107 (GDA94), 8059 (GDA2020) |
| Other | 3577 (GDA94 Australian Albers) |

Companion constants: `AU_CRS_LABELS` (display names) and `AU_CRS_GROUPS` (optgroup structure for the dropdown).

### Parse pipeline

`parseGisFile(fileOrList)` dispatches by input type:

**Loose shapefile components (FileList or array containing `.shp` etc.):**
- `parseLooseFiles(files)` groups by stem, validates `.shp`+`.dbf`+`.shx` present, reads each as `ArrayBuffer` via `readFileAsArrayBuffer()`, assembles virtual zip via JSZip, parses with `shp(zipBuf)`.

**Single `.zip`:**
- JSZip extracts `.prj` files (keyed by shapefile stem); `shp(buf)` parses. `.prj` WKT matched to known EPSG via `matchEpsgFromWkt()`.

**Single `.geojson`/`.json`:**
- JSON.parse; `sourceCRS` from `crs.properties.name` or `'EPSG:4326'`.

**Single `.kml`:**
- togeojson; `sourceCRS = 'EPSG:4326'`.

Post-parse for non-shapefiles only: coordinate sanity check (>10% outside ±180/±90 → abort; 1–10% → skip bad features with warning). Shapefiles skip this check — CRS may be projected and will be reprojected at import time.

Each layer returned as `{name, sourceCRS, features, _prjText, _detectedEpsg, _has3DCoords, warnings}`.

`_has3DCoords` (boolean) — transient flag set by `detectHas3D()` after `processLayer`; true if any feature vertex has a non-null third coordinate element (PointZ/LineStringZ/PolygonZ). Used only to render the inline Z-values notice in the import modal; not serialised.

### EPSG matching (`matchEpsgFromWkt`)

Parses WKT via `proj4.Proj(wktText)`, compares projection name + zone + datum-shift presence against each registered EPSG. Returns best-matching EPSG code or `null`.

### Assignment modal

`openAssignmentModal(parsed)` builds the per-layer assignment UI. For each layer:

**CRS block** (`buildCrsBlock`, shapefile layers only):
- If `.prj` present: shows detected EPSG label + "Override detected" toggle. Override reveals the EPSG dropdown.
- If no `.prj`: shows warning + mandatory EPSG dropdown (Import disabled until set).
- Dropdown populated from `AU_CRS_GROUPS`; last-used EPSG pre-selected with "(last used)" hint.
- "Other EPSG…" option reveals a numeric input + "Look up" button → `resolveEpsg(code)` → epsg.io fetch → localStorage cache.
- Resolved value stored in `<input type="hidden" id="_gResolvedCRS_{li}">`.

**Per geometry type (points / lines / polygons):**
- **Import as** select; **Source library** select; **Interior Lp** (Building source); **Movements** (Line source); **Name from** / **Height from**; **Filter by attribute**

Live preview via `_gisPreviewLayer`. `_validateImport()` also checks CRS resolved for each shapefile layer. Escape key registered in capture phase.

### Reprojection (import click handler)

On Import click: for each layer with `selectedCRS !== 'EPSG:4326'`, calls `reprojectFeature(f, fromKey)` on each feature. `fromKey` is the EPSG string (e.g., `'EPSG:7854'`) or the raw WKT string when `selectedCRS === '_prj'`. Reprojection uses `proj4(fromKey, 'EPSG:4326', [x, y])`. After reprojection, last-used EPSG saved to `localStorage` (`noiseTool.lastImportEpsg`).

### Execution (`executeImport`)

Iterates `asgn.layers[].{points,lines,polygons}` where `importAs !== 'skip'`. Converts GeoJSON `[lng,lat]` → `[lat,lng]`; strips polygon closing vertex. Elements pushed to global arrays then batch-rendered:

| importAs | Target array | Render call |
|---|---|---|
| Point source | `sourcePins[]` | `renderSourcePins()` |
| Line source | `lineSources[]` | `H.renderLineSourceLayer()` + `H.renderLineSourceCards()` |
| Area source | `areaSources[]` | `H.renderAreaSourceLayer()` |
| Building source | `buildingSources[]` | `H.renderBuildingSourceLayer()` |
| Custom building | `customBuildings[]` (IIFE-local) | `H.addCustomBuildings(batch)` |
| Barrier | `userBarriers[]` (IIFE-local) | `H.addBarriers(batch)` |
| Ground absorption | `_groundZones[]` | `H.renderGroundZone(gz)` per zone |

`render()` + `window._recomputeNoiseMap()` called after all renders. `window._undoPushState('GIS import: N elements')` records one undo entry for the whole import.

### Cross-IIFE hooks (`window._gisRenderHooks`)

Set by the map IIFE to expose IIFE-local functions to the GIS IIFE:

| Hook | Purpose |
|---|---|
| `addCustomBuildings(cbs[])` | Batch push + `renderCustomBuildings()` + `rebuildBuildingsIndex()` |
| `addBarriers(ubs[])` | Batch push + `renderUserBarriers()` + `rebuildBuildingsIndex()` |
| `makeBuildingSource(verts, ht)` | Calls `_bsMakeDefault(verts, ht)` (uses `CONSTRUCTION_LIBRARY`) |
| `renderAreaSourceLayer()` | Delegates to IIFE-local function |
| `renderBuildingSourceLayer()` | Delegates to IIFE-local function |
| `renderLineSourceLayer/Cards()` | Delegates to IIFE-local functions |
| `renderGroundZone(gz)` | Delegates to `_renderGroundZone(gz)` |
| `isTerrainEnabled()` | Returns `!!_terrainEnabled` |
| `fetchTerrainForCb/Ub(el)` | Calls `_fetchVertexElevations(el)` if terrain enabled |

### Background terrain fetch

`_gisTerrainFetch(items[])` — rate-limited async pool (max 4 concurrent). Each item is `{type:'pin'|'poly', el, name}`. Source pins use `DEMCache.getElevation(lat, lng)` → sets `pin.groundElevation_m` + `pin.effectiveHeight_ASL`. Polygon/line/building objects use `_fetchVertexElevations(el)`. AbortController pattern: new import aborts previous in-flight fetch. Progress chip bottom-right, turns green on full success, amber on partial failure (10 s).

### Namespace

`window._gisImport = {importGis, parseGisFile, closeModal}` — single entry point. `window.importGis` / `window.parseGisFile` removed.

> **Modal-stack note**: Escape capture handler closes the GIS modal first. In v1 no other modal opens concurrently, so this is safe. Revisit if multi-modal flows are added.

## Scenario Comparison (Phase 1)

Named snapshots of assessment state saved within the current session and persisted through Save/Load Assessment JSON.

### Data structure

`window._scenarios` — array reference exposed from the save/load IIFE. Each entry:

```js
{
  id:            'sc_<timestamp>_<random6>',   // collision-resistant
  name:          'Base Case',
  timestamp:     '<ISO 8601>',
  schemaVersion: 1,
  state:         {},   // parsed object from _serialiseState() — NOT a JSON string
  stripData:     []    // deep-cloned copy of window._stripData at capture time
}
```

`window.SCENARIO_SCHEMA_VERSION = 1` — used for forward-compatibility checks on load.

### Save/load JSON

Serialised as `data._scenarios` (array of scenario objects). `state` is stored as a plain object (not a JSON string). `stripData` is deep-cloned at export time. On load, scenarios with `schemaVersion` newer than `SCENARIO_SCHEMA_VERSION` are skipped with a `console.warn`; all others are deep-copied and pushed to `_scenarios[]`. The current canvas state is NOT auto-applied from any scenario — it comes from the file root as normal.

### Toolbar button

`#scenariosBtn` — `.pdf-btn` class, appended after `#shareAssessmentBtn` in the Save/Load row.

### Scenarios IIFE

Separate `<script>` block immediately after the save/load IIFE. Provides:

| Function | Purpose |
|---|---|
| `_generateScenarioId()` | `'sc_' + Date.now() + '_' + random6` |
| `saveScenario()` | Prompt for name, capture `_serialiseState()` + deep-copy `_stripData`, push to `window._scenarios` |
| `restoreScenario(id)` | Push current canvas onto undo stack, call `_loadAssessment(scenario.state)` (parsed object, no re-parse), close modal, toast with Ctrl+Z hint |
| `updateScenario(id)` | Confirm dialog, overwrite `state`/`stripData`/`timestamp` in-place (id/name/schemaVersion unchanged), re-render modal, toast; **no** undo push |
| `renameScenario(id)` | Prompt with current name, update in-place |
| `deleteScenario(id)` | Confirm dialog, splice from array |
| `showScenariosModal()` | Reset `_compareSelection`, build backdrop+box (mirrors `showMethodologyModal` pattern, max-width 900px), Esc listener, backdrop-click closes, Tab/Shift+Tab focus trap, call `renderScenariosModal()` |
| `closeScenariosModal()` | Remove backdrop, remove listeners, restore focus to `#scenariosBtn` |
| `renderScenariosModal()` | Rebuild inner HTML: header, Save button, list sorted newest-first (name + timestamp + `[Update] [Restore] [Rename] [Delete]` with flex-wrap); when ≥2 scenarios also renders Compare section (Baseline select, Include checkboxes, `#scenarioCompareTable`), wires select/checkbox change handlers, calls `renderComparisonTable()` |
| `renderComparisonTable()` | Resolves baseline (explicit → oldest → first) and included cols; baseline first then remaining in `_scenarios` order. Receiver rows: first-seen order across included stripData, placed=true in at least one col. Periods D/E/N/Lmax; skips rows with no numeric pred. Baseline col: pred + cs-ok/cs-bad vs own crit. Comparison cols: pred + signed Δ (U+2212) vs baseline pred, cell colour vs own crit. Crit col: uncoloured, prefers baseline crit. Receiver groups alternately striped. Writes into `#scenarioCompareTable` only. |

`_compareSelection = {baselineId, includedIds}` — UI-only, internal closure, resets on modal reopen, never persisted to JSON.

`window._showScenariosModal` and `window._closeScenariosModal` exposed globally. Save/update/rename/delete do **not** push to the undo stack. Restore is the **only** scenario action that pushes to the undo stack (by design — it replaces canvas state).

Toast notifications use the existing app-wide `showToast(msg, durationMs)` helper (line 14541). No custom toast added.

## Right-click Context Menu

All user-editable map layers expose a floating context menu on right-click. The menu is built by the shared `_showMapCtxMenu(cx, cy, items[])` function (defined near line 34350 in `index.html`) and positioned to stay within the viewport.

### Shared helpers (defined above `_showMapCtxMenu`)

| Helper | Purpose |
|---|---|
| `_ctxActivateMoveMode()` | Sets `_moveMode = true` and updates `#moveGeomBtn` active state |
| `_ctxFlashMarker(marker)` | Blinks a `L.marker` 3× via `setOpacity` over ~900 ms |
| `_ctxFlashPolyLayer(layer)` | Temporarily doubles weight/fillOpacity of a polyline or polygon, then restores original style |
| `_ctxStartShapeEdit(layer, opts)` | Generic shape-edit-bar launcher: enables `layer.editing`, appends the floating "Editing: … Save / Cancel" bar to the map container, wires up Escape and the two buttons, calls `opts.afterSave(layer)` on save |

### Menu items per object type

| Object type | Edit | Edit shape | Move | Duplicate | Delete |
|---|---|---|---|---|---|
| Point source | ✓ (`openSrcPanel`) | — | ✓ (flash marker) | ✓ | ✓ |
| Receiver (r1–r4) | ✓ (opens popup) | — | ✓ (flash marker) | — | ✓ (`removeMarker`) |
| Line source | ✓ (`openLsPanel`) | ✓ | ✓ (move mode + flash) | ✓ | ✓ |
| Area source | ✓ (`openAsPanel`) | ✓ | ✓ (move mode + flash) | ✓ | ✓ |
| Building source | ✓ (`openBsPanel`) | ✓ | ✓ (move mode + flash) | ✓ | ✓ |
| Barrier | ✓ (`openBarrierPanel`) | ✓ | ✓ (move mode + flash `_line`) | ✓ | ✓ |
| Custom building | ✓ (`openBuildingPanel`) | ✓ | ✓ (move mode + flash `_polygon`) | ✓ | ✓ |
| Ground zone | ✓ (`openGroundZonePanel`) | ✓ | ✓ (move mode + flash `_polygon`) | ✓ | ✓ |
| OSM building | — | — | — | — | — |

Edit shape uses `_ctxStartShapeEdit` with `isPolyline: true` for barriers and line sources (flat `getLatLngs()` array), and `isPolyline: false` for all polygon types (`getLatLngs()[0]` ring).

Menu closes on: action chosen, click outside, Escape, map pan/zoom (handled by existing `_hideMapCtxMenu` infrastructure).

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
1. Check `window._pendingCortnId` (set when an unplaced road row in the Objects window was clicked). If set, find the matching `cortnRoads[]` entry and assign `vertices` to it — skip creating a new road. Clear `_pendingCortnId`.
2. If no pending ID: `newCr = _cortnDefaultRoad(verts)` → push into `cortnRoads`
3. `renderCortnRoadLayer()`
4. `window._undoPushState('Add/Place CoRTN road')`
5. `openCortnPanel(cr.id)`

The same **pending-ID pattern** applies to all polyline/polygon draw tools:
- `window._pendingLsId` — line source (checked in `L.Draw.Event.CREATED` for line source)
- `window._pendingAsId` — area source (checked in area source CREATED handler)
- `window._pendingBsId` — building source (checked inside the building source popup OK button)
- `window._pendingCortnId` — CoRTN road (checked above)

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

## Shared Source-Panel UI Components

Five CSS classes provide a consistent visual language across all floating source panels (Point, Line, Area). The Building source panel is the visual reference; do not modify its HTML when updating these patterns.

| Class | Purpose |
|-------|---------|
| `.src-section-header` | UPPERCASE small-caps section divider (`font-weight:700; font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:#6d28d9`) |
| `.src-period-card` | Bordered period card (`border:1px solid #e9d5ff; border-radius:6px; padding:8px; margin-bottom:8px`) |
| `.src-metric-grid` | Two-column header metric row — height input + read-only computed field (`display:grid; gap:6px; padding:8px; background:#f5f3ff; border-radius:6px; border:1px solid #e9d5ff`) |
| `.src-band-sublabel` | Sub-label above octave grid (`font-size:11px; color:#6b7280; font-weight:600; margin-bottom:3px`) |
| `.src-lib-row` | Flex row for library label left / search box full-width (`display:flex; align-items:center; justify-content:space-between`) |

All four floating source panels use `display:flex; flex-direction:column; overflow:hidden` on the outer container, with a `flex-shrink:0` sticky header, a `flex:1; min-height:0; overflow-y:auto` scrollable body, and a `flex-shrink:0` sticky footer containing Delete (red outline: `background:#fee2e2; border:1px solid #fca5a5; color:#b91c1c`) and Close (grey outline: `background:#f3f4f6; border:1px solid #ddd`) buttons. All panels are 360 px wide.

## UI Layout — Fixed collapsible LHS side panel + top-right atom buttons

The map area (inside `#map-column`) is flanked by two panels:

- **Left**: `#side-panel` — a fixed 300px-wide column containing Search + Mapping/Tools/Modelling/Propagation/Custom sources accordions + Objects button + the drawer toggle. Collapsible via a right-edge button; state persists in `localStorage`. On mobile (<768px) it's an overlay with a backdrop. Injected at runtime by `_resonateSidePanelBoot()` in the inline script at [index.html:1721](../index.html:1721).
- **Right**: `#drawer-panel` — the 520px drawer with **section-filtered** panels (Setup / Criteria / Results / Recommended treatments). Nav buttons activate sections via `activateSection(sectionId)` which toggles `.section-hidden` on `[data-section]` elements. When the drawer opens, `setDrawerOpen()` sets `mapColumn.style.right` to the drawer's current `offsetWidth` so the map physically shrinks (mirroring the LHS collapse pattern); a `transitionend` listener on `#map-column` for the `right` property calls `map.invalidateSize()` after the `0.3s cubic-bezier` animation. Resize-drag and window-resize re-clamp also update `mapColumn.style.right` in lockstep.

### LHS additional panels (beyond Mapping/Tools/Modelling)

- **`#mp-objects`** — Objects LHS button (no body); clicking `#objectsToggleBtn` opens `#objectsFloatPanel`, a draggable `position:fixed` overlay (same pattern as `#helpFloatPanel` / `#suggestFloatPanel`). The panel lists all source types: point sources, line sources, area sources, building sources, and CoRTN roads. Unplaced sources (those with `vertices.length < 2`, or for point sources no `latlng`) show "not placed — click to place" in grey italic. Clicking an unplaced row activates the draw tool for that source type using the pending-ID pattern (`window._pendingLsId` / `_pendingAsId` / `_pendingBsId` / `_pendingCortnId`). `_renderObjectList()` re-renders the whole list; `_objRowClick(type, idx)` handles row clicks; `_objMenuBtn(type, idx)` opens the ⋮ context menu; `_objDelete(type, idx)` and `_objDuplicate(type, idx)` handle delete/duplicate for all five source types including CoRTN roads.
- **`#mp-propmethod`** — Propagation method accordion: method toggle buttons (`#propMethodGroup`), ISO 9613-2 params (`#iso9613Params`), CONCAWE params (`#concaweMetPanel`), ISO validation runner. The old RHS Propagation method `.grid2` is kept in HTML but hidden with `style="display:none"`.
- **`#mp-customsrc`** — Custom sources accordion containing `#customSrcBody`. The old RHS Custom sources `.grid2` is hidden with `style="display:none"`. All existing JS using `getElementById('customSrcBody')` etc. is unaffected because LHS elements appear first in DOM.

### RHS drawer section filtering

`activateSection(sectionId)` — defined in the layout boot script, exposed as `window._activateSection`:
- Queries `#drawer-content [data-section]` and toggles `.section-hidden` (= `display:none !important`) on each element
- Sections: `setup`, `criteria`, `results`, `treatments`
- Elements with `data-section="results treatments"` appear in both Results and Recommended treatments sections
- `window._activeNavSection` tracks the active section for restore after PDF export
- Called on page load (default: `setup`), on nav button click, and from `_restoreDrawerLayout()` after PDF export restore
- PDF export: `_restoreForPdfExport()` strips all `.section-hidden` classes so all panels appear in the captured output

```
┌─ #side-panel 280px ──┬─ #map-column (reflowed) ──┬─ #drawer-panel 520px ─┐
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
├── #side-panel (position: absolute; top:0 left:0 bottom:0; width: 280px; box-sizing: border-box)
│   ├── #side-panel-toggle (position: absolute; right: -32px; 32×48px chevron tab)
│   ├── #side-panel-resize-handle (position: absolute; right: -8px; 16px drag zone)
│   └── #side-panel-inner (flex column; padding 12px 14px; box-sizing: border-box; gap 4px)
│       ├── #side-panel-toolbar (horizontal flex row of 5 icon buttons, 6px gap)
│       │   ├── #mp-help         — ? Quick Reference (moved from #mapPanelContainer)
│       │   ├── #mp-suggest      — 💡 Suggested Sources
│       │   ├── #mp-undo         — ↶ Undo
│       │   ├── #mp-redo         — ↷ Redo
│       │   └── #mp-save-jpg     — 📷 Save JPG (label span hidden inside toolbar)
│       ├── #mapSearchWrapper (moved here from #mapPanelContainer)
│       ├── #mp-objects  (LHS button → opens #objectsFloatPanel floating panel)
│       ├── #mp-mapping (.mp accordion, moved here)
│       ├── #mp-tools (.mp accordion, moved here)
│       ├── #mp-modelling (.mp accordion, moved here)
│       ├── #mp-propmethod (.mp accordion — Propagation method, moved from RHS)
│       ├── #mp-customsrc  (.mp accordion — Custom sources, moved from RHS)
│       └── #side-panel-footer (margin-top: auto; border-top)
│           └── #mp-toggle-drawer (the Expand/Panels button, moved here)
├── #side-panel-nametag-tab (sibling; display:none normally; shown when side-panel-collapsed)
├── #side-panel-backdrop (display: none; shown only on mobile)
├── #map-column (position: absolute; top:0 right:0 bottom:0; left: 280px)
│   ├── #mapInnerWrapper
│   │   ├── #mapPanelContainer (display: none !important — empty after boot)
│   │   ├── #mapFullscreenSidebar
│   │   ├── #noise-map (Leaflet — only app overlay on the map canvas)
│   │   └── #map-guide-overlay (hidden once sources exist)
│   └── #map-status-row (bottom: 24px; left: 10px)
├── #drawer-panel (position: absolute; top:0 right:0 bottom:0; width: 520px; defaults closed)
└── #drawer-collapsed-nametag (sibling; display:none when drawer open; shown when drawer-closed)
```

### CSS variables & classes

| Variable / Class | Effect |
|---|---|
| `--side-panel-width: 280px` | Declared on `:root`. Default panel width (minimum to fit 6 toolbar icons). User resize saved to `localStorage('resonate_side_panel_width')` and restored on boot. |
| `#side-panel.collapsed` | `width: 0; border-right: none; box-shadow: none`. Added/removed by `setCollapsed()`. Toggle and resize handle hidden via CSS child selectors; nametag shown via `#app-layout.side-panel-collapsed` selector. |
| `#app-layout.side-panel-collapsed` | Flips `#map-column.left` from `280px` → `0` and shows `#side-panel-nametag-tab` via `> #side-panel-nametag-tab { display:block }`. |
| `#drawer-panel.drawer-closed` | Pre-existing. New atom-button rule `#drawer-panel.drawer-closed ~ #map-column #mapPanelContainer { right: 10px }` moves the atom buttons flush right when the drawer is manually closed. |

### Collapse / expand state machine

`_resonateSidePanelBoot()` in the inline script block in `#mapInnerWrapper`:

1. Creates `#side-panel`, its toggle button (`#side-panel-toggle`), a resize handle (`#side-panel-resize-handle`), an inner flex column (`#side-panel-inner`), a footer (`#side-panel-footer`), and a sibling `#side-panel-backdrop`.
2. Creates `#side-panel-nametag-tab` (sibling of `#side-panel`, inserted after it in `#app-layout`). Also creates `#drawer-collapsed-nametag` (appended to `#app-layout`).
3. Moves 5 elements out of `#mapPanelContainer`: `#mapSearchWrapper`, `#mp-mapping`, `#mp-tools`, `#mp-modelling`, `#mp-toggle-drawer` (the last goes into the footer).
4. Inserts `#side-panel`, `#side-panel-nametag-tab`, and `#side-panel-backdrop` as the first children of `#app-layout`.
5. Defines `setCollapsed(collapsed)` which:
   - Toggles `.side-panel-collapsed` on `#app-layout` (drives `#map-column.left` and nametag visibility via CSS)
   - Toggles `.collapsed` on `#side-panel` (drives width=0; toggle/resize-handle visibility via CSS child selectors)
   - On collapse: clears `sidePanel.style.width` so CSS `width:0` takes effect
   - On expand: restores saved width from `localStorage('resonate_side_panel_width')` if present
   - Writes `localStorage['sidePanelCollapsed']`; calls `_map.invalidateSize()`
   - Does NOT touch `toggle.style.display` or `spNametag.style.display` — all visibility controlled by CSS classes
6. `initSidePanelResize()` IIFE wires pointer events on `#side-panel-resize-handle`. Drag saves width to `localStorage('resonate_side_panel_width')`; click (< 5px movement) calls `setCollapsed(toggle)`.
7. Initial state: mobile → force-collapse; desktop → honour `localStorage`. `matchMedia` listener re-collapses on crossing mobile breakpoint. Drawer initialises as `drawer-closed` (user must open manually).

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

## Google Sheets source library (sole active source)

**Status (2026-04-22): Supabase disabled. Google Sheets is the sole active library.**

`js/sources-library.js` (IIFE, loaded in `<head>`) exposes `window.SourceLibrary`. All five source-type dropdowns route exclusively through it. Supabase script tags are commented out.

### DATA_TYPE_APPLICABILITY mapping

| Sheet "Data type" | Panel context key(s) |
|---|---|
| `Lw, dB(Z)` | `'point'`, `'area'` |
| `Lw/m, dB(Z)/m` | `'line'` |
| `Lp, dB(Z)` | `'building_interior'` |
| `Transmission Loss` | `'building_facade'` |
| `Insertion Loss` | *(none — reserved)* |

### In-memory variables (all populated from SourceLibrary, not hardcoded)

| Variable | Shape (per record) | Populated by |
|---|---|---|
| `SOURCE_LIBRARY_GROUPED` | `{name, lw, spectrum[8], height}` | `rebuildSourceLibraries()` — pulls `'point'` context |
| `SOURCE_LIBRARY_GROUPED_NON_LMAX` | same, excluding Lmax entries | derived from above |
| `LINE_SOURCE_LIBRARY_GROUPED` | `{name, category, lw_m_dba, spectrum_unweighted{63..8000}, height_m}` | `rebuildLineSourceGrouped()` — pulls `'line'` context |
| `AREA_SOURCE_LIBRARY_GROUPED` | `{name, category, lw_m2_dba, spectrum_unweighted{63..8000}, height_m}` | `rebuildAreaSourceGrouped()` — pulls `'area'` context |
| `BUILDING_LP_LIBRARY_GROUPED` | `{name, category, lp_dba, spectrum{63..8000}}` | `rebuildBuildingLpGrouped()` — pulls `'building_interior'` context |
| `CONSTRUCTION_LIBRARY` | `{walls:[...], roof:[...], openings:[...]}` each `{name, rw, octaveR{63..8000}}` | **Hardcoded** — no Sheet equivalent |

`LINE_SOURCE_LIBRARY`, `AREA_SOURCE_LIBRARY`, `BUILDING_LP_LIBRARY` are declared as empty `[]` (kept for backward compatibility with any external references).

### Loading pipeline

`_sourceLibBoot` IIFE (in `index.html`, replaces the old `_resonateLibBoot`) calls:
```
SourceLibrary.loadSourceLibrary().then(() => rebuildAllLibraries())
```

`SourceLibrary.loadSourceLibrary()` implements stale-while-revalidate:
- If fresh cache in `localStorage` (`sourceLibraryCache_v2`, TTL 1 hour) → resolves immediately
- If stale cache → resolves with stale data, revalidates Sheet in background
- If no cache → fetches from Google Sheets CSV, falls back to `data/sources-fallback.json`

### rebuildAllLibraries()

Calls all five rebuild functions in order, each pulling from `SourceLibrary.getGroupedLibraryForSourceType(context)`:

1. `rebuildSourceLibraries()` — `'point'` → `SOURCE_LIBRARY_GROUPED` + derived flat/lmax variants
2. `rebuildLineSourceGrouped()` — `'line'` → `LINE_SOURCE_LIBRARY_GROUPED`
3. `rebuildAreaSourceGrouped()` — `'area'` → `AREA_SOURCE_LIBRARY_GROUPED`
4. `rebuildBuildingLpGrouped()` — `'building_interior'` → `BUILDING_LP_LIBRARY_GROUPED`
5. `rebuildConstructionGrouped()` — reads `CONSTRUCTION_LIBRARY` (hardcoded, unchanged)

### Submit new source

`window.showSubmitSourceModal()` opens a validated form that POSTs form-encoded data to the Apps Script endpoint (CORS-safe). On success, `localStorage.removeItem('sourceLibraryCache_v2')` invalidates the cache so the next dropdown open picks up the new row.

### Files

| File | Purpose |
|---|---|
| [js/sources-library.js](../js/sources-library.js) | IIFE — fetch, cache, API (`loadSourceLibrary`, `getGroupedLibraryForSourceType`, `submitNewSource`) |
| [data/sources-fallback.json](../data/sources-fallback.json) | 650-row offline fallback (mirrors live Sheet as of 2026-04-22) |

### Previously: Supabase-backed library (disabled 2026-04-22)

Four hardcoded libraries were the offline snapshot; `library-loader.js` fetched live data from Supabase `reference_noise_sources` / `reference_constructions`; `supabase-admin.js` provided magic-link CRUD. All three script tags are now commented out. `CONSTRUCTION_LIBRARY` (Rw data) remains hardcoded as no Sheet equivalent exists.

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
    ├── #savePdfBtn             (Save PDF — A4 criteria appendix, calls generatePDFAppendix())
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
5. `#mp-suggest` — Suggested noise sources from PDF. Clicking opens `#suggestFloatPanel` (draggable `position:fixed` overlay). When no PDF is loaded, all 10 facility groups are shown in a collapsed list with a "no PDF loaded" note. When a PDF is scanned via `window._soPdfScanSources(text)`, matched facilities appear open at the top; non-matched facilities are collapsed under an "Other facilities" disclosure. Each facility row has a parent checkbox that toggles all child sources, and each child source row shows the source name, a type badge (`point`/`line`/`area`/`building`), and an orange **TODO** badge if the library entry is missing or the source is a known stub. "Add selected" creates one source object per checked entry (pushed to the appropriate global array) and calls the matching render function via `window._toolboxApi`. Data structure: `FACILITY_SUGGESTIONS[]` — array of `{id, label, keywords[], sources[]}` where each source has `{type, searchName, defaultName, isStub?}`. Keyword matching: `_normKw(s)` normalises both PDF text and each keyword before comparison — lowercase, NFD diacritic strip (café→cafe, crèche→creche), curly/smart apostrophe→straight. Keywords cover Australian synonyms, abbreviations, and brand names (servo, kindy, OSHC, ELC, HQ, McDonald's, KFC, BP, Ampol, etc.) across all 10 categories. Library lookup: `_findLibByType(searchName, type)` does a case-insensitive substring match against the relevant library global (`SOURCE_LIBRARY_ALL` for point, `LINE_SOURCE_LIBRARY_GROUPED` for line, `AREA_SOURCE_LIBRARY_GROUPED` for area, `BUILDING_LP_LIBRARY_GROUPED` for building). Confirmed stub entries (known missing from library): "Unloading activity" (area), "Children (10 children 2–3 yrs)" (area). `window._pdfSuggestedGroups`: `null` = no PDF; `[{id, label, matchedKeyword}]` = matched facilities after scan. Used by `_pdcAnyMatch()` (SA PDC relevance auto-detect) via `.label`.
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
| `#jump-nav` | Flex row of `.jump-btn` pills: Setup / Criteria / Results / Recommended treatments |
| `.jump-btn.jump-active` | Highlighted state (blue) for current scroll section |
| `.drawer-group-anchor` | Zero-height `<div>` inserted before panel groups in `#drawer-content` — scroll targets for jump nav |

### Group anchor IDs and their targets

Anchors are inserted **inside** the drawer content structure, immediately before the `.grid2` ancestor of each target element. `#drawer-content` has `position: relative` so `anchor.offsetTop` resolves against drawer-content regardless of nesting depth.

**Auto-expand on tab activation:** `activateSection(sectionId)` calls `window._expandSectionCards()` after setting section visibility. `expandSectionCards()` expands all `.card-body` elements and inline-toggle bodies (from `INLINE_TOGGLE_BODIES`) that are not inside a `.section-hidden` ancestor, skipping `objectsPanelBody` (floating panel, not in `drawer-content`). The window bridge is required because `activateSection` and `expandSectionCards` live in different `<script>` blocks. `setInitialCollapseState()` also calls `expandSectionCards()` after collapsing all panels so the initial Setup tab opens expanded. Manual collapse within a tab works normally; switching tabs re-expands.

**SA-only card:** The `#pdcProvisionsSection` card ("Planning & Design Code — Interface between Land Uses") carries class `sa-only` and is only rendered when `currentState === 'SA'`. It is hidden by CSS for VIC, NSW, OTHER, and the initial null state (no address geocoded). The "Receivers & criteria" card immediately below it is always visible. The `sa-only` CSS pattern: three explicit `body.state-X .sa-only { display: none !important; }` rules cover VIC/NSW/OTHER; one `body:not(.state-sa):not(.state-vic):not(.state-nsw):not(.state-other) .sa-only` rule covers the null/empty-address state.

**Nesting note:** One outer wrapper `<div class="grid2" data-section="criteria results">` spans from the "Receivers & criteria" card all the way through the results panels. Its `data-section="criteria results"` keeps it visible under both the Criteria and Results tabs. The inner "Receivers & criteria" `card.span2` carries `data-section="criteria"` so it hides under Results. Each nested panel manages its own visibility via its own `data-section` attribute.

| Anchor ID | Target element | Group contents |
|---|---|---|
| `group-setup` | `#devInfoCard` | Development info |
| `group-criteria` | `#critBody` | Receivers & criteria, VIC/NSW params, SA/NSW Derivation, Emergency/Music/Childcare criteria, MBS 010 |
| `group-results` | `#assessmentCasesSection` | Assessment cases, Source contribution (`#contribSection`), Characteristic penalties (`#charPenaltySection`), Predicted noise levels (`#predNoiseSection`) |
| `group-treatments` | `#recommendationsCard` | Recommended treatments |
| `group-export` | `#pdfBtn` | PDF/Report buttons, GIS Export, Methodology |

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
| `#map-column` | Absolutely positioned within `#app-layout`; `left` tracks LHS panel width, `right` tracks RHS drawer width (0 when closed, drawer `offsetWidth` when open). `transition: right 0.3s cubic-bezier(0.4,0,0.2,1)`. Contains `#mapInnerWrapper` (with `#noise-map`, toolbars, fullscreen sidebar), search bar overlay (`#mapSearchWrapper`), and status row |
| `#drawer-panel` | 520px right-side panel. `position:absolute; right:0`. Animates open/closed via `transform:translateX()`. Opening sets `mapColumn.style.right` so the map shrinks rather than being overlaid. Classes: `drawer-open` / `drawer-closed` |
| `#drawer-toggle` | Button docked to left edge of drawer, toggles open/closed |
| `#drawer-content` | Scrollable container inside drawer, holds all panels in original order |

### Body class

- `body.drawer-layout` — Activates the full-viewport flex layout (`display: flex; flex-direction: column; height: 100vh; overflow: hidden`)

### localStorage keys

| Key | Values | Purpose |
|-----|--------|---------|
| `resonate_drawer_open` | `"true"` / `"false"` | Persists drawer open/closed state (default: collapsed — only opens if value is exactly `"true"`) |
| `resonate_disclaimer_accepted` | `"true"` | Hides disclaimer banner on subsequent visits |
| `sa-epa-recent-v1` | JSON array of `{name, timestamp, content}` | Recent assessments cache — up to 5 entries (RECENT_LIMIT). Each entry stores the full assessment JSON object, the display name (derived from address search field on save, or filename on file-dialog load), and a Unix ms timestamp. Oldest entry falls off when the list exceeds 5. Quota-exceeded errors handled by trimming and retrying; on final failure the recent list silently gives up (the file dialog path is unaffected). Cache is per-browser, per-device, per-origin; incognito windows have their own empty cache. |

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

### PDF export — Criteria section typography spec (`generatePDFAppendix`)

All heading and body text is rendered via jsPDF API calls (not html2canvas). Helper functions defined inside `generatePDFAppendix`:

| Helper | Style |
|---|---|
| `h1Heading(text)` | Arial 20 pt bold, Resonate yellow `#F2CB00` `[242,203,0]`, before: 12 pt, after: 6 pt; hanging indent — first line at `margin`, continuation lines at `margin + 15 mm` |
| `h2Heading(text)` | 15 pt bold, black `[51,51,51]`, before: 12 pt, after: 6 pt; same hanging indent |
| `introPara(text)` | 9 pt normal, black, line spacing 12 pt (4.23 mm/line); 2 mm gap after paragraph. Call once per paragraph. |
| `captionText(text)` | 8 pt bold, black, before: 3 pt, after: 3 pt. **Not used in the Criteria section** — retained for future reuse. |
| `bulletItem(text)` | 9 pt normal, black, line spacing 12 pt. Glyph U+2022 `•` at `mSide`; text at `mSide + 10 mm` (1 cm hanging indent); wrapped lines align back to `mSide + 10 mm`. Space before 3 pt, after 3 pt. Single-bullet page overflow handled per item. |
| `bulletItemMixed(runs)` | Same layout as `bulletItem`. `runs` is `[{text: string, italic: boolean}, …]`. Wrapping measured from concatenated text in normal font; each line rendered as italic/roman segments using `pdf.getTextWidth()` for x-advancement. Use for bullets containing publication / legislation title italics. |
| `parseDescriptors(text)` | Splits a string into `[{text: string, sub: boolean}]` segments where `sub: true` marks a subscript run. Recognises: `LAeq`, `LA10`, `LA90`, `LAmax`, `L10,15min`, `L90,15min`. For each descriptor, the leading `L` is a normal segment and the subscript letters/digits are a `sub: true` segment. |
| `measureRichLine(segs, bold, fs)` | Returns the total rendered width (mm) of a segment array at the given font size. Normal segments measured at `fs`; subscript segments measured at `fs × 0.62`. Used for centering rich lines in table cells. |
| `renderRichLine(segs, startX, lineY, bold, fs, lineH)` | Renders a segment array at `(startX, lineY)`. Normal segments at `fs`; subscript segments at `fs × 0.62` with a downward baseline offset of `lineH × 0.28`. Does not change text colour — caller must set it beforehand. |
| `placeImage(img, label, maxH)` | Renders captured image at full column width (`cW = 166 mm`); adds 2 mm gap after. Throws on invalid data. |

**Constant:** `var PT = 0.3528;` — converts points to mm (used for all spacing calculations).

**Font:** `var FONT = 'helvetica'` is the default, overridden to `'arial'` at runtime if `fonts/arial-normal.ttf`, `arial-bold.ttf`, `arial-italic.ttf`, and `arial-bolditalic.ttf` are present in the project `fonts/` directory. The four font files are loaded as base64 and registered with jsPDF (`addFileToVFS` / `addFont`) immediately after `new jsPDF()`. The `fonts/` directory is in `.gitignore` (Microsoft Arial is not redistributable). If the font files are absent (e.g. on GitHub Pages), the code logs a console warning and uses Helvetica throughout.

**Top-level section order** (fixed):
1. H1 "Criteria" (Resonate yellow, 20 pt bold)
2. H2 "Introduction" → lead-in paragraph → 5-item bullet list *(see below)*
3. H2 "Zoning" → intro → zone map image
4. H2 "Planning & Design Code — Interface between Land Uses" → intro → table *(SA only)*
5. H2 "Environmental noise policy" → 2× intro → table
6. H2 "Emergency equipment criteria" → intro → table *(conditional)*
7. H2 "Music noise criteria" → intro → table *(conditional)*
8. H2 "Schools, kindergartens, child-care centre of place of worship" → intro → table *(conditional)*

**Introduction bullet list** — five fixed items (order preserved):

| # | Text |
|---|---|
| 1 | Planning & Design Code |
| 2 | Environment Protection (Commercial & Industrial Noise) Policy 2023 (Noise Policy) |
| 3 | Local Nuisance and Litter Control Act 2016 |
| 4 | World Health Organization (WHO) Guidelines for Community Noise |
| 5 | Environment Protection Authority (EPA) Guideline Assessing music noise from indoor venues (2021). |

Final bullet ends with a full stop — intentional. Keep-with-next: entire Introduction block (H2 + lead-in + all 5 bullets) measured via `_mH2 + _mParas + _mBullets` and `newPageIfNeeded()` called before rendering.

**Criteria section structure** (sub-section order is fixed):
1. H1 "Criteria"
2. H2 "Zoning" → intro → zone map image
3. H2 "Planning & Design Code — Interface between Land Uses" → intro → table *(SA only)*
4. H2 "Environmental noise policy" → 2× intro paragraphs → table
5. H2 "Emergency equipment criteria" → intro → table *(conditional)*
6. H2 "Music noise criteria" → intro → table *(conditional)*
7. H2 "Schools, kindergartens, child-care centre of place of worship" → intro → table *(conditional)*

**No captions** — all figure and table captions have been removed from the Criteria section. The `captionText()` helper remains in the codebase but is not called.

**Subscripts on L-descriptors** — All acoustic L-descriptors (`LAeq`, `LA10`, `LA90`, `LAmax`, `L10,15min`, `L90,15min`) are rendered with true subscript formatting via the `parseDescriptors` / `measureRichLine` / `renderRichLine` helper trio. The subscript portion (e.g. `Aeq`, `A10`) is set at 62 % of body font size and shifted downward by 28 % of line height. All five text-rendering functions that draw table cells or paragraph text (`introPara`, `drawCell`, `_eCell`, `_dcM`, `_chCell`) delegate to `renderRichLine`; the two standalone bold header strings ("Criteria, L\u200BAeq dB" and "L\u200BAeq dB") are replaced with `parseDescriptors` + `measureRichLine` + `renderRichLine` calls for manual centring.

### PDF export — map framing panel (`#pdfFramingPanel`)

A non-blocking floating panel shown before either PDF export function locks its button. Lets the user adjust map zoom/pan before capture.

**HTML:** `<div id="pdfFramingPanel">` — `position:fixed; top:72px; left:50%; transform:translateX(-50%); z-index:10000; display:none; flex-direction:column`. Panel does not close on click-outside; only Accept/Cancel buttons close it.

**JS:** `window._showPdfFramingPanel()` — returns `Promise<boolean>`. Resolves `true` on Accept, `false` on Cancel. `stopPropagation` on click/mousedown/wheel prevents accidental panel interaction reaching the map, but the map remains fully interactive behind the panel.

**Buttons:** `#pdfFrameAcceptBtn` (resolves true), `#pdfFrameCancelBtn` (resolves false).

**Integration:** `generatePDFAppendix()` calls `await window._showPdfFramingPanel()` as its **first** async step — before `btn.disabled = true`. If the user clicks Cancel, the function returns immediately without capturing or locking the UI.

### PDF export — page geometry constants

All page-fit logic in `generatePDFAppendix` reads from a single set of constants defined at the top of the "3. Build PDF" section. **Never hardcode margin or height values elsewhere in the function — always derive from these.**

| Constant | Value | Notes |
|---|---|---|
| `LOGO_W` | `52.9 mm` (5.29 cm) | Logo width |
| `LOGO_H` | `LOGO_W × (306/816) ≈ 19.84 mm` | Aspect-ratio derived from `resonate-logo.png` (816 × 306 px) |
| `LOGO_TOP` | `20 mm` (2 cm) | Border between page top edge and top of logo |
| `LOGO_GAP` | `30 × PT ≈ 10.58 mm` | Gap from bottom of logo to first body content (30 pt) |
| `mTop` | `LOGO_TOP + LOGO_H + LOGO_GAP ≈ 50.42 mm` | Top content margin (first y position for body) |
| `mBot` | `20 mm` | Bottom margin |
| `mSide` | `22 mm` | Left and right margins |
| `pW` | `210 mm` | A4 page width |
| `pH` | `297 mm` | A4 page height |
| `cW` | `pW − 2×mSide = 166 mm` | Content column width |
| `cH` | `pH − mTop − mBot ≈ 226.6 mm` | Content column height |

**Logo asset:** `resonate-logo.png` — located at repo root alongside `index.html`, 816 × 306 px PNG. Loaded via `new Image()` → **2× canvas** (1632 × 612 px) → `toDataURL('image/png')`. The 2× canvas serves two purposes: (1) forces conversion to RGBA PNG format, which jsPDF's internal `png.js` parser handles reliably (the original file may be indexed-colour or RGB, which the parser can silently degrade); (2) doubles the pixel count to ~784 DPI at the 5.29 cm rendered width, crisp at 200%+ zoom. If load fails `logoDataUrl` is `null` and the logo is silently skipped (page numbers still render). **Permanent fix note:** replacing `resonate-logo.png` with a print-quality SVG or ≥1500 px PNG from Resonate brand assets would remove the canvas-upsample dependency entirely.

**Running header:** logo rendered via post-processing loop — after all content pages are built, a `for (_p = 1 … pageCount)` loop calls `pdf.setPage(_p)` then `pdf.addImage(logoDataUrl, …)` for every page. Page numbers (`N / total`) rendered in the same loop, centred at `(pW/2, pH-10)`.

**No cover page** — the first content page is page 1; the logo appears on it like every other page.

### PDF export — keep-with-next convention

Each Criteria sub-section is treated as an atomic block (heading + intro paragraph(s) + figure/table). Before rendering any block, its total height is measured using helper functions and `newPageIfNeeded(needH)` is called:

| Helper | What it measures |
|---|---|
| `_mH2(text)` | H2 heading height (12 pt before + lines × 15 pt leading + 6 pt after) |
| `_mParas(texts[])` | Sum of intro paragraph heights (lines × 12 pt leading + 2 mm gap each) |
| `_mCap()` | Caption height (3 pt + 8 pt + 3 pt = fixed 14 pt ≈ 4.94 mm) — **kept for future use; not included in any block-height calculation** |
| `_mImg(img)` | Image height (`cW × img.aspect + 2 mm`) or 0 if no image |

`newPageIfNeeded(needH)` inserts `pdf.addPage()` and resets `y = mTop` if `needH > remainH()`.

`renderCritTablePaginated()` handles the criteria table separately — it renders row-by-row and inserts a page break (with **gold header row only** repeated) whenever a row would overflow the page. No caption is repeated on continuation pages.

### PDF Figure 1 — layer-state override pattern

Figure 1 (zone map) must show **only** base street tiles + zone polygons. `generatePDFAppendix()` implements an override using a whitelist approach:
1. Pre-flight call to `_getPdfZoneCaptureState()` checks `effectiveZoneOn`; if false, clicks `zoneToggleBtn` and waits 2× rAF + 1000ms for layer data to arrive.
2. Gets final refs via `_getPdfZoneCaptureState()` (called after zone forcing so `saZonesLayer` ref is valid).
3. Builds a whitelist: street basemap, parcel outlines, SA `saZonesLayer` (canvas GeoJSON), VIC/NSW `activeZoneOverlay` + `_currentImage` + `zoneOutlineLayer` + `subzoneFeatureLayer`.
4. Removes ALL non-whitelisted layers from `_map` (recorded for restore).
5. After capture: restores removed layers, then turns zones back off if they were forced on.

**SA zone state caveat** — for SA, `isZoneOn` (in the SAPPA/overlay IIFE) is never set; SA zone visibility is tracked by `_planZonesOn` inside the planning IIFE, exposed via `window._isPlanZonesOn()`. `_getPdfZoneCaptureState()` computes `effectiveZoneOn = isZoneOn || saZonesOn` and returns `saZonesLayer` (via `window._getSaZonesLayer()`). Future figures must read `effectiveZoneOn`, not `isZoneOn`, when deciding whether zones are on.

### PDF appendix image formats (`generatePDFAppendix`)

All PDF table cells render from the data model. Input-element capture is not used — `captureElement()` / html2canvas must **never** be applied to tables containing `<input>` or `contenteditable` elements, as input chrome and clipping artefacts will appear in the output.

| Section | How rendered | Format |
|---|---|---|
| Figure 1 — zone map | Leaflet map canvas via `map.getContainer()` | JPEG, direct `pdf.addImage(..., 'JPEG', ...)` |
| PDC table | Native jsPDF — reads `_PDC_PROVISIONS[i]` + `_pdcProvisions[i].relevance` | — (no image) |
| Environmental noise criteria table | Native jsPDF via `renderCritTablePaginated()` | — (no image) |
| Emergency equipment table | Native jsPDF — 2-row header (gold + grey) built from `fireOn`/`genOn` flags; body rows from `emergEquipBody` DOM | — (no image) |
| Music noise criteria table | Native jsPDF — reads `musicBg*` input values directly | — (no image) |
| Childcare table | Native jsPDF — static "All sensitive receivers | 50" row | — (no image) |

html2canvas (`captureElement()`) is used only for the zone map figure; all table sections use native jsPDF rendering. `placeImage()` is retained for the zone map only.

#### PDC table column layout
Three columns, proportional to `cW = 166 mm`:
- Performance Outcome: 47% ≈ 78 mm
- DTS/DPF: 33% ≈ 55 mm
- Relevance: 20% ≈ 33 mm

Row height is dynamic: each row measured via `_pdcMeasureRowH()` (wraps all three cells at their widths, returns `maxLines × _pdcLH + 2 × _pdcPad`). Rows never split across pages; header row repeats on continuation pages.

#### Named colour constants (inside `generatePDFAppendix`)
| Constant | Value | Purpose |
|---|---|---|
| `TABLE_HEADER_YELLOW` | `[242,203,0]` (#F2CB00) | Primary header row (gold) — all tables |
| `TABLE_HEADER_GREY` | `[217,217,217]` (#D9D9D9) | Subheader / frequency-label rows — all tables (final, confirmed) |
| `GOLD` | same reference as `RESONATE_YELLOW` | Legacy alias, still used inside `renderCritTablePaginated` |

#### Table style invariants (all five tables)
- **Borders:** 0.5 pt black (`setDrawColor(0,0,0)`, `setLineWidth(0.18)`), drawn AFTER fills on every cell — 4 sides, no exceptions
- **Text colour:** black (`setTextColor(0,0,0)`) for all cells including header rows
- **Row height:** auto-sized — `max(lines per cell) × lineHeight + 2 × padding`; no fixed row heights; `lineHeight ≈ fontSize × 0.3528 × 1.35`, `padding = 2 mm`
- **Text alignment:** top-aligned (baseline at `cy + pad + capHeight`); subsequent lines at `+ lineHeight` each
- **Space after table:** `y += 12 * PT` (~4.2 mm) appended after the last row of every table

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

## 3D Scene Viewer

A full-viewport modal that renders the current assessment geometry (terrain, buildings, barriers, sources, receivers) in a Three.js scene for visual verification of screening geometry and heights. It is a snapshot-on-open read-only view — no editing, no real-time sync with the Leaflet map. Shipped in phases; **Phase 1** provides only the modal scaffolding and an empty scene with a placeholder ground plane.

The viewer operates in **two modes** depending on whether DEM data is available:

- **Terrain mesh mode** — DEM tiles are cached (Terrain is ON and tiles have finished fetching). The scene is built on a colour-ramped elevation surface with per-vertex heights from the LiDAR / SRTM sample grid. Wireframe toolbar button enabled.
- **Flat fallback mode** — no DEM tiles cached (Terrain is OFF, or just turned on but fetch is in flight, or the site is outside LiDAR + SRTM coverage). The scene uses a 2 km × 2 km grey `PlaneGeometry` at Y=0 as the ground surface; all buildings / barriers / sources / receivers still render at their specified heights above Y=0 so the viewer is still useful for verifying relative heights. A yellow banner reads "No terrain data available. Enable Terrain for 3D elevation." The Wireframe toolbar button is disabled with a "No terrain mesh (fallback plane in use)" tooltip.

Both modes go through the same Phase 2–5 build pipeline — the `showNoTerrainFallback()` branch just replaces the real terrain mesh step with the flat plane and skips the chunked DEM sampling.

### Triggering

- **Toolbar button** `#threeDViewBtn` in the Tools panel at [`index.html:2214`](../index.html:2214), between `#terrainContourBtn` and `#buildingsToggleBtn`. **Always visible** — not gated on terrain state (the viewer works in flat-fallback mode when no DEM is cached).
- **Keyboard shortcut** `V` at [`index.html:36097`](../index.html:36097). Input-focus guard inherited from the main keyboard handler; no terrain-state gating.
- **Save/load** does not persist the modal open/close state (matches the ISO noise map policy). The button is always visible so there's nothing about the button itself to restore from the saved JSON.

### Three.js lazy-load

- **Library:** Three.js **r128** from cdnjs (`three.min.js`) + OrbitControls from jsdelivr (`examples/js/controls/OrbitControls.js` under `three@0.128.0`).
- **Why r128:** later Three.js releases dropped the UMD `examples/js/` path. The app has no build step, so ES modules / `/addons/` imports don't work. r128 is the last release that exposes `THREE.OrbitControls` as a global via plain `<script>` tags.
- **Loader:** `loadThreeJS()` inside the 3D-viewer IIFE. Returns a cached Promise on second+ call. CDN failures surface as an in-modal error message (no silent blank). Implemented at [`index.html:3672`](../index.html:3672).

### Modal DOM structure

Built on-demand by `show3DModal()` at [`index.html:3851`](../index.html:3851). DOM layout:

```
#threeDModalBackdrop       position:fixed; inset:0; z-index:10000; rgba(0,0,0,0.85)
└── box                    position:absolute; inset:12px; #1a1a2e; flex column
    ├── header             #0f0f1e; flex row; title + × close button
    └── canvasWrap         position:relative; flex:1 1 auto; #000
        ├── #threeDCanvas  WebGLRenderer attaches here
        ├── status         loading / error overlay (pointer-events:none)
        └── hint           bottom-left usage hint (pointer-events:none)
```

- **ARIA:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby="3d-modal-title"`.
- **Close mechanisms:** × button, Escape key (capture phase + `stopImmediatePropagation` so it doesn't leak to the drawer Esc handler), click on backdrop outside the box.
- **Focus trap:** `focusin` capture handler pulls focus back to the close button if it escapes the backdrop.
- **Focus restore:** tracks `document.activeElement` on open, restores on close with a stale-element guard (`document.contains()` check, fall-back to fresh `getElementById('threeDViewBtn')` lookup) — same pattern as methodology modal.

### Scene setup

Inside `initThreeScene(canvas, container, statusEl)`:

| Component | Configuration |
|---|---|
| `WebGLRenderer` | `antialias: true`, `setPixelRatio(devicePixelRatio)`, sky-blue clear color `0x87ceeb` |
| `PerspectiveCamera` | FOV 60, near 0.1, far 50000, initial `(300, 250, 300)` (overridden by `frameCameraToTerrain()` once the mesh is built) |
| `OrbitControls` | `enableDamping: true`, `dampingFactor: 0.1`, `minDistance` / `maxDistance` set from terrain bbox after build |
| `AmbientLight` | `0xffffff` × 0.5 |
| `DirectionalLight` | `0xffffff` × 0.7, positioned NW at `(-100, 200, -100)` |
| `GridHelper` | Sized to `max(100, 1.2 × terrain-bbox-diagonal)`, positioned at `Y = elevMin − 0.5`, **hidden by default** (`.visible = false`) |
| `AxesHelper` | Size 20 at origin, **hidden by default** |

Placeholder ground plane from Phase 1 is removed — the real terrain mesh (or a fallback flat plane when DEM data is absent) takes its place. After scene construction, `initThreeScene()` calls `buildTerrainMesh()` which runs async over many ticks.

**Render loop** uses `setTimeout(animate, 16)` rather than `requestAnimationFrame`. Some embedded preview / iframe / hidden-tab renderers throttle rAF to zero callbacks/second, which would stall `OrbitControls` damping and leave post-build scene mutations (most importantly the Phase 2 terrain mesh arriving after chunked sampling) permanently invisible. `setTimeout` has negligible perf cost for a small scene in a short-lived modal and works in every environment. The internal variable name `_3dRafId` is retained for diff-noise reduction — it's just a timer id now; the matching `cancelAnimationFrame` in `close3DModal` has been swapped for `clearTimeout`.

### Coordinate system

- **Y axis** — up. Scene Y = elevation in metres above the reference datum.
- **X axis** — east (positive longitude direction).
- **Z axis** — south (negative Z = north).
- **Scene origin** — current map centre (`window._map.getCenter()`), not a lat/lng origin.

### `window.latLngToLocal(lat, lng, centreLat, centreLng)`

Equirectangular projection with `cos(centreLat)` scaling. Returns `{ x, z }` in metres relative to the scene origin. Accurate for areas under ~5 km (typical noise-assessment viewport). Will be used by Phase 2 terrain mesh and Phase 3+ geometry:

```js
var R = 6371000, D = Math.PI / 180;
var x = (lng - centreLng) * D * R * Math.cos(centreLat * D);
var z = -(lat - centreLat) * D * R;
```

Exposed globally so other modules can reuse it once later phases need to serialise geometry for the scene.

**Verified with real coordinates** (Adelaide CBD, lat -34.9285): self-transform at viewport centre returns `(0, 0)` exactly; a `+0.001°` lat/lng offset produces `(91.165 m east, -111.195 m north)` matching the hand-calc to ~5×10⁻¹⁰ m (floating-point noise); a point ~300 m north-west of centre lands at `(27.35 m east, -300.23 m north)` — exact match against the formula.

### `window._3dAddMarker(lat, lng, opts)`

Debug / dev helper for dropping a coloured sphere at an arbitrary geographic point in the live 3D scene. Returns the `THREE.Mesh` (so callers can inspect `.position.x/y/z`), or `null` if the modal isn't open / Three.js isn't loaded / no map is mounted.

`opts` is optional: `{ radius = 5, color = 0xff3b3b, y = 10, name = 'debug-marker' }`. Used during Phase 1 verification to confirm `latLngToLocal` works; will be useful through Phases 2–6 for visual debug of building/barrier/source positioning before the dedicated geometry code is in place.

### Cleanup pattern

Called by `close3DModal()` in this exact order (WebGL context leak prevention — browsers cap at ~8–16 contexts):

1. **Cancel in-flight chunked terrain sampling** — `_3dSamplingCancel = true` + `clearTimeout(_3dSamplingHandle)`. Must run first so no late `processChunk` callback mutates a scene that's about to be disposed.
2. `clearTimeout(_3dRafId)` — stop the render loop before any further `render()` can run on a disposed resource. (Variable retains the `_RafId` name for diff-noise reduction; it's just a `setTimeout` handle — see "Render loop" under Scene setup.)
3. `scene.traverse(obj => { obj.geometry?.dispose(); obj.material?.dispose(); })` — release GPU buffers and textures for the terrain mesh, fallback plane, grid + axes helpers, all three building flavours, and any marker spheres added via `_3dAddMarker`.
4. `controls.dispose()` — remove the orbit controls' pointer listeners from the canvas.
5. `renderer.forceContextLoss()` — explicitly drop the WebGL context (without this, browsers silently fail to grant a new context on the 9th+ modal open).
6. `renderer.dispose()` — release internal state.
7. Remove the backdrop from the DOM.
8. Remove keydown, focusin, and window resize listeners.
9. Restore focus to `#threeDViewBtn`.

All state variables are module-scoped inside the IIFE and nulled-out (or reset to empty arrays) on close so a subsequent `show3DModal()` starts with a clean slate:

- Phase 1 / 2 core: `_3dRenderer`, `_3dScene`, `_3dCamera`, `_3dControls`, `_3dModalEl`, `_3dRafId`
- Phase 2 terrain: `_3dTerrainMesh`, `_3dFallbackPlane`, `_3dGridHelper`, `_3dAxesHelper`, `_3dCanvasWrap`, `_3dBannerEl`, `_3dProgressEl`, `_3dSamplingHandle`
- Phase 3 buildings: `_3dOsmBuildingsMesh`, `_3dCustomBuildingMeshes[]`, `_3dBuildingSourceMeshes[]`
- Phase 4 barriers + ground zones: `_3dBarrierMeshes[]`, `_3dBarrierCrests[]`, `_3dGroundZoneMeshes[]`
- Phase 5 sources + receivers + labels: `_3dSourcesGroup`, `_3dReceiversGroup`, `_3dLabelsGroup` (each a `THREE.Group`; `scene.traverse` walks into them to dispose geometries + materials + `material.map` CanvasTextures)
- Phase 6 toolbar: `_3dToolbarControls` (refs to slider + toggle buttons), `_3dToolbarKeyHandler` (document-level capture-phase keydown listener) — both removed / nulled on close

### Reference-elevation datum

All Y values in the 3D scene are **relative**, not absolute ASL. A module-level `_3dReferenceElevation` holds the local datum — the minimum elevation across the cached DEM sample grid at modal-open time. Every Y-coordinate producer subtracts this value so the terrain minimum sits at Y=0 and relief grows upward from there. Without this step, a 45 m-ASL Adelaide CBD site would render the terrain mesh floating 45 m above the OSM buildings and fallback plane (which sit at Y=0), with cliff-like edges where the two coordinate systems meet.

Where the subtraction happens:

- **Terrain mesh** — directly in `finaliseTerrainMesh()`: position buffer writes `(elev - elevMin)` for each vertex. The colour ramp was already driven by `(elev - elevMin) / range`, so its output is byte-identical to pre-normalisation.
- **`sampleTerrainAt(lat, lng)`** — subtracts `_3dReferenceElevation` before returning. Phase 3–4 consumers (building centroid lookup, barrier per-endpoint sampling, ground-zone per-vertex lookup) and the area source per-vertex lookup automatically get normalised values via this helper. Barriers and area sources also call `_sampleTerrainMeshAt` first for triangle-exact interpolation, falling back to `sampleTerrainAt`.
- **Point sources** using `source.groundElevation_m` — subtract explicitly at the call site (this value is pre-fetched from DEM for the propagation engine, which DOES need absolute ASL, so the source of truth stays absolute and the 3D viewer does its own subtraction).
- **Receivers** using `recvGroundElevations[key]` — same deal, subtract explicitly.

Behaviour across modes:

| Mode | `_3dReferenceElevation` |
|---|---|
| Terrain mesh built | `elevMin` of the cached sample grid |
| Flat fallback (terrain off, or no DEM cached) | `0` |

In fallback mode the subtraction is a no-op; buildings / sources / receivers sit at `0 + their_height`. The main app's terrain-toggle-off path also clears `sources[*].groundElevation_m` and `recvGroundElevations[*]` so stale absolute values never leak into the fallback scene.

Reset to 0 in `close3DModal()` so every fresh open starts with a clean datum. The propagation engine, 2D contour rendering, and `DEMCache` raw samples are all untouched by this normalisation — it's a 3D-viewer-local transform applied at use-time.

### Building-aware object heights

Every source / barrier / receiver / line-source / area-source vertex placed inside a building footprint has its Y lifted by the roof height at that point, so rooftop objects visually sit on the roof rather than inside the building.

The underlying data model distinguishes height-above-surface from height-above-ground:

- `pin.height_m` — height ABOVE the local surface (ground, or roof if the pin is on a building)
- `pin.buildingHeight_m` — pre-computed roof height beneath the pin (0 if no building), maintained by `detectBuildingUnderSource()` at [`index.html:10754`](../index.html:10754)
- Effective height above ground = `height_m + buildingHeight_m` — the propagation engine already does this addition at every prediction site.

#### `_3dBuildingHeightAt(lat, lng)`

The 3D viewer's own lookup helper. Returns the effective roof height at a geographic point, or 0 if the point isn't inside any building footprint. Independent of the 2D "Buildings layer" toggle because the 3D viewer always renders every building it knows about — an object on a rooftop must always sit on it in 3D regardless of 2D layer visibility.

**Priority order** — first hit wins:

1. `window._getCustomBuildings()` — `(cb.baseHeightM || 0) + (cb.heightM || 3)`
2. `window._getBuildingSources()` — `(bs.baseHeightM || 0) + (bs.height_m || 6)` (note the underscore-separated `height_m` field and the `vertices` property vs custom buildings' `polygon`)
3. `window._buildings` (OSM) — filtered to skip `isCustom` / `isBarrier` / `isBuildingSource` pseudo-entries and `excluded` / `demolished`. Height fallback chain `heightM → height → levels × 3 → 6 m` matches `buildOSMBuildings()`.

Reuses the existing top-level `_pointInPolygon(lat, lng, polygon)` ray-casting PIP at [`index.html:10736`](../index.html:10736).

#### Call-site pattern

For every per-vertex Y calculation in Phases 3–5:

```js
var terrainY  = sampleTerrainAt(lat, lng) || 0;
var buildingY = _3dBuildingHeightAt(lat, lng);
var y         = terrainY + buildingY + object.height;
```

Call sites wired in:

| Object type | Lookup granularity | What happens on a rooftop |
|---|---|---|
| Point sources | Per-pin | Sphere sits at `roof + height_m` |
| Line sources | Per-vertex | Tube rises where vertices fall inside a footprint, drops back on the outside |
| Area sources | Per-vertex | Polygon drapes over the roof on the overlapping side |
| Barriers | Per-endpoint | Wall steps up at the vertex crossing the building edge |
| Receivers | Per-pin | Cone sits at `roof + receiver_height + cone-centering offset` |

Line / area source centroid labels also subtract the centroid's `_3dBuildingHeightAt` so labels float above the object even when the centroid is on a rooftop.

Per-vertex transitions mean a line source that enters a building mid-segment gets its height change at the NEXT vertex, not at the building edge. Acceptable for v1; proper edge-intersection would require ray-building-edge clipping which isn't worth the complexity for a visual-verification tool.

#### Performance

Worst case `O(objects × vertices × buildings)` per modal open. A 500-OSM-building project with 50 source vertices is ~25,000 PIP tests at microseconds each — well under 100 ms total, no observable slowdown. If a project ever pushes this, the right fix is to pre-build a bbox spatial index for `window._buildings`; not needed at v1.

### Terrain mesh pipeline (Phase 2)

Entry point: `buildTerrainMesh()` called at the end of `initThreeScene()` after the scene and camera are set up but before Phase 3's building pass.

- **Data source**: `DEMCache.getAllWCSRasters()` filtered to LiDAR + SRTM tiles that overlap `window._map.getBounds()`. Mirrors the tile filter in `generateTerrainContours()`. Zero overlap → `showNoTerrainFallback()`.
- **Grid construction** identical to the 2D contour code: `rawSpacing = max(latSpan, lngSpan) / 250`, snapped up to the nearest `10^floor(log10(raw))` magnitude, floor 0.00005°, capped at 250 samples per axis. Lat / lng axis arrays built south-to-north and west-to-east.
- **Chunked sampling** — 5,000 samples per `setTimeout(…, 0)` tick. LiDAR preferred (most-recent-first), SRTM fallback, NaN when neither covers a cell. Progress overlay text updates after each chunk. `_3dSamplingCancel` flag short-circuits the loop on modal close so a late chunk never mutates a disposed scene. `setTimeout` rather than `requestAnimationFrame` — see "Render loop" under Scene setup for why.
- **Geometry build** (`finaliseTerrainMesh`):
  - Position buffer `(x, y, z)` per vertex, Y = sampled elevation (or Y = elevMin when NaN so the vertex exists but isn't indexed).
  - Index buffer: two triangles per cell, **skipped when any of the four corners is NaN** → honest gaps instead of cliff artifacts from zero-filling.
  - Colour buffer: three-stop RGB ramp (green `#4a7c3a` at t=0 → brown `#8b6f3a` at t=0.5 → tan `#d4b896` at t=1) with `t = (elev − elevMin) / (elevMax − elevMin)`. Normalised so a 2 m fall on a flat industrial site still maps across the full palette. Implemented in `_elevationRamp(t)`.
  - `computeVertexNormals()` → `MeshLambertMaterial({ vertexColors: true, side: DoubleSide })`.
- **Grid-helper swap**: `THREE.GridHelper` doesn't expose a resize API, so the Phase 1 1000-unit placeholder is disposed and replaced with one sized to `max(100, 1.2 × bbox diagonal)`, positioned at `Y = elevMin − 0.5` so it sits just below the lowest terrain vertex. Visibility state is preserved across the swap so Phase 7's toolbar toggle still works.

### No-terrain fallback

Triggered when `DEMCache.getAllWCSRasters()` returns zero tiles overlapping the current viewport — e.g. the user opens the modal before the terrain fetch finishes, or the site is entirely outside LiDAR + SRTM coverage.

- Adds a 2 km × 2 km flat grey `PlaneGeometry` at Y = 0 (named `fallback-plane`) so Phase 3+ geometry still has a surface to build on.
- Repositions the grid helper to `Y = −0.1` so it stays just below the plane.
- Frames the camera via `frameCameraToTerrain(new Box3(-1000..1000, 0, -1000..1000))`.
- Shows a yellow non-blocking banner at the top of the canvas reading "No terrain data available. Enable Terrain for 3D elevation." — `pointer-events: none` so it doesn't interfere with orbit controls.
- **Partial coverage** (some tiles missing within the viewport) is NOT treated as no-data; it's handled by the per-cell NaN-skip in the mesh builder so the rest of the mesh still renders with visible gaps where data is missing.

### Camera auto-positioning

`frameCameraToTerrain(bbox)` computes a good viewing position based on the geometry bounding box:

- **Target** = bbox centre.
- **Distance** = `1.5 × diagonal` along a `(+x, +y, +z)` vector (normalised so horizontal offset is `0.7 × cos45° × distance` in each of X and Z, vertical is `0.7 × distance` in Y) — approximately 45° elevation looking NW, so north reads as "up-left" matching the Leaflet 2D convention.
- `controls.target` set to the bbox centre.
- `controls.maxDistance = 5 × diagonal`, `controls.minDistance = 10 m`.

Called from both `finaliseTerrainMesh()` (after the real terrain is added) and `showNoTerrainFallback()` (with a synthetic 2 km box) so the camera always frames whatever surface is actually on-screen.

### Building extrusion (Phase 3)

Three flavours of building-shaped geometry, identical extrusion logic, different data source + material:

| Flavour | Data source | Material | Mesh strategy |
|---|---|---|---|
| OSM buildings | `window._buildings` (filtered) | `MeshLambertMaterial({ color: 0x888888, transparent: true, opacity: 0.7, side: DoubleSide })` | Single merged mesh across all footprints (perf — dense urban can have 500+) |
| Custom buildings | `window._getCustomBuildings()` | `MeshLambertMaterial({ color: 0x4a90d9, transparent: true, opacity: 0.8, side: DoubleSide })` | Individual mesh per building |
| Building sources | `window._getBuildingSources()` (new accessor) | `MeshLambertMaterial({ color: 0xE67E22, transparent: true, opacity: 0.8, side: DoubleSide })` | Individual mesh per source |

`buildAllBuildings()` is called from both `finaliseTerrainMesh()` and `showNoTerrainFallback()` so buildings appear whether terrain loaded or not.

#### `buildExtrudedFootprint(vertices, baseY, topY, centreLat, centreLng)`

Shared helper that takes a footprint polygon and base / top elevations, returns raw indexed geometry arrays `{ positions: Float32Array, indices: Uint32Array }` (or `null` on degenerate input / triangulation failure). The raw-arrays return shape lets the caller either attach them directly to a `BufferGeometry` (custom + source paths) or concat them into a merged accumulator (OSM path). Key steps:

1. Normalise both `{lat,lng}` and `[lat,lng]` vertex shapes; drop a closing duplicate vertex if present (earcut expects an open contour).
2. Convert each vertex to local XZ via `latLngToLocal()`.
3. Compute signed area of the XZ polygon. If negative (CW from above) reverse the contour so side-wall outward-facing winding is consistent with the top-cap CCW winding.
4. Triangulate the top cap via `THREE.ShapeUtils.triangulateShape(contour, [])` inside `try/catch`. On throw → `console.warn` + return `null` so self-intersecting OSM polygons are skipped instead of killing the scene.
5. Build vertex layout:
   - `0 .. N-1`: top-cap verts at `topY`
   - `N .. 2N-1`: bottom-cap verts at `baseY` (same XZ)
   - `2N .. 2N + 4N - 1`: side-wall verts, **4 per edge** so `computeVertexNormals()` produces distinct per-wall normals rather than smoothing them across corners.
6. Emit indices: top cap (original winding, +Y normals), bottom cap (reversed winding, −Y normals), two side-wall triangles per edge.

#### `sampleTerrainAt(lat, lng)`

Point-samples `DEMCache` for a single lat/lng. LiDAR preferred (most-recent-first), SRTM fallback, `null` if no coverage. Used for per-building base-elevation lookup at the centroid of each footprint. Null-sample buildings use `baseY = 0` so they sit on the mean ground plane / fallback plane rather than floating.

#### OSM pass (`buildOSMBuildings`)

- **Skip rules**: <3 vertices, `excluded` / `demolished` flags, any entry flagged `isCustom` / `isBarrier` / `isBuildingSource`, and any entry whose `id` appears in the custom-buildings or building-sources lists.
- **Why the id dedup**: in some paths the 2D screening pipeline injects pseudo-entries for customs / barriers / building sources into `window._buildings` so the combined screening iteration hits them too. Without the id check those would double-render — once as grey OSM, once as the correct custom blue / source orange.
- **Height fallback**: `b.heightM || b.height || (b.levels ? b.levels * 3 : null) || 6` — catches OSM records where the `height` tag is null but `levels` isn't, and finally a 6 m last-resort for records with no height information at all.
- **Merge**: each building's positions + indices go into per-chunk typed arrays; after the loop they're concatenated into a single `Float32Array` + `Uint32Array` pair attached to one `BufferGeometry`. Indices are offset by the running vertex count as each building is appended.

#### Custom + building-source passes

Small counts → individual meshes, easier to reason about than a merged blob. Height is `cb.heightM` (custom) or `bs.height_m` (source — note the underscore, matching the field naming in the existing data structure). Base elevation is `(sampleTerrainAt(centroid) || 0) + (baseHeightM || 0)`, so a custom building with `baseHeightM = 3` sits on a 3 m elevated platform above the terrain — matches how the 2D renderer treats those.

#### Accessors

- `window._buildings` — existing global (OSM footprints + pseudo-entries in some paths), read-only from 3D code
- `window._getCustomBuildings()` — pre-existing accessor next to save/load
- `window._getBuildingSources()` — **new** in Phase 3, exposed next to `_getCustomBuildings()` at [`index.html:31153`](../index.html:31153). Returns the closed-over `buildingSources[]` array. Also used by save/load in future if needed.

### Barriers and ground zones (Phase 4)

Two more polygon-based geometry types — same coordinate / DEM-sampling utilities as Phase 3, different data structure and rendering.

#### Barriers

Data source: `window._getUserBarriers()` returning `userBarriers[]`. Each barrier has `{ id, vertices: [[lat,lng],…], heightM, baseHeightM, suppressed, name, vertexElevations: number[]|null }`. `vertexElevations` stores absolute-ASL elevation at each vertex, fetched via `_fetchVertexElevations()` / `DEMCache.getElevations()`. Suppressed barriers are fully skipped in 3D — the 2D map handles suppression indication with its own styling.

`_buildOneBarrier(barrier, centre)` at [`index.html:4664`](../index.html:4664) emits:

- **Wall mesh** — one quad per consecutive vertex pair. Each quad has:
  - Bottom corners at `(x_i, baseY_i, z_i)` and `(x_j, baseY_j, z_j)` where `baseY_n = sampleTerrainAt(n) + baseHeightM` — independent per endpoint, so the bottom edge **follows the ground slope** exactly.
  - Top corners at `baseY_n + heightM`.
  - Winding `BL → BR → TR` and `BL → TR → TL` with `side: THREE.DoubleSide` so both faces render.
- **Crest accent line** — a `THREE.Line` with `LineBasicMaterial({ color: 0x2E7D32 })` running through every barrier vertex at `y = baseY_n + heightM`. Makes the top edge readable from any orbit angle, especially when a barrier sits behind or over a building.

Material: `MeshLambertMaterial({ color: 0x4CAF50, transparent: true, opacity: 0.85, side: DoubleSide })`. Matches the 2D `BARRIER_STYLE` green.

#### Ground zones

Data source: `window._getGroundZones()` returning `_groundZones[]`. Each zone has `{ id, name, g, vertices: [[lat,lng],…] }` where `g ∈ [0, 1]` is the ground absorption coefficient.

`_buildOneGroundZone(zone, centre)` at [`index.html:4779`](../index.html:4779):

1. Normalise vertex shape, drop duplicate closing vertex, enforce CCW winding.
2. Per-vertex `y = sampleTerrainAt(lat, lng) + 0.2 m` — the **+0.2 m offset** is critical for avoiding z-fighting with the terrain mesh surface; anything closer flickers.
3. Triangulate via `THREE.ShapeUtils.triangulateShape(contour2D, [])` inside `try/catch` — warn + skip on failure (same pattern as Phase 3 buildings).
4. Build `BufferGeometry` with positions only (no vertex colours — G is uniform within a zone).

Material: `MeshBasicMaterial({ color: _groundZoneColour(g), transparent: true, opacity: 0.4, side: DoubleSide, depthWrite: false })`. `depthWrite: false` is what makes the zone look like a tint on the terrain rather than an occluder — the terrain colour shows through the semi-transparent fill. `renderOrder: 1` (terrain and other geometry default to 0) puts the zones last in the draw order so the blend is correct.

G-factor colour ramp (`_groundZoneColour(g)`):

| G | Description | Colour |
|---|---|---|
| 0.0 | Hard | `#9E9E9E` grey |
| 0.5 | Mixed | `#7A8B4A` olive |
| 1.0 | Soft | `#4CAF50` green |

Linear RGB interpolation between stops. Flat colour per zone (not vertex colours — G is uniform within a zone by definition).

#### Build order

`buildAllBuildings()` now calls in sequence: OSM buildings → custom buildings → building sources → barriers → ground zones. Transparent zone fills render last so they blend over the opaque / mostly-opaque volumes that would otherwise peek through.

### Sources + receivers + labels (Phase 5)

The acoustic elements of an assessment — point / line / area sources, receivers, and their text labels. Rendered after the static Phase 2–4 geometry so they sit on top visually.

#### Data accessors

Added to the window export surface at [`index.html:31803`](../index.html:31803) alongside the existing `_getCustomBuildings` / `_getBuildingSources`:

- `window._getSourcePins()` → `sourcePins[]`
- `window._getLineSources()` → `lineSources[]`
- `window._getAreaSources()` → `areaSources[]`

Receiver positions come from the existing `window._getAllLatLngs()` (returning `{ r1: {lat,lng}, r2: {lat,lng}, … }`). Receiver heights come from the pre-existing global `getReceiverHeight(idx)` which reads `recvHeights[key]` (overrides) with fallback to `iso_receiverHeight`. Cached receiver ground elevations live on `window.recvGroundElevations` and are preferred over a fresh DEM sample.

#### `THREE.Group` containers

Three groups added to the scene during build, one per category — enables Phase 6 to toggle an entire category with `group.visible = !group.visible`:

| Group | Contains | `.name` |
|---|---|---|
| `_3dSourcesGroup` | All point / line / area source meshes (not building sources — those are Phase 3) | `sources` |
| `_3dReceiversGroup` | All receiver cone meshes | `receivers` |
| `_3dLabelsGroup` | All sprite labels (sources + receivers) | `labels` |

Groups are created fresh on every build (inside `buildAllSourcesAndReceivers()`), so a close → reopen cycle starts with clean state. Nulled on close; `scene.traverse` in `disposeScene()` walks into the groups and disposes every `.geometry` / `.material` / `.material.map`.

#### Geometry by type

| Type | Geometry | Material | Notes |
|---|---|---|---|
| Point source | `SphereGeometry(0.8, 12, 8)` — same as receivers; distinguished from receivers by colour only | `MeshLambertMaterial({ color: 0xE53E3E })` | Y prefers `source.groundElevation_m` (pre-fetched), falls back to `sampleTerrainAt()` |
| Line source | `TubeGeometry(CatmullRomCurve3, max(16, (N−1)×8), 0.5, 8)` | `MeshLambertMaterial({ color: 0xE53E3E, transparent: true, opacity: 0.9 })` | Each vertex elevated to `terrainY + height_m` |
| Area source | **Primary**: `BufferGeometry` from `_terrainGrid` cell quads clipped by polygon PiP. **Fallback**: `BufferGeometry` from `ShapeUtils.triangulateShape` on densified outline | `MeshLambertMaterial({ color: 0xE53E3E, transparent: true, opacity: 0.5, side: DoubleSide, depthWrite: false })` | Primary path uses terrain grid cells (centroid PiP via `_asPip2D`) with exact grid elevations + 0.05 m offset — perfect terrain parity, no interior interpolation error. Boundary outline densified at ~5 m. Fallback used when `_terrainGrid` null (terrain off / no coverage). Label at max Y of mesh vertices + 4 m. `renderOrder: 2` |

#### Receiver cone colours

Exactly matches the 2D map marker palette so mental mapping between views is instant:

| Receiver | Colour |
|---|---|
| R1 | `#2563EB` blue |
| R2 | `#16A34A` green |
| R3 | `#D97706` amber |
| R4 | `#7C3AED` purple |

Geometry is `SphereGeometry(0.8, 12, 8)`, positioned with the **sphere centre at the receiver point** (`groundY + buildingY + receiverHeight`) — natural visual for "person / ear at this point", and paired with the 0.8–1.4 m source bursts for matched marker weight. Receivers without a placed map marker are skipped entirely.

#### `_makeLabelSprite(text)` sprite helper

Canvas-rendered text label that billboards to face the camera. At [`index.html:4911`](../index.html:4911):

1. 256 × 64 pixel `<canvas>` with `bold 28px sans-serif` text.
2. White fill with a 4-pixel black outline for legibility against any background (sky, terrain, building roof, cone).
3. Truncated to 17 chars + `…` if the name is long.
4. `CanvasTexture` wrapped in `SpriteMaterial({ map, depthTest: false, transparent: true })` — labels are readable **through** geometry (point of a label is to tag something even when something visually occludes it).
5. World-unit sprite scale `20 × 5` — big enough at typical site distances, not dominant.
6. `renderOrder: 10` so `depthTest: false` actually wins over other geometry in the draw order.

`_addLabel(text, x, y, z)` positions the sprite in world space and adds it to `_3dLabelsGroup`. Offsets tuned to the current marker sizes: sources get a label 3 m above the sphere centre, receivers get one 2.5 m above the sphere centre — both clear the 0.8 m radius with generous margin. Anti-stacking: collisions within a 5 m XZ radius bump the label Y by 4 m per prior label.

Labels are added during geometry construction — there's no "add labels afterwards" phase. Phase 6's label-toggle button will flip `_3dLabelsGroup.visible`.

#### Canvas texture disposal

`SpriteMaterial.map` is a `CanvasTexture` that holds references to both the backing `<canvas>` element and its GPU texture. `material.dispose()` does NOT cascade into `.map`, so `disposeScene()` at [`index.html:3733`](../index.html:3733) was extended to explicitly call `.map.dispose()` before `.dispose()`. Without this, repeated open / close cycles leaked both canvas nodes and GPU textures.

### Toolbar controls (Phase 6)

A bottom toolbar inside the 3D modal exposes session-only view controls. No GPU resources, no persistence, no changes to geometry — the controls read / write boolean properties on existing scene objects.

#### Layout

Flex row at the bottom of the inner modal box, below the canvas. `#0f0f1e` background matching the header, thin `#2a2a44` top border. The canvas container has `flex: 1 1 auto` and the toolbar has `flex: 0 0 auto`, so the canvas shrinks automatically to fit between header and toolbar — no manual resize maths. Order left-to-right:

```
[Vert × slider + value readout] [|] [Wireframe] [Labels] [Grid] [Axes] [|] [Reset view]
```

#### Controls

| Control | Target | Default | Shortcut |
|---|---|---|---|
| Vert × slider (1.0× – 10.0×, step 0.5) | `_3dScene.scale.y` | 1.0× | `+` / `-` adjust ±0.5 |
| Wireframe | `_3dTerrainMesh.material.wireframe` | off | `W` |
| Labels | `_3dLabelsGroup.visible` | on | `L` |
| Grid | `_3dGridHelper.visible` | off | `G` |
| Axes | `_3dAxesHelper.visible` | off | `A` |
| Reset view | `resetCameraToScene()` | — | `R` |

The Wireframe button is created in a disabled state at modal-open time (terrain builds async, `_3dTerrainMesh` is null then) and re-wired inside `finaliseTerrainMesh()` once the mesh exists. If the fallback flat plane is in use instead of a real terrain mesh, the button stays disabled with a `"No terrain mesh (fallback plane in use)"` tooltip.

#### Vertical exaggeration

`_3dScene.scale.y = n` multiplies into the world transform of every child, so a single line scales the whole terrain / buildings / barriers / ground zones / sources / receivers stack on the Y axis uniformly. Sprite labels are unaffected because sprites use their own world-space positioning, so text stays legible at any exaggeration — exactly the behaviour you want for a verification tool.

#### `resetCameraToScene()`

At [`index.html:4103`](../index.html:4103). Builds a `THREE.Box3` across every `isMesh` / `isLine` child of the scene, skipping helpers (`GridHelper` / `AxesHelper`), lights, sprites (their positions are already covered by the source / receiver meshes they sit above), the debug marker, and the fallback plane (would skew the box for a tiny site with a 2 km fallback). Passes the union box to the existing Phase 2 `frameCameraToTerrain()` which computes a 45°-from-NE camera position at 1.5× the bbox diagonal and calls `controls.update()`.

Empty-box fallback: if no geometry has accumulated (terrain still loading, no buildings/barriers/etc.), falls back to framing the terrain mesh alone, or — if even that isn't present — a synthetic 2 km box centred on the origin.

#### Modal-scoped keyboard shortcuts

Attached to `document` in capture phase inside `show3DModal()`, removed in `close3DModal()`. Handler gate:

- Ignores when `_3dModalEl` is null (safety).
- Ignores modifier combos (`ctrlKey` / `metaKey` / `altKey`).
- Ignores `INPUT` / `TEXTAREA` / `SELECT` / contenteditable targets.

When a handled key fires: `preventDefault` + `stopPropagation` + `stopImmediatePropagation`, so the global 2D keyboard handler at the end of `index.html` does NOT also fire. Verified live: while the modal is open, `R` resets the 3D camera and does NOT toggle the 2D ruler; after the modal closes the 3D handler is removed and `R` correctly activates the 2D ruler again.

The cleanup pattern also nulls `_3dToolbarControls` (the ref bundle `{ exagSlider, applyExag, wire, labels, grid, axes }`) and `_3dToolbarKeyHandler` on close.

### Future phases (not yet shipped)

- **Phase 7**: optional propagation-path visualisation (source → receiver lines)

## CONCAWE Propagation (Report 4/81)

Third propagation method (alongside Simple and ISO 9613-2). Engine functions
live in `shared-calc.js` inside the `SharedCalc` IIFE; re-exported from `calc.js`.

### Data structures

| Name | Type | Location |
|------|------|----------|
| `CONCAWE_K3_COEFFS` | `{ 63: [a0,a1,a2,a3], … 4000: [...] }` | `shared-calc.js` — polynomial coefficients per octave band |
| `CONCAWE_GAMMA_TABLE` | `[[ψ, γ], …]` (9 entries) | `shared-calc.js` — Figure 9 grazing-angle lookup |

### Functions

| Function | Signature | Purpose |
|----------|-----------|---------|
| `calcConcaweK3(d, freqHz, groundType)` | `(number, number, 'hard'\|'soft') → number` | K3 ground attenuation per band. Hard = −3 dB; soft = polynomial lookup. Distance clamped 100–2000 m. 8 kHz maps to 4 kHz. |
| `lookupGamma(psiDeg)` | `(number) → number` | Linear interpolation of γ from the Figure 9 table. Clamped at table bounds. |
| `calcConcaweK5(K3, K4, hs, hr, d)` | `(number, number, number, number, number) → number` | K5 source height correction. Returns 0 when hs ≤ 2 m or (K3+K4) ≤ −3. |

| `CONCAWE_K4_TABLE` | `{ 1: {63:8, …}, … 6: {63:-2, …} }` | `shared-calc.js` — K4 Simplification 2 values per met category per band |

### Functions (K4 meteorological)

| Function | Signature | Purpose |
|----------|-----------|---------|
| `calcConcaweK4(freqHz, metCategory)` | `(number, number) → number` | K4 met correction. Category 1–6, clamped. 8 kHz maps to 4 kHz. Positive = upwind atten, negative = downwind enhancement. |
| `getPasquillClass(windSpeed, timeOfDay, solarRadiation, cloudCover)` | `(number, string, string, string) → string` | Pasquill stability class A–G (including A-B, B-C, C-D intermediates). |
| `pasquillToGroup(pasquill)` | `(string) → string` | Maps Pasquill class to group: 'AB', 'CDE', or 'FG'. |
| `getConcaweMetCategory(pasquillGroup, vectorWind)` | `(string, number) → number` | CONCAWE met category 1–6 from Pasquill group + vector wind (positive=downwind). |
| `calcConcaweK4FromMet(freqHz, windSpeed, windDirection, sourceBearing, timeOfDay, solarRadiation, cloudCover)` | `(number, number, number, number, string, string, string) → {K4, metCategory, pasquillClass, vectorWind}` | Full-chain: raw met inputs → K4 + all intermediates. |

### Functions (prediction chain)

| Function | Signature | Purpose |
|----------|-----------|---------|
| `calcConcaweAtPoint(spectrum, srcHeight, distM, adjDB, barrierDelta, recvHeight, concaweParams, endDeltaLeft, endDeltaRight, barrierInfo, terrainILPerBand)` | same shape as `calcISOatPoint` | Complete CONCAWE prediction. `concaweParams = {temperature, humidity, groundFactor, metCategory}`. Returns overall A-weighted Lp. |
| `calcConcaweAtPointDetailed(...)` | same args | Returns `{total, distance, srcHeight, recvHeight, K1, metCategory, groundType, bands: [{freq, Lw, K1, K2, K3, K4, K5, K6, Aterr, Lp}]}`. |

### Method routing

Global `propagationMethod` can be `'simple'`, `'iso9613'`, or `'concawe'`.

- **Main thread**: `calcPredAtReceiver()` routes both `iso9613` and `concawe` through `calcTotalISO9613()` → `calcISO9613forSourcePin()` → `calcISO9613single()` which branches to `calcConcaweAtPoint` for CONCAWE.
- **Worker**: `noise-worker.js` checks `method === 'concawe'` before the ISO branches, calls `calcConcaweAtPoint` directly.
- **LAmax**: continues using existing ISO/simple path.

### CONCAWE state fields (index.html)

| Variable | Default | Purpose |
|----------|---------|---------|
| `_concaweMetCategory` | 4 | Met category 1–6 (4=neutral) |
| `_concaweMetMode` | `'direct'` | `'direct'` or `'computed'` |
| `_concaweWindSpeed` | null | Prompt 4 UI |
| `_concaweWindDirection` | null | Prompt 4 UI |
| `_concaweTimeOfDay` | null | Prompt 4 UI |
| `_concaweSolarRadiation` | null | Prompt 4 UI |
| `_concaweCloudCover` | null | Prompt 4 UI |

All serialised under `data.propagation.*` in save/load JSON.

### ISO 9613-2 propagation state fields (index.html)

| Variable | Default | Purpose |
|----------|---------|---------|
| `iso_groundFactor` | `0.5` | Scalar ground factor G (0 = hard, 1 = soft/porous). Used when per-region mode is off. |
| `_groundFactorPerRegion` | `{ enabled: false, Gs: 0.5, Gm: 0.5, Gr: 0.5 }` | Per-region ground factor state. When `enabled`, `_effectiveGroundFactor()` returns `{Gs,Gm,Gr}` instead of the scalar `iso_groundFactor`. Persisted in `localStorage('iso_perRegion')`. |

`_effectiveGroundFactor()` — returns `{Gs, Gm, Gr}` when per-region mode is active, else `iso_groundFactor`. Called at all ISO engine entry points, both noise map `postMessage` calls, and in `_gzComputePathG()`.

**Save format `_version: 3`** — The save JSON includes:
```js
data.propagation.groundFactorPerRegion = { enabled: bool, Gs: number, Gm: number, Gr: number }
```
`_version` was bumped from 2 → 3. Files without this key (v2) synthesise `{ enabled: false, Gs: G, Gm: G, Gr: G }` on load, where `G` is the loaded scalar ground factor (backward compatible).

**`migrateV2ToV3(saved, fromVersion)`** — Migration function added in Prompt B (April 2026). Defined in `index.html` just before `loadAssessment`. Called by a version ladder at the top of `loadAssessment`:
```js
var savedVersion = data._version || 1;
if (savedVersion < 3) {
  migrateV2ToV3(data, savedVersion);
  data._version = 3;
}
```
Migration actions:
- **Point sources (`sourcePins[]`)**: Heuristic distinguishes custom-UI spectra (stored as dB(A) in v2) from library spectra (stored as dB(Z)). Heuristic: `energyDiff = lw − energySum(spectrum)`. If `energyDiff ≥ −1 dB` → custom dB(A), subtract `A_WEIGHTS_BANDS[i]` from each band (converting to dB(Z)). If `energyDiff` between −1 and −8 dB → grey zone, log warning and skip. If `energyDiff ≤ −8 dB` → library dB(Z), no change. Also handles `spectrum_max` using `lw_max` as the reference.
- **Line sources**: `spectrum_m_base` was already the correct field name in v2 saves (values dB(Z) from library). No value change. Count logged only.
- **Area sources**: `as.spectrum[period]` values were dB(Z) from library. No change. Count logged only.
- **Building sources**: No spectrum stored in save file (computed from `interiorLp + construction Rw`). No-op.
- Logs `console.info('[migrateV2ToV3] vN→3. Converted: { point, line, area, building }')`.
- Tests: `migrate-v2-v3.test.js` (25 tests; covers custom, library, line, area, building, mixed, round-trip, edge cases).

### Meteorological input panel (`#concaweMetPanel`)

Visible only when `propagationMethod === 'concawe'`. Two modes controlled by radio buttons:

- **Mode A (direct)**: `<select id="concaweMetCatSelect">` with options 1–6. Directly sets `_concaweMetCategory`.
- **Mode B (computed)**: wind speed, wind direction, time of day, solar radiation (day only), cloud cover (night only). Computes Pasquill class → group → met category via SharedCalc functions. Live display strip shows intermediates.

`_updateConcaweMet(skipRender)` — recomputes `_concaweMetCategory` from current UI state and source/receiver positions. Called on:
- Any met input change
- Mode toggle
- At the top of `calcTotalISO9613()` when CONCAWE computed mode is active (covers drag-move of source/receiver)

`_concaweBearing(lat1, lng1, lat2, lng2)` — geodetic bearing in degrees 0–360. Used to compute source bearing from first receiver to first source for vector wind calculation.

### Console test harnesses

`window.testConcaweK3K5()` — prints K3 soft/hard tables, expected-value
spot checks, K5 with elevated source, and gamma interpolation checks.

`window.testConcaweK4()` — prints K4 direct lookup table for all 6
categories, Pasquill class tests, met category tests, and full-chain
vector wind test.

## Terrain Diffraction — `SharedCalc` (shared-calc.js)

Three functions moved from `noise-worker.js` into `shared-calc.js` in April 2026 so both the grid worker and the single-point receiver path use a single implementation:

| Function | Signature | Purpose |
|----------|-----------|---------|
| `findTerrainEdges(srcLL, srcTip, recLL, recTip, totalDist, elevFn)` | → `edge[]` | Samples `N = clamp(round(dist/5), 20, 100)` profile points, returns all local-maximum protrusions above the source→receiver LOS. |
| `deygoutSelectEdges(edges, srcTip, recTip, totalDist)` | → `edge[]` | Deygout principal-edge selection: up to 3 edges ordered source→receiver. |
| `terrainILPerBand(srcLL, srcH, recLL, recH, elevFn)` | → `number[8]` | Full Deygout chain. Returns per-octave-band IL (63 Hz–8 kHz, dB), capped at 25 dB/band. Returns all-zero array if `elevFn` is null or elevations unavailable. |

`elevFn(lat, lng) → number|null` — caller-supplied synchronous elevation lookup:
- **Worker**: the bilinear `lookupElev` closure over the worker's flat `demCache` array.
- **index.html**: nearest-neighbour over the pre-fetched profile from `getTerrainProfile()`.

`noise-worker.js` wraps `SharedCalc.terrainILPerBand` in a thin local `terrainILPerBand` that guards on `demCache` and passes `lookupElev`. The worker call sites are unchanged.

`updateTerrainIL()` in `index.html` fetches the terrain profile async (via `DEMCache.getElevations`), constructs the synchronous `elevFn`, then calls `SharedCalc.terrainILPerBand` synchronously. Profile sampling uses the same `N = clamp(round(dist/5), 20, 100)` formula.

`detectDominantRidge()` and `calcTerrainDiffraction()` — **deleted April 2026**. Both were single-ridge only; the Deygout path supersedes them.

**Note — worker-side Gaussian smoothing:** The worker post-processes the per-cell terrain IL grid with a separable Gaussian smoothing pass (noise-worker.js:~329–426, σ = 0.5 cell, radius 2 cells) before integrating terrain bands into `calcISOatPoint`. σ was reduced from 1.0 to 0.5 in April 2026 after empirical validation confirmed bilinear DEM interpolation handles the original spike-suppression role (see `references/smoothing-source-investigation-2026-04.md`). The single-point receiver path (`updateTerrainIL` / `calcISO9613forSourcePin`) does **not** smooth — it returns the exact unsmoothed Deygout IL at the receiver's lat/lng. As a result, the heatmap colour and the receiver panel can disagree at the same lat/lng in narrow terrain shadow zones by ~3–6 dB — the receiver panel value is authoritative. The always-visible receiver Lp badge (Option C) on each placed receiver marker shows the unsmoothed receiver-panel value on the map. See `references/heatmap-receiver-divergence-2026-04.md` for the root-cause analysis.

## Terrain Contour Helpers (`index.html`)

Functions defined at top-level script scope, adjacent to `generateTerrainContours()`.

| Function | Signature | Purpose |
|----------|-----------|---------|
| `gaussianSmoothGrid(grid, width, height, sigma)` | `(Float32Array, number, number, number) → Float32Array` | Separable 1D Gaussian smooth over a flat elevation grid. Returns a new array; input is not mutated. Uses normalised convolution so NaN (no-coverage) cells don't propagate. Called on `ctGridLidar` and `ctGridSrtm` before marching squares in `generateTerrainContours`. Controlled by `TERRAIN_CONTOUR_SMOOTH_SIGMA` (default 1.5 grid cells). |
| `generateTerrainContours()` | `() → void` | Builds merged LiDAR + SRTM elevation grids from `DEMCache`, applies Gaussian pre-smooth, runs marching squares, applies Chaikin smoothing, and adds polylines to `_terrainContourLayer`. |

## Cache Invalidation Convention

Any change to `shared-calc.js`, `noise-worker.js`, or `cortn-worker.js` requires a `?v=N` version parameter bump on all consumer load sites:

| Consumer | Load site | How to bump |
|----------|-----------|-------------|
| Browser main thread | `<script src="shared-calc.js?v=N">` in `index.html` | Increment N in the script tag |
| noise-worker.js | `importScripts('shared-calc.js?v=N')` at top of file | Increment N in the importScripts call |
| cortn-worker.js | `importScripts('shared-calc.js?v=N')` at top of file | Increment N in the importScripts call |
| Other workers | Any future worker loading shared-calc.js | Must include ?v=N |

The `cache-bust-convention.test.js` test suite enforces this for all `importScripts` calls in worker files (fails if any local shared-calc.js call is missing `?v=N`) and for all local `<script src>` tags in `index.html`. Script tags in `index.html` must be updated manually whenever the loaded file changes.

**Why this matters:** Without coordinated cache busting, the browser may serve the old cached engine to a worker while the main thread loads the updated one — producing a receiver-vs-heatmap mismatch (observed as 7–12 dB divergence during the Option B rollout before `?v=3` was added).
