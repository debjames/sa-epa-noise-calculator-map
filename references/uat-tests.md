# UAT Tests

## Google Sheets Source Library

Prerequisite: Page loaded with network access so `SourceLibrary.status` becomes `'live'`.

### Library load

- [ ] **SourceLibrary loads** — Open browser console; confirm `[SourceLibrary] Loaded N entries from Sheet.` log (first load) or `Revalidated N entries` (stale cache refresh). No errors.
- [ ] **Status is live** — `window.SourceLibrary.status === 'live'` in console.
- [ ] **No Supabase** — `window.ResonateLib` is `undefined`. No 404s for `library-loader.js`, `supabase-config.js`, or `supabase-admin.js` in Network tab.

### Point source dropdown

- [ ] **Library populated** — Place a point source, open its panel. The "Library" dropdown contains optgroups (e.g. "Mechanical units", "Trucks", etc.) with entries from the Sheet.
- [ ] **Selecting entry pre-fills** — Choose a library entry → the Lw field and octave-band spectrum update. Height updates to 1.5 m.
- [ ] **No hardcoded fallback entries** — Entries match exactly what's in the Google Sheet (not the old hardcoded list).

### Line source dropdown

- [ ] **Library populated** — Place a line source, open its panel. The library select contains optgroups from the Sheet (`Lw/m, dB(Z)/m` entries, e.g. "Trucks" category).
- [ ] **Selecting entry pre-fills** — Choose an entry → `lw_m_base` and `spectrum_m_base` update for all periods; height updates.
- [ ] **No duplicate optgroups** — Entries appear once (not duplicated as "X" and "X (Library)").

### Area source dropdown

- [ ] **Library populated** — Place an area source, open its panel. The library select shows optgroups with Sheet entries.
- [ ] **Selecting entry pre-fills** — Choose an entry → Lw/m² field, spectrum bands, and height update for all periods.

### Building source — Interior Lp

- [ ] **Library populated** — Open a building source panel, type in the Interior Lp search box. Entries from the Sheet appear (`Lp, dB(Z)` type).
- [ ] **Selecting entry pre-fills** — Choose an entry → octave-band Lp inputs update.
- [ ] **No duplicate entries** — Each entry appears once (old hardcoded + SourceLibrary duplicates eliminated).

### Save / load round-trip with library entry

- [ ] **Save with library entry** — Assign a library entry to a line or area source. Save Assessment JSON.
- [ ] **Load restores entry** — Load the saved JSON. The library entry is resolved from `LINE_SOURCE_LIBRARY_GROUPED` / `AREA_SOURCE_LIBRARY_GROUPED` (Sheet-backed), not from the old flat arrays.

### Submit new source

- [ ] **Submit link present** — Building source panel shows "Submit to library…" link.
- [ ] **Modal opens** — Click it → modal appears with name, data type, category, octave-band inputs, dB(A) preview, source citation fields.
- [ ] **dB(A) auto-calculates** — Enter octave-band values → dB(A) preview updates in real time.

## PDF Appendix Export

Prerequisite: SA assessment with source placed, 2+ receivers placed and zones detected. Project number set to "A123456".

### Basic export

- [ ] **Save PDF button visible** — The "Save PDF" button appears in the header export row alongside Save Assessment / Load Assessment / Share Assessment.
- [ ] **PDF downloads** — Click "Save PDF" → a PDF file downloads. No console errors during generation.
- [ ] **Filename with project number** — With projectNumber "A123456", filename is `A123456_Appendix_Criteria.pdf`.
- [ ] **Filename without project number** — Clear projectNumber, click "Save PDF" → filename is `Appendix_Criteria.pdf`.

### Map capture

- [ ] **Zone-only image** — Open the downloaded PDF. The site image shows ONLY: base map tiles, zone polygons/labels, and site boundary. NO sources, receivers, barriers, buildings, contours, noise map, or other objects visible in the image.
- [ ] **Layers restored** — After PDF generation, return to the tool. All objects (sources, receivers, barriers etc.) are visible again on the map. Toggle states match pre-export state.

### Planning & Design Code table

- [ ] **Table present** — PDF contains a "Planning & Design Code" section with a table.
- [ ] **Columns correct** — Table has columns: Location, Zone, Subzone, Land Use Category.
- [ ] **Rows correct** — Source row present, plus one row per placed receiver. Values match the Receivers & criteria panel in the drawer.

### Noise Criteria table

- [ ] **Table present** — PDF contains a "Noise Criteria" section with a table.
- [ ] **Day/Night values match** — Day LAeq and Night LAeq values match the Receivers & criteria panel.
- [ ] **Clause column (SA)** — For SA assessments, the Clause column shows "Clause 5(4)", "Clause 5(5)", or "Clause 5(6)" matching the SA derivation table.

### Conditional sections

- [ ] **Emergency criteria — present** — Tick "Emergency equipment" checkbox + "Fire & smoke control" → regenerate PDF → "Emergency Equipment Criteria" section appears with fire pump criteria values.
- [ ] **Emergency criteria — absent** — Untick "Emergency equipment" → regenerate PDF → no emergency section in PDF.
- [ ] **Music criteria — present** — Tick "Music" checkbox, enter background noise values → regenerate PDF → "Music Noise Criteria" octave band table appears with LA90 and LA10 criteria values.
- [ ] **Music criteria — absent** — Untick "Music" → regenerate PDF → no music section in PDF.
- [ ] **Childcare criteria — present** — Tick "Childcare / students" → regenerate PDF → "Childcare / Student Criteria" section appears showing 50 dB(A).
- [ ] **Childcare criteria — absent** — Untick "Childcare" → regenerate PDF → no childcare section in PDF.

### Page layout

- [ ] **A4 portrait** — PDF page is A4 portrait (210 × 297 mm).
- [ ] **Margins** — Content area has approximately 22 mm margins on all sides.
- [ ] **Page overflow** — With all three special categories active (emergency + music + childcare): content flows onto page 2 if needed.
- [ ] **Page numbers** — Each page shows "1 / N" style page numbering centred at bottom.

### Criteria tables (force-render regression guard)

- [ ] **Fresh load — PDC present** — SA state, Adelaide CBD, do NOT click the Criteria nav button. Export appendix → PDC section present with populated table rows.
- [ ] **Fresh load — criteria present** — Same fresh-load scenario → Receivers & Criteria section present with populated table.
- [ ] **PDC SA only** — SA state, export → PDC section present. Switch to VIC, export → no PDC section. Switch to NSW, export → no PDC section.
- [ ] **Emergency table — force-rendered** — Enable emergency + fire, do NOT open the emergency panel. Export → emergency table present with populated fire pump criteria.
- [ ] **Panels unchanged after export** — Note which panels are open/collapsed before export. After PDF downloads, all panels remain in the same open/closed state.

### Zone map content (whitelist isolation)

- [ ] **Street map only — no noise overlay** — Toggle noise map ON, export appendix → Figure 1 shows street map + boundary + zones only. No noise colour gradient visible.
- [ ] **Street map only — no contours** — Toggle noise contour lines ON, export → no contour lines in Figure 1.
- [ ] **Street map only — no terrain** — Toggle terrain contours ON, export → no terrain in Figure 1.
- [ ] **Street map only — no buildings** — Toggle OSM buildings ON, export → no building footprints in Figure 1.
- [ ] **Street map only — no pins** — Add sources, receivers, barriers, export → no markers/pins in Figure 1.
- [ ] **Forced street basemap** — Switch basemap to Aerial, export → Figure 1 shows STREET MAP tiles (CartoDB light), not satellite imagery.
- [ ] **Basemap restored after export** — After aerial export, map returns to aerial view. After street export, map stays on street.
- [ ] **Layers restored** — After export with noise map + contours + pins all on, all are back on the map immediately after the PDF downloads.
- [ ] **Zone legend in capture** — Zone legend (bottom-left) and scale bar remain visible in Figure 1 image.
- [ ] **SA zones in appendix** — SA state selected, zones toggled on → SA zone polygons appear in Figure 1.
- [ ] **VIC zones in appendix** — VIC state selected, zones toggled on → VIC zone polygons appear in Figure 1.
- [ ] **NSW zones in appendix** — NSW state selected, zones toggled on → NSW zone polygons appear in Figure 1.
- [ ] **Zones off → no zones** — Zones toggled off → Figure 1 shows street map + boundary only, no zone polygons.
- [ ] **Parcel boundary in capture** — Source placed (triggers parcel boundary API fetch) → black/white dashed boundary polygon appears in Figure 1.
- [ ] **No parcel boundary before source placed** — No source placed → no boundary polygon in Figure 1. Export still succeeds.

### Diagnostic logging (regression guard for PNG corruption fix)

- [ ] **Console entries present** — On successful export, browser console shows `[pdf-appendix] receivers & criteria { format: "JPEG", dataUrlLength: ..., dataUrlPrefix: "data:image/jpeg;base64,...", aspect: ... }` and similarly for any other included sections. Length must be > 100. Note: prefix is now `data:image/jpeg` (not `data:image/png`).
- [ ] **Named error on failure** — If export fails, alert reads `"PDF appendix export failed at [section name]: ..."` not a generic message. Trigger by temporarily breaking a capture (e.g. hiding the critBody element before export).
- [ ] **Zero-size element skipped** — If a table element has zero width/height at capture time (e.g. collapsed section), that section returns `null` from `captureElement()` and is silently skipped in the PDF — no error thrown.

### JPEG table capture (regression guard for large-PNG jsPDF failure)

- [ ] **Tall criteria table — no PNG error** — NSW state, 4 receivers placed, all zones detected (maximises row count). Export appendix → no "Incomplete or corrupt PNG file" alert. PDF downloads and opens. Criteria table visible.
- [ ] **All sections JPEG** — Open browser devtools console before export. Export appendix with PDC + criteria + emergency + music + childcare all active. Every `[pdf-appendix]` log entry shows `format: "JPEG"` and `dataUrlPrefix: "data:image/jpeg;base64,"`. No `"data:image/png"` prefix in any entry.
- [ ] **Text readability** — Open the exported PDF at 100% zoom. Table text (column headers, receiver names, dB values) is sharp and legible — JPEG compression at quality 0.95 must not produce visible blocking artefacts on text.
- [ ] **Error labels the section** — If any table capture fails, the alert message includes the section name (e.g. `"PDF appendix export failed at [receivers & criteria]: ..."`) — confirmed because `placeImage()` now sets `_pdfLabel` as its first action before `addImage` can throw.
- [ ] **Zone map still JPEG** — Figure 1 (zone map) still captured as JPEG directly (not via `captureElement()`). Confirm by checking `[pdf-appendix] zone map` log entry shows `format: "JPEG"` or equivalent prefix.

### 3D area source terrain draping

- [ ] **Sloped terrain — no clipping** — Terrain enabled, place an area source on a hill slope. Open 3D Scene Viewer. Area source polygon conforms to the hill surface — no orange polygon cutting into the terrain, no floating above it.
- [ ] **Valley drape** — Place an area source across a valley. In 3D view the polygon follows the dip without floating over the low point.
- [ ] **Flat terrain** — Area source on flat ground → polygon is flat (terrain disabled OR all terrain at same elevation). No regression.
- [ ] **Terrain disabled — flat behaviour** — Toggle terrain OFF, open 3D Scene Viewer. Area sources render as flat polygons at Y=0 plane. No clipping, no console errors.
- [ ] **Terrain toggle off → on → off** — Toggle terrain off and on twice. 3D scene rebuilds correctly each time; area source polygon updates to drape and flatten as expected.
- [ ] **Large area source — no interior clipping** — Place an area source >30 m across on terrain with an internal bump (e.g. a hillock inside the polygon boundary). Open 3D Scene Viewer and orbit underneath. No terrain pokes through the orange polygon from any angle — interior terrain grid cells are used directly, not large interpolated triangles.
- [ ] **Small area source (<10 m)** — Renders correctly. No performance regression or degenerate triangles.
- [ ] **Concave polygon (L-shape)** — No spurious triangles cross the concave notch; PiP check correctly excludes cells in the concave gap.
- [ ] **Label above draped surface** — Label floats above the highest point of the polygon on sloped terrain (not sunk into the hillside). Orbit camera to confirm from all sides.
- [ ] **Polygon outside terrain coverage** — Area source placed at the edge of the terrain grid (or terrain tiles not loaded) → falls back to densified-boundary triangulation, no crash, no console error.
- [ ] **Acoustic output unchanged** — Check dB(A) prediction values before and after opening the 3D viewer. Numbers are identical — 3D rendering does not touch the propagation engine.
- [ ] **2D map unchanged** — Area source polygon displays correctly on the 2D Leaflet map after opening and closing the 3D modal.

### Non-regression

- [ ] **Generate Report unchanged** — Existing Generate Report (.docx) button still works correctly.
- [ ] **Save JPG unchanged** — Existing Save JPG button still works correctly.
- [ ] **Existing criteria PDF unchanged** — The ⇩ button in the Receivers & criteria card header still generates the existing criteria derivation PDF.

## Methodology modal — focus management and a11y

Prerequisite: tool loaded, LHS side panel expanded so `#side-panel-methodology-btn` is visible.

### Normal open / close — focus returns to opener

