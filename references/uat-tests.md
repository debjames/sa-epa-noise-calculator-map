# UAT Tests

## Option B Prompt B — Save format migration v2→v3

> Manual verification of `migrateV2ToV3` on a real v2 assessment file.

### Automated tests (run first)

- [ ] **`migrate-v2-v3.test.js` passes** — Run `npm test`. All 263 tests pass including the 25 new migration tests. No grey-zone warnings for library sources with energyDiff ≤ −8 dB.

### Load v2 file: custom point source migration

- [ ] **Prepare v2 fixture** — Open the app on a version _before_ Prompt A (or manually craft a JSON file with `"_version": 2` containing one custom point source: name="Custom fan", lw.day=69, spectrum.day=[60,60,60,60,60,60,60,60] for all periods).
- [ ] **Load v2 file** — Load the JSON via the Import Assessment button.
- [ ] **Check console** — `console.info` shows `[migrateV2ToV3] v2→3. Converted: { point: 3, line: 0, area: 0, building: 0 }`.
- [ ] **Verify Lp unchanged** — Place R1 at 50m from the source. Note the predicted Lp. This should equal the pre-Prompt-A prediction (the migration preserves the broadband Lw; only the per-band shape changes to dB(Z) convention).
- [ ] **Save as v3** — Save the loaded assessment. Open the JSON file. Verify `"_version": 3`. Verify the spectrum arrays contain dB(Z) values (band 0 ≈ 86.2 for the flat-60 fixture, not 60).

### Load v3 file: no re-migration (idempotent)

- [ ] **Reload the v3 file** — Load the saved v3 JSON. Console does NOT show a `[migrateV2ToV3]` log. Lp values are identical to those after the first load.

### Load v2 file: library point source (no change expected)

- [ ] **Prepare library source v2 fixture** — Create a v2 JSON with one library source (e.g. spectrum.day=[90.2,88.1,85.6,82.2,79,76.8,73,67.1], lw.day=85.1 — Carpark exhaust fan values).
- [ ] **Load v2 file** — Console shows `{ point: 0, ... }` — no conversion. Spectrum values unchanged after load.

### Grey zone manual check

- [ ] **Grey zone fixture** — If a source has energyDiff between −1 and −8 dB (unusual — not expected in normal use), console shows `[migrateV2ToV3] Grey zone point source ...` warning. The spectrum is NOT converted.

## Line source — multi-vertex placement

> Verify the polyline tool supports unlimited vertices matching barrier drawing behaviour.

- [ ] **3-vertex line** — Activate line source tool. Click 3 distinct map points. Confirm preview polyline grows with each click and tool stays active. Click the 3rd (last-placed) vertex marker → line commits with exactly 3 vertices. No duplicate or extra vertex.
- [ ] **6-vertex line** — Activate tool. Click 6 distinct points. Click vertex 6 marker → line commits with exactly 6 vertices and renders on the map correctly.
- [ ] **Minimum 2 vertices enforced** — Activate tool. Click once (1 vertex placed). Click that vertex marker → tool does NOT finish; it continues waiting. Click a second point → 2 vertices placed. Click vertex 2 marker → line commits with 2 vertices (original 2-vertex case still works).
- [ ] **Escape cancels** — Start a line, place 2+ vertices, press Escape → no line committed, preview removed, button de-activates, `_drawingActive` cleared.
- [ ] **Save/load — 5-vertex line** — Place a 5-vertex line source. Save Assessment JSON. Reload JSON → all 5 vertices present, line renders correctly, calculations match pre-reload values.
- [ ] **Existing 2-vertex lines load unchanged** — Load a saved assessment containing 2-vertex line sources → they load and render with no errors.
- [ ] **Terrain re-fetch fires** — With Terrain ON, commit any multi-vertex line → `_fetchVertexElevations` is called (check console for terrain fetch log or observe elevation values appear).
- [ ] **Panel opens on finish** — After committing any multi-vertex line, the floating edit panel opens (same as single-segment behaviour).
- [ ] **No interference with barrier tool** — Draw a barrier polyline while line source tool is inactive → barrier finishes normally; no `draw:drawvertex` early-completion hook fires on the barrier.
- [ ] **No console errors** — No JS errors during placement, finish, cancel, save, or load.

## Map-click mode — planning layer click-passthrough (generalised)

> Verify with all three planning layers visible (Zones toggle ON, MBS 010 ON).

- [ ] **Ruler through planning layers** — Enable Zones layer. Click Ruler button. Click map 3 times forming a triangle → each click registers as a ruler point; no zone popup fires during measurement.
- [ ] **Ruler exit restores popups** — After ruler ends (second click), click any zone polygon → zone popup opens normally.
- [ ] **Escape cancels ruler cleanly** — Start ruler (first click placed). Press Escape → ruler exits, button de-activates. Click zone polygon → popup fires; no leftover `pointer-events: none` on planning canvas.
- [ ] **Switching to add-receiver cancels ruler** — Start ruler. Without ending it, click Add Receiver (R1 button). Ruler cleanly exits; Add Receiver mode starts. Click map → receiver placed (not a ruler point or zone popup).
- [ ] **pointer-events restored after any tool exit** — DevTools → inspect planning canvas element (`_canvasRenderer._container`) after any tool exit → `pointer-events` is `''` or unset (never stuck as `none`).
- [ ] **Area source drawing still works with zones ON** — Enable Zones. Draw area source polygon → completes normally, no zone popup interference.
- [ ] **Line source drawing still works with zones ON** — Draw line source → completes normally.
- [ ] **No console errors** — No JS errors throughout the above steps.
- [ ] **Source/receiver placement unchanged** — Add source, place receivers with zones ON → works as before; zone popups suppressed during placement, restored after.

## PlanSA Planning Layers (display only)

> **IMPORTANT**: These layers are display only. All tests below must be run AFTER Stage 2 (build mode Action has committed data). Steps 1–5 can be verified before data is available.

### Pre-data checks (code-only, no GeoJSON needed)

