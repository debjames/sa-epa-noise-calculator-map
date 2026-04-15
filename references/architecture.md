# Architecture

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

The Methodology panel is a `<div class="card" id="methodologyCard">` containing ~24 sections of acoustic methodology reference (propagation, barrier diffraction, terrain screening, conformity, data sources, etc.). It's default-collapsed by `initCollapse()` (which adds a `.card-body.collapsed` wrapper on init based on the `DEFAULT_COLLAPSED` heading list).

Two access paths:

1. **Header button** `#headerMethodologyBtn` — on click:
   - Opens the drawer via `window._setDrawerOpen(true)` if closed
   - Waits 350 ms for the drawer slide-in
   - Removes the `collapsed` class from the card body and flips the `.collapse-btn` glyph to ▲ (so the card expands)
   - Calls `window._scrollDrawerTo('group-methodology')` to smooth-scroll the drawer to the card

2. **Jump nav 6th button** "Methodology" — just calls `window._scrollDrawerTo('group-methodology')` via the standard scroll-to-anchor handler. Does NOT auto-expand — the jump nav is for navigation, not content expansion. The scroll spy highlights this button when the drawer scrolls to the methodology section.

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
if (methCardEl) drawerContent.appendChild(methCardEl);
```

GIS Export lands in the Export group (after pdfBtn / recommendationsCard). Methodology is appended LAST so it sits as the final drawer panel, anchored by `#group-methodology` for the 6th jump-nav button and the header Methodology button.

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
10. `#mp-toggle-drawer` (`#drawerPanelBtn`) — Expand/Panels drawer toggle. Wraps the old `#mapMaximiseBtn` SVG icon + `#mapMaximiseBtnLabel` span in a `.mp > .mp-hdr` shell. Click handler calls `window.toggleMapFullscreen()` which in turn calls `window._setDrawerOpen(!isOpen)`. `setDrawerOpen()` writes the label text (`Expand` when drawer open, `Panels` when closed).

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

### Expand/Panels button in toolbar

The Phase 4 `#drawerPanelBtn` / `#mp-toggle-drawer` wrapper remains in the toolbar as the LAST item (after Save JPG). It reuses the SVG icon and label span that originally belonged to the hidden `#mapCard`'s `#mapMaximiseBtn`. Click handler calls `window.toggleMapFullscreen()` which delegates to `window._setDrawerOpen(!isOpen)`. `setDrawerOpen()` syncs the label: "Expand" when the drawer is open (click to close), "Panels" when closed (click to re-open). Both this button and the drawer's own edge triangle (`#drawer-toggle`) work — they're kept as parallel discovery surfaces.

## UI Layout — Phase 4: Expand button cleanup + Esc priority + responsive fallback

### Expand button repurposed

- `#mapMaximiseBtn` (the old "Expand" button) was originally in `#mapCard`'s card header, which is hidden in Phase 1. During the Phase 1 IIFE it is now physically moved into `#mapPanelContainer` (the top-right map toolbar) and wrapped in a new `.mp#mp-toggle-drawer > .mp-hdr#drawerPanelBtn` structure so it visually matches Save JPG, Mapping, Tools, and Modelling.
- Inline `onclick="toggleMapFullscreen()"` is removed; a click listener is attached to the new `.mp-hdr` wrapper calling `window.toggleMapFullscreen()`.
- `window.toggleMapFullscreen()` is rewritten: it now calls `window._setDrawerOpen(!drawer.classList.contains('drawer-open'))`. The old `_enter()` / `_exit()` helpers and the `.map-fullscreen` CSS remain in the file as dead code (no call sites) to minimise risk — they can be removed in a later cleanup pass.
- Button label syncs with drawer state inside `setDrawerOpen()`: `#mapMaximiseBtnLabel` shows `Expand` when the drawer is open and `Panels` when it's closed.
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
| `resonate_drawer_open` | `"true"` / `"false"` | Persists drawer open/closed state (default: open) |
| `resonate_disclaimer_accepted` | `"true"` | Hides disclaimer banner on subsequent visits |

### Keyboard shortcut

- `]` — Toggles drawer open/closed (ignored when focus is in input/select/textarea)

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
