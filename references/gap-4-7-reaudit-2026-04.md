# Gap 4 & 7 Re-audit — April 2026

**Purpose:** Re-audit acoustic gaps 4 (multiple barrier diffraction) and 7 (single-ridge terrain screening) following confirmation that ISO/TR 17534-3 T11 and T08 pass the node suite. Determine whether test passage implies the gaps are closed in user-facing paths. Read-only — no source code was modified.

---

## Summary

**Gap 4 — Multiple barrier diffraction:** T11 passes because the test bypasses the engine's barrier-selection logic entirely, calling `calcBarrierAttenuation` directly with pre-computed geometry. All user-facing paths remain single-dominant-barrier via `getDominantBarrier()`. Gap 4 is **NOT closed**.

**Gap 7 — Single-ridge terrain screening:** The noise map grid worker (`noise-worker.js`) implements full Deygout 3-edge terrain screening — Gap 7 is **closed for grid computation**. The single-point receiver path in `index.html` still uses a single dominant ridge and single-ridge Maekawa — Gap 7 is **still open for single-point receivers**.

---

## Gap 4 — Multiple barrier diffraction

### ISO test path (T11)

`iso17534.test.js` lines 328–399. The test defines a building with thickness `e = 10 m`, pre-computes three path length differences:

```javascript
const z_top    = 7.882;   // over top edge
const e        = 10;      // building thickness (double-diffraction path)
const z_lateral = 4.14;   // around left/right vertical edges
```

It then calls `calcBarrierAttenuation` directly — once for the top path and once for each lateral path — and manually energy-sums the three results in the test body:

```javascript
var Abar_top = calcBarrierAttenuation(z_top, OCT_FREQ, true, e);
var Abar_lat = calcBarrierAttenuation(z_lateral, OCT_FREQ, false, e_lateral);
// linSum = 10^(-IL_top/10) + 2*10^(-IL_lat/10)
```

**`getDominantBarrier()` is never called.** The multi-edge energy summation is implemented entirely inside the test, not inside any engine function that user-facing code calls.

### User-facing barrier path

All four call sites follow an identical pattern:

| File | Line | Call |
|------|------|------|
| `index.html` | ~10879 | `getDominantBarrier(srcLL, recLL, srcH, recH, screenable)` |
| `index.html` | ~11115 | `getDominantBarrier(srcLL, recLL, srcH, recH, screenable)` |
| `index.html` | ~11375 | `getDominantBarrier(srcLL, recLL, srcH, recH, screenable)` |
| `noise-worker.js` | ~647 | `getDominantBarrier(srcLL, recLL, srcH, recH, screenable)` |

`getDominantBarrier()` (`shared-calc.js` lines 375–507):

1. Calls `getIntersectingEdges()` — returns **all** intersecting edges from all buildings and barrier polylines.
2. Selects **one** dominant edge by midpoint-distance heuristic (lines 384–390).
3. Returns a single `barrierInfo` object.

The comment at `shared-calc.js` line 372 explicitly documents the limitation:

> "may under/overestimate in multi-barrier scenarios. This is a deliberate performance trade-off."

`calcBarrierWithEndDiffraction()` (`shared-calc.js` lines 553–576) then energy-sums top/left/right paths for that **one barrier only**.

### Thought experiments

**Experiment A — Two separate `userBarriers` polylines in series:**
A source at origin, a receiver 200 m away, two barrier polylines at 60 m and 140 m. `getIntersectingEdges()` returns edges from both polylines. `getDominantBarrier()` selects one by the midpoint-distance heuristic (whichever midpoint is closer to the source–receiver midpoint). The second barrier is discarded. Combined IL is the IL of the selected barrier alone — the additional screening of the second barrier is not applied. **Under-prediction.**

**Experiment B — One wide building with thick walls (T11 scenario):**
A single building polygon produces edges at entry and exit faces. `getDominantBarrier()` selects the dominant edge. `calcBarrierWithEndDiffraction()` receives that single `barrierInfo` and applies `calcBarrierAttenuation` with `e > 0` (building thickness), triggering the C3 double-diffraction correction. Top + lateral paths are energy-summed. **This sub-case works correctly** — the double-diffraction correction covers the thick-building case through `calcBarrierAttenuation`'s `e` parameter.

### Verdict

**BUILDING-ONLY (partially working, not fully closed).**

- Double-diffraction through a single thick building: **working** — handled by `calcBarrierAttenuation(delta, freq, capped, e)` with `e = building depth`.
- Multiple separate barrier polylines in series: **not working** — only the dominant edge is used; remaining barriers are ignored.
- T11 passing the ISO suite does **not** indicate the user-facing path handles multi-barrier scenarios; the test bypasses `getDominantBarrier()` entirely.

### Implication for simplification register

`soundplan-comparison.md` Simplification 4 (reflections) does not directly document this gap. The gap belongs in a separate acoustic gaps audit. The `soundplan-comparison.md` "When to Use SoundPLAN Instead" section correctly lists "Multiple barrier diffraction" as a trigger for using SoundPLAN. No change to `soundplan-comparison.md` is required as a result of this re-audit.

---

## Gap 7 — Single-ridge terrain screening

### Noise map grid worker (`noise-worker.js`) — Deygout 3-edge

`findTerrainEdges()` (lines 275–308): Samples `N = max(20, min(100, round(dist/5)))` profile points along the source–receiver path. Identifies **all** local maxima that protrude above the line of sight.

`deygoutSelectEdges()` (lines 315–382): Applies Deygout chaining — selects the principal edge (highest Fresnel number score), then the best sub-edge on the source side and the best sub-edge on the receiver side. Returns 1–3 edges ordered source → receiver.