- [ ] **Mapping panel group** — Mapping▼ contains "Zones (PlanSA)" button. No "Planning layers (display only)" group label. No "Noise & Air Emissions" or "Aircraft Noise (ANEF)" buttons in the Mapping panel. No existing Mapping or Tools buttons affected.
- [ ] **Save/load round-trip** — Enable Zones layer, Save Assessment JSON. Open JSON; verify `planningLayers: {zones:true}` (no `noiseAirEmissions` or `aircraftNoise` keys). Reload — Zones layer re-enabled.
- [ ] **Load pre-existing JSON** — Load any JSON saved before this feature was added (may contain `planningLayers: {noiseAirEmissions:true, aircraftNoise:true}`). Loads cleanly; noise/aircraft keys silently ignored; no console errors.
- [ ] **MBS 010 Screening includes Noise & Air Emissions and ANEF** — Enable MBS 010 Screening (SA state). Legend shows "Noise & Air Emissions" (red `#d62728`) and "ANEF" (orange `#ff9a5a`) entries alongside ANR Contours and road/rail layers. Both load from local GeoJSON (no SAPPA network calls). Checkboxes toggle layers on/off. No console errors.
- [ ] **_version unchanged** — Saved JSON has `"_version": 2` (not 3).
- [ ] **`window._getZoneColour` accessible** — Open DevTools console → `window._getZoneColour('General Neighbourhood')` returns a non-null colour string. `window._getZoneColour('Nonexistent Zone Xyz')` returns `'#999'`.

### Post-data: Zones (PlanSA)

- [ ] **Layers toggle on/off** — Enable "Zones (PlanSA)"; GeoJSON zone layer appears on map. Disable; layer removed.
- [ ] **Zones visible at zoom 12 — Adelaide metro** — Navigate to -34.92, 138.60 (Adelaide), zoom 12. Zone polygons render with per-zone SAPPA colours (e.g. General Neighbourhood pale pink, Employment blue-grey). Legend shows "P&D Code Zones" with viewport-visible zone swatches.
- [ ] **Residential check** — Drop receiver at Prospect (~-34.895, 138.605). Zone polygon is pale pink/salmon. Receiver panel shows "Established Neighbourhood" auto-detected, no "SAPPA unavailable" message.
- [ ] **Industrial check** — Navigate to Regency Park (~-34.863, 138.579). Zone polygons render Strategic Employment colour (light purple). Drop receiver; zone auto-detects as "Strategic Employment".
- [ ] **Rural/Hills check** — Navigate to Adelaide Hills. Zone polygons render green tones (Conservation, Hills Neighbourhood etc.).
- [ ] **Click popup** — Click any zone polygon. Popup shows zone name in bold, with note "Auto-detected from PlanSA open data (DD MMM YYYY) — verify on SAPPA ↗". Link opens SAPPA in a new tab.
- [ ] **Zoom 14 and zoom 8: all features present** — At zoom 14, full detail. At zoom 8, all ~5,400 features still present (simplification is geometric only — no feature dropping).
- [ ] **Toggle rapidly 5×** — Toggle Zones on/off 5 times quickly. Canvas renderer handles state changes cleanly; no flicker or orphan polygons.
- [ ] **Pan performance** — Pan across Adelaide metro at zoom 11 with Zones visible. Pan stays smooth (canvas renderer). If framerate drops below ~30fps, the canvas renderer is not being used.
- [ ] **Regional cities** — Pan to Mount Gambier (~-37.83, 140.78), Whyalla (~-33.03, 137.57), Port Lincoln (~-34.72, 135.87). Zones render without gaps.
- [ ] **Legend appears** — When Zones ON, bottom-left legend appears with zone swatches.
- [ ] **Legend hides** — When Zones OFF, legend removed from map.
- [ ] **Unknown zone grey** — Any zone not in `ZONE_COLOURS` (e.g. "Workers' Settlement") renders `#999` grey rather than a named colour. This is cosmetic only — criteria are unaffected.

### Viewport-aware legend

- [ ] **Adelaide zoom 12 — partial legend** — Toggle Zones ON at zoom 12 centered on Adelaide. Legend shows only zones visible in that viewport (typically ~25–35), not all 65.
- [ ] **Pan to Mt Gambier** — Legend updates within 200 ms to show Mt Gambier-specific zones (~15–20). "Adelaide Park Lands" and "Capital City" disappear from list.
- [ ] **Zoom out to all SA** — Zoom to level 6 (all of SA visible). Legend shows "Zoom in for zone legend" placeholder.
- [ ] **Zones OFF — no legend work** — Toggle Zones OFF, then pan the map. DevTools Performance shows no `refreshZonesLegendNow` calls while zones are hidden.
- [ ] **Debounce** — Pan rapidly; legend updates once after panning stops (~150 ms), not on every frame.

### Offline zone detection (SA state only)

- [ ] **Prospect receiver** — Place receiver at ~-34.895, 138.605. Zone field auto-populates as "Established Neighbourhood" (or adjacent residential zone). No "SAPPA unavailable" text appears anywhere.
- [ ] **Regency Park source** — Place source pin at ~-34.863, 138.579. Zone auto-detects as "Strategic Employment". Criteria use this zone without any dropdown override needed.
- [ ] **Belair / Conservation zone** — Place receiver inside Belair National Park (~-35.02, 138.63). Zone auto-detects as a Conservation or Hills-family zone.
- [ ] **Zero SAPPA network calls** — Place 4 receivers in different SA locations. DevTools → Network tab: zero requests to `location.sa.gov.au`. All zone fields populated offline.
- [ ] **Speed: 4 rapid receivers** — Place 4 receivers in quick succession. Each zone field populates within 200 ms of placement (check with DevTools Timeline or `console.time`).
- [ ] **"No zone found" message** — Place receiver outside all SA zones if possible (far offshore, or cross-border). Status label reads "No zone found — verify on SAPPA ↗".
- [ ] **Zone detection works before Zones layer toggled** — Without toggling the Zones display layer ON, drop a receiver. Zone auto-detects (PIP triggers its own fetch). Then toggle Zones ON — layer loads instantly (uses same cached data, no second fetch).
- [ ] **Criteria compute immediately on first receiver — zones layer OFF** — Load the tool fresh (hard-refresh). Do NOT toggle "Show zones". Wait 10 seconds for page to settle. Place a receiver in an SA zone (e.g. ~-34.895, 138.605). Within ~1 second, the Receivers & Criteria panel shows a zone name AND populated Day/Evening/Night/Lmax criteria values. No dashes that then populate after a further delay.
- [ ] **Criteria unchanged** — For a known test site (e.g. Prospect Established Neighbourhood), criteria output (INL, Lmax limit) matches pre-refactor values. Zone key format "Established Neighbourhood Zone | En Subzone" feeds into criteria correctly.

### "Verify on SAPPA" note

- [ ] **Zone description text (SA state)** — In SA state, the zone description text in the Receivers/Map panel reads "…using PlanSA open data (DD MMM YYYY)… verify on SAPPA ↗". Link opens SAPPA in a new tab.
- [ ] **Date updates after zones loaded** — Enable Zones layer (triggers metadata fetch). Date in zone description text updates to match `data/metadata.json fetched_utc`.
- [ ] **VIC and NSW state** — VIC/NSW zone detection unchanged; no "PlanSA" text in those states.

### Post-data: Noise & Air Emissions overlay

