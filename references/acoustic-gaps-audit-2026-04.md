# Acoustic Calculation Gaps Audit — 2026-04

**Assessment date:** 25 April 2026
**Tool:** SA EPA Noise Calculator (vanilla JS, single-page app)
**Scope:** 10 identified gaps from ISO 9613-2 / ISO/TR 17534-3 compliance framework
**Methodology:** Code search and functional inspection across `shared-calc.js`, `index.html`, `iso17534.test.js`, `noise-worker.js`

---

## Gap 1 — Cmet (Meteorological Correction)

- **Status:** no
- **Location:** `shared-calc.js` → `calcBarrierAttenuation()` lines 241–266
- **Current behaviour:** Barrier attenuation (Maekawa diffraction) hardcodes `Kmet = 1` with no downwind vs long-term mode selector. No Cmet term is fed into the ISO propagation chain. The isoParams object has no Cmet placeholder field.
- **Adjacent hooks:** CONCAWE K4 correction is fully implemented (lines 1139–1146); Pasquill stability class is available (lines 1177–1230). These structures could provide the meteorological data path if an ISO long-term mode were added.
- **Effort:** Medium — CONCAWE K4 logic already exists as a parallel path; the work is (1) a mode UI selector (downwind / long-term), (2) metCategory → Cmet lookup table, and (3) integration into `calcBarrierAttenuation` and `calcISOatPoint`.

---

## Gap 2 — Per-Region Ground Factor (Gs / Gm / Gr)

- **Status:** partial
- **Location:** `shared-calc.js` → `calcAgrPerBand()` lines 79–147; `calcAgrBarrier()` lines 163–197
- **Current behaviour:** The calculation engine fully supports a `{Gs, Gr, Gm}` object (lines 82–88) and ISO/TR 17534-3 T04 passes within ±0.5 dB. However, the public API only ever supplies a single scalar `G` — the three-region split never reaches `calcAgrPerBand`. The `groundZones[]` polygon layer exists but is not sampled along the propagation ray.
- **Adjacent hooks:** `groundZones[]` array with `G` attribute per polygon; point-in-polygon check for zone detection already used elsewhere (zone classification). UI is a scalar-only dropdown with no three-region panel. Save/load schema has no `{Gs, Gr, Gm}` fields.
- **Effort:** Small — The calculation engine is complete. Remaining work: (1) extend save/load JSON to carry `{Gs, Gr, Gm}`, (2) add an "Advanced Ground" UI panel with three sliders or a ray-sampling toggle, (3) optionally wire `groundZones[]` for automatic per-region derivation from drawn polygons.

---

## Gap 3 — Source Directivity (Dc)

- **Status:** no
- **Location:** No Dc function found in `shared-calc.js` or `index.html`
- **Current behaviour:** No directivity term appears anywhere in the ISO propagation chain. Point sources have no orientation or azimuth field. Building source spectra are broadband + octave only with no per-band directivity weighting.
- **Adjacent hooks:** `getDominantReflection()` (line 1002) uses a cosine dot-product on a wall-edge normal — the same geometric primitive needed for source directivity. CoRTN road traffic applies a simplified broadband angle-of-view proxy (`angleOfView_deg`, `index.html` line 13614) which is conceptually analogous.
- **Effort:** Medium — Requires: (1) add an `orientation` / azimuth field to point-source and building-source data structures, (2) implement a per-band cardioid or cosine directivity model (ISO 9613-2 §7.6), (3) add a UI angle input or rotation handle, (4) wire Dc into `calcISOatPoint`.

---

## Gap 4 — Multiple Barrier Diffraction

- **Status:** scaffolded only
- **Location:** `shared-calc.js` → `getDominantBarrier()` lines 375–541; `getIntersectingEdges()` line 340; `calcBarrierWithEndDiffraction()` lines 553–576
- **Current behaviour:** `getIntersectingEdges()` returns all edges that cross the source–receiver path, but `getDominantBarrier()` discards all except the one closest to the path midpoint (lines 382–390). Only that single edge feeds into Maekawa diffraction. The comment at line 371–372 notes this is "a deliberate performance trade-off."
- **Adjacent hooks:** `getIntersectingEdges()` already enumerates all candidate edges — that loop is the natural extension point. `calcBarrierWithEndDiffraction()` already energy-sums multiple path contributions; it could be called per-edge in a multi-edge loop.
- **Effort:** Large — Requires: (1) iterate all intersecting edges rather than discarding, (2) compute Maekawa delta for each edge individually, (3) combine by energy sum per band (ISO 9613-2 Annex B), (4) significant grid-worker O(n²) cost requires performance profiling.

---

## Gap 5 — Amisc (Afol Vegetation, Ahouse Housing)

