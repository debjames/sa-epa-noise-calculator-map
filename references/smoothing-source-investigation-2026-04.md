# Smoothing Source Investigation — Heatmap Terrain IL

**Date:** April 2026  
**Scope:** Read-only. No source code modified.  
**Question:** Were the radial spike artefacts suppressed by the Gaussian smoothing caused by barrier IL discontinuities, terrain IL discontinuities, or both? Is Option B (remove terrain IL smoothing) safe?

---

## Summary

The Gaussian smoothing of terrain IL was introduced in commit `71aaea5` (2026-03-28) specifically to fix terrain-driven radial spike artefacts caused by abrupt step-function transitions in DEM cell elevation values under a nearest-neighbour lookup scheme. Barrier IL was never smoothed — the code comment at noise-worker.js:335 explicitly states this. The verdict is **TERRAIN-DRIVEN**.

Option B (remove terrain IL smoothing) is **conditionally feasible but requires empirical verification** before committing. The bilinear DEM interpolation (also introduced in `71aaea5`, one day after the original terrain code) addresses the root cause of the step-function artefacts. With bilinear interpolation in place, the Gaussian smoothing may no longer be needed for the original radial-spike suppression purpose. However, removing it will sharpen the acoustic shadow boundary in the heatmap, and whether that sharpened boundary looks like an artefact or like correct physics requires a visual test.

Option C (receiver pin reads from `_terrainIL` cache rather than the smoothed grid) is recommended as the immediate lower-risk fix, independently of whether Option B proceeds.

---

## Smoothing Pass Quoted

**File:** `noise-worker.js`  
**Line range (current, post Gap-7 uncommitted):** approximately 322–427

```javascript
/* ── Pre-compute and Gaussian-smooth terrain IL grids ──
 *
 * Issue 1 fix (rectangular clip): terrain IL is computed for EVERY grid
 * cell and stored as an explicit 0 where DEM data is absent. The main
 * loop then uses a simple table lookup — no path can skip rendering a
 * cell due to missing terrain data.
 *
 * Issue 2 fix (radial spikes): a separable Gaussian kernel (radius 2,
 * σ = 1.0 grid cells) is applied to the raw terrain IL grid for each
 * source before the main propagation loop. This smooths the abrupt
 * 0↔IL transitions at DEM cell boundaries near the source while
 * preserving the large-scale acoustic shadow shapes.
 *
 * Only the terrain IL contribution is smoothed — the base propagation
 * levels (distance attenuation, barriers) are computed exactly per cell.
 */
```

The kernel: σ = 1.0 grid cell, radius = 2 cells, kernel size = 5 — confirming the diagnostic report. Weights (normalised): approximately `[0.054, 0.242, 0.399, 0.242, 0.054]`. Applied separably (horizontal then vertical pass) to each of the 8 octave bands independently.

**What is smoothed:** the per-band terrain IL field `terrainSmoothed[si]` — a stride-8 `Float32Array(rows × cols × 8)` per source (post Gap-7). In the original commit `71aaea5`, this was a broadband scalar `Float32Array(rows × cols)` per source; the Gap-7 work extended it to per-band without changing the kernel or smoothing logic.

**What is NOT smoothed:** distance attenuation (Adiv), atmospheric absorption (Aatm), ground attenuation (Agr), barrier IL (Abar), reflection IL, building IL. Every one of these is computed exactly per cell with no post-processing.

No companion smoothing pass exists elsewhere in the worker. Search of `noise-worker.js` for `gaussian`, `smooth`, `spike`, `artefact`, `artifact`, `radial`, `kernel` returns only this one block.

---

## Git History

### Smoothing introduced: `71aaea5`

```
Commit: 71aaea50725cccf2c773563b346069e89c46ef51
Date:   2026-03-28 14:24:44 +1030
Author: Deb James

Fix terrain noise map and SA zone detection

noise-worker.js:
- Replace tile-grid DEM lookup with flat-cache bilinear interpolation
- Build structured lat/lng grid from demCache for bilinear elevation lookup
- Fall back to nearest-neighbour (no snap threshold) outside DEM extent
- Pre-compute per-source terrain IL grids; apply separable Gaussian smooth
  (radius 2, sigma 1.0) to eliminate radial spikes near source
- Terrain IL stored as 0 for cells outside DEM extent — fixes rectangular
  clip where edge cells were excluded rather than rendered without screening

index.html:
- Replace getTileForBounds() with sequential 100-point getElevations() batches
  to avoid all-null API responses from large parallel tile fetches
- Pass flat [{lat,lng,elev}] demCache array to worker (not tile grid)
- Quality thresholds: warn if <80% valid, skip terrain if <20% valid
...
```