- [ ] **Toggle on/off** — Enable "Noise & Air Emissions"; red polygon overlay appears. Disable; overlay removed.
- [ ] **Coverage** — Red polygons present along South Rd, around Adelaide Airport, Wingfield, Port Adelaide, Torrens Rd corridor.
- [ ] **Click popup** — Click a polygon; popup shows "Noise and Air Emissions" (or exact overlay name) with note about MBS-010 and SA EPA Noise Policy.

### Post-data: Aircraft Noise (ANEF) overlay

- [ ] **Toggle on/off** — Enable "Aircraft Noise (ANEF)"; graduated contour polygons appear around Adelaide Airport and Parafield Airport. Disable; layer removed.
- [ ] **ANEF graduation** — Inner contours darker than outer (ANEF 40 darkest, ANEF 20 lightest).
- [ ] **No magenta contours** — No magenta polygons visible. If any appear, `anef_contour` has an unexpected value — update `ANEF_STYLES` in the planning layers IIFE.
- [ ] **Click popup** — Click a contour; popup shows "ANEF {value}" label and overlay name, with note about AS 2021.

### Attribution

- [ ] **Attribution appears** — With any one planning layer ON, attribution strip (bottom-right) shows "© Govt of SA (DHUD), CC-BY 4.0 — planning data as at DD MMM YYYY". Date matches `data/metadata.json fetched_utc`.
- [ ] **Attribution hidden** — When all three planning layers OFF, attribution string is removed.

### Performance

- [ ] **GeoJSON size guard** — `data/zones/sa-zones.geojson` file size < 30 MB.
- [ ] **Calc not slowed** — Run a full noise grid with Zones ON vs Zones OFF. Canvas rendering is 2D-composited; timing difference ≤10%.
- [ ] **Fast 3G (DevTools throttle)** — Initial Zones toggle fetches in a few seconds; subsequent toggles are instantaneous (cached).
- [ ] **No console errors** — With all three layers visible and a calc in progress, no errors in console.

## Suggested Noise Sources (💡) — Facility-Group Multi-Source

### No PDF loaded — all facilities visible
- [ ] **Open 💡 panel without any PDF** — Panel shows a "No PDF loaded — showing all facility groups" note plus all 10 facility groups collapsed. The "Add selected sources" button is visible.
- [ ] **All 10 facilities present** — Car park, Loading dock, Office / Commercial, Generator / Plant room, Function / Hospitality, Fast food / Drive-through, Car wash, Service station, Industrial / Warehouse, Childcare.
- [ ] **Expand a facility** — Click a facility row to expand; child sources listed with type badge (coloured: blue=point, yellow=line, green=area, purple=building).
- [ ] **TODO badges** — "Unloading activity" in Loading dock shows orange TODO. "Children (10 children 2–3 yrs)" in Childcare shows orange TODO.
- [ ] **Parent checkbox toggles children** — Uncheck a facility's parent checkbox → all its child checkboxes uncheck. Re-check parent → all re-check.
- [ ] **Child checkbox propagates indeterminate** — Uncheck one child → parent shows indeterminate state. Uncheck all → parent unchecked. Check all → parent fully checked.

### PDF keyword matching
- [ ] **"loading bay and office"** — Upload PDF containing those words. Panel shows Loading dock (4 sources: area, line, line, area) and Office / Commercial (2 sources: point, point) as matched (open), all other facilities under "Other facilities (no keyword match)" collapsed.
- [ ] **"car wash and vacuum station"** — Car wash facility matched (4 sources: vacuum point, car wash auto point, car driving slowly line, car idling point).
- [ ] **"McDonald's drive-through"** — Fast food / Drive-through matched (3 sources: speaker box point, patrons area, car idling area).
- [ ] **"industrial factory warehouse"** — Industrial / Warehouse matched (5 sources: forklift area, truck movements line, truck exhaust line, unloading area, warehouse shell building).
- [ ] **No match** — Upload PDF with no facility keywords. Panel shows "No matching facility types detected" note + all facilities listed under "All facilities (no keyword matches)".

### Library audit console report
- [ ] **Console report on PDF scan** — After uploading any PDF, console shows `[SuggestedSources] Library audit` block listing every source as `EXISTS` (with library entry name) or `STUB (TODO)` or `MISSING`.
- [ ] **Confirmed stubs** — "Unloading activity" and "Children (10 children 2–3 yrs)" logged as `STUB (TODO)`.

### Add selected — source types
- [ ] **Add 3 items (point + line + area)** — Check 3 sources of different types, click "Add selected". Exactly 3 sources created: correct type appears in Objects panel (point shows "Place" button; line/area appear on map as polygon/polyline at map centre).
- [ ] **Point source Lw pre-filled** — Added point source (e.g. Medium condenser) has Lw pre-filled if library entry was found (EXISTS). Lw is null if library miss.
- [ ] **Line source lw_m_base pre-filled** — Added line source has `lw_m_base.day` set from `lw_m_dba` if library entry found.
- [ ] **Area source lwValue pre-filled** — Added area source has `lwValue.day` set from `lw_m2_dba` if library entry found.
- [ ] **Building source Lp pre-filled** — Add warehouse shell from Industrial/Warehouse group. Building source added with `interiorLp.day.broadband` populated from the warehouse library entry's `lp_dba`.
- [ ] **Stub toast warning** — When any TODO-flagged source is added, toast includes "TODO placeholder Lw — confirm values before predicting".
- [ ] **No source created for deselected items** — Uncheck 2 items, click Add. Only checked items created.

### Save/load round-trip
- [ ] **Round-trip preserves suggested sources** — Add sources via 💡 panel (including one stub). Save Assessment JSON. Reload from JSON. All sources present with same names, Lw values (or null for stubs), and `_libName` fields.
- [ ] **Building source round-trip** — Warehouse shell added via 💡 panel saves/loads with its vertices and `interiorLp` data intact; prediction at a receiver produces the same result before and after round-trip.