- **Status:** no
- **Location:** Not found anywhere in the codebase
- **Current behaviour:** No vegetation-belt (Afol) or housing-cluster (Ahouse) attenuation is implemented. Total propagation loss is the ISO 9613-2 equation (12) sum only; no insertion-loss layer for foliage or residential-area screening.
- **Adjacent hooks:** `groundZones[]` polygon layer could be extended with a `type` attribute (e.g. `vegetation`, `housing`). No vegetation species library, height/density model, or housing-cluster density selector exists.
- **Effort:** Large — Requires: (1) new data model for vegetation belts (species, height, density, depth), (2) foliage IL lookup per ISO 9613-2 Annex A.1 (10–30 dB/100 m range), (3) housing-cluster model (Annex A.2), (4) ray-sampling to identify zones crossed, (5) per-band Amisc accumulation and integration into `calcISOatPoint`.

---

## Gap 6 — Building Source +6 dB Hardcoding

- **Status:** yes (hardcoded, not user-configurable)
- **Location:** `index.html` → `_bsCalcDerived()` approximately lines 32671–32679
- **Current behaviour:** Hemisphere correction is hardcoded as `hemCorrection = 6` dB and applied uniformly to all wall and roof façades. There is no user-configurable room constant, interior absorption coefficient, or alternative reverberation model (e.g. Sabine / Eyring).
- **Adjacent hooks:** `buildingSources` objects carry an `interiorLp` field (no `interiorAbsorption`). `roofConstruction` carries `Rw` and octave `R` values for insulation only. The UI has an "Interior Lp" numeric input but no "Room Absorption" control.
- **Effort:** Small — Replace the hardcoded constant with a Sabine formula: (1) add `interiorAbsorption` (α·S or equivalent) to the `buildingSources` data structure, (2) compute `hemCorrection = 10·log10(1 + α·S/A)` or similar, (3) add a UI input for absorption, (4) extend save/load. Arithmetic chain is otherwise unchanged.

---

## Gap 7 — Single Ridge Terrain Screening

- **Status:** partial
- **Location:** `shared-calc.js` → terrain/elevation logic in `calcBarrierAttenuation()` lines 241–266; elevation sampling in `noise-worker.js`
- **Current behaviour:** Elevation is sampled at source and receiver endpoints only. A single dominant ridge is identified implicitly via the barrier geometry rather than explicit profile sampling. No multi-point elevation profile traversal or Deygout multi-edge chaining (ISO 9613-2 Annex B) is implemented.
- **Adjacent hooks:** Terrain elevation fetch exists (`_fetchVertexElevations`, `DEMCache`). The `calcISOatPoint` function signature includes a `terrainILPerBand` parameter (approximately line 607) that defaults to `null`, indicating a clean extension point. Custom building outlines can be manually drawn as surrogate ridges.
- **Effort:** Medium — Requires: (1) sample elevation at N interpolated points along the source–receiver path, (2) identify local maxima (ridges) from the profile, (3) apply Deygout chaining per ISO 9613-2 Annex B for each ridge, (4) energy-sum per band. Infrastructure for single-ridge is already present; extension to multi-ridge is incremental.

---

## Gap 8 — Reflections (1st Order, Single Dominant)

- **Status:** yes (1st order single reflection implemented; 2nd order not implemented)
- **Location:** `shared-calc.js` → `getDominantReflection()` lines 944–1013
- **Current behaviour:** ISO 9613-2 §7.5 image-source method, 2D horizontal plane only. Selects the single dominant reflection (shortest reflected path = strongest contribution). Reflection coefficient ρ = 1 hardcoded (fully reflective, no absorption). Grazing cutoff at 80° (line 947). Returns the first-found shortest path among equals (line 1007).
- **Adjacent hooks:** `getDominantReflection` is exposed in the `SharedCalc` API (approximately line 1446). CoRTN road traffic uses it as a simplified broadband proxy. Buildings have no `absorptionCoeff` field — only `Rw` for airborne insulation. A 2nd-order reflection would require a recursive call passing the image-source position back into the same function.
- **Effort:** Medium — Extend to: (1) add a per-edge `absorptionCoeff` field (ρ < 1), (2) implement recursive 2nd-order image-source (call `getDominantReflection` on the 1st-order image position with a depth limit), (3) energy-sum per band, (4) apply a distance threshold cutoff. The 1st-order code path is already complete and reusable.

---

## Gap 9 — Ground-Barrier Interaction (Agr / Abar Combined)

- **Status:** yes (ISO 9613-2 §7.4 fully implemented)
- **Location:** `shared-calc.js` → `calcAgrBarrier()` lines 163–197; `calcISOatPoint()` lines 607–666
- **Current behaviour:** Full §7.4 insertion-loss formulation. When a barrier is present, Agr is recomputed along the source→barrier-top and barrier-top→receiver sub-paths via `calcAgrBarrier`. The combined term is `max(Dz, Agr_subpath)` per band (approximately line 656), correctly replacing rather than simply adding Agr. ISO/TR 17534-3 T09 was tightened from ±1.0 dB to ±0.25 dB after this fix.
- **Adjacent hooks:** `barrierInfo {d1, d2, hBar}` in function signature. `calcBarrierWithEndDiffraction` already energy-sums multiple paths using this combined term. ISO §7.4 form documented in comments at approximately lines 626–627.
- **Effort:** Small (implementation complete) — No further work required for the core interaction. Residuals may shift slightly if Cmet (Gap 1) or per-region G (Gap 2) are later added; re-validate T08/T09/T11 at that point.