`terrainILPerBand()` (lines 386–422): Computes per-band Maekawa IL for each selected edge, sums ILs, caps at 25 dB per band. This is the ISO 9613-2 Annex B Deygout method.

**Gap 7 is closed for the noise map grid.**

### Single-point receiver path (`index.html`) — single dominant ridge

`detectDominantRidge()` (lines 8541–8579): Samples the elevation profile and selects the **single** point of maximum protrusion above the source–receiver line of sight. Returns one ridge point.

`calcTerrainDiffraction()` (lines 8603–8634): Applies Maekawa diffraction for that single ridge. No chaining.

**Gap 7 is still open for single-point receiver calculations.**

### ISO test path (T08)

`iso17534.test.js` lines 226–283. T08 models an **explicit user-drawn barrier**, not terrain. Pre-computed geometry:

```javascript
const z_top   = 0.0578;
const z_left  = 267.53;
const z_right = 362.85;
const barrierInfoT08 = { d1: 170.24, d2: 23.93, hBar: 6 };
```

These values come from Cartesian barrier geometry — there is no elevation profile sampling, no `detectDominantRidge`, and no terrain DEM query. **T08 passing does not test the terrain code path at all.**

### Thought experiment — two terrain ridges in series

Source at 0 m elevation, two ridges at 50 m and 150 m separation each protruding 3 m above the line of sight, receiver at 200 m.

- **Worker (Deygout):** Both ridges are identified by `findTerrainEdges`. `deygoutSelectEdges` selects principal + one sub-edge. `terrainILPerBand` sums ILs — total terrain screening ≈ 2× the single-ridge IL (order of magnitude; exact value depends on Fresnel geometry). Receiver level is meaningfully reduced.
- **Single-point (index.html):** `detectDominantRidge` selects the ridge with the larger protrusion. The other ridge is ignored. Only one IL term is applied. Under-prediction relative to Deygout.

The divergence between the two paths means that a site screened by two terrain ridges will show lower levels on the noise map (worker) than in the single-point receiver panel (index.html), potentially by 3–8 dB depending on ridge geometry.

### Verdict

**MIXED.**

| Path | Method | Status |
|------|--------|--------|
| Noise map grid (`noise-worker.js`) | Deygout 3-edge, per-band, capped 25 dB | **Closed** |
| Single-point receiver (`index.html`) | Single dominant ridge, single-edge Maekawa | **Open** |

The two paths can disagree by 3–8 dB on sites with multiple terrain ridges, creating internal inconsistency: the heatmap shows lower levels than the receiver panel for the same location.

### Implication for simplification register

`soundplan-comparison.md` Simplification 3 (terrain screening — single dominant ridge) describes the single-point receiver behaviour and is still accurate for that path. The worker path is now better than Simplification 3 describes. A clarifying note should be added to Simplification 3 distinguishing the two paths — see Recommended Actions below.

---

## UAT coverage gap

Reviewing `references/uat-tests.md`:

- T08 (barrier): Covered by ISO suite. Maps to `calcBarrierWithEndDiffraction` + `calcBarrierAttenuation`. Does not exercise multi-barrier user path.
- T11 (building shielding): Covered by ISO suite. Tests `calcBarrierAttenuation` with `e > 0` directly — does not exercise `getDominantBarrier`.
- **No UAT scenario** exercises two separate `userBarriers` polylines in series to verify combined attenuation.
- **No UAT scenario** exercises a multi-ridge terrain path through the single-point receiver code path (`detectDominantRidge`/`calcTerrainDiffraction`).
- **No UAT scenario** compares the worker terrain result against the single-point receiver terrain result for the same multi-ridge geometry.

These are coverage gaps in the test suite — not engine failures, but untested combinations.

---

## Recommended Actions

1. **Update `soundplan-comparison.md` Simplification 3** — Add a clarifying note under the "Tool" description: "Applies to single-point receiver calculations (`detectDominantRidge`, `calcTerrainDiffraction` in `index.html`). The noise map grid worker (`noise-worker.js`) uses Deygout 3-edge and is not subject to this simplification."

2. **Do not close Gap 4 in any gap register** — Multiple separate `userBarriers` still select only one dominant edge. The ISO T11 pass result should not be cited as evidence that Gap 4 is closed.

3. **Do not close Gap 7 entirely** — Mark Gap 7 as PARTIALLY CLOSED: closed for the worker/grid path, still open for single-point receiver. Update any gap register accordingly.

4. **Add UAT scenarios** to `uat-tests.md`:
   - Two `userBarriers` in series — verify whether combined attenuation is applied (expected: currently only dominant barrier IL is returned; document the actual behaviour).
   - Single-point receiver on a two-ridge terrain profile — record predicted level and compare against the noise map worker result for the same location.

5. **Effort estimate for full closure:**
   - Gap 4 (multi-barrier user path): Moderate — requires replacing the single `getDominantBarrier` result with an energy-sum across all intersecting barrier groups, or implementing sequential attenuation. Risk: performance impact at all four call sites.
   - Gap 7 (single-point receiver Deygout): Low-moderate — the Deygout logic already exists in `noise-worker.js`; porting `findTerrainEdges`/`deygoutSelectEdges`/`terrainILPerBand` to the index.html single-point path and removing `detectDominantRidge`/`calcTerrainDiffraction` is the primary work.

6. **SoundPLAN guidance remains unchanged** — `soundplan-comparison.md` "When to Use SoundPLAN Instead" already correctly lists both multiple barrier diffraction and complex terrain as triggers. No change needed there.

---

*Compiled: 2026-04. Read-only audit — no source code or existing reference files were modified. Evidence gathered from: `iso17534.test.js`, `shared-calc.js`, `index.html`, `noise-worker.js`.*