---

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
- [ ] **Music LA90 row — no input-box clipping** — Enter values 20, 23, 25, 34, 40, 42, 45 in the seven octave bands. Export PDF. LA90 row shows all values fully visible as plain centred text: 20 23 25 34 40 42 45. No input-box border, no clipped digits.
- [ ] **Music LA90 and LA10 row styling match** — Both rows render with identical cell style (same font size, centred alignment, no background fill). Neither row shows any input widget chrome.
- [ ] **Music LA10 values correct** — With background values above, LA10 row shows 28 31 33 42 48 50 53 (each = LA90 + 8).
- [ ] **Music table — missing band value** — Leave one band empty. That cell shows "—" in both LA90 and LA10 rows; other cells unaffected.
- [ ] **Music table header** — Gold header row reads "Octave band centre frequency, Hz" in white bold. Frequency label row (63 125 250 500 1000 2000 4000) renders in light grey with bold numerals.
- [ ] **Music live UI unchanged** — After PDF export, the background noise input boxes in the sidebar remain fully editable; values entered before export are preserved.
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
- [ ] **SA zones in appendix** — SA state selected, zones toggled on → SA zone polygons (canvas-rendered GeoJSON) appear in Figure 1 with their fill colours and zone labels.
- [ ] **SA zones forced on — zones off** — SA state selected, zones toggled **OFF** before export → export PDF → Figure 1 shows SA zone polygons (forced on during capture). After download, live map zone toggle is restored to OFF.
- [ ] **VIC zones in appendix** — VIC state selected, zones toggled on → VIC VicPlan zone polygons appear in Figure 1.
- [ ] **VIC zones forced on — zones off** — VIC state, zones OFF before export → Figure 1 shows VIC zone polygons. Live map restored to zones OFF after export.
- [ ] **NSW zones in appendix** — NSW state selected, zones toggled on → NSW planning portal zone polygons appear in Figure 1.
- [ ] **NSW zones forced on — zones off** — NSW state, zones OFF before export → Figure 1 shows NSW zone polygons. Live map restored to zones OFF after export.
- [ ] **Zones forced on — many objects visible** — Sources, receivers, barriers, ground zones, noise map all ON; zone toggle OFF. Export → Figure 1 shows zones only (all other objects absent). After export: all objects + noise map restored; zone toggle still OFF.
- [ ] **Async zone fetch — export immediately after page load** — Open page, do NOT toggle zones. Export appendix immediately (zone data not yet loaded into `_zonesLayer`). Figure 1 either (a) shows zone polygons (if 1000ms wait was sufficient for async GeoJSON load) or (b) shows street map only with a console warning — but does NOT capture a half-rendered or blank map silently.
- [ ] **SA zone state not double-toggled** — SA state, zones toggled ON before export. Export appendix → zones are already on, should NOT be toggled off and back on (no flicker). After export, zones remain ON.
- [ ] **Criteria PDF (exportCriteriaPdf) — SA zones forced** — SA state, zones OFF. Click "Export Criteria PDF" button → Figure 1 shows SA zone polygons. After export, zones remain OFF.
- [ ] **Parcel boundary in capture** — Source placed (triggers parcel boundary API fetch) → black/white dashed boundary polygon appears in Figure 1.
- [ ] **No parcel boundary before source placed** — No source placed → no boundary polygon in Figure 1. Export still succeeds.

### Diagnostic logging (regression guard)

- [ ] **Console entries present** — On successful export, browser console shows `[pdf-appendix] zone map { dataUrlLength: ..., aspect: ... }`. Native table sections (PDC, criteria, emergency, music, childcare) produce no `[pdf-appendix]` log entries as they use no image capture.
- [ ] **Named error on failure** — If export fails, alert reads `"PDF appendix export failed at [section name]: ..."`. For image captures, `_pdfLabel` is set before `addImage`; for native tables any JS error propagates to the outer catch with the last known `_pdfLabel`.
- [ ] **No html2canvas calls for tables** — Confirm via DevTools Network tab: no canvas/JPEG fetch requests are made for PDC, emergency, or childcare sections (all rendered inline by jsPDF).

### JPEG zone map capture (regression guard for large-PNG jsPDF failure)

- [ ] **Tall criteria table — no PNG error** — NSW state, 4 receivers placed, all zones detected (maximises row count). Export appendix → no "Incomplete or corrupt PNG file" alert. PDF downloads and opens. Criteria table visible.
- [ ] **Zone map still JPEG** — Zone map is still captured as JPEG directly. Confirm by checking `[pdf-appendix] zone map` console entry shows `format: "JPEG"` or JPEG data URL prefix.
- [ ] **Text readability** — Open the exported PDF at 100% zoom. Table text (column headers, receiver names, dB values) is sharp and legible — no JPEG artefacts on text (tables are now native jsPDF, not JPEG).
- [ ] **Error labels the section** — If export fails, alert includes a section name from `_pdfLabel`. For native-rendered sections (PDC, emergency, childcare) the label is set to 'init' during the PDF build; for zone map the label is 'zone map'.

### Native table rendering — Resonate styling (PDC, emergency, childcare)