**What this commit did in context:** This was a fix commit issued one day after `95f6adf` (2026-03-27, "Add terrain screening to noise contour map via DEM tile"). The original terrain implementation used nearest-neighbour DEM lookup from a tile grid. The fix commit simultaneously introduced:
1. Bilinear DEM interpolation (the *primary* fix for stepped elevation artefacts)
2. Gaussian smoothing of the terrain IL field (the *secondary* mitigation)

The bilinear interpolation comment in the diff reads: "This produces smooth elevation gradients between DEM sample points, eliminating the stepped artefacts from nearest-neighbour transitions." The Gaussian smoothing comment: "smooths the abrupt 0↔IL transitions at DEM cell boundaries near the source."

Both mitigations were aimed at the same root cause: DEM resolution artefacts.

### Original terrain commit: `95f6adf`

```
Commit: 95f6adf4bf38398e11fc500300f8971a23bb0e64
Date:   2026-03-27 08:55:35 +1030

Add terrain screening to noise contour map via DEM tile

Worker (noise-worker.js):
- Receives demTile with lats[], lngs[], flat elevations[].
- demElevAt(lat, lng): nearest-neighbour lookup from DEM grid.
- terrainILForRay: 10-point sampling, max protrusion, broadband Maekawa.
```

**No smoothing in `95f6adf`.** The radial spikes would have been visible in this commit.

### Subsequent commits

Commits `ecea32e`, `282544d`, `2b838b9`, `6bd4fc2`, `afd6913` all show the smoothing code as context lines — none of them modified the smoothing parameters or logic. The Gap-7 uncommitted work extended the smoothing from broadband scalar to per-band stride-8 format, identical kernel.

**Conclusion:** The smoothing was introduced once, in `71aaea5`, for terrain-related reasons. It has not been modified since.

---

## Code Structure Analysis

### a) What feeds into the smoothed terrain IL field

```
terrainILPerBand(srcLL, srcH, gridPt, recvH)     [worker local wrapper]
  → SharedCalc.terrainILPerBand(srcLL, srcH, gridPt, recvH, lookupElev)
      → findTerrainEdges(srcLL, srcTip, gridPt, recTip, totalDist, lookupElev)
          → N = clamp(round(d/5), 20, 100) profile samples
          → lookupElev(lat, lng) = bilinear interpolation from demCache
      → deygoutSelectEdges(edges, srcTip, recTip, totalDist)
      → per-edge Maekawa IL, 8 octave bands
  → raw _ilRaw8[cell, band] = terrainILPerBand(...)
→ Gaussian smooth each band → terrainSmoothed[si]
→ main loop reads terrainSmoothed[si][(r*cols+c)*8 + band]
```

`lookupElev` is the bilinear DEM interpolation introduced in commit `71aaea5`. It operates on the `demCache` flat array, building a structured grid for bilinear lookup with nearest-neighbour fallback at the DEM boundary.

### b) Barrier IL — separate and never smoothed

Barrier IL (`getDominantBarrier` → `calcBarrierWithEndDiffraction`) is computed per-cell in the main propagation loop:

```javascript
// Inside main loop, per cell (r, c):
var barrier = getDominantBarrier(srcLL, pt, src.heightM, recvHeight, buildings);
// barrierDelta, endDeltaLeft, endDeltaRight from barrier geometry
// → calcISOatPoint(..., barrierDelta, ..., terrBands)
```

The barrier geometry is computed fresh for each grid cell — no pre-pass, no smoothing. It feeds directly into `calcISOatPoint` alongside `terrBands` from the pre-smoothed array. These are strictly separate contributions.

### c) Other IL fields — none smoothed

- Reflection IL (`getDominantReflection`): computed per cell in main loop, no smoothing
- Ground attenuation (`_wkPathG` / `calcAgrPerBand`): computed inside `calcISOatPoint` per cell, no smoothing
- Distance attenuation: analytic formula per cell, no smoothing