- [ ] **Tab to opener** — Tab through the side panel until `#side-panel-methodology-btn` has focus (outline visible). Press Enter or Space to activate. The Methodology modal opens and focus lands on the close (×) button inside the modal (verify with `document.activeElement` in devtools — should be the `.close methodology` button).
- [ ] **Esc closes and restores focus** — Press `Escape`. Modal closes and `document.activeElement.id` is `side-panel-methodology-btn` (the original opener). Focus outline is visible on the opener.
- [ ] **× click closes and restores focus** — Re-open, this time click the × button. Modal closes and focus returns to the opener.
- [ ] **Backdrop click closes and restores focus** — Re-open, click the dimmed area outside the white box. Modal closes and focus returns to the opener. Clicking *inside* the white box must NOT close the modal.

### Stale opener fallback — opener removed while modal is open

Simulates a drawer rebuild or side panel re-render hot-swapping the opener node while the modal is open. In devtools, open the modal then run:

```js
var oldBtn = document.getElementById('side-panel-methodology-btn');
var parent = oldBtn.parentNode, next = oldBtn.nextSibling;
oldBtn.remove();
var freshBtn = document.createElement('button');
freshBtn.id = 'side-panel-methodology-btn';
freshBtn.type = 'button';
freshBtn.textContent = 'Methodology';
parent.insertBefore(freshBtn, next);
```

- [ ] **Close after stale opener** — Press Escape (or click ×). Modal closes and `document.activeElement` is the *fresh* `#side-panel-methodology-btn` element (not `document.body`, not the detached old button). Verified by `document.activeElement === freshBtn` in devtools.
- [ ] **Regression — normal path still works** — Reload the page. Re-run the *Normal open / close* cases above. Focus must still restore to the original opener in the normal case (the fallback must only activate when `document.contains(_methPrevFocus)` is false).

### Hotkey suppression while modal is open (M2 regression)

- [ ] **A/P/L/K/B/W hotkeys no-op while modal open** — Open the modal. Press `A`, `P`, `L`, `K`, `B`, `W` (source-placement hotkeys). None should activate their placement mode — no toast pill, no map cursor change, no mode chip on the toolbar. Close the modal. Press `P` — placement mode for point source activates normally.

### Duplicate-id prefix walk (M3 regression)

- [ ] **No duplicate ids while modal open** — Open the modal. In devtools run `document.querySelectorAll('#opTimeNote').length` — must be exactly `1` (the original in the hidden drawer, not the clone). Run `document.querySelectorAll('#meth-modal-opTimeNote').length` — must be exactly `1` (the clone). Close the modal. The `meth-modal-` prefixed node is gone.

### Test suite and ISO validation

- [ ] **Vitest suite** — `npm test` reports **5 files, 233 tests passed**. No duplicate file count, no `.claude/worktrees/` copies.
- [ ] **ISO/TR 17534-3** — T01 G=0 → 44.29 (ref 44.29, ±0.05 dB). T02 G=0.5 → 41.52 (ref 41.53, ±0.05 dB). T03 G=1 → 39.13 (ref 39.14, ±0.05 dB).

---

## Site plan overlay — aspect ratio preservation

Prerequisite: a fresh assessment with no site plan overlays loaded. Use the Tools panel **Site plan overlay** button to import each test image.

### Initial placement respects image proportions

- [ ] **Landscape PDF** — Import an A3 landscape site plan PDF (or any PDF whose first page is wider than tall). The overlay appears with visibly landscape proportions — width noticeably greater than height. It must NOT appear as a near-square box.
- [ ] **Portrait PNG** — Import a portrait PNG (e.g. 1000×1600 px). The overlay appears with visibly portrait proportions — height noticeably greater than width. It must NOT appear stretched to a square.
- [ ] **Square image** — Import a square image (e.g. 1000×1000 px). The overlay appears square.
- [ ] **Centre** — In every case the overlay is centred in the current map view.
- [ ] **No overflow** — The overlay fits within the visible map area (roughly ~50% of the shorter view dimension).
- [ ] **Latitude compensation** — Test on a map view near the equator (e.g. Darwin, ~12°S) and again near Adelaide (~35°S). The on-screen proportions should still match the image's native aspect ratio in both cases (i.e. the `cos(lat)` correction is doing its job).

### Corner-drag aspect-ratio lock (default) and Shift unlock