---

## Gap 10 — ISO/TR 17534-3 T08 / T09 / T11 Conformance

- **Status:** yes (test cases implemented and passing within tolerance)
- **Location:** `iso17534.test.js` lines 229–457; `shared-calc.js` lines 79–1013
- **Current behaviour:** Three validation cases are implemented with Cartesian geometry inputs:
  - **T08 (long barrier, ground both sides):** Reference 32.48 dB; current residual ±0.6 dB. Dz matches within ±0.5 dB across octave bands (lines 280–293).
  - **T09 (short barrier, §7.4 ground-barrier interaction):** Reference 32.93 dB; residual tightened to ±0.25 dB post-fix (lines 331–343).
  - **T11 (cubic building, double diffraction, 3 paths):** Reference 41.30 dB; residual ±1.0 dB. Uses frequency-dependent C3, 25 dB cap, and 3-path energy sum (lines 410–456).
  Per-band residuals are present in test comments. Test inputs are hardcoded Cartesian coordinates; the lat/lng pipeline is not exercised.
- **Adjacent hooks:** A-weighting applied at output only. Test comments identify which bands carry the largest residual. No per-band residual output in the run-validation UI — broadband only.
- **Effort:** Small (implementation complete) — Current tolerances are acceptable for ISO 9613-2 engineering use. Future additions of Cmet (Gap 1) or per-region G (Gap 2) will shift residuals; re-run T08/T09/T11 after each. Investigate the T11 ±1.0 dB residual if tighter conformance is required: candidates are Fresnel zone approximation for z, C3 polynomial coefficients, and region-extent averaging for G.

---

## Recommended Sequencing

### Priority rationale

Gaps are ordered by: (1) effort vs acoustic impact from `soundplan-comparison.md`, (2) logical dependency (downstream gaps unblocked by upstream ones), (3) shared infrastructure (co-implement where code paths overlap).

---

### Tier 1 — Foundation (Small effort, unlocks other gaps)

| # | Gap | Effort | Impact | Notes |
|---|-----|--------|--------|-------|
| 1 | Gap 2: Gs / Gm / Gr UI + save/load | Small | ±1–2 dB | Engine complete; only UI and JSON schema needed. Must precede Gap 9 re-validation. |
| 2 | Gap 6: Parametric interior absorption (replace +6 dB) | Small | <1 dB | Standalone, no dependencies. Low risk. |

---

### Tier 2 — Enhanced Barriers and Terrain (Medium–Large effort, high acoustic impact)

| # | Gap | Effort | Impact | Notes |
|---|-----|--------|--------|-------|
| 3 | Gap 7: Multi-ridge Deygout terrain screening | Medium | ±1–3 dB | Infrastructure (elevation fetch, single-ridge) already present. Implement before Gap 4 as they share the Maekawa path. |
| 4 | Gap 4: Multiple barrier diffraction | Large | ±1–5 dB | Implement after Gap 7 — both extend the same diffraction engine. Profile grid-worker performance impact before committing. |

---

### Tier 3 — Advanced Physics (Medium effort, moderate impact)

| # | Gap | Effort | Impact | Notes |
|---|-----|--------|--------|-------|
| 5 | Gap 1: Cmet downwind vs long-term mode | Medium | ±1–3 dB | Orthogonal to other gaps. Add after Tier 2 so validation suite re-run is not repeated. |
| 6 | Gap 3: Dc source directivity | Medium | ±0.5–3 dB | Orthogonal. Implement after data-structure changes in Gap 2 and Gap 6 settle. |
| 7 | Gap 8: 2nd-order reflections + configurable ρ | Medium | ±0.5–1.5 dB | Depends on Gap 6 for absorption coefficient; reuses existing 1st-order path. |

---

### Tier 4 — Specialised (Large effort, situational impact)

| # | Gap | Effort | Impact | Notes |
|---|-----|--------|--------|-------|
| 8 | Gap 5: Amisc vegetation and housing belts | Large | ±1–10 dB (site-specific) | No existing infrastructure. Highest implementation cost; only relevant when vegetation belts are explicitly present. Implement last. |

---

### Gaps already complete — maintain with re-validation only

- **Gap 9** (Agr/Abar interaction §7.4) — complete; re-validate T09 after Gap 2 changes.
- **Gap 10** (ISO/TR 17534-3 T08/T09/T11) — passing within tolerance; re-run suite after each Tier 1–3 gap is implemented.