The smoothing pass is exclusively on the terrain IL grid.

### d) Which terms produce sharp discontinuities cell-to-cell

| Term | Sharp discontinuity? | Mechanism |
|---|---|---|
| Shadow-zone boundary | **Yes — strongest** | Deygout IL transitions from 0 (LOS) to Maekawa value as the receiver crosses the terrain shadow edge |
| DEM cell step-function | **Yes — original problem** | With nearest-neighbour DEM, elevation jumps at cell boundaries create artificial shadow-edge crossings; bilinear interpolation mitigates this |
| Deygout edge flip | Mild | The dominant edge selected by `deygoutSelectEdges` can flip between two candidates at knife-edge geometry; effect is typically < 1 dB and not spatially organised |
| 25 dB cap | Negligible | Clipping only at very high IL; not spatially organised |

The dominant source of "radial" spatial patterns (concentric arcs or radial spokes centred on the source) is the shadow-zone boundary combined with DEM cell step functions. Near the source, DEM cells subtend larger angles, making the radial pattern more pronounced.

### e) Commit attribution

Both the commit message ("radial spikes near source") and the in-code comment ("abrupt 0↔IL transitions at DEM cell boundaries near the source") attribute the artefact to terrain IL, specifically to DEM cell boundary artifacts. No commit message or comment references barrier-related spikes.

---

## Empirical Test

**Status: Skipped.**

No scenario is currently loaded and the Mount Lofty test site requires a live browser session with DEM data. The console monkey-patch to make the Gaussian pass a no-op requires patching the worker (which runs in a separate thread) — patching it from the main thread console would require rebuilding the worker message, which is non-trivial in this codebase.

The git history and code structure analysis are considered decisive. Empirical test results would confirm the conclusion but would not change the direction of the verdict.

If an empirical test is desired, the recommended approach is: create a branch, set `_SIGMA = 0.001` in the Gaussian kernel (effectively a no-op), rebuild, and render a heatmap for a simple terrain-ridge scenario with no barriers. If concentric arc patterns or radial spokes reappear in the shadow zone boundary, the bilinear interpolation alone is insufficient. If the shadow boundary looks visually clean (just sharper), bilinear interpolation is sufficient and Option B is safe.

---

## Verdict

**TERRAIN-DRIVEN.**

Evidence:
1. The smoothing was introduced in commit `71aaea5` (2026-03-28) explicitly to fix terrain-related artefacts ("radial spikes near source", "0↔IL transitions at DEM cell boundaries").
2. The commit message and in-code comment both attribute the artefact to DEM cell resolution, not to barriers.
3. Barrier IL has never been smoothed — the code comment at lines 335–336 explicitly excludes it.
4. The original commit that triggered the fix (`95f6adf`, nearest-neighbour terrain) had no barrier smoothing and no terrain smoothing. Adding barriers later did not add any smoothing.
5. No other commit introduced or referenced barrier-related spike artefacts.

**Corollary:** Option B as originally stated ("keep barrier IL smoothing, remove terrain IL smoothing") is based on a false premise. There is no barrier IL smoothing to keep. Option B is really "remove terrain IL smoothing entirely."

**Option B safety assessment:**

The bilinear DEM interpolation (introduced simultaneously with the Gaussian smoothing in `71aaea5`) is the primary mitigation for DEM cell boundary step-function artefacts. With bilinear interpolation in place, the Gaussian smoothing may no longer be necessary for the original radial-spike use case. However, without the Gaussian smoothing, the acoustic shadow boundary will be sharper. Whether this sharpness constitutes a visible artefact depends on:
- Grid spacing (at coarse grids, the boundary is already several cells wide due to sampling; at fine grids, it is a single-cell step)
- The terrain geometry (gradual slopes produce wider transition zones naturally; knife edges produce near-instantaneous transitions)

**Provisional assessment:** Option B (removing Gaussian smoothing) is **likely safe** given that bilinear DEM interpolation now handles the original root cause. The risk is a sharper-looking shadow boundary in the heatmap, which may be visually acceptable (it is arguably more physically correct) or may look artefactual at fine grid spacings. Empirical verification is required before committing.

---

## Recommended Fix Scope

### Immediate (low risk): Option C