- [ ] **Drag corner WITHOUT Shift** — After importing any image, grab a corner handle and drag. The overlay resizes but the image does NOT distort — aspect ratio stays locked at the image's natural ratio.
- [ ] **Drag corner WITH Shift held** — Hold Shift before dragging a corner handle. Free (unconstrained) resize is allowed — aspect ratio can change.
- [ ] **Release and re-drag** — After a Shift-release, the overlay keeps whatever aspect ratio Shift-drag left it at; a subsequent non-Shift drag locks to that current ratio (because `_imgW`/`_imgH` still reflect the image's natural dims, the non-Shift drag actually snaps back to natural aspect — document this as expected behaviour if observed).

### Save / load round-trip

- [ ] **Save with overlay** — Place a site plan, corner-drag it to some non-default proportions, optionally rotate it, lock it, then **Save Assessment**.
- [ ] **Load it back** — In a fresh session / refresh, **Load Assessment**. The overlay must appear at EXACTLY the saved bounds — no aspect-ratio recalculation, no resize snap, no drift. Verify by zooming to it and comparing with the saved state (or by comparing coordinates in the saved JSON vs runtime `ovr.bounds`).

### Adjacent functionality (no regressions)

- [ ] **Move via centre handle** — Centre-drag still moves the overlay without resizing.
- [ ] **Rotate via rotation handle** — Rotation still works; corner handles follow the rotated visual corners.
- [ ] **Lock / unlock** — Toggling locked state still hides/shows the handles as before.
- [ ] **Compress-dialog path (>5 MB image)** — Import an oversized image that triggers the compression dialog. After compression proceeds, the resulting overlay still has correct aspect ratio on placement.
- [ ] **Multiple overlays** — Import two different-aspect images one after the other. Each gets its own correct proportions independently.
- [ ] **No console errors** — DevTools console is clean through all the above.

## −6. CoRTN Road Traffic — Phase 5 (noise map grid worker)

Prerequisite: have at least one CoRTN road drawn with a valid AADT (e.g. AADT 20000, 60 km/h, 5% CV, DGA surface, one-way). Open the Modelling panel on the side panel so the **CoRTN road noise map** button is visible beneath the existing Noise map controls.

### UI placement and defaults

- [ ] **Button visible** — "CoRTN road noise map" button with road-trend icon, immediately below `#noiseMapGridWarning`.
- [ ] **Click once** — the dropdown shows Day/Night pills (Day active), LAeq/LA10 pills (LAeq active), Height 1.5 m, Grid Auto, Range 35–75 dB, Interval 5 dB. The Noise map button's own controls remain unaffected.
- [ ] **Grid selector** has exactly Auto / 5 m / 10 m / 20 m / 50 m / 100 m — **no 1 m / 2 m** options.

### Day LAeq grid — smoke test

- [ ] Click the CoRTN button → button label cycles through "Computing… N%" then returns to the default icon + label.
- [ ] A coloured contour overlay appears around the road with contour lines at 35, 40, 45, …, 75 dB.
- [ ] A **CoRTN Day LAeq dB(A)** legend appears bottom-right. (The ISO noise map legend, if active, appears as a separate control — both coexist.)
- [ ] No console errors.

### LAeq ↔ LA10 toggle

- [ ] Click **LA10** pill → contours redraw **instantly without the "Computing…" progress** (re-render only). Levels are ~3 dB higher than LAeq. Legend title updates to "CoRTN Day LA10 dB(A)".
- [ ] Click **LAeq** pill → instant re-render back to LAeq levels.

### Day ↔ Night toggle

- [ ] Click **Night** pill → the button shows "Computing…" progress again (this IS a recompute because the traffic volumes / CV percentages / Australian adjustment all change). Night LAeq is typically 3–7 dB below Day LAeq.
- [ ] Legend title reflects the new period.

### Height + Grid + Range/Interval

- [ ] Change **Height** to 4 m → after ~1 s debounce, recompute fires. For low meanPropHeight values the absorption correction changes slightly.
- [ ] Change **Grid** to 5 m → recompute fires, contours become visibly smoother. "Computing… N%" progresses slower.
- [ ] Change **Grid** back to Auto → contours resolve to 5/10/25/50 m based on zoom level.
- [ ] Change **Range** to 45–85 dB → contours re-render (no recompute). Low-level contours disappear; high-level contours become visible close to the road.
- [ ] Change **Interval** to 3 dB → denser contour lines.

### Dual carriageway + 3-source-height

- [ ] Open the CoRTN road panel, switch to dual carriageway → CoRTN map auto-recomputes (via `window._recomputeCortnMap` hooked into `recalcAndRefresh`).
- [ ] Enable 3-source-height → auto-recompute. Levels should shift by < 1 dB for typical traffic mixes.

### Receiver-point vs grid spot check

- [ ] Place an R1 receiver near the road → Predicted Levels panel shows a CoRTN LAeq value for Day.
- [ ] Read off the CoRTN grid value at the same location by hovering a contour line.
- [ ] **Expected discrepancy**: the grid value reads ~1–1.5 dB LOUDER than the receiver-point value at short distances (< 30 m). This is the known Phase 4 / Phase 5 distance-convention divergence — Phase 4 uses `distFromKerb_m = perpDist` (→ `d_horiz = perpDist + 3.5`) while Phase 5 uses `distFromKerb_m = perpDist − 3.5` (→ `d_horiz = perpDist`). At 100 m the discrepancy shrinks to ~0.3 dB.
- [ ] At distances > ~50 m the discrepancy should be < 1 dB.

### Compliance view

- [ ] Click **Compliance** → criterion input appears. Enter 60 dB(A).
- [ ] Contour overlay switches to red/green Δ = Predicted − Criterion, with a thick 0 dB boundary line and fainter ±1/3/5/10 dB contours.
- [ ] CoRTN compliance legend replaces the CoRTN levels legend.
- [ ] Click **Levels** → levels view restored.

### Simultaneous ISO + CoRTN maps

- [ ] Enable the existing **Noise map** (ISO 9613-2) as well as the CoRTN map.
- [ ] Both canvases draw. The layer order can make one appear on top of the other, but neither crashes.
- [ ] Switching the ISO map period does NOT affect the CoRTN map and vice versa.
- [ ] Disable the ISO map → CoRTN map stays visible. Disable the CoRTN map → ISO map stays visible.

### Save / load round-trip

- [ ] With the CoRTN map active, change metric to LA10, height to 4 m, range to 40–80, interval to 3 dB, grid to 10 m.
- [ ] Click Save Assessment → download the JSON.
- [ ] Refresh the page and Load the saved JSON.
- [ ] The CoRTN map button is NOT auto-activated (matches ISO map policy). The dropdown controls **are** pre-populated with period=Day, metric=LA10, height=4, range=40–80, interval=3, grid=Auto (always resets from whatever was saved).
- [ ] Click the CoRTN map button → recomputes with the restored settings.

### Delete road while map is active

- [ ] Delete the CoRTN road via the panel or context menu while the map is displayed.
- [ ] After the 1 s debounce, the CoRTN map recomputes. If no valid roads remain it shows "Add CoRTN roads to generate the grid." and clears the layers.

### Map pan/zoom

- [ ] Pan the map → CoRTN map recomputes (debounced 1 s) for the new bounds.
- [ ] Zoom in 2 steps → Auto grid drops from 50/25 m to 10/5 m; recompute shows the new grid resolution.

### No regressions

- [ ] Existing ISO 9613-2 noise map still computes identically (spot-check a known-good case).
- [ ] Existing CoRTN receiver-point calculations in the Predicted Levels panel are unchanged (spot-check day LAeq at R1 against a pre-Phase-5 saved value within 0.1 dB — they must be byte-for-byte identical).
- [ ] All other source types (point/line/area/building) still render and contribute to the ISO map as before.

## −5. Building source — Interior Lp library dropdown

Prerequisite: open the live tool, ensure the library badge is either green (Supabase) or grey (offline snapshot — both should expose the same 12 building Lp presets).

1. **Library globals exist** — In the console run `JSON.stringify({n: window.BUILDING_LP_LIBRARY.length, cats: Object.keys(window.BUILDING_LP_LIBRARY_GROUPED)})`. Must return 12 entries across 6 categories (Recreation, Hospitality, Industrial, Childcare, Community, Commercial).

2. **Panel renders the combo** — Draw a building source on the map, click it to open `#bsFloatPanel`. The combo `#bs-lib-combo` must be present above the "Interior Noise Levels" heading with placeholder "Search library…", and `#bs-lib-dropdown` must be a sibling div with `display:none` initially.

3. **Focus opens the dropdown** — Focus the combo. The dropdown must show all 6 category headers (uppercase, grey, non-clickable) and all 12 entry rows beneath them, with `display:block`.

4. **Search filter** — Type "gym" into the combo. The dropdown must collapse to only the "Recreation" category header followed by 2 items: "Gymnasium — general sporting activity" and "Gymnasium — amplified music event". Clear the search and the full list must return.

5. **Selection populates all three periods** — Click "Gymnasium — general sporting activity". The combo must update to that name, the dropdown must close, and **all 24 input fields** (`bs_${period}_lp_${b}` for period ∈ day/eve/night and b ∈ 63/125/250/500/1000/2000/4000/8000) must be populated with `{63:72, 125:75, 250:78, 500:80, 1000:82, 2000:79, 4000:74, 8000:68}`. The internal `bs.interiorLp.day.broadband` must equal 85.

6. **Derived Lw recalculates** — After selecting the Gymnasium entry, the `#bsDerivedLw` panel must show per-wall and roof radiated Lw values plus a "Total radiated" row in dB(A). For a 4-sided 100 m × 100 m default-construction (Colorbond Rw 25) box with default 6 m height, expect total ≈ 90–95 dB(A).

7. **Manual override sticks** — After library selection, manually type `99` in `bs_day_lp_1000`. The value must persist (`bs.interiorLp.day.octave[1000] === 99`), the eve and night 1000 Hz bands must remain at the library value (82), and `#bsDerivedLw` must recalculate without any input being reset.

8. **lpLibraryEntry persists** — Confirm `bs.lpLibraryEntry === 'Gymnasium — general sporting activity'` after selection.

9. **Save → load round-trip** — Save the assessment JSON (or directly call `_setBuildingSources([savedJson])` with the in-memory snapshot). Reopen the panel — the combo must be pre-filled with the stored library name, the day 1000 Hz band must show 99 (the manual override), the other periods must show the library value (82), and `bs.lpSource` must be `'octave'`.

10. **Library doesn't lock fields** — After library selection, the manual band inputs must remain editable. Selecting a second library entry must overwrite the bands again (no per-field "locked" state to clear).

11. **Supabase live mode** — With `SUPABASE_CONFIG` set and the migration run, the library badge must show `… / 12B / …` and `window.BUILDING_LP_LIBRARY` must be the Supabase rows. With Supabase offline, the badge must show `0B` (or the configured count) but `BUILDING_LP_LIBRARY` must still contain the 12 hard-coded snapshot entries.

12. **Admin tab CRUD** — Click the library badge → modal opens → 5 tabs visible (Point sources / Line sources / Area sources / **Building Lp** / Constructions). The Building Lp tab must list the 12 presets (or whatever the DB contains), and a `+ New` form must accept name, dropdown group, source citation, and 8 octave-band Lp values. Saving must call `PATCH`/`POST` on `reference_noise_sources` with `source_kind=building` and re-fetch the loader so the in-app dropdown updates without a page reload.

13. **Existing point source library still works** — Place a point source, open its panel, type "fan" in the point source combo. The point source dropdown must still show the matching mechanical units (separate library, untouched).

14. **No console errors** — Across all of the above, no `TypeError`, `ReferenceError`, or warnings about `BUILDING_LP_LIBRARY` being undefined.

## −4. Terrain screening — Deygout 3-edge method

Prerequisite: open the console on the live tool. These tests drive the
worker directly with synthetic DEM scenarios so they are independent of
the chosen map location.

1. **Flat terrain → zero regression** — Run the worker with `terrainEnabled: true` but a DEM of all-zero elevations. The resulting grid's average level must match the same scenario with `terrainEnabled: false` to within 0.01 dB. Verifies the new per-band code path produces no spurious screening on flat ground.

2. **Single ridge → matches legacy behaviour** — Place one 10 m ridge perpendicular to a 300 m source→receiver path. The grid's minimum level with the Deygout method should be within 0.5 dB at 1 kHz of the pre-refactor single-ridge result. In the verified scenario the single ridge produced min 15.9 dB (vs 28.8 dB flat) — a ~13 dB shadow consistent with the old single-ridge Maekawa.

3. **Two ridges → more screening than single ridge** — Add a second 10 m ridge on the same path. The grid's minimum and average levels must both *decrease* relative to the single-ridge case. Verified scenario: min 15.9 → 8.7 dB, avg 28.8 → 22.1 dB.

4. **Three ridges → more screening still, capped at 25 dB** — Add a third ridge. Min and avg must decrease again relative to the two-ridge case, up to the 25 dB per-band cap. Verified scenario: min 8.7 → 6.4 dB, avg 22.1 → 21.7 dB. Further ridges past the Deygout 3-edge limit should produce no additional screening (the algorithm selects at most 3 edges).

5. **Monotonic progression** — Across all four scenarios above (flat, 1, 2, 3 ridges) both the minimum and average grid levels must be monotonically non-increasing in ridge count.

6. **Per-band physical correctness** — Via `SharedCalc.calcISOatPointDetailed(..., terrainILPerBand)`, verify that the `Aterr` field on each band entry reflects the input array. Test inputs `[1,2,3,4,5,6,7,8]` must produce bands with `Aterr = 1, 2, 3, 4, 5, 6, 7, 8`.

7. **No barrier double-counting** — Compute two ISO predictions: barrier only (no terrain), and barrier + a weaker terrain array (e.g. `[1,1,1,1,1,1,1,1]`). If the barrier IL dominates, the two results must be identical to within float epsilon (< 0.01 dB). Verifies `max(Abar, Aterr)` correctly prevents double counting.

8. **Null vs zero-array equivalence** — `calcISOatPoint(..., null)` and `calcISOatPoint(..., [0,0,0,0,0,0,0,0])` must return byte-identical results. This guarantees that cells outside the terrain pre-pass grid (receiving `null`) are treated the same as cells where the pre-pass found no obstruction.

9. **Long-path sampling cap** — For a 2 km source→receiver path, `findTerrainEdges()` must sample exactly 100 points (the upper cap). No performance degradation vs. a 500 m path.

10. **Short-path sampling floor** — For a 40 m path, `findTerrainEdges()` must sample exactly 20 points (the lower floor). Ridge detection must still work on short paths.

11. **Terrain + barrier per band** — Run a scenario with both a building barrier and a terrain ridge. For each band, the effective IL must equal `max(barrier IL, terrain IL)` — never the sum. In the grid cells directly behind the barrier, IL should not exceed the barrier-alone IL.

12. **Save/load round-trip** — Enable terrain, save assessment, clear, load. The noise map must re-render with identical per-cell values after reload.

13. **No console errors** — Across all of the above, no `TypeError`, `RangeError`, or `NaN` cells must appear in the grid output.

14. **ISO/TR 17534-3 barrier validation** — The in-app ISO validator still passes. `calcBarrierAttenuation` was not modified, only called more times, so all existing barrier test cases must continue to pass.

## −4. CoRTN Road Traffic — Phase 4 (receiver integration)

Prerequisites: Phase 2 + 3 already complete. These tests exercise the integration between CoRTN roads, placed receivers, the Predicted Levels panel, and criteria assessment.

1. **Receiver near a CoRTN road** — Draw a CoRTN road. Enter AADT 23 600, Speed 60, CV 5%, one-way carriageway. Place R1 about 20 m perpendicular from the road. Expected: the Predicted Levels panel gains a new "CoRTN Road Traffic — per-receiver breakdown" section at the bottom with an R1 row showing `Dist ≈ 20 m`, `Angle ~80°`, `Day LA10 ~67`, `Day LAeq ~64`, `Night LA10 ~61`, `Night LAeq ~58`. The total Day Leq in the main table above includes the CoRTN contribution.

2. **Move receiver closer** — Drag R1 to ~10 m from the road. Day LAeq in the breakdown rises by ~3 dB; the total Day Leq in the main table rises by the same amount (if CoRTN is the dominant source).

3. **Move receiver farther** — Drag R1 to ~100 m from the road. Day LAeq drops by ~10 dB (expected from `−10·log₁₀(100/20) ≈ 7 dB` plus additional ground / angle-of-view adjustment). Total updates accordingly.

4. **CoRTN + point source energy sum** — Place a point source near R1 with Lw 80 dB. Verify the total Day Leq in the main table is an energy sum of both contributions: e.g. if point-source-only total was 60 and CoRTN-only total was 64, the combined total should read `10·log₁₀(10^6.0 + 10^6.4) ≈ 65.5` → rounds to 66.

5. **CoRTN detail shows LA10 (not just LAeq)** — Day LA10 and Night LA10 columns in the per-receiver breakdown table show non-null values even though LA10 is not used by the main per-receiver total (which uses LAeq). Point / line / area / building sources contribute LAeq only — LA10 is CoRTN-specific.

6. **Delete a CoRTN road** — Right-click the road polyline → Delete. Verify: the per-receiver breakdown section disappears (or, if other roads remain, the deleted road's block disappears). Total Day Leq drops back to whatever it was before the road existed.

7. **Multiple CoRTN roads** — Draw 2 roads (Road A at 20 m with AADT 10 000, Road B at 50 m with AADT 5 000). Place R1. The detail panel shows two table blocks (one per road), each with an R1 row showing its own `Dist`, `Angle`, and LA10/LAeq. The total in the main table energy-sums both contributions.

8. **Multiple receivers + multiple roads** — Add R2 near one of the roads. The detail panel now shows 2 roads × 2 receivers = 4 rows total (2 per road block). Each row shows its own receiver's distance and angle.

9. **Period handling** — Eve and Lmax totals should be unaffected by CoRTN (the loop is gated on day/night only). Switch to a Victoria criteria configuration that shows evening results — CoRTN should not contribute.

10. **Save / Load round-trip** — Save an assessment with CoRTN roads + placed receivers. Load it back. Verify: the CoRTN roads are restored, receivers are restored, and the Predicted Levels detail panel shows identical per-receiver breakdown values (they are re-computed on load, not persisted, but the result is identical because inputs are identical).

11. **Criteria assessment still works** — Place a receiver in an SA residential zone with a CoRTN road contributing ~55 dB LAeq. Verify the SA criteria panel's Δ value for Day Leq takes the CoRTN contribution into account (total − criterion). Criteria logic itself is unchanged — it consumes the same `calcTotalISO9613` return that the new CoRTN loop feeds into.

12. **Existing source types unchanged** — With no CoRTN roads placed, the Predicted Levels panel looks exactly like it did before Phase 4. No detail section visible, no extra rows, no shifted totals.

13. **`cortnBroadbandToSpectrum()` round-trip** — In DevTools console:
    ```js
    const s = cortnBroadbandToSpectrum(75);
    10 * Math.log10(s.reduce((a, v) => a + Math.pow(10, v / 10), 0));
    // → 75.0
    ```

14. **No console errors** — Place receivers, move them, create roads, delete roads, toggle 3-source-height, enable barriers — none should emit warnings or errors in DevTools Console.

## −3. CoRTN Road Traffic — Phase 3 (barrier diffraction)

Prerequisite: Phase 2 validation scenario already entered (AADT 23600, Speed 60, CV 5%, 11 day hours / 9 night hours, DGA surface, one-way, day LA10 = 75.7 dB free-field).

1. **Barrier section visible** — Open the CoRTN panel and scroll to the new "Barrier" section below NSW 3-source-height. It should contain an `Enable barrier` checkbox, three hidden inputs, and a derived-values display. When the checkbox is OFF, the inputs are hidden.

2. **Enable barrier** — Tick `Enable barrier`. Three numeric inputs appear: `Barrier height (m)`, `Barrier base RL (m)`, `Receiver→barrier dist (m)`. Directly below them, a blue-boxed readout shows `Source→barrier`, `Path difference (δ)`, `Zone`, and `Attenuation`.

3. **SoundSurfer scenario** — Set `Barrier height = 1.5`, `Barrier base RL = 0`, `Receiver→barrier = 3`. Verify:
    - `Source→barrier = 4.5 m` (= `distFromKerb_m 4 + 3.5 − distToBarrier_m 3`)
    - `Path difference (δ) = 0.0434 m` (exact to 4 decimal places)
    - `Zone = Shadow`
    - `Attenuation = −8.0 dB`
    - Day LA10 = **67.7** dB, LAeq = **64.7** dB (free-field 75.7/72.7 minus 8.0)
    - Night LA10 = **61.3** dB, LAeq = **58.3** dB (free-field 69.3/66.3 minus 8.0)

4. **Toggle barrier off** — Uncheck `Enable barrier`. Day LA10 returns to 75.7, Night to 69.3.

5. **Minimum barrier height (0 m)** — Re-enable, set height = 0. Zone becomes `Illuminated`, attenuation ≈ −0.3 dB, Day LA10 ≈ 75.4.

6. **Tall barrier cap at −30 dB** — Set barrier height to 20 m (keeping other inputs). Zone stays `Shadow`, attenuation clamps to **−30.0 dB**, Day LA10 = 45.7 dB (75.7 − 30).

7. **Barrier behind source** — Set `Receiver→barrier = 10` (> `distFromKerb_m 4 + 3.5 = 7.5`). A red error line appears in the barrier readout: *"Receiver-to-barrier distance is ≥ source line (barrier behind source)."* Day LA10 reverts to the free-field 75.7 (the barrier is silently dropped, not applied).

8. **Illuminated zone** — Set height = 0.3, base RL = 0, dist-to-barrier = 3 (short barrier that doesn't break line of sight at receiver 1.5 m / source 0.5 m over 7.5 m). Zone = `Illuminated`, atten ≈ −0.7 dB.

9. **Barrier with ground absorption** — Set ground absorption to 0.8 (so free-field has a non-zero `corr_ground`). Enable a shadow-zone barrier. The breakdown should show `corr_ground_final = 0.0` (barrier replaces ground correction with 0) while `corr_ground` (free-field value) remains non-zero. LA10 with barrier = free-field LA10 − old `corr_ground` + 0 + `atten`.

10. **Per-contribution barrier in breakdown** — With the SoundSurfer scenario + barrier enabled, click `Show breakdown`. Each contribution block now includes:
    - `barrier = Shadow  (δ=0.0434, src→barr=4.5m)`
    - `corr_ground_f = 0.0   (free-field corr_ground was 0.0)`
    - `corr_barrier  = −8.0`
    Verify these values appear under "DAY — One-way".

11. **Dual carriageway with barrier** — Switch carriageway to Dual (50/50). Both near and far contributions go through the same barrier geometry (per the simplification documented in calculations.md). Verify LA10 decreases relative to the free-field dual-carriageway result.

12. **3-source-height with barrier** — Enable both 3-source-height AND barrier. Breakdown shows 4 contributions (Cars, CV tyres, CV engines, CV exhausts), each with its own barrier section. All sub-sources use the standard 0.5 m source RL for the barrier geometry (not their own elevated heights, per spec).

13. **Save / Load round-trip** — Set a non-default barrier (e.g. height 2.5, base RL 1.0, dist 2, enabled). Save the assessment. Clear roads via `window._setCortnRoads([])`. Load the assessment back. Verify:
    - Barrier inputs show the same 2.5 / 1.0 / 2
    - Enable checkbox is checked
    - Derived display shows the same δ, zone, attenuation
    - Day LA10 matches the pre-save value exactly

14. **Existing ISO 9613-2 barriers unaffected** — Draw a `userBarriers` barrier via the regular Draw barrier flow. Place a point source nearby. Verify the ISO 9613-2 barrier attenuation applies to the point source as before, independently of any CoRTN barriers. Neither barrier type affects the other.

15. **No console errors** — Draw a CoRTN road, enable barrier, edit every field, toggle on/off, switch carriageway, enable 3-source-height, save, load, delete — no warnings or errors in DevTools Console.

## −2. CoRTN Road Traffic — Phase 2 (calculation engine)

1. **SoundSurfer validation scenario** — Draw a CoRTN road. Set inputs: AADT 23600, Speed 60, Gradient 0, %CV day 5, %CV night 5, Distance from kerb 4, Mean prop height 1, Ground absorption 0, Surface DGA, Angle 180, Carriageway **one-way**, %AADT day 90 / night 10, Day hours 11, Night hours 9, Aust adj day −1.7 / night +0.5, 3-source OFF. Verify results:
   - Day LA10 = **75.7 dB** ± 0.1, LAeq = **72.7 dB** ± 0.1
   - Night LA10 = **69.3 dB** ± 0.1, LAeq = **66.3 dB** ± 0.1
   Reference (from the UK CoRTN spreadsheet): Day 75.8 / 72.8, Night 69.3 / 66.3. The engine matches within 0.1 dB (rounding drift).

2. **Auto-validation via URL flag** — Load the app with `?cortn_validate=1` in the URL. DevTools console prints `[CoRTN validation] PASS — got day: 75.7 / 72.7 night: 69.3 / 66.3 | expected day: 75.8 / 72.8 night: 69.3 / 66.3`. Tolerance is 0.3 dB per reading.

3. **Speed sensitivity** — From the validation scenario, change speed 60 → 100. Day LA10 increases by ~3.7 dB (to ~79.4). Change back to 60 → returns to 75.7.

4. **Gradient sensitivity** — Set gradient 0 → 5. Day LA10 increases (speed correction falls as `V_adj` drops, but `corr_gradient = 0.3 × 5 = +1.5 dB`). Final result rises by roughly +0.8 to +1.2 dB depending on other settings.

5. **Surface correction** — Switch Road surface from `DGA (0 dB)` to `Concrete (+3 dB)`. Both LA10 and LAeq increase by exactly 3.0 dB. Switch to `OGA (−2 dB)` → both decrease by exactly 2.0 dB from the baseline.

6. **Dual carriageway** — Set Carriageway to `Dual`, 50/50 split, `laneOffset_m = 7`. Keep the validation scenario otherwise. Day LA10 drops from 75.7 (one-way) to ~74.5 dB — the far lane is now 7 m further from the receiver. "Show breakdown" reveals two contributions: "Near lane" and "Far lane".

7. **Dual carriageway uneven split** — Keep dual, change split to 80 / 20. Day LA10 rises slightly (more traffic in the near lane). 20 / 80 → symmetric mirror result (20% near, 80% far).

8. **NSW 3-source-height** — Enable the checkbox. Breakdown now shows 4 contributions per lane: Cars (~74 dB dominates), CV tyres (~67), CV engines (~66), CV exhausts (~58). Energy sum ≈ 75.4 dB (one-way). Disable → back to single "One-way" contribution.

9. **AADT = 0 edge case** — Set AADT to 0. Results display reads `—` for all four values and shows "Enter AADT to compute results." in red. No NaN, no Infinity, no console errors.

10. **Australian adjustment override** — Change Aust. adj. day from −1.7 to 0. Day LA10 increases by exactly 1.7 dB. Change to +2 → increases by 3.7 dB vs the default.

11. **Angle of view + reflection** — Set angle of view to 90° (half the road visible). Day LA10 decreases by 3.0 dB (`10·log₁₀(90/180) = −3.0`). Set reflection angle to 30° at angle 90 → reflection correction adds `1.5·30/90 = 0.5 dB`.

12. **Ground absorption** — Set ground absorption to 1.0 (soft ground). If mean prop height stays at 1 m and distFromKerb_m = 4 m then `d = 7.5`, `H ≥ (7.5+5)/6 = 2.08` is FALSE (H=1 < 2.08), `H < 0.75` is FALSE, so `corr_ground = 5.2 × 1 × log10((6×1 − 1.5)/7.5) = 5.2 × log10(0.6) = −1.15 dB`. Day LA10 drops by ~1.2 dB.

13. **Low-volume correction** — Set AADT to 300 (very low) and day hours to 18 → hourly flow ≈ 14. Verify the breakdown `corr_lowVol` shows a non-zero negative value (e.g. −2 to −5 dB). LAeq ignores this correction.

14. **Show breakdown toggle** — Click "Show breakdown" in the Results section. A monospace dump of every intermediate value appears (L_basic, V_adj, corr_speed, d_slant, corr_distance, G_factor, corr_ground, corr_angle, corr_reflection, corr_surface, corr_lowVol, corr_aust, corr_add). Toggle back to hide.

15. **Live recalculation** — Every input in the panel (text, number, dropdown, radio, checkbox) triggers an immediate recalculation. The Results section updates on every keystroke — no "Calculate" button required.

16. **Save / Load preserves results** — Save an assessment containing CoRTN roads. Load it back. Results are automatically re-computed by `_setCortnRoads` via `recalcCortnRoad`, so the loaded roads show the same LA10/LAeq values they had before save (they are NOT read from the saved JSON — they're always derived).

17. **No console errors** — Draw, edit every field, toggle dual/one-way, enable/disable 3-source-height, save, load, delete — all should run without any warnings or errors in DevTools Console.

## −1. CoRTN Road Traffic Source — Phase 1

1. **Tools menu has the button** — Open the side panel → expand the Tools accordion. Verify a new `Road (CoRTN)` button sits just after the `Line source` button. It has a dark blue (`#1565C0`) left border, a road-stripe SVG icon, and the tooltip "Draw a CoRTN road traffic source (UK CoRTN method with Australian adjustments)".

2. **Draw a new road** — Click `Road (CoRTN)`. The button highlights "active". Click two or more points on the map to draft a polyline (it renders a light dashed blue preview). Double-click to finish. Verify:
   - A dashed dark blue polyline appears where you drew
   - A small `R1` label sits at its midpoint in `#1565C0` bold
   - The floating `#cortnFloatPanel` opens centred on the viewport

3. **Panel layout — desktop** — Inspect the panel. It should contain, top-to-bottom:
   - Blue-bordered header with "Road 1 — CoRTN" and a `×` close button
   - **Name** input (with midpoint + length display below)
   - **Traffic**: AADT, Speed, Gradient, Carriageway radios (Dual / One-way), Traffic split
   - **Commercial vehicles**: %CV day, %CV night
   - **Time periods**: Metric dropdown (`LA10,18h` / `LAeq,15h/9h` / `LAeq,16h/8h`), %AADT day, %AADT night, day hours, night hours
   - **Corrections**: Road surface dropdown, Custom correction (hidden initially), Aust. adj. day, Aust. adj. night
   - **Propagation**: Dist. from kerb, Road height, Ground absorption, Mean prop height, Angle of view, Reflection angle
   - **NSW 3-source-height model** checkbox
   - **Results** placeholder showing "—" for both Day and Night LA10 / LAeq
   - Delete + Close buttons at the bottom

4. **Default values** — Without changing anything, verify:
   - Speed = 60, Gradient = 0
   - %CV day = 5, %CV night = 5
   - Carriageway = Dual (checked)
   - Traffic split 50 / 50
   - Metric = `LA10,18h (6am–midnight)`
   - %AADT day = 94, %AADT night = 6
   - Day hours = 18, Night hours = 6
   - Road surface = DGA
   - Aust. adj. day = −1.7, Aust. adj. night = 0.5
   - Dist. from kerb = 4, Road height = 0
   - Ground absorption = 0, Mean prop height = 1
   - Angle of view = 180, Reflection angle = 0
   - 3-source-height unchecked

5. **Edit fields and bind-back** — Change the Name to "Fullarton Road", AADT to 25000, Speed to 50. Close the panel, then click the polyline on the map. Panel re-opens showing all the changes preserved.

6. **Period metric auto-update** — Change Metric to `LAeq,15h / LAeq,9h (7am–10pm / 10pm–7am)`. Verify %AADT day auto-updates to 90, %AADT night to 10, day hours to 15, night hours to 9. Change to `LAeq,16h / LAeq,8h` → day hours 16, night hours 8, %AADT day 94.

7. **Surface correction auto-map** — Switch surface dropdown to `Concrete` → the row is hidden (no custom field). Switch to `OGA` → still hidden. Switch to `Custom` → a new "Custom correction (dB)" input row appears. Enter `5.5` → bound to `surfaceCorrection`.

8. **Carriageway toggle** — Check `One-way` → the traffic split inputs become disabled/greyed. Check `Dual` → enabled again.

9. **Draw a second road** — Close panel, click `Road (CoRTN)` again, draw another polyline. Verify the midpoint label reads `R2` (not `R1`). Both roads remain on the map.

10. **Right-click context menu** — Right-click the first CoRTN road polyline. Verify a context menu appears with Edit / Duplicate / Delete items (plus the icons). Click `Duplicate` → a third road appears slightly offset; label `R3`. Click `Delete` on the duplicate → it disappears from the map and from `cortnRoads`.

11. **Save / Load round-trip** — With 2 roads on the map, click Save Assessment → inspect the exported JSON → verify it contains a `cortnRoads` array with 2 entries, each with all the fields. Delete both roads. Load the saved JSON back → both roads reappear in the correct places with exactly the same names, AADT values, surface types, etc.

12. **Coexistence with line sources** — Add a line source (`L` shortcut) and a CoRTN road in the same session. Verify:
    - Line source polyline is solid red, label `L1`
    - CoRTN road polyline is dashed blue, label `R1`
    - Clicking each opens the correct panel type (`lsFloatPanel` vs `cortnFloatPanel`)
    - Delete one → the other remains untouched
    - Save / load round-trips both independently

13. **Results placeholder** — Open a CoRTN panel and scroll to Results. Both Day and Night show `LA10 = —  |  LAeq = —` with an italic note "Phase 2 will populate these via the CoRTN engine." No calculation happens yet — that's correct for Phase 1.

14. **No console errors** — Drawing, editing, saving, loading, deleting — all should execute without any errors in DevTools > Console.

## 0. Fixed LHS Side Panel + Atom Buttons

1. **Fresh load (desktop ≥768px)** — Clear `localStorage`. Reload. Verify `#side-panel` is visible on the left, 300px wide, dark background (`rgba(20, 26, 38, 0.98)`), full height of the map area. The search bar is at the top; Mapping / Tools / Modelling accordion headers are stacked below; the Expand/Panels (drawer) toggle sits at the bottom of the panel. The Leaflet map fills the space between the side panel and the right-side drawer.

2. **Accordion: open Tools** — Click the "Tools" header. It gets a subtle white highlight (`.mp-open` class). The body expands INLINE below the header (not as a floating dropdown) with all tool buttons visible: Terrain toggle, Buildings, Ruler, Site plan overlay, Barrier placement, Source placement, Receiver placement, Show/hide, Clear all.

3. **Multiple sections open independently** — With Tools open, click the "Mapping" header. BOTH Tools and Mapping stay open simultaneously (no mutual-exclusion — Claude-sidebar style). Click Modelling — all three stay open.

4. **Outside click does not close accordions** — With sections open, click on the Leaflet map. None of the open accordions close. They only close when you click their own header.

5. **Collapse panel** — Click the `«` toggle on the panel's right edge. Panel width goes from 300px to 0, the `«` becomes `»`, and the Leaflet map reflows to fill the full width up to the drawer. `localStorage['sidePanelCollapsed']` is `'true'`.

6. **Expand panel** — Click the `»` toggle (now at the left edge, sticking out from the map area). Panel restores to 300px, map shrinks back to accommodate it, chevron flips to `«`, `localStorage` is `'false'`.

7. **Persistence across reload** — Collapse the panel, reload the page. Panel stays collapsed on load. Expand, reload — panel stays expanded.

8. **Leaflet still interactive after toggle** — Toggle panel a few times, then pan/zoom/click the map. Coordinates are correct; no drag offset; click-to-place-source works; measure ruler is accurate. (This verifies `map.invalidateSize()` was called after each toggle.)

9. **Search bar in side panel** — Type an address ("123 Hindley St, Adelaide") into the search input and click Search. Map centers on the result. Autocomplete results dropdown appears below the search input (not clipped by side panel overflow).

10. **All Tools dropdown items still function** — Terrain contour toggle, Buildings fetch, Ruler, Site plan overlay upload, Barrier placement, Source placement (click map to add), Receiver placement, Show/hide groups, Clear all. None of these should have regressed.

11. **All Mapping and Modelling items still function** — Street/aerial switch, cadastral overlay, zone overlay, MBS 010 screening; ISO 9613-2 toggle, noise map grid settings, contour interval.

12. **Atom buttons in top-right** — Save JPG, Help (?), Suggest (💡), Undo, Redo appear as individual dark pill buttons in a horizontal row at the top-right of the visible map area (just to the LEFT of the drawer, 9px gap). Each button hovers/clicks independently. None are hidden behind the drawer. Save JPG exports a 3× JPEG as before.

13. **Drawer toggle at bottom of side panel** — The Expand/Panels button is the last item in the side panel (inside `#side-panel-footer`). Clicking it still opens/closes the right drawer and still triggers `map.invalidateSize()`.

14. **Close right drawer → atom buttons snap right** — Click the drawer's own edge triangle to close it. The map fills the full viewport width (minus the side panel). The atom buttons re-home from `right: 530px` to `right: 10px` so they're flush with the viewport edge.

15. **Mobile @ ≤767px — auto-collapse on load** — Resize to 375×800 and reload. The side panel is collapsed on load (slid off-screen via `transform: translateX(-100%)`). The toggle button (`»`) is visible at the far left edge. The Leaflet map fills the full 375px width.

16. **Mobile — open panel overlays the map** — Tap the `»` toggle. Panel slides in from the left. Map stays at full width (it is NOT pushed right). A semi-transparent dark backdrop appears covering the rest of the map area. `#side-panel-backdrop` has `display: block`.

17. **Mobile — backdrop tap closes the panel** — Tap anywhere on the dark backdrop. Panel slides back out, backdrop disappears. Chevron returns to `»`.

18. **Mobile — atom buttons stay accessible** — With panel closed on mobile, the atom buttons (Save JPG / ? / 💡 / Undo / Redo) are at the top-right edge of the viewport, not behind the drawer. Each still responds to taps.

19. **Save/load round-trip unaffected** — Place 2 point sources + 3 receivers + 1 area source + 1 building source with walls. Save assessment JSON. Reload the page. Load the saved file. Verify every source/receiver/building/library selection restores exactly as before — the side panel refactor touched no Save/Load serialisation paths.

20. **Panels below the map unchanged** — Scroll down to the Objects / Receivers / Propagation method / Noise sources / Assessment cases panels. None of them moved, resized, or broke. They render exactly as before.

21. **ISO/TR 17534-3 validation passes** — Run the in-app Propagation method validation. T01/T02/T03 should match within ±0.05 dB as before. This verifies no propagation code path was touched.

22. **No console errors** — Open DevTools > Console. Reload with a clean session. No errors during load, panel toggle, accordion open/close, search, or any Tools/Mapping/Modelling action.

## 1. Disclaimer Banner

1. **Fresh visit** — Clear `localStorage` (or use incognito). Banner appears at bottom of viewport with full disclaimer text and "I understand" button. Tool content (intro text, map, panels) is visible immediately without scrolling past the disclaimer.

2. **Accept disclaimer** — Click "I understand". Banner slides/fades out smoothly. Verify `localStorage` key `resonate_disclaimer_accepted` is set to `"true"` in DevTools > Application > Local Storage.

3. **Subsequent visit** — Reload page. Banner does not appear at all. No flash of banner content.

4. **Map controls not obscured** — With banner visible, verify map zoom controls, toolbar buttons, and bottom-of-map elements (Save JPG, etc.) are accessible and not hidden behind the banner.

5. **Narrow viewport** — Resize to ≤600 px width. Banner content stacks vertically, button is full-width, text is readable.

6. **Reset acceptance** — In DevTools > Application > Local Storage, delete `resonate_disclaimer_accepted`. Reload. Banner reappears.

7. **Intro text preserved** — The intro sentence ("A screening tool to predict noise levels...") and "under construction" notice remain visible in the header.

8. **No console errors** — Open DevTools console, verify no errors related to the banner or missing elements.

## 2. Phase 1 Layout — Full-viewport map with drawer

### Layout

9. **Page loads** — Map fills the full viewport below the header. No grey Leaflet tiles — map renders correctly at full size.

10. **Drawer visible** — Drawer is visible on the right (520px wide) with all panels inside, scrollable. Panels appear in the same order as before.

11. **Map behind drawer** — Map extends behind the drawer — visible on the left side.

12. **Header compact** — Logo, title, and action buttons are on one horizontal row. Under-construction notice and intro text are compact below.

### Drawer toggle

13. **Click toggle button** — Drawer slides closed smoothly. Map is now 100% visible and usable. Toggle icon flips direction.

14. **Click toggle again** — Drawer slides open. Scroll position within the drawer is preserved.

15. **Press `]` key** — Toggles drawer. Does NOT trigger when typing in a text input field.

16. **Reload page** — Drawer open/closed state persists via localStorage.

### Map interaction with drawer open

17. **Pan and zoom** — Pan and zoom the map on the visible portion (left of drawer). Responds normally.

18. **Place source** — Click map to place a source — coordinates are correct (source appears where clicked, not offset by drawer width).

19. **Place receiver** — Click map to place a receiver — same coordinate check.

20. **Drag marker** — Drag a marker — works correctly.

21. **Map toolbars** — Map toolbars (Mapping / Tools / Modelling) are accessible. When drawer is open, they may be partially behind it. When drawer is closed, all are fully visible.

### Panel functionality

22. **Expand/collapse panels** — Expand/collapse individual panels within the drawer — all still work.

23. **Collapse All button** — "Collapse All" button still works (in header).

24. **Criteria populate** — Place source + receivers. Criteria populate in the Receivers & criteria panel. Values are correct.

25. **Noise sources** — Add noise sources in the Day/Evening/Night tables. Predicted levels update correctly.

26. **Objects sidebar** — The Objects sidebar (on the map, in fullscreen mode) still slides in/out correctly and is independent of the drawer.

### Save/Load/Report

27. **Save → Load round-trip** — Full assessment setup → Save Assessment → reload → Load Assessment → all state restores correctly.

28. **Generate Report** — Generate Report → output includes content from all panels (not just visible ones — scroll down in drawer to verify all sections contributed).

### Noise map

29. **Noise map calculation** — Run a noise map calculation. Contours render correctly across the full map width (including behind the drawer).

30. **Save JPG** — Save JPG captures the map only, not the drawer.

### General

31. **All keyboard shortcuts** — P, L, A, B, N, 1–4, M, T, C, O, Z, R, H, S, E, Esc, Ctrl+Z, etc. all work.

32. **No console errors** — No errors in DevTools console.

33. **No missing elements** — No elements are visually missing or misplaced compared to the original layout (same panels, same content, just in the drawer now).

## 3. Phase 2 — Sticky compliance strip + jump navigation

### Empty state

34. **Fresh page load** — No source or receivers placed. The compliance strip at the top of the drawer shows "Place source and receivers to see compliance" in italic grey. Jump nav shows 5 buttons (Setup / Criteria / Sources / Results / Export).

### SA criteria display

35. **Place source + R1 in Adelaide CBD** — Strip populates with one row: `R1 <address> · Capital City Zone | (no subzone) · INL-5 · Cl 5(5)`. Period cells show `D —/52`, `N —/45` (grey, no source data yet). Drawer auto-scrolls to the Criteria section. Criteria jump button highlights.

36. **Place R2** — Second row appears in strip. Both receivers show up to 4 period cells each.

37. **Verify matching values** — Strip criteria values match the Receivers & criteria table below. Zone label matches the dropdown in the table.

38. **Clause detection** — If the receiver falls inside an intervening noise-designated zone, strip shows `Cl 5(6)`. If source + receiver same category, strip shows `Cl 5(4)`. Default is `Cl 5(5)`.

### Compliance display

39. **Enter source Lw** — Set source `lw.day = 90`. Strip updates to show `D 31/52 ✓ −21` or similar (green badge, compliant by 21 dB). Verify the predicted value matches the Predicted noise levels table.

40. **Push to exceedance** — Bump `sourcePins[0].lw` to 115 dB. Strip updates to `D 56/52 ✗ +4` (red badge, exceeded by 4 dB). No scroll needed — the strip stays visible.

41. **Iteration loop** — Perform 3 cycles of: adjust source Lw → observe strip update. Confirm the strip updates immediately without needing to scroll or click anywhere. This is the core UX win.

42. **Per-period visibility** — In SA, only Day and Night appear (no Evening). In VIC/NSW, Day + Evening + Night appear. In OTHER with Evening unchecked, Evening disappears.

### Jump navigation

43. **Click Setup** — Drawer scrolls to Development information panel. Panel header visible (not hidden behind the sticky strip). "Setup" button highlights active.

44. **Click Criteria** — Scrolls to Receivers & criteria panel. Active highlight moves.

45. **Click Sources** — Scrolls to Custom sources panel.

46. **Click Results** — Scrolls to Predicted noise levels area.

47. **Click Export** — Scrolls to PDF / GIS Export / Methodology area.

48. **Scroll spy** — Manually scroll the drawer. The active jump button updates automatically based on scroll position.

### Strip row click

49. **Click a receiver row in the strip** — Drawer scrolls smoothly to the Criteria derivation section. The clicked receiver's row in the Derivation table is visible.

### Auto-scroll on placement

50. **Close drawer, place new receiver** — Drawer auto-opens and scrolls to Criteria section.

51. **Drawer already open, place new receiver** — Drawer scrolls to Criteria section (was possibly showing Results).

52. **Change source after placement** — Adjusting source Lw does NOT trigger auto-scroll. Only the strip updates silently.

### Save/Load

53. **Save → Load round-trip** — Full assessment with source + 2 receivers + Lw set → Save Assessment → reload → Load Assessment → strip populates correctly with restored values. Jump nav still works.

### Regressions (must still pass)

54. **ISO/TR 17534-3 validation** — Click "Run validation" in Propagation method panel → all T01–T03 PASS within ±0.05 dB. No calc changes in Phase 2.

55. **Save JPG** — Captures the map only, not the drawer or compliance strip.

56. **Generate Report** — Word report collects content from all panels regardless of drawer position (uses global `.card` query).

57. **All keyboard shortcuts** — P, L, A, B, N, 1–4, M, T, C, O, Z, R, H, S, E, `]`, Esc, Ctrl+Z still work.

58. **No console errors** — No errors attributable to Phase 2 code. (The `showSaveFilePicker` security error when triggering Save via scripted click is a browser restriction, not a Phase 2 regression.)

## 4. Phase 4 — Expand button cleanup, shortcut documentation, responsive

### Expand button repurposed

59. **Expand button visible in toolbar** — On page load with the drawer open, the "Expand" button appears in the top-right map toolbar (inside `#mapPanelContainer`) alongside Save JPG, Mapping, Tools, and Modelling. Label reads `Expand`.

60. **Click Expand with drawer open** — Drawer slides closed, map fills the viewport. Button label updates to `Panels`.

61. **Click button again (now "Panels")** — Drawer slides back open at its saved width. Label reverts to `Expand`.

62. **Press `E` keyboard shortcut** — Same behaviour as clicking the button: toggles the drawer.

63. **No legacy fullscreen glitches** — No residual `.map-fullscreen` class is applied to `#mapCard`, no layout jumps, no duplicated Objects sidebar.

### Esc key priority

64. **Drawer open → Esc** — Drawer closes immediately. No other Esc side effects (draw mode stays active if it was, context menus stay unless they catch Esc elsewhere).

65. **Drawer closed → Esc** — No drawer change. Other Esc handlers run normally (e.g. cancels an in-progress draw, dismisses modal).

66. **Drawer open + draw mode active** — First Esc closes drawer. Second Esc cancels draw mode.

67. **Drawer open + Quick Reference modal open** — First Esc closes drawer (drawer is topmost). Second Esc closes the modal via its existing click-outside handler (or another press of `?`).

68. **Esc while typing in an input** — No drawer change. Esc falls through to native input behaviour.

### Quick Reference update

69. **Open Quick Reference (`?` key)** — Expand the `Keyboard shortcuts` details section. Verify a new `Layout` subsection is present at the bottom with three rows: `]`, `E`, `Esc`.

70. **Old entries removed** — `E — Expand/restore map` no longer appears under `Tools`. `Esc — Exit maximised mode` no longer appears under `Editing`.

### Responsive breakpoints

71. **Resize browser to 1000px wide** — Drawer defaults to 420px (unless user has dragged and saved a different width — clamp still applies). All panels render without horizontal scroll.

72. **Resize browser to 700px wide** — Drawer becomes full-width (100% of viewport). Resize handle is hidden. Toggle button reappears at bottom-left corner (not top-right).

73. **Click toggle on narrow viewport** — Drawer slides away, map is fully visible. Click again: drawer slides back full-width.

74. **Resize from 700px back to 1440px** — Drawer returns to its saved `resonate_drawer_width` (or 520px default). Resize handle reappears and works.

### Regressions (must still pass)

75. **All keyboard shortcuts** — P, L, A, B, N, K, 1–4, T, C, O, F, Z, R, M, H, S, `?`, `]`, `E`, `Esc`, Ctrl+Z, Ctrl+Shift+Z all work.

76. **ISO/TR 17534-3 validation** — Click "Run validation" → all T01–T03 PASS within ±0.05 dB.

77. **Save/Load round-trip** — Full assessment → Save → reload → Load → all state restores, including drawer width and drawer open state.

78. **Compliance strip + jump nav still functional** — Place source + receiver, enter Lw, verify strip updates and jump nav scrolls correctly.

79. **No console errors** — No errors attributable to Phase 4 code.

## ISO 9613-2 §7.4 ground-barrier interaction

80. **No-barrier tests unchanged** — Run `iso17534.test.js`. T01 (G=0) → 44.29, T02 (G=0.5) → 41.53, T03 (G=1) → 39.14. All three within ±0.25 dB of reference. The §7.4 fix must NOT touch these paths.

81. **T09 short barrier tightened tolerance** — T09 total LAeq must be within ±0.25 dB of 32.93 dB (was ±1.0 dB before the fix). Expected around 32.80 dB with `barrierInfo = {d1: 170.49, d2: 23.68, hBar: 6}`.

82. **T08 long barrier baseline** — T08 total LAeq within ±0.6 dB of 32.48 dB. The §7.4 fix has no numerical effect here because the large lateral deltas make `Abar > Agr_bar` in every band — verify this by per-band inspection: `Abar[i] - max(Agr[i], Agr_bar[i])` should be positive for all bands.

83. **T11 cubic building baseline** — T11 total LAeq within ±1.0 dB of 41.30 dB. Also unchanged by the §7.4 fix because the 25 dB cap on double diffraction dominates any per-band Agr_bar.

84. **`SharedCalc.calcAgrBarrier` exported** — In the browser console: `typeof SharedCalc.calcAgrBarrier === 'function'` and `SharedCalc.calcISOatPoint.length >= 10`.

85. **`getDominantBarrier` returns `d1`/`d2`** — `SharedCalc.getDominantBarrier(srcLL, recLL, 1, 1.5, [bldg])` on a blocking building returns an object where `d1 > 0 && d2 > 0 && d1 + d2 ≈ flatDist(src, rec)` (within floating-point tolerance).

86. **Hard ground unchanged (G=0 reflecting)** — Place source and receiver either side of a 5 m barrier on flat hard ground (`groundFactor = 0`). Predicted level should be identical before and after the §7.4 fix, because the unobstructed `Agr` ≈ −4.5 dB per band and the sub-path `Agr_bar` is also negative; `max(Dz, Agr_bar) = Dz` either way.

87. **Soft ground + short barrier (where it matters)** — Place source and receiver either side of a 3 m barrier on soft ground (`groundFactor = 1`) at short distance (~30 m). Predicted level at 250–500 Hz bands may differ from before the fix — this is the full observable effect of the §7.4 correction.

88. **Barrier on soft ground — noise map grid** — Generate a noise map over a scene with a ground-mounted barrier on soft ground (G=1). Map must render without NaN cells, no visual artefacts along the barrier shadow line, and no console errors.

89. **Save/load round-trip** — Save an assessment with barrier + ground zones, reload, load — all state preserved, predicted levels byte-identical to before save.

90. **Simple / ISO convergence for G=0** — With `groundFactor = 0`, no barrier, one source / one receiver, the ISO 9613-2 and simple propagation methods must still match within 0.5 dB (the `max(Dz, Agr_bar)` change is a no-op when no barrier is present).

## 3D Scene Viewer

### Phase 1 — infrastructure

91. **Button hidden when terrain off** — Load the app with Terrain disabled. `#threeDViewBtn` must be `display:none`. Enable Terrain; button appears in the Tools panel between `#terrainContourBtn` and `#buildingsToggleBtn` with the `V` keyboard-shortcut badge.

92. **V key opens when visible** — Terrain ON, no input focused. Press `V`. Modal opens with role="dialog". Press `Escape`. Modal closes; focus returns to the button.

93. **V key no-op when hidden** — Terrain OFF. Press `V`. No modal opens, no console error, no toast. Press `Escape` — does not throw.

94. **Backdrop click closes** — Open the modal. Click the dark area outside the inner `#1a1a2e` box. Modal closes. Clicking inside the box (e.g. on the header, canvas, hint overlay) must NOT close.

95. **10× open/close — WebGL context budget** — Open the modal, close it, repeat 10 times. No "too many WebGL contexts" warning in console. `renderer.forceContextLoss()` must be doing its job.

### Phase 2 — terrain mesh

96. **Adelaide Hills relief** — Set map view over a hilly area (e.g. Mount Lofty, zoom 13–14). Enable Terrain, wait for LiDAR tiles to fetch. Open 3D View. Terrain mesh should show visible relief with the ridgelines corresponding to the same contour lines visible on the 2D layer when Contours is toggled on.

97. **Flat site colour-ramp normalisation** — Set map view over a flat industrial area (e.g. Port Adelaide, zoom 15). Enable Terrain, wait. Open 3D View. Colour variation across the mesh must still be visible (not uniform green) thanks to the min-max normalisation — even a <5 m elevation range should map across the full green → brown → tan palette.

98. **SRTM-only remote site** — Set map view over a location outside LiDAR coverage (e.g. inland SA). Enable Terrain, wait for SRTM fallback. Open 3D View. Mesh renders but coarser; `DEMCache.getAllWCSRasters()` should include entries with `source === 'srtm'`.

99. **No-terrain fetched yet — fallback banner** — Fresh page reload. Enable Terrain, immediately open 3D View before tiles finish loading. Expect a yellow banner reading "No terrain data available. Enable Terrain and wait for it to load, then reopen 3D View." and a 2 km flat grey plane. Close, wait for the fetch to finish, reopen — now the real mesh builds.

100. **Partial coverage gaps** — Set map view where LiDAR coverage is partial (e.g. an edge tile). Open 3D View. Mesh should render with visible gaps where the NaN-skip logic drops cells whose corners are uncovered — NO cliff artifacts from zero-filling.

101. **Escape during chunked sampling** — Set a very wide view (zoom 10–11) with a large number of tiles; open 3D View. Press `Escape` while "Building terrain mesh… N%" is still updating. Modal closes cleanly. No console errors. Reopen — build runs from scratch without issue.

102. **Grid + axes helpers hidden by default** — Open 3D View. In devtools, query `THREE.GridHelper` / `THREE.AxesHelper` children of the scene via `window._3dAddMarker(…).parent.children`. Both exist but `.visible === false`. Manually toggle `.visible = true` via console — grid renders at terrain-appropriate scale, axes render at the origin. Phase 7 will add toolbar buttons to flip these.

### Phase 3 — buildings

103. **OSM-only project** — Load / open a project in a dense urban area with the OSM Buildings layer on. Open 3D View. All OSM footprints appear as extruded grey volumes at the correct positions. Heights resolved from OSM `heightM` / `height` / `levels × 3`; missing-height buildings get the 6 m fallback.

104. **Merged-mesh performance** — With 200+ OSM buildings in view, orbit should stay ≥ 30 fps in a real browser. The whole OSM set is a single `Mesh` named `osm-buildings` — verify via `scene.traverse` that there's exactly one such mesh regardless of building count.

105. **Self-intersecting polygon tolerance** — Inject a bowtie polygon into `window._buildings`, open 3D View. Console may log `[3D] triangulation failed for building footprint …` (warning, not error). Other buildings still render. Scene doesn't crash.

106. **Custom building appears blue** — Draw a 10 m custom building in 2D. Open 3D View. The custom building renders blue (`#4a90d9`, opacity 0.8), visibly distinct from surrounding OSM grey.

107. **No double-render for custom** — Same scenario as 106. In devtools, count meshes whose name matches either `osm-buildings` OR `custom-building-*`. The custom building's id should appear only in the custom mesh — id-dedup in `buildOSMBuildings` prevents the same footprint rendering both grey (OSM pass) and blue (custom pass).

108. **baseHeightM platform** — Draw a custom building with `baseHeightM = 5`, `heightM = 10`. Open 3D View. Base sits 5 m above terrain at the centroid-sampled elevation; top 15 m above terrain. Visible "floating platform" effect is expected.

109. **Building source orange material** — Draw a building source, `height_m = 8`. Open 3D View. Renders with the same footprint silhouette as a custom building would, but orange (`#E67E22`, opacity 0.8). Material matches the 2D "this is a source" styling convention.

110. **Buildings on sloping terrain** — Place a custom building on a visibly-sloping part of the terrain (e.g. a hillside). Building base sits at the centroid-sampled elevation. Small clipping/floating at the downhill / uphill edges is acceptable at v1 (Phase 6 may add per-vertex terrain-following later).

111. **Empty project** — New project, no buildings of any kind. Open 3D View. Scene renders terrain (or fallback plane) only, no errors.

112. **10× open/close with buildings** — Project with OSM + custom + building source present. Open / close the modal 10 times. No memory growth in DevTools Memory tab. Scene teardown traverses all mesh types and disposes geometries + materials correctly.

113. **Post-close 2D intact** — After testing 111–112, close the modal. 2D map building layer still toggles on/off normally; custom building edit / delete still works; building source context menu still fires. No state leaked between 3D and 2D.

### Phase 4 — barriers and ground zones

114. **Barrier on flat ground** — Draw a 3 m barrier with both endpoints over flat terrain. Open 3D View. A green wall (opacity 0.85) appears at the correct XZ position. Bottom edge is flat; top edge exactly 3 m above. A darker-green accent line runs along the crest.

115. **Barrier across sloping ground — bottom edge follows terrain** — Draw a barrier with one endpoint on high ground and the other on low ground (e.g. across a hillside at zoom 14). Open 3D View. The bottom edge of each segment is at its respective terrain elevation + `baseHeightM`; the two base corners of a given quad are at DIFFERENT Y values. Top edge remains uniformly `heightM` above each base — the two top corners are also at different Y values, matching the bottom-edge slope. Verify in devtools: read the barrier's `geometry.attributes.position` and check the 4 verts of a single segment quad — `BL.y` ≠ `BR.y` by the terrain delta across the segment.

116. **Barrier next to building — height comparison** — Draw a 10 m barrier adjacent to a 6 m custom building. Open 3D View. From any orbit angle the barrier is clearly taller than the building. The crest accent line is visible above the building roofline.

117. **Multi-segment barrier — connected wall, no gaps** — Draw a barrier with 3+ vertices (e.g. a U-shape around a receiver). Open 3D View. Wall segments connect cleanly at shared vertices — no visible gaps or overlaps. The crest line passes through every barrier vertex.

118. **Suppressed barrier — invisible in 3D** — Mark a barrier as `suppressed: true` in 2D (or via devtools). Open 3D View. The suppressed barrier does NOT render — no mesh, no crest line. Unsuppress it → reopen → it renders normally.

119. **Ground zone G=0 (hard)** — Draw a ground zone with G=0. Open 3D View. Flat grey (`#9E9E9E`) semi-transparent overlay appears on the terrain surface. The underlying terrain colour is still visible THROUGH the zone (confirms `depthWrite: false` working).

120. **Ground zone G=0.5 (mixed)** — Draw a zone with G=0.5. Open 3D View. Olive (`#7A8B4A`) overlay — visibly between the grey-0 and green-1 stops. Hard to mistake for either.

121. **Ground zone G=1 (soft)** — Draw a zone with G=1. Open 3D View. Green (`#4CAF50`) overlay. Three zones (G=0, G=0.5, G=1) side-by-side should show a clear grey → olive → green progression.

122. **Ground zone on sloping terrain — follows the slope** — Draw a zone across a hillside. Open 3D View. The fill follows the terrain contour (per-vertex Y sampling), not a flat plane cutting through the hill. +0.2 m offset means no z-fighting / flicker.

123. **Empty project — barriers + zones path** — New project with no barriers and no ground zones but one terrain mesh. Open 3D View. Scene renders terrain only. No `ground-zone-*` / `barrier-*` meshes in the scene. No console errors.

124. **Overlapping zones** — Draw two ground zones whose polygons overlap. Open 3D View. Both zones render; in the overlap region the blending adds (two × 0.4 transparent layers). No z-fighting. `renderOrder: 1` on both keeps them above the terrain cleanly.

125. **10× open/close with barriers + zones** — Project with multiple barriers (including suppressed) and several ground zones (various G values). Open / close 10 times. No memory growth in DevTools Memory tab. Scene teardown disposes `barrier-*` meshes, `barrier-crest-*` Lines, and `ground-zone-*` meshes — the `scene.traverse` pass catches Line objects because they have the same `.geometry` + `.material` shape as Mesh.

126. **Post-close 2D barriers + zones still work** — After all the above, close the modal. 2D barrier drag-to-move, delete-key removal, suppress toggle still work; ground zone edit (G value, polygon drag) still fires correctly. No state leaked.

### Phase 5 — sources, receivers, and labels

127. **Point source at 5 m height** — Place a point source, set height to 5 m. Open 3D View. Red sphere (`#E53E3E`) appears at the correct XZ position with Y = terrain-at-source + 5 m. Label "Source 1" (or the source's name) floats 5 m above the sphere.

128. **Cached ground elevation preferred over re-sample** — Place a source on a hillside, wait for terrain fetch so `source.groundElevation_m` is set, then artificially override it (e.g. `sourcePins[0].groundElevation_m = 99`). Open 3D View. Sphere Y = 99 + height_m, NOT the DEM-sampled value — confirms the code uses the stored value over a fresh `sampleTerrainAt()`.

129. **Line source as 3D tube** — Draw a 3-vertex line source at 2 m above terrain. Open 3D View. A red tube (`TubeGeometry`) follows the polyline smoothly with 0.5 m radius, elevated 2 m above the terrain at each vertex. Bends are smoothed (CatmullRomCurve3) without over-tessellating straight sections. Label "Conveyor" floats near the centroid.

130. **Area source as semi-transparent red polygon** — Draw an area source at 1 m above terrain. Open 3D View. Red (`#E53E3E`) flat polygon with `opacity 0.5`, per-vertex Y so on sloping ground it follows the slope. Terrain visible THROUGH the zone (`depthWrite: false`). Renders above ground zones (`renderOrder: 2` > zone's 1). Label floats above the centroid.

131. **Receiver R1 blue** — Place Receiver 1. Open 3D View. Blue (`#2563EB`) cone appears with its base at `terrain + receiver_height`, apex pointing up 4 m higher. Label "R1" (or custom name if set) 6 m above the apex.

132. **All four receivers with distinct colours** — Place all four receivers. Open 3D View. Four cones at the four positions, colours R1 blue / R2 green / R3 amber / R4 purple matching the 2D map markers exactly.

133. **Unplaced receivers skipped** — Place only R1 and R3. Open 3D View. Only two cones in the scene (blue and amber). No `receiver-r2` / `receiver-r4` meshes, no "R2" / "R4" labels.

134. **Custom receiver name in label** — In the RHS drawer, set Receiver 1's name to something like "Living room". Open 3D View. The R1 label reads "Living room" (truncated to 17 chars with `…` if longer), not "R1".

135. **Label billboarding** — Open 3D View with labels present. Orbit 360° around the scene. Labels rotate to always face the camera — text is always readable.

136. **Labels readable through geometry** — Place a source directly behind a tall building (from the current camera angle). Open 3D View. The source sphere is occluded by the building, but its label is still visible through / over the building (`depthTest: false`).

137. **Source positions match 2D map** — Take screenshots of the 2D map with sources + receivers placed, then open 3D View and orbit to a plan (top-down) view. Source XZ positions relative to buildings / roads should match the 2D map exactly.

138. **Building sources vs point sources visually distinct** — Project with both a building source (Phase 3 orange extrusion) and point sources (Phase 5 red sphere). Open 3D View. The two types are unambiguous — building source is a tall orange box, point source is a small red sphere.

139. **Empty project** — New project, no sources and no receivers (receivers cleared). Open 3D View. Scene renders terrain + buildings + barriers + zones only, no errors. `sources` / `receivers` / `labels` groups exist but have zero children.

140. **10× open/close — canvas texture leak check** — Project with ~10 sources and 4 receivers (14 labels total). Open / close the modal 10 times. DevTools Memory tab: no sustained growth. Performance tab: confirm no "Detached nodes" accumulating from the `<canvas>` elements that back label sprites. The `disposeScene()` `.map.dispose()` call must be doing its job.

141. **Post-close 2D source / receiver interactions** — After all the above, close the modal. Drag a source to a new position in 2D — works. Open the source edit panel — works. Drag receiver R1 to a new position — works. No state leaked between 3D and 2D.

### Phase 6 — toolbar controls

142. **Toolbar layout** — Open 3D View. A flex-row toolbar appears at the bottom of the modal with dark `#0f0f1e` background, thin top border. Left-to-right: `Vert × [slider] 1.0×` | `Wireframe` | `Labels` | `Grid` | `Axes` | `Reset view`. Canvas fills the space between header and toolbar with no gap.

143. **Vert slider at 1×** — Open 3D View. Slider defaults to position 1, readout reads `1.0×`. `_3dScene.scale.y === 1` (verify in devtools). Scene shows true elevation scale.

144. **Vert slider to 5×** — Drag the slider to position 5. Readout updates live to `5.0×`. Terrain relief visibly amplified (hilltops 5× taller); buildings and barriers stretched vertically; sprite labels unchanged (sprites are unaffected by scene scale — this is correct behaviour).

145. **Vert slider to 10×** — Drag to max. Readout `10.0×`. Extreme exaggeration visible. Scene remains coherent — no flickering, no geometry missing.

146. **Wireframe toggle on** — Click `Wireframe`. Terrain mesh renders as triangle wireframe (can see the ~250² grid structure). Button takes the blue active style.

147. **Wireframe toggle off** — Click `Wireframe` again. Terrain returns to solid shaded surface. Button style returns to inactive.

148. **Labels toggle off** — Click `Labels`. All sprite labels (source names, receiver names) disappear from the scene. Button active style flips off.

149. **Labels toggle on** — Click `Labels` again. Labels reappear at their original positions.

150. **Grid toggle on** — Click `Grid`. The `THREE.GridHelper` becomes visible at terrain min elevation (or −0.1 m on the fallback plane). Sized to the terrain extent.

151. **Axes toggle on** — Click `Axes`. The 20-unit `THREE.AxesHelper` becomes visible at the scene origin. Red = +X (east), green = +Y (up), blue = +Z (south).

152. **Reset view** — Orbit / zoom / pan far away so the scene is barely visible. Click `Reset view`. Camera snaps to the 45° NE overview, framing the whole scene — terrain + buildings + barriers + sources + receivers all in view.

153. **Reset view with partial scene** — Project with terrain only (no buildings / barriers / sources). Click `Reset view`. Camera frames the terrain mesh cleanly.

154. **`W` key toggles wireframe** — Modal open. Focus NOT in an input. Press `W`. Wireframe toggles on. Press `W` again — off. Matches button click behaviour.

155. **`L` key toggles labels** — Press `L` — labels hide. Press `L` again — labels show. 

156. **`G` key toggles grid** — Press `G` — grid shows. Press `G` again — hides. Does NOT activate the 2D Ground Zone draw mode (`stopImmediatePropagation` beats the 2D handler).

157. **`A` key toggles axes** — Press `A` — axes show. Press `A` again — hides. Does NOT activate the 2D Area Source draw mode.

158. **`R` key resets camera** — Orbit away. Press `R`. Camera returns to overview. Does NOT toggle the 2D Ruler.

159. **`+` key increases exaggeration** — Press `+` twice from 1.0×. Slider and readout advance to 2.0×, scene Y scale = 2.

160. **`-` key decreases exaggeration** — Press `-` once from 2.0×. Down to 1.5×. `-` cannot go below 1.0×; `+` cannot go above 10.0×.

161. **Shortcuts inert when modal closed** — Close the modal. Press `R`. 2D Ruler button activates (its normal behaviour). The 3D keyboard handler has been removed cleanly in `close3DModal()`. Click the ruler button to deactivate before continuing.

162. **Shortcuts skip when typing in an input** — Reopen modal. Focus into any future input (or the main app's address search in the background — the modal's focus trap should prevent this, but verify shortcuts don't fire if somehow the target is an input).

163. **Wireframe button disabled on fallback plane** — Open 3D View WITHOUT fetching terrain (immediately after enabling Terrain, before tiles arrive). The modal shows the fallback plane + banner. `Wireframe` button appears greyed out / disabled with a tooltip `"No terrain mesh (fallback plane in use)"`. Clicking does nothing. Pressing `W` also does nothing.

164. **Toolbar state resets on each open** — Open modal, set slider to 8×, toggle wireframe on, toggle labels off. Close modal. Reopen. Slider reads `1.0×`, Wireframe off, Labels on — all defaults. No stale state.

165. **10× open/close with toolbar interaction** — Open, slide Vert to 5×, toggle buttons, close. Repeat 10 times. No memory growth in DevTools. No console errors. The toolbar keydown listener is cleanly removed each time — open DevTools Listeners view on `document` and verify only one `keydown` capture listener is present while the modal is open, zero when closed.

166. **No console errors** — After the full Phase 6 walkthrough (142–165) the console has zero errors and zero new warnings.

## Objects follow terrain (per-vertex elevation cache)

### Vertex elevation fetch

167. **Fetch on creation (terrain enabled)** — Enable Terrain. Draw a barrier. Within ~2 s the barrier object in `window._getUserBarriers()[0]` has a non-null `vertexElevations` array with `vertices.length` entries. Each entry is a finite number (absolute ASL metres) or null if outside DEM coverage.

168. **Fetch on terrain toggle** — Draw a barrier with Terrain OFF. Check `vertexElevations` is null. Enable Terrain. Within ~2 s `vertexElevations` is populated. Disable Terrain and re-enable: values are retained (no unnecessary re-fetch).

169. **Partial re-fetch on drag** — Enable Terrain. Draw a 4-vertex barrier. Drag the second vertex to a new location. Only that vertex is re-fetched (check console — one `[vertexElev]` log, not four). The other vertices retain their cached values.

170. **`_fetchMissingVertexElevations` on load** — Save an assessment with Terrain enabled and a barrier. Reload the page, load the assessment. Within ~2 s the barrier has `vertexElevations` populated (if the save predated this feature and the field was null, the back-fill runs).

171. **Save/load round-trip** — Save an assessment. Load it. `userBarriers[0].vertexElevations` in the loaded data matches the pre-save value (not re-fetched on load if already present).

### Barrier diffraction — terrain-aware hBar

172. **hBar includes terrain elevation** — Enable Terrain on a hilly site. Place a source and receiver with a barrier between them. Check the per-band breakdown panel: `hBar` in the barrier info should be significantly higher than `barrierHeightM + baseHeightM` alone if the barrier sits at elevated terrain.

173. **hBar fallback on flat terrain** — On a completely flat site (all DEM samples equal), the terrain-aware `hBar` should equal `barrierHeightM + baseHeightM` (terrain elevation is zero, net effect zero). Level predictions unchanged vs pre-terrain behaviour.

174. **hBar fallback when terrain off** — Disable Terrain. Draw a 3 m barrier. `_barrierHBar()` should return `3` (no terrain component). Predictions match pre-terrain values exactly.

175. **hBar fallback when vertexElevations null** — With Terrain ON but DEM coverage unavailable (e.g. offshore site), `vertexElevations` will be all-null. `hBar` falls back to `baseHeightM + barrierHeightM`. No NaN or error in the prediction.

### 3D viewer — per-vertex terrain for buildings

176. **Custom building follows terrain** — Enable Terrain on a sloped site. Draw a custom building polygon that spans a hill. Open 3D View. The building base should step with the terrain at each vertex (not float flat at the centroid elevation). Verify by orbiting to a side view.

177. **Building source follows terrain** — Same test with a building source polygon. Building source base follows terrain per-vertex; top is at `baseHeightM + height_m` above each vertex's terrain.

178. **OSM buildings unaffected** — OSM buildings still use centroid `sampleTerrainAt()` (no per-vertex terrain). This is expected — OSM geometry is not edited by the user and doesn't have `vertexElevations`.

### Worker (noise map)

179. **Noise map hBar terrain-aware** — Enable Terrain on a hilly site. Draw a barrier. Run the noise map. The contours on the leeward side of the barrier should show increased screening compared to the flat-terrain result (terrain elevation adds to effective barrier height when the barrier is on raised ground).

180. **No console errors** — After the full per-vertex terrain walkthrough (167–179) the console has zero errors and zero new warnings.

## GIS Import (Phases 1–3)

### Phase 1 — Parser

181. **Toolbar button present** — "Import GIS file…" button visible at the top of Group 2 in the Tools▼ dropdown. Clicking it triggers a file picker.

182. **Shapefile reprojection (GDA2020 MGA Zone 55)** — Import `Public Buildings.zip` (or any MGA55 shapefile). Features appear in South Australia / Victoria, not off the coast of Africa. `layer.sourceCRS` = `"GDA2020_MGA_Zone_55"`.

183. **GeoJSON import** — Import a `.geojson` file with polygon features. Features parse correctly; `sourceCRS` defaults to `'EPSG:4326'`.

184. **KML import** — Import a `.kml` file with placemarks/polygons. Features parse; `sourceCRS = 'EPSG:4326'`.

185. **Coordinate sanity guard** — A file with >10% coordinates outside ±180/±90 is rejected with an alert. A file with 1–10% bad coords imports with a warning.

186. **Large file confirm** — A GeoJSON with 350 features triggers a confirmation dialog before proceeding.

187. **Hole-stripping warning** — Import `Public Buildings.zip`; the warnings banner in the modal shows the polygon-holes warning.

### Phase 2 — Assignment modal

188. **Modal styling** — Modal matches Quick Reference panel: dark header `rgba(26,32,44,.92)`, `border-radius:10px`, closes on backdrop click, × button, Escape key.

189. **CRS in layer header** — Layer header shows `(GDA2020_MGA_Zone_55)` after importing `Public Buildings.zip`.

190. **Polygon options correct** — Import a polygon layer; Import as options are: skip, Custom building, Building source, Area source, Ground absorption.

191. **Line options correct** — Import a line layer; Import as options are: skip, Barrier, Line source.

192. **Point options correct** — Import a point layer; Import as options are: skip, Point source.

193. **Library enforcement** — Set to Area source without choosing a library → Import button disabled. Choose library → Import button enabled.

194. **Building source Lp enforcement** — Set to Building source without choosing Lp option → Import button disabled. Select flat placeholder radio → Import button enabled. Select library radio → button disabled until library entry chosen.

195. **Live preview** — Set any geom type to a non-skip value → dashed grey shapes appear on map. Footer shows correct feature count. Cancel/Escape → preview removed.

196. **Attribute filter** — Import a mixed shapefile. Set filter attribute = TYPE, value = "building" → only building features in preview count.

197. **Zoom checkbox** — Zoom to imported checkbox is checked by default.

### Phase 3 — Element creation

198. **Custom building import** — Import 87 polygons as Custom buildings → 87 custom building polygons appear on map, each clickable with an edit panel, `heightM` = 3 (default). Preview layer removed after import.

199. **Area source import** — Import polygons as Area sources with library "Light vehicle movements" → `areaSources[]` contains entries with `libraryEntry.name = "Light vehicle movements"`, vertices in `[lat,lng]` order, first coordinate in correct AU range. Elements appear on map with correct styling.

200. **Point source import** — Import a point as Point source with library → `sourcePins[]` entry has correct lat/lng, `lw.day` from library, `spectrum.day` from library. Element appears on map as a source marker.

201. **Barrier import** — Import line features as Barriers → barrier polylines appear on map with correct styling (solid, not dashed), `heightM` from default or attribute.

202. **Building source — flat placeholder** — Import polygon as Building source with flat placeholder → `lpSource = 'broadband'`, `interiorLp.day.broadband = 75`, `defaultConstruction` present.

203. **Building source — library** — Import polygon as Building source with library entry → `lpSource = 'octave'`, `lpLibraryEntry` = entry name, `interiorLp.day.octave` bands populated from library spectrum.

204. **Name from attribute** — Import with Name from = "NAME" attribute → element name matches feature property value.

205. **Height from attribute** — Import with Height from = "HEIGHT" attribute and feature has `HEIGHT = 8` → element height = 8.

206. **Toast summary** — After importing 87 custom buildings, toast shows "Imported 87: 87 custom buildings" for ~6 s.

207. **Zoom to imported** — With zoom checkbox checked, map bounds fit to imported features after import.

208. **Save/load round-trip** — Import area sources and custom buildings. Save Assessment JSON. Reload. Elements reconstruct identically with same ids, names, vertices, library references.

209. **Background terrain (if terrain enabled)** — Enable terrain. Import 10+ elements. Import UI completes immediately. A progress chip "Fetching terrain… 0/N" appears bottom-right, counting up. Elements render immediately with `groundElevation_m = null`; values populate as terrain resolves.

210. **Terrain rate limit** — With terrain enabled, import 20+ elements. In the network panel, no more than 4 WCS requests in-flight simultaneously.

211. **Terrain abort on re-import** — Start terrain-heavy import, then immediately start a second import. First terrain fetch aborts; second chip replaces first. No console errors.

212. **Namespace** — `window.importGis` and `window.parseGisFile` are `undefined`. `window._gisImport.importGis` is a function. Toolbar button still imports correctly.

213. **No console errors** — After all GIS import tests, console has zero errors.



## Scenario Comparison — Phase 1: Infrastructure & Management

Prerequisite: any assessment loaded. Terrain and compliance strip state not required but recommended for full round-trip.

1. **Modal opens empty** — Click Scenarios → modal opens showing header "Scenarios", "Save current state as scenario…" button, and "No scenarios saved yet." hint text. No console errors.

2. **Save first scenario** — Click "Save current state as scenario…" → enter "Base Case" → click OK. Modal list shows exactly one entry: "Base Case" with a formatted timestamp (e.g. "21 Apr 2026, 2:14 pm"). "No scenarios saved yet." text is gone.

3. **Second scenario, newest-first sort** — Save a second scenario "Option A". Modal list shows Option A **above** Base Case (newest-first). Both entries display name and timestamp.

4. **Rename** — Click Rename on "Option A" → enter "With Barrier" → click OK. List entry updates in-place to "With Barrier". Timestamp unchanged. No new entry created.

5. **Delete with confirm** — Click Delete on "With Barrier" → confirm dialog shows `Delete scenario "With Barrier"?`. Confirm → entry removed. List shows only "Base Case".

6. **Delete cancel** — Click Delete on "Base Case" → cancel dialog. List still shows "Base Case".

7. **JSON export — structure** — Save Assessment to JSON. Open file. Confirm `data._scenarios` is an array with one entry. Confirm `state` is a **plain object** (not a JSON string). Confirm `stripData` is an array.

8. **Round-trip — fresh load** — Fresh tab → Load Assessment JSON → open Scenarios modal → "Base Case" present with the **original** timestamp from step 2.

9. **Undo isolation** — Save a scenario, then press Ctrl+Z repeatedly. Scenario is **still present** in the list (not undone). Undo affects map state only.

10. **Esc closes** — With modal open, press Escape. Modal closes. Focus returns to Scenarios button.

11. **Backdrop click closes** — With modal open, click the dark backdrop outside the modal box. Modal closes.

12. **Inner click does not close** — With modal open, click inside the white modal box (not on a button). Modal stays open.

13. **Tab focus trap** — With modal open, Tab/Shift+Tab cycles through modal controls only. No focus escapes to the page behind the modal.

14. **Focus restored** — After closing the modal (by any method), focus returns to the Scenarios button.

15. **Schema version skip** — Edit a saved JSON: set `schemaVersion: 99` on one scenario. Load assessment. Open Scenarios modal — that scenario is absent. Browser console shows a warning containing the scenario name and schema version numbers. Other scenarios (with `schemaVersion: 1`) load normally.

16. **Rapid-save uniqueness** — Write a console test: save 5 scenarios within 1 second. Open JSON → confirm all 5 `id` values are unique strings (no Date.now() collision).

17. **Phase 3 stub** — When ≥2 scenarios exist, a stub line "Comparison available in Phase 3." appears below the list.

18. **Empty name rejected** — Click "Save current state as scenario…" → enter empty string or whitespace → OK. Alert fires ("Scenario name cannot be empty."). No entry added to list.

19. **Rename — cancel / empty** — Rename prompt: click Cancel → no change. Enter blank → no change. Only non-empty names are accepted.

20. **No console errors** — Across all steps above, no console errors or warnings (except the intentional schema-version warn in step 15).

## Scenario Comparison — Phase 2: Restore & Overwrite

Prerequisite: Phase 1 tests pass. Two scenarios saved: "Base Case" (no barrier) and "With Barrier" (barrier placed).

1. **Restore replaces canvas** — Restore "Base Case" → modal closes → barrier absent from map. No console errors.

2. **Toast on Restore** — After restoring, a toast appears reading "Restored \u201CBase Case\u201D \u2014 press Ctrl+Z to undo". Toast fades after ~5 seconds.

3. **Ctrl+Z after Restore** — After restoring "Base Case", press Ctrl+Z. Canvas reverts to the With Barrier state (pre-restore canvas was pushed to undo stack by restoreScenario).

4. **Update overwrites in-place** — Move a receiver. Click Update on "With Barrier" → confirm. Scenario list shows same name, same position in list, but refreshed timestamp. Toast shows "Updated \u201CWith Barrier\u201D".

5. **Restore reflects Update** — Restore "With Barrier" → receiver is in the moved position (proves the updated state was stored, not the original).

6. **Update undo isolation** — After clicking Update, press Ctrl+Z. Undo steps back to the canvas action before the Update (e.g. receiver move), NOT through the Update itself.

7. **Rename undo isolation** — Rename a scenario, then Ctrl+Z. Canvas steps back through map edits, not through the rename.

8. **Delete undo isolation** — Delete a scenario, then Ctrl+Z. Canvas steps back through map edits, not through the delete.

9. **Restore is the only undo-tracked scenario action** — Only Restore pushes an undo entry. Save, Update, Rename, Delete do not.

10. **Rapid toasts** — Fire Restore three times in quick succession. Only the most recent toast is visible (prior toast removed on each call via showToast replacement behaviour).

11. **Toast non-blocking** — While toast is visible, clicking map controls works normally (pointer-events:none on toast).

12. **Update cancel** — Click Update → cancel confirm dialog. Scenario timestamp and state unchanged.

13. **Restore pre-terrain state** — Save a scenario before enabling terrain, then enable terrain, then Restore the pre-terrain scenario. Canvas updates cleanly; no console errors.

14. **Button layout wraps** — Narrow the browser window until the modal is at its minimum width. All four buttons (Update, Restore, Rename, Delete) remain accessible (flex-wrap prevents overflow).

15. **Button order** — In the modal, confirm button order left-to-right: Update, Restore, Rename, Delete.

16. **Restore bold** — Restore button has bold text (font-weight:700) to signal its destructive character.

17. **No console errors** — Across all steps above, no console errors.

## Scenario Comparison \u2014 Phase 3: Comparison Table

Prerequisite: Phase 1+2 tests pass. Two or more scenarios saved with receivers placed and compliance strip populated (run calculation first).

1. **Hidden below 2 scenarios** \u2014 With 1 scenario, Compare section is absent from modal.

2. **Visible at 2+ scenarios** \u2014 With 2+ scenarios: Compare section shows "Compare scenarios" heading, Baseline select, Include checkboxes (all checked), and table.

3. **Default baseline is oldest** \u2014 Baseline select defaults to the scenario with the earliest timestamp. Table baseline column matches that scenario name.

4. **Baseline checkbox locked** \u2014 The checkbox for the current baseline scenario is checked and disabled; all others are enabled.

5. **Manual \u0394 spot-check** \u2014 Note R1 Day pred from compliance strip for scenario A (baseline) = X and scenario B = Y. Table shows B column: Y and \u0394 = (Y \u2212 X) with correct sign. Negatives use U+2212 (\u2212), not a hyphen.

6. **\u03940 renders as (�0)** \u2014 Where pred is identical across baseline and a comparison scenario, cell shows pred then "(�0)".

7. **Lmax rows present** \u2014 Receivers with Lmax data in at least one included scenario show a Lmax row (label "Lmax").

8. **Unplaced receiver absent** \u2014 A receiver with placed=false in ALL included scenarios has no rows in the table.

9. **Receiver placed in only one scenario** \u2014 Row present; comparison column for the scenario without that receiver shows \u2014 (no colour class); \u0394 omitted where baseline has no data.

10. **Colour per own crit** \u2014 Each comparison cell is coloured cs-ok/cs-bad based on that scenario\u2019s own crit value, not the baseline\u2019s.

11. **Crit column uncoloured** \u2014 Crit column has no cs-ok/cs-bad background; values match baseline crit where available.

12. **Receiver striping** \u2014 Alternating receiver groups have subtly different row backgrounds (\u2060#f8fafc vs white).

13. **Change baseline** \u2014 Change Baseline select to a different scenario. Table re-renders: new baseline column shows pred only (no \u0394); old baseline column now shows pred + \u0394 vs new baseline. Scenario list above the Compare section does not re-render (scroll position preserved).

14. **New baseline checkbox auto-locked** \u2014 After changing baseline, the new baseline\u2019s checkbox is checked+disabled; the previous baseline\u2019s checkbox is re-enabled.

15. **Uncheck a non-baseline scenario** \u2014 Uncheck a comparison scenario. Its column disappears; baseline and other columns unaffected. Table re-renders without full modal rebuild.

16. **Delete a scenario \u2014 fewer than 2 remain** \u2014 Delete until 1 scenario remains. Compare section disappears from modal (hidden by renderScenariosModal guard).

17. **Delete with 2+ remaining** \u2014 Delete a non-baseline scenario while \u22652 remain. Table re-renders cleanly; no JS error.

18. **Delete baseline scenario** \u2014 Delete the current baseline while \u22652 others remain. Section re-renders; new default baseline resolves to oldest surviving scenario.

19. **Save\u2192Load resets compare selection** \u2014 Save Assessment with 2+ scenarios and a non-default baseline. Reload. Open Scenarios modal. Baseline defaults to oldest (not the one previously selected). Expected by design (\u0394compareSelection is UI-only).

20. **No horizontal scroll at \u22651280px** \u2014 With 4 scenarios � 4 receivers � 4 periods at \u22651280px viewport width, the table fits without horizontal scrollbar.

21. **Horizontal overflow on narrow viewport** \u2014 Narrow browser to 600px. Table gets a horizontal scrollbar inside the modal; modal itself does not overflow viewport.

22. **No console errors** \u2014 Across all steps above, no JS errors.
