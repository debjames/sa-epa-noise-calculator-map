# CLAUDE.md — Resonate Environmental Noise Screening Tool

## Project

Browser-based environmental noise assessment tool implementing ISO 9613-2 propagation for Australian multi-state acoustic assessments (SA, VIC, NSW).

- **Repo:** `https://github.com/debjames/sa-epa-noise-calculator-map`
- **Live:** `https://debjames.github.io/sa-epa-noise-calculator-map/`
- **Stack:** Vanilla JavaScript, Leaflet.js, no npm/build step, deployed via GitHub Pages
- **Benchmark:** SoundPLAN — features must be acoustically defensible against it

## Before Making Any Changes

1. Read `references/architecture.md` — file structure, data structures, UI layout
2. Read the relevant reference file for the area being changed:
   - `references/calculations.md` — propagation, ISO 9613-2, barriers, terrain, ground effect
   - `references/sa-criteria.md` — SA Noise Policy, INL, land use categories, clauses 5(4)/5(5)/5(6)
   - `references/vic-criteria.md` — VIC EPA Pub 1826.5, IF, zone types, LGA overrides
   - `references/nsw-criteria.md` — NSW NPI, RBL, amenity, intrusiveness, sleep disturbance
3. Read `references/soundplan-comparison.md` if touching propagation or calculation logic

## Guard Rails

- **NEVER** modify propagation formulas without verifying against ISO 9613-2 equations in `references/calculations.md`
- **NEVER** remove or weaken barrier/terrain screening without explicit user request
- **NEVER** change criteria logic for one state in a way that affects another state
- **NEVER** silently change a formula — if code differs from the reference doc, flag it and ask
- If uncertain whether a change is acoustically correct, **stop and ask** — do not guess at acoustic engineering decisions

## Coding Conventions

- No build step — all vanilla JS, no npm, no bundling
- Single-page app — everything loads from `index.html`
- Web Workers for heavy calculation (noise map grid)
- GeoTIFF tiles fetched as 100×100px chunks (cannot handle internally-tiled TIFFs)
- All new UI elements must be consistent with existing panel styling (check adjacent panels)
- Keep functions focused — one logical purpose per function

## Key Rules for Every Change

1. **Save/load integrity** — Any new state MUST be serialised in Save Assessment JSON (`_format: 'resonate-noise-tool'`, `_version: 2`). Verify save → load round-trip preserves all state.
2. **No silent regressions** — Verify adjacent functionality still works after changes
3. **Multi-state independence** — SA, VIC, and NSW criteria logic are independent modules. Changes to one must not affect others.
4. **Terrain awareness** — Any geometry change must consider terrain re-fetch if terrain is enabled
5. **Simple/ISO convergence** — When ground factor G=0, ISO method should match simple method. Check this after propagation changes.

## After Making Changes

1. Run the ISO/TR 17534-3 in-app validation if propagation was touched (click "Run validation" in Propagation method panel)
2. Verify save → load round-trip preserves all state
3. Test simple vs ISO convergence (G=0 should match simple)
4. For propagation/calculation changes: re-verify against SoundPLAN benchmark scenarios in `references/uat-tests.md` §3
5. Check for console errors

### Update reference files

After implementation, update the relevant reference files in `references/`:

| File | Update when... |
|------|---------------|
| `changelog.md` | Always — add a bullet under the current month |
| `architecture.md` | New files, data structures, UI layout changes, new APIs |
| `calculations.md` | Propagation, barrier, terrain, or screening logic changed |
| `sa-criteria.md` / `vic-criteria.md` / `nsw-criteria.md` | Criteria derivation, zone logic, or policy references changed |
| `uat-tests.md` | Always — add test cases for new functionality |
| `soundplan-comparison.md` | Known difference fixed, new simplification introduced, or comparison results recorded |

Only update files relevant to the change — do not rewrite unchanged files.

## Communicate Clearly

After every implementation, state:
- What was changed (files, functions, behaviour)
- What was NOT changed (adjacent functionality confirmed intact)
- Manual verification steps the user should perform
- Whether SoundPLAN benchmark re-run is needed

## Key Data Structures

See `references/architecture.md` for full details. Core structures:

- `sourcePins[]` — point sources with octave-band spectra per period
- `lineSources[]` — road/rail with per-period movements
- `areaSources[]` — polygon area sources
- `buildingSources[]` — buildings with interior Lp and facade/roof construction
- `userBarriers[]` — noise barriers with height and base elevation
- `customBuildings[]` — building polygons for screening
- `groundZones[]` — ground absorption zones (G = 0–1)
- `markers` / `zones` / `recvPenalties` — receiver positions, zone classifications, character penalties

## External APIs

| API | Purpose |
|-----|---------|
| SAPPA | SA zone detection |
| VicPlan | VIC zone detection + LGA |
| NSW Planning Portal | NSW zone detection (LEPs/SEPPs) |
| Geoscience Australia WCS | 5m LiDAR DEM |
| Open-Elevation | SRTM 30m fallback DEM |
| Overpass API | OSM building footprints |
| Nominatim | Geocode / reverse geocode |
| SA DIT Speed Zones | Road speeds for MBS 010 |

## Reference Files

All in `references/` — read the relevant ones before starting work:

- `architecture.md` — codebase structure, data structures, UI layout
- `calculations.md` — ISO 9613-2 formulas, barrier diffraction, terrain screening
- `sa-criteria.md` / `vic-criteria.md` / `nsw-criteria.md` — state-specific noise policy
- `soundplan-comparison.md` — known differences from SoundPLAN, acceptable tolerances
- `uat-tests.md` — standard test cases, SoundPLAN benchmark scenarios
- `changelog.md` — recent changes and known issues