- [ ] **PDC table present and populated** — SA state, export → PDC table shows 6 rows, each with wrapped Performance Outcome, DTS/DPF, and Relevance text. No `<div contenteditable>` artefacts.
- [ ] **PDC row heights dynamic** — PO 4.2 (longest text) renders with a noticeably taller row than PO 4.4 (short text). No row is clipped.
- [ ] **PDC relevance text preserved** — Type custom text into a Relevance cell in the sidebar before export. That text appears verbatim in the Relevance column of the PDF table.
- [ ] **PDC "TBC" value** — If a relevance cell reads "TBC" (auto-set by the tool), the PDF renders it as "TBC pending modelling".
- [ ] **PDC header row gold** — Header row ("Performance Outcome" / "DTS/DPF" / "Relevance") has gold (#F2CB00) background with **black bold text**.
- [ ] **PDC subheading row grey** — "Activities Generating Noise or Vibration" row renders with grey (**#D9D9D9**) background and black text.
- [ ] **PDC column proportions** — Performance Outcome column is visibly the widest (~47%); Relevance column the narrowest (~20%).
- [ ] **PDC pagination** — On a long-form export where the PDC table spans a page break, the header row ("Performance Outcome" / "DTS/DPF" / "Relevance") repeats at the top of the continuation page. No row body is split mid-cell.
- [ ] **Emergency table 2-row header** — Fire pump only: row 1 gold "Receiver | Criteria, LAeq dB"; row 2 grey "empty | Fire pump". Generator only: row 2 shows "Standby generator". Both active: row 2 shows both equipment labels.
- [ ] **Emergency table body values** — Criteria values in the body rows match what appears in the Emergency Equipment Criteria section in the sidebar.
- [ ] **Emergency table body reads from rendered DOM** — Enable emergency equipment, do NOT open the Emergency Equipment Criteria panel. Export PDF → emergency table body rows are populated (values come from `emergEquipBody` after `renderEmergencyEquipCriteria()` runs).
- [ ] **Childcare table layout** — Table has two columns: "Location" (75% width) and "LAeq dB" (25% width). Single body row: "All sensitive receivers" | "50".
- [ ] **Childcare table header gold** — Header row has gold background with **black text**.
- [ ] **All table borders consistent** — Every native table (PDC, criteria, emergency, music, childcare) uses **0.18 mm black borders** on all four sides of every cell. No missing or doubled borders visible at 200% zoom in PDF viewer.
- [ ] **Every cell has full 4-sided border** — Zoom to 200% in PDF viewer. Check each table: no cell has a missing edge (top, bottom, left, or right). Borders are solid black, not grey.
- [ ] **No text clipping in any cell** — Rows auto-size to content. "Night LAmax (dB)" header, "Old Belair Road, Torrens Park" receiver name, and "Suburban Neighbourhood Zone" zone name all render without truncation or overflow into adjacent cells.
- [ ] **12 pt gap between table and next element** — After each table (PDC, criteria, emergency, music, childcare) there is a visible ~4 mm gap before the next heading or paragraph. No table is flush against the element below it.
- [ ] **Grey shade matches #D9D9D9** — Subheader / frequency-label rows (PDC category subheadings, music octave-band frequency row) render in a mid-grey that visually matches #D9D9D9. Not the lighter #F2F2F2.
- [ ] **TABLE_HEADER_YELLOW consistent** — Gold header colour is visually identical across all five tables (PDC, criteria, emergency, music, childcare). All use #F2CB00.

### PDF export — map framing panel

- [ ] **Panel appears on Save PDF** — Click "Save PDF" toolbar button. A floating panel titled "Prepare map for PDF" appears centred near the top of the screen. The button is NOT yet disabled (export hasn't started).
- [ ] **Map still interactive** — While the framing panel is visible, zoom and pan the map. Both work normally — the panel does not block map interaction.
- [ ] **Panel does not close on click-outside** — Click on the map or sidebar while the panel is visible. Panel stays open.
- [ ] **Accept starts export** — Click Accept. Panel closes, button disables to "Exporting…", PDF export proceeds and downloads.
- [ ] **Cancel aborts export** — Click "Save PDF", then click Cancel. Panel closes, button remains enabled (not disabled), no PDF downloaded. Clicking Save PDF again re-shows the framing panel.
- [ ] **exportCriteriaPdf framing panel** — Trigger the standalone Criteria PDF export button (if visible). Same framing panel appears; Accept/Cancel behave identically.
- [ ] **Framing panel z-index** — Panel appears on top of all map layers, sidebars, and overlays. No UI element obscures it.

### PDF export — criteria capture independent of sidebar state

- [ ] **All panels collapsed — export still works** — Collapse all cards in the Criteria sidebar tab. Click Save PDF → Accept. Export completes; PDF includes all criteria table sections with correct data (no blank tables, no missing sections).
- [ ] **Panels restored after export** — After export completes, collapsed panels remain collapsed. The export process does not leave panels in a different state than before export.
- [ ] **Mixed collapse state** — Collapse only the "Environmental noise policy" card. Export → Accept. PDF includes the criteria table from that card. Card remains collapsed in the sidebar after export.
- [ ] **overflow-y clipped panels captured** — If any criteria panel has a scrollable (overflow-y:auto) container, the full table content is captured — not just the visible viewport portion.

### PDF Criteria section — heading and intro text structure

- [ ] **H1 "Criteria" present** — PDF opens with "Criteria" as the first heading in Resonate yellow (#F2CB00), 20 pt bold. No other heading uses this colour.
- [ ] **Six H2 sub-sections in correct order** — Sub-sections appear in this sequence: Zoning → Planning & Design Code — Interface between Land Uses → Environmental noise policy → Emergency equipment criteria → Music noise criteria → Schools, kindergartens, child-care centre of place of worship. (Conditional sections only appear when their source category is active.)
- [ ] **Old headings gone** — "Receivers & Criteria", "Childcare / Student Criteria", and "Emergency Equipment Criteria" do not appear anywhere in the PDF.
- [ ] **H1 spacing** — 12 pt before / 6 pt after H1 "Criteria". H1 is visually separated from the H2 below it.
- [ ] **H2 spacing** — 12 pt before / 6 pt after each H2. H2 headings are visually separated from intro paragraphs below.
- [ ] **Intro paragraphs present** — Each H2 is immediately followed by its intro paragraph in 9 pt normal weight. Text is verbatim per spec (spot-check first sentence of each).
- [ ] **Two-paragraph intro — Environmental noise policy** — The "Environmental noise policy" intro is split into two separate paragraphs, with a visible gap between "…noise-affected premises." and "Based on the land use categories…".
- [ ] **Line spacing** — Body intro text has visible leading (12 pt line spacing). Lines are not cramped.
- [ ] **No captions anywhere in Criteria section** — Export PDF. Search the PDF text (Ctrl+F in Acrobat) for: "Zone map", "Relevant assessment provisions", "Environmental noise criteria", "Music noise criteria", "People noise criteria". None of these strings should appear as standalone caption lines — the H2 heading text is the only labelling. Confirm zero caption occurrences.
- [ ] **H1 hanging indent** — If H1 wraps to two lines (unlikely at 20 pt), continuation line is indented 1.5 cm from left margin.
- [ ] **H2 hanging indent** — "Schools, kindergartens, child-care centre of place of worship" at 15 pt — if it wraps, continuation line is indented 1.5 cm.
- [ ] **Table data unchanged** — Receiver names, zone names, INL values, criteria values (dB), fire pump / generator values, octave band values, 50 dB(A) childcare threshold all unchanged in the tables.
- [ ] **Other PDF sections unaffected** — Sections outside Criteria (page numbers, cover metadata if any) render identically to before.
- [ ] **No console errors** — Export completes with no errors in DevTools console.

### PDF export — Introduction section

- [ ] **Introduction before Criteria** — Export appendix. The PDF opens with an H2 "Introduction" heading (15 pt bold black) appearing immediately before the "Criteria" H1 heading. No other content appears between them.
- [ ] **H2 style matches Criteria sub-sections** — "Introduction" heading renders identically in size, weight, colour, and spacing to other H2 headings such as "Zoning" — 15 pt bold black, 12 pt before, 6 pt after.
- [ ] **Lead-in sentence present and correct** — Immediately below the heading: "The noise impact assessment has been undertaken in consideration of the following guidelines:" in 9 pt normal black, line spacing matching Criteria intro paragraphs.
- [ ] **Five bullets in correct order** — Bullets appear in this exact sequence: (1) Planning & Design Code; (2) Environment Protection (Commercial & Industrial Noise) Policy 2023 (Noise Policy); (3) Local Nuisance and Litter Control Act 2016; (4) World Health Organization (WHO) Guidelines for Community Noise; (5) Environment Protection Authority (EPA) Guideline Assessing music noise from indoor venues (2021).
- [ ] **Solid round bullet glyph** — Each bullet begins with `•` (U+2022 solid round bullet), NOT a middle dot `·`, hyphen `-`, or tofu square `□`. Copy a glyph from the PDF and paste into a text editor — it should paste as `•`.
- [ ] **1 cm hanging indent** — Measure in the PDF: bullet glyph sits at the body left margin (0 cm offset); bullet text starts 1 cm to the right of the glyph. Wrapped lines on multi-line bullets (bullets 2, 4, 5) align back to the 1 cm mark — not to the glyph position.
- [ ] **Full stop on final bullet** — Bullet 5 ends with a full stop: "…indoor venues (2021)." — verify it is present and in roman (not italic).
- [ ] **Bullet spacing** — Consistent small gap between each bullet (~2 mm visible gap); 3 pt before + 3 pt after each item (no tight stacking, no large gaps).
- [ ] **Bullet text style** — 9 pt black; line spacing matches the lead-in paragraph above.
- [ ] **Italic runs — bullet 1** — "Planning & Design Code" renders entirely in roman (no italic).
- [ ] **Italic runs — bullet 2** — "Environment Protection (Commercial & Industrial Noise) Policy" renders in italic; " 2023 (Noise Policy)" renders in roman. Italic/roman boundary is at the space before "2023".
- [ ] **Italic runs — bullet 3** — "Local Nuisance and Litter Control Act" renders in italic; " 2016" renders in roman.
- [ ] **Italic runs — bullet 4** — "World Health Organization (WHO) " renders in roman; "Guidelines for Community Noise" renders in italic.
- [ ] **Italic runs — bullet 5** — "Environment Protection Authority (EPA) Guideline " renders in roman; "Assessing music noise from indoor venues" renders in italic; " (2021)." renders in roman.
- [ ] **Wrapped italic lines** — If a bullet wraps mid-italic-run, the continuation line continues in italic from the correct word. No style flip at line boundaries.
- [ ] **Keep-with-next — block stays together** — If the Introduction would start near the bottom of a page and overflow, the entire block (H2 + lead-in + all 5 bullets) moves to the next page together. No orphan heading or lead-in sentence left alone at the bottom.
- [ ] **Criteria H1 unaffected** — After the Introduction, "Criteria" H1 still appears in 20 pt bold Resonate yellow, followed by all six sub-sections in the correct order and with correct data.
- [ ] **No console errors** — Export completes with no errors in DevTools console.

### PDF export — L-descriptor subscript formatting

- [ ] **Subscript present — criteria table headers** — In the SA/VIC/NSW criteria table, column headers "Day L**Aeq** (dB)", "Night L**Aeq** (dB)", and "Night L**Amax** (dB)" render with "Aeq" / "Amax" visibly smaller than "L" and slightly lower (subscript position). The "L" sits on the normal baseline; the subscript letters sit below it.
- [ ] **Subscript size** — The subscript portion appears approximately 60 % of body text height. It is clearly smaller than surrounding text but still legible at normal PDF zoom (100 %).
- [ ] **Subscript baseline** — The subscript portion sits below the normal text baseline — not above (superscript) and not on the baseline. The descender of the subscript does not clip the cell border below.
- [ ] **Centring preserved — centre-aligned cells** — Column headers with subscripts remain horizontally centred in their cells. The centring is calculated from the actual rich-text rendered width (not the plain-string width), so the header is not visibly off-centre.
- [ ] **Emergency header — "Criteria, L_Aeq dB"** — The spanning gold header in the Emergency equipment table reads "Criteria, L**Aeq** dB" with subscript "Aeq". The text is horizontally centred in the span.
- [ ] **Childcare header — "L_Aeq dB"** — The "L**Aeq** dB" column header in the Schools/childcare table has subscript "Aeq" and is centred in the right-hand column.
- [ ] **Music table row labels** — "Lowest background L**A90** (dB)" and "Music noise criteria L**A10** (dB)" in the music table render with subscript "A90" / "A10" respectively. Left-aligned, no misalignment.
- [ ] **Intro paragraph — music noise** — The music noise intro paragraph text contains "L**10,15min**" and "L**90,15min**" with subscript "10,15min" / "90,15min". These are legible at the 9 pt body font size.
- [ ] **Non-descriptor text unchanged** — Text that does not contain an L-descriptor (e.g. "Location", "Zone", frequency numbers, criteria values) renders identically to before — no unintended reformatting.
- [ ] **Row heights not clipped** — No cell has its bottom text line clipped by the cell border. Row auto-heights accommodate the subscript descender correctly (the subscript sits within the top-padding + cap-height zone and does not extend past the cell floor).

### PDF export — running logo header and page geometry

- [ ] **Logo on every page** — Export appendix with enough content to produce 2+ pages. Open the PDF. Resonate logo appears at top-left of **every** page (page 1, page 2, …), not just the first.
- [ ] **Logo position and size** — Logo is approximately 5.29 cm wide and sits exactly **2 cm** from the top edge of each page (measure from page top to top of logo), aligned with the left content margin.
- [ ] **Body text clears logo** — No body text or heading overlaps the logo. Visible gap (~10.58 mm / 30 pt) between the bottom of the logo and the first line of content.
- [ ] **Logo crisp at 100% zoom** — Open exported PDF in Acrobat at 100%. Resonate logo text and mark are sharp with clean edges — no pixelation or blur.
- [ ] **Logo crisp at 200% zoom** — Zoom to 200% in Acrobat. Logo remains crisp; text edges are clean. (2× canvas upsample → 1632 × 612 px → ~784 DPI at 5.29 cm — should be clean at 200%.)
- [ ] **Logo crisp at 400% zoom** — Zoom to 400%. Some softening acceptable (raster source); no severe staircase pixelation on letter curves.
- [ ] **Logo colour correct** — Yellow matches Resonate brand colour (#F2CB00); no colour shift from canvas re-encode.
- [ ] **Page numbers on every page** — Every page shows "N / Total" centred at the bottom (e.g. "1 / 3", "2 / 3"). Format is `page / total`, not just a page number.
- [ ] **No cover page** — PDF opens directly at the Criteria content; there is no blank or title-only cover page. Logo is on the first content page.

### PDF export — keep-with-next and pagination

- [ ] **No orphaned H2 headings** — With minimal content (only Zoning + Environmental noise policy sections), verify that no H2 heading appears as the last element on a page with its content starting on the next page. If the heading + intro + table won't fit together, the entire block starts on the next page.
- [ ] **Zone map figure not split** — If the zone map image is tall, the entire zone map block (H2 + intro + figure) moves to a new page rather than splitting the image across pages.
- [ ] **Tall criteria table paginates** — Place ≥8 receivers (to force a multi-page table). Export appendix. On the second (and subsequent) criteria table pages: (a) **no caption** at the top — header row starts immediately at the top margin; (b) gold header row repeats immediately below the top margin; (c) table data continues correctly without gaps or duplicate rows; (d) no content overflows below the bottom margin.
- [ ] **Repeated header row styling** — Repeated header row uses the same Resonate yellow background `[242,203,0]` and bold black text as the original header row — not plain white.
- [ ] **Single-page table — no spurious page break** — With 1–3 receivers, the criteria table fits on one page. No blank page inserted before or after the table.
- [ ] **All active conditional sections paginate correctly** — Enable emergency + music + childcare, place 6 receivers. Export. All six sub-sections appear; none has an orphaned heading; each section block starts cleanly on a new page if it would otherwise overflow.

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

## Per-Region Ground Factor (Gs / Gm / Gr)

1. **Toggle off — baseline unchanged** — With `groundFactorPerRegion.enabled = false` (default), confirm the predicted level at any receiver is identical to the pre-feature result using the same scalar G value. Verify: the "Per-region G (advanced)" checkbox in the Propagation map panel is unchecked, the Gs/Gm/Gr row is hidden, and `_effectiveGroundFactor()` returns the scalar `iso_groundFactor`.

2. **Uniform Gs = Gm = Gr — matches scalar** — Check the "Per-region G (advanced)" checkbox. Set Gs = Gm = Gr to the same value as the current scalar G (e.g. all to 0.5). Predicted level must be identical to the scalar G result within floating-point precision. This validates the three-region path produces the same output as the scalar path when all three values are equal.

3. **Mixed Gs / Gm / Gr — intermediate result** — Set Gs = 0 (hard), Gm = 0.5 (mixed), Gr = 1.0 (soft). Predicted level must lie strictly between the result for scalar G = 0 (all hard) and scalar G = 1 (all soft). Inspect per-band Agr: source-region bands should show hard-ground attenuation, receiver-region bands should show soft-ground attenuation.

4. **Save → reload round-trip** — Enable per-region mode, set Gs = 0, Gm = 0.5, Gr = 1.0. Save Assessment JSON. Close tab / reload. Load the saved file. Verify: checkbox is checked, Gs/Gm/Gr dropdowns match 0 / 0.5 / 1.0, predicted levels are byte-identical to pre-save, and `localStorage('iso_perRegion')` contains `{"enabled":true,"Gs":0,"Gm":0.5,"Gr":1}`.

5. **Backward-compat: v2 file synthesises correct defaults** — Open a `_version: 2` file (no `groundFactorPerRegion` key in `data.propagation`). After load: checkbox is unchecked, Gs/Gm/Gr are initialised to the loaded scalar G value, and predicted levels are unchanged. The re-saved file will have `_version: 3` and a `groundFactorPerRegion: { enabled: false, Gs: G, Gm: G, Gr: G }` block.

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

212. **Namespace** — `window.importGis` and `window.parseGisFile` are `undefined`. `window._gisImport.importGis` is a function. `window._gisImport.importGisFiles` is a function. Toolbar button still imports correctly.

213. **No console errors** — After all GIS import tests, console has zero errors.

---

### GIS Import — Loose files, EPSG override, reprojection (added April 2026)

214. **Zip regression** — Import an existing `.zip` shapefile. Features land in the same place as before (no regression). If `.prj` is present, CRS block shows "Detected: …" with matched EPSG. Import button enabled.

215. **Loose .shp — with .prj** — Select `.shp` + `.dbf` + `.shx` + `.prj` together via the file picker (all four files). Import succeeds; CRS block shows detected EPSG; features appear at the correct WGS84 location.

216. **Loose .shp — without .prj** — Select `.shp` + `.dbf` + `.shx` only (no `.prj`). CRS block shows the "No .prj file" warning in amber. Import button is disabled until a CRS is selected from the dropdown. After selecting (e.g. EPSG:7854), Import button enables and import succeeds.

217. **Missing required component** — Select only `.shp` + `.dbf` (no `.shx`). Alert shows: _"Shapefile import requires .shp, .dbf and .shx files for [basename]. Missing: .shx."_ Import does not proceed.

218. **Drag-and-drop — loose files** — Drag a group of unzipped shapefile files onto the "Import GIS file" button. Same CRS-selection flow as file picker.

219. **Drag-and-drop — single zip** — Drag a `.zip` shapefile onto the map canvas. Same import flow as file picker.

220. **Drag-and-drop — GeoJSON** — Drag a `.geojson` file onto the map canvas. GeoJSON import proceeds unchanged (no CRS block shown in modal).

221. **Override detected CRS** — Import a shapefile where `.prj` is present and EPSG is auto-detected. Tick "Override detected coordinate system". Dropdown becomes visible; select EPSG:4326. Features land at incorrect (raw northing/easting) location, confirming the override is honoured.

222. **MGA Zone 54 reprojection accuracy** — Import an MGA Zone 54 shapefile (EPSG:7854) with no `.prj`, select EPSG:7854 in the dropdown. A known point (e.g. easting 322,000 / northing 6,100,000) should appear within ≤1 m of its expected WGS84 coordinate on the basemap.

223. **Other EPSG — fetch from epsg.io** — Enter "Other EPSG" code 32754 (UTM Zone 54S). Look-up button fetches from epsg.io; status shows "✓ EPSG:32754 registered." Import proceeds correctly.

224. **Other EPSG — served from localStorage cache** — After test 223, take the network offline (DevTools → offline). Re-open a new import and enter EPSG:32754 again. Succeeds from cache without a network request.

225. **Invalid EPSG** — Enter EPSG code 99999. Status shows "Could not retrieve EPSG:99999. Check the code or your network connection." Import button remains disabled.

226. **Last-used EPSG pre-select** — After importing with EPSG:7854, open a new shapefile import with no `.prj`. EPSG:7854 is pre-selected in the dropdown with "(last used)" hint.

227. **Save → reload round-trip** — Import shapefile objects with reprojection. Save assessment JSON → reload. Imported objects preserved at the same WGS84 coordinates. (Coordinates are stored post-reprojection in the tool's data structures, so round-trip is unaffected.)

228. **Override toggle clears CRS and disables Import** — Import a shapefile with a valid `.prj` (auto-detected to e.g. EPSG:28354). Confirm Import button is ENABLED. Tick "Override detected coordinate system" → dropdown becomes visible, dropdown value is blank, and Import button is **DISABLED**. Pick EPSG:7854 from the dropdown → Import button is ENABLED and honours EPSG:7854. Untick override → dropdown hides, Import button remains ENABLED with EPSG:28354 restored.

229. **3D shapefile notice** — Import a PointZ or LineStringZ shapefile (any file with Z coordinates in vertex data). Confirm an inline notice appears under the CRS block reading "This shapefile contains Z (elevation) values. They will be ignored — set object heights using the height fields after import." Confirm import succeeds and the resulting placed features have no Z component in their stored coordinates. Confirm the notice does **not** appear when importing a 2D shapefile. If a multi-layer zip contains one 3D layer and one 2D layer, the notice appears only on the 3D layer block.

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

## Terrain Diffraction — Gap 7 closure (Deygout single-point receiver)

Tests for the April 2026 wiring of `SharedCalc.terrainILPerBand` into the single-point receiver path. Requires terrain enabled and a site with measured ridge elevation (or a synthetic test using the console).

### Multi-ridge convergence

Prerequisites: ISO 9613-2 method, terrain enabled, a source and receiver ~400 m apart with two visible terrain ridges along the path (both protruding at least 2 m above the direct line of sight), LiDAR or SRTM coverage at the site.

1. **Place source and receiver** — Source A at one end, Receiver R1 at B, ~400 m apart. Ensure the terrain profile panel shows two distinct humps above the LOS line.

2. **Record single-point receiver Lp** — After the terrain IL cache updates (`updateTerrainIL` resolves), note the predicted Lp from the compliance strip or receiver panel, to 0.1 dB.

3. **Compute noise map** — Run the heatmap at the same propagation settings. Record the grid cell value at the receiver coordinates.

4. **Verify convergence** — Pass criterion depends on shadow width relative to grid spacing:
   - **Broad shadow scenario** (terrain shadow width > ~4× the heatmap grid spacing): heatmap and receiver panel must agree within **0.5 dB**.
   - **Narrow shadow scenario** (shadow width ≤ ~2× grid spacing, e.g. receiver just behind a small hill crest): divergence of up to ~6 dB is **currently expected** due to the heatmap terrain-IL Gaussian smoothing (noise-worker.js:~329–426, σ = 0.5 cell). The receiver panel value is authoritative — the always-visible Lp badge on each receiver marker shows the panel value on the map. Document the divergence and note it is a partially-resolved known characterisation behaviour (changelog.md April 2026 Known Issues).

5. **No console errors** — `console.error` or uncaught exceptions absent during heatmap computation and receiver panel update.

### Single-ridge backward-compatibility

Prerequisites: same setup but only one ridge between source and receiver.

1. **Single-ridge scenario** — One ridge protruding 2-5 m above LOS. No secondary ridges along the path.

2. **Record new Lp** — After update, note predicted Lp.

3. **Compare against pre-Deygout reference** — For a 3 m ridge at 200 m on a 400 m path with flat terrain otherwise, the pre-Deygout single-ridge implementation would have returned approximately 10-12 dB terrain IL at 1 kHz. The new Deygout single-edge result should agree within **0.5 dB** (both use the same Fresnel delta approximation; agreement is typically < 0.1 dB for single-edge cases).

4. **Verify convergence with heatmap** — For a broad single ridge (shadow width > ~4× grid spacing), heatmap value at receiver coordinates matches single-point Lp within **0.5 dB**. For a narrow ridge shadow (width ≤ ~2× grid spacing), divergence up to ~6 dB is currently expected (reduced from ~10 dB after σ = 1.0 → 0.5) — see Known Issues in changelog.md April 2026.

5. **No console errors.**

### Narrow shadow divergence — characterisation test

This is a **characterisation test** of current behaviour (partially resolved). Option B' reduced σ from 1.0 to 0.5; maximum narrow-shadow divergence is now ~3–6 dB. Option C (receiver Lp badge) makes the authoritative panel value visible on the map without hover. Convert to a strict pass/fail test (criterion ≤ 0.5 dB) only if full smoothing removal is implemented.

Prerequisites: ISO 9613-2 method, terrain enabled, a source and receiver separated by a terrain feature whose shadow zone is narrow (width ≤ 2× the heatmap grid spacing at the test grid resolution).

1. **Set up scenario** — Place source on one side of a small hill or ridge crest. Place receiver R1 in the centre of the shadow zone, directly behind the crest. Confirm the terrain profile panel shows the ridge above the LOS.

2. **Record receiver panel terrain IL** — In the browser console:
   ```javascript
   console.log('Exact terrain IL:', window._terrainIL[0][1]);
   // Expect insertionLoss_dB ≥ 15 dB at 1 kHz for a meaningful ridge
   ```

3. **Verify receiver Lp badge** — The Lp badge below R1's map marker should show the same rounded value as the compliance strip for that receiver. Confirm it updates immediately when source levels change.

4. **Compute noise map** — Run the heatmap at the same propagation settings. Record the grid cell colour / value at R1's coordinates.

5. **Characterise divergence** — Expected behaviour post-Option B':
   - Receiver panel / Lp badge: high terrain IL (≥ 15 dB at 1 kHz) → lower predicted Lp (e.g. ~36 dB)
   - Heatmap at R1's grid cell: smoothed lower terrain IL → higher colour band (e.g. ~39–42 dB)
   - Divergence of ~3–6 dB is currently expected for narrow shadows at default 50 m grid spacing (was 5–12 dB at σ = 1.0)

6. **Document** — Record the measured divergence (receiver panel Lp, heatmap Lp, difference) in the test run log.

7. **No console errors.**

### Receiver Lp badge

Prerequisites: one or more receivers placed, at least one source with Lw data entered.

1. **Badge visible** — Each placed receiver (R1–R4) shows a small label below its circle icon with a predicted level (e.g. "36 dB"), colour-matched to the receiver.

2. **Value matches compliance strip** — The rounded dB value shown in the badge matches the worst-case (highest) predicted level across Day / Eve / Night shown in the compliance strip for that receiver.

3. **Placeholder on first placement** — Immediately after placing a receiver (before `render()` has run with source data), the badge shows "…".

4. **Updates on change** — Changing source Lw, enabling/disabling terrain, or adding/removing sources causes the badge to update to the new rounded prediction.

5. **Drag follows badge** — Dragging a receiver to a new position: the badge moves with the receiver circle and shows "…" briefly while terrain updates, then updates to the new predicted level.

6. **Visibility toggle** — Clicking the pins toggle (eye icon) hides all markers including receiver Lp badges; toggling back restores them.

7. **No console errors.**

### Terrain IL Gaussian smoothing — spike regression (automated)

Covered by the vitest suite: `iso17534.test.js` — describe block "Terrain IL Gaussian smoothing — σ=0.5 spike regression".

Tests:
- Kernel weights sum to 1.0 (normalisation)
- Open-field (all-zero input) produces zero output — no spurious IL
- Isolated spike cell (20 dB amid zeros) leaves zero spike cells after smoothing
- 1-cell shadow IL retention ≥ 70% at centre
- 5-cell broad shadow IL retention ≥ 85% at centre

Run: `npm test` (all 5 tests included in the 238-test suite as of April 2026).