Display the receiver-panel value (from `_terrainIL` cache) at receiver pin locations rather than the heatmap grid colour.

**File:** `index.html`  
**Where:** The hover tooltip or popup that shows the noise level when the user hovers over a receiver pin on the heatmap. Alternatively, the compliance strip already shows the correct receiver-panel value — the issue is that the heatmap colour behind the pin is misleading.  
**Approach:** No changes to the heatmap grid computation. Add a note in the heatmap tooltip (when a receiver pin is present) that the heatmap colour at that point may differ from the compliance panel value due to terrain IL smoothing.  
**Effort:** Small  
**Risk:** Low  
**Sufficient alone?** Yes for the reported compliance divergence. Does not fix the heatmap spatial accuracy inside narrow shadows.

### Deferred (medium risk, requires empirical test): Option B'

Reduce Gaussian σ from 1.0 to 0.5 cells, keeping the radius at 2 cells.

**File:** `noise-worker.js`  
**Line:** `var _KR = 2, _SIGMA = 1.0, _KS = 5;` → `var _KR = 2, _SIGMA = 0.5, _KS = 5;`  
**Effect:** Kernel weights shift from `[0.054, 0.242, 0.399, 0.242, 0.054]` to approximately `[0.003, 0.238, 0.517, 0.238, 0.003]` (much more peaked, effectively ±1 cell influence). Shadow blur reduces from ~100 m to ~50 m at 50 m grid spacing.  
**Effort:** Trivial (one line)  
**Risk:** Low — bilinear interpolation already handles the original root cause. A visual regression test on the Mount Lofty scenario is sufficient.  
**Pre-condition:** Empirical test (branch with `_SIGMA = 0.001`) confirms bilinear interpolation alone does not produce visible spike artefacts.

### Full Option B (higher risk, deferred): Remove smoothing entirely

`var _KR = 2, _SIGMA = 1.0, _KS = 5;` block and the smoothing Step 2 loop removed. `terrainSmoothed` replaced with the raw `_ilRaw8` array.

**Effort:** Small  
**Risk:** Medium — requires empirical test on multiple scenario types (fine grid, coarse grid, knife-edge, gradual slope). Risk of re-introducing artefacts at fine grid spacings where bilinear interpolation may not fully suppress step-function effects.  
**Not recommended** until Option B' has been tested and the radial-spike question is fully resolved empirically.

### Whether Option C should accompany B regardless

**Yes.** Option C (receiver panel is authoritative, clearly communicated to user) should be implemented regardless of whether Option B or B' proceeds. The heatmap is inherently a spatial-overview tool; Options B and B' reduce the smoothing artefact but do not eliminate the fundamental grid-cell-position offset effect (§5 of the diagnostic report). Even with Option B, the heatmap at a receiver's exact lat/lng may differ from the panel value by 1–3 dB due to grid node position offset on steep terrain.

---

## Open Questions

1. **Does bilinear interpolation alone prevent radial spikes?** — The definitive test is a branch with `_SIGMA = 0.001` on a terrain-ridge scenario with no barriers, at fine grid spacing (≤ 10 m). The original spikes appeared at 50 m grid; finer grids will be more sensitive to remaining step-function artefacts. This test was not run in this investigation (browser session not active).

2. **What was the original scenario that revealed the spikes?** — Commit `71aaea5` was authored one day after `95f6adf`. The commit message references "radial spikes near source" but no test scenario is preserved in the repository. If the original scenario (source position, terrain site, grid resolution) were known, it could be used directly as the regression test for Option B.

3. **Does the per-band Gaussian smoothing (post Gap-7) behave differently from the original broadband smoothing?** — In `71aaea5`, smoothing was applied to a single broadband IL value per cell. After Gap-7, it is applied to 8 bands independently. Because terrain IL increases with frequency (Maekawa diffraction is frequency-dependent), the shadow boundary sharpness is frequency-dependent — lower bands have a wider, softer boundary, higher bands have a narrower, sharper boundary. Smoothing all bands with the same σ may be over-smoothing at low frequencies and under-smoothing at high frequencies. This is a secondary question and does not change the Option B safety assessment but could inform a future Option A (adaptive σ by band).

---

*Investigation date: April 2026. READ-ONLY — no source code or reference files modified except this report.*
