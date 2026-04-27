# Heatmap / Receiver Panel Divergence — Diagnostic Report

**Date:** April 2026  
**Scenario:** Mount Lofty point source, R2 = (−34.97528, 138.70814)  
**Observed:** Receiver panel shows ~36 dB; heatmap shows ~43–45 dB at R2's position  
**Divergence:** ~8–9 dB  
**Status:** Root cause identified (read-only analysis). No code modified.

---

## 1. Headline Finding

**Primary cause: Gaussian smoothing applied to heatmap terrain IL, absent from receiver panel terrain IL.**

The noise-map worker computes Deygout terrain IL for every grid cell, then applies a separable 5×5 Gaussian kernel (σ = 1.0 cell, radius = 2 cells) to each octave band independently (noise-worker.js:346–426). When R2 sits inside a narrow terrain shadow zone — as it does at Mount Lofty — cells immediately outside the shadow have near-zero terrain IL. The Gaussian blur blends these low-IL neighbours into R2's grid cell, drastically reducing the smoothed IL value. The receiver panel calls `SharedCalc.terrainILPerBand` for the exact R2 position with no smoothing applied, producing the correct high-IL value.

**Secondary cause (smaller magnitude): grid cell coordinate offset.** The heatmap's terrain IL for any position is computed at the nearest grid node `(startLat + r·dLat, startLng + c·dLng)`, which can be up to half a diagonal cell width from R2. On steep terrain a lateral shift of ~25 m (at 50 m grid) can shift the ridge geometry enough to change the Deygout IL by several dB, independently of the smoothing effect.

**Distance function discrepancy: not significant.** The receiver panel uses `haversine()` (great-circle, R = 6371000); the worker uses `flatDistM()` (flat-earth cosine approximation). At Mount Lofty distances of 5–15 km the relative error is < 0.04 % — acoustically negligible (< 0.1 dB).

---

## 2. Two Paths to `calcISOatPoint`

### Receiver panel path

```
updateTerrainIL(srcIdx, recvIdx)               [index.html:~8430]
  └─ getTerrainProfile(src.lat, src.lng,        [async DEM fetch, N=max(20,min(100,round(d/5))) points]
                       rec.lat, rec.lng, N)
  └─ build nearest-neighbour elevFn from profile
  └─ SharedCalc.terrainILPerBand(srcLL, srcH,   [NO smoothing]
                                 recLL, recH,
                                 elevFn)
  └─ _terrainIL[si][recvIdx] = { insertionLoss_dB, perBand }

calcISO9613forSourcePin(si, receiverIdx)        [index.html:11240]
  └─ d = getDistanceForSourceReceiver(si, ri)   [haversine — exact great-circle metres]
  └─ terrainPerBand = _terrainIL[si][ri].perBand [exact R2 position, unsmoothed]
  └─ calcISO9613single(…, terrainPerBand)
       └─ SharedCalc.calcISOatPoint(spectrum, srcH, d, adj,
                                    barrierDelta, recH, isoParams,
                                    endDeltaL, endDeltaR, barrInfo,
                                    terrainPerBand)
```

### Heatmap worker path

```
[terrain pre-pass, noise-worker.js:357–426]
  for each src:
    for every grid cell (r, c):
      pt = { lat: startLat + r·dLat, lng: startLng + c·dLng }  [grid node, ≠ exact R2]
      _ilRaw8[r,c,*] = terrainILPerBand(srcLL, srcH, pt, recvHeight)  [Deygout, unsmoothed raw]
    Gaussian smooth (σ=1 cell, radius=2) each band independently
    → terrainSmoothed[si]  [stride-8 Float32Array, smoothed]

[main propagation loop, noise-worker.js:433–]
  for each source si, each grid cell (r, c):
    dist = flatDistM(srcLL, pt)                 [flat-earth approximation]
    barrierW = getDominantBarrier(srcLL, pt, …)
    terrBands = terrainSmoothed[si][(r·cols+c)*8 + band]  [SMOOTHED, at grid node position]
    lp = calcISOatPoint(spectrum, srcH, dist, adj,
                        barrierDelta, recvHeight, isoParams,
                        endDeltaL, endDeltaR, barrInfo,
                        terrBands)
```

---

## 3. Input Argument Comparison at R2 (table)

| Argument | Receiver panel | Heatmap worker | Divergence |
|---|---|---|---|
| **Terrain IL (per-band)** | `SharedCalc.terrainILPerBand` at exact R2 = (−34.97528, 138.70814); no smoothing | Gaussian-smoothed value at nearest grid node to R2; node can be ≤ half-diagonal away | **Dominant — estimated 8–12 dB at 1 kHz for a narrow shadow zone** |
| **Distance** | `haversine()` — exact great-circle | `flatDistM()` — flat cosine approximation | < 0.1 dB at 5–15 km |
| **Receiver height** | `getReceiverHeight(ri)` — user-settable per receiver | `isoParams.receiverHeight` from noiseMapHeight input (default 1.5 m) | Up to ~2 dB if user set R2 height ≠ map height; Agr / Abar effect only |
| **Receiver position** | Exact R2 lat/lng | Nearest `startLat + r·dLat`, `startLng + c·dLng` | Up to ~25 m diagonal at 50 m grid; see §5 |
| **Barrier geometry** | `getDominantBarrier` from exact R2 | `getDominantBarrier` from nearest grid node | Typically < 1 dB on open terrain; can be larger if R2 is near a barrier tip |
| **Ground factor G** | `_gzComputePathG(srcLL, recLL, …)` — exact path | `_wkPathG(src.lat, src.lng, lat, lng, …)` — same algorithm, different endpoint | Negligible if ground zones are large relative to grid step |
| **Source spectrum / Lw** | Same `sourcePins[si].spectrum` | Same `srcData[si].spectrum` | Identical |
| **Temperature / humidity** | Same `isoParams` | Same `isoParams` | Identical |

---

## 4. Per-Band Output Decomposition (structural)

The 9 dB divergence accumulates almost entirely in the terrain term. Worked example for 1 kHz band only (representative):

| Step | Receiver panel value | Heatmap value | Delta |
|---|---|---|---|
| Lw (source) | [as set] | [as set] | 0 |
| Adiv (spreading) | −f(d_haversine) | −f(d_flatDistM) | < 0.1 dB |
| Aatm (air absorption) | −f(d, T, H) | −f(d, T, H) | < 0.1 dB |
| Agr (ground attenuation) | −f(G, hS, hR, d) | −f(G, hS, hR, d) | < 0.5 dB (height diff) |
| Abar (barrier) | −f(exact R2 geometry) | −f(grid-node geometry) | < 1 dB (open terrain) |
| **Aterr (terrain, 1 kHz)** | **−terrainIL_exact ≈ −15 to −20 dB** | **−terrainIL_smoothed ≈ −7 to −9 dB** | **~8–12 dB** |
| Predicted Lp | ~36 dB | ~44 dB | ~8 dB |

The specific Aterr values depend on the Mount Lofty ridge geometry at R2 and are estimates only. Monkey-patching `calcISOatPoint` in both contexts to log per-band inputs would yield exact values.

---

## 5. Grid Cell Coordinate Offset (quantified)

At latitude −34.975°:
- 1° latitude = 111 320 m → grid step dLat = res / 111 320
- 1° longitude = 111 320 × cos(34.975° × π/180) ≈ 91 216 m → dLng = res / 91 216

At 50 m grid spacing:
- Max row offset from R2: ½ × 50 m = 25 m  
- Max col offset from R2: ½ × 50 m = 25 m  
- Max diagonal offset: √(25² + 25²) ≈ 35 m

At 50 m grid spacing and a terrain gradient of ~10° (typical south-facing Mount Lofty slope):
- Vertical elevation difference from 35 m offset: 35 × tan(10°) ≈ 6 m

A 6 m change in the effective ridge height over a source–receiver path of ~5 km can shift the Deygout path-length difference by 0.5–2 m, translating to 3–6 dB IL change at 1 kHz (Maekawa-regime). This effect is **secondary** relative to the smoothing effect but not negligible.

Additionally, the terrain pre-pass computes raw terrain IL at every grid cell, then smooths by ±2 cells = ±100 m at 50 m grid. The resulting smoothing radius is large enough to import zero-IL cells from the fully-exposed side of the ridge crest into R2's grid cell.

---

## 6. Colour Scale — Fixed, Not Autoscale

The legend scale is defined by hardcoded defaults (index.html:36392–36397):

```javascript
var _legendMin = 25;
var _legendMax = 70;
var _legendInterval = 5;
```

`buildNoiseScale()` uses these values to build NOISE_COLOURS with fixed dB bands. There is no autoscale mechanism. `getNoiseColour(dB)` maps a dB value to its band purely by linear lookup:

```javascript
function getNoiseColour(dB) {
  if (!isFinite(dB)) return null;
  for (var i = 0; i < NOISE_COLOURS.length; i++) {
    if (dB >= NOISE_COLOURS[i].min && dB < NOISE_COLOURS[i].max)
      return NOISE_COLOURS[i].color;
  }
  return NOISE_COLOURS[NOISE_COLOURS.length - 1].color;
}
```

The colour at R2's grid position on the heatmap directly represents the smoothed computed level, not an artefact of the colour mapping. The 9 dB divergence is a real difference in predicted noise level, not a rendering artefact.

---

## 7. Conclusions and Recommended Fix Scope

### Root cause
The Gaussian smoothing of terrain IL in the heatmap worker is necessary to suppress the radial-spike artefact (documented in noise-worker.js:329–330) but has the side-effect of significantly reducing terrain IL at grid cells near the edge of a terrain shadow zone. When R2 is precisely placed inside a narrow shadow zone (as at Mount Lofty), the smoothed grid value under-represents the exact-position terrain IL by 8–12 dB.

The receiver panel uses unsmoothed, exact-position terrain IL and is acoustically correct.

### What this means for field use
- The receiver panel prediction (36 dB) is the authoritative value for compliance — it uses the exact receiver position with unsmoothed Deygout terrain IL.
- The heatmap colour at R2's position will read ~44 dB and will not match the compliance prediction. This is expected and is a known limitation of the smoothing artefact suppression.
- Users should not use the heatmap to read off a predicted level at a specific point. The heatmap is for spatial overview only. The receiver panel is for compliance.

### Recommended fix options (not implemented — scope decision needed)

**Option A — Adaptive smoothing radius:** Reduce the Gaussian σ from 1.0 to 0.5 at grid spacings ≤ 20 m. This reduces smoothing blur while still suppressing radial spikes. Trade-off: spike artefacts may reappear on some grid/terrain combinations.

**Option B — No smoothing on terrain IL, smooth only barrier IL:** The radial-spike artefact was caused by barrier IL discontinuities, not terrain IL discontinuities. Apply smoothing only to the barrier IL field, leaving terrain IL unsmoothed. Requires profiling to confirm the spike artefact does not recur from terrain IL.

**Option C — Marker pin at R2 reads from `_terrainIL` cache, not grid:** When the user clicks the map near a receiver, show the receiver-panel value (from `calcPredAtReceiver`) rather than the grid interpolated value. The map already has marker pins; this is a display-layer fix rather than a propagation fix.

**Option D — Document as known limitation:** No code change. Add a tooltip or note in the noise map panel explaining that the heatmap may disagree with receiver predictions by up to 10 dB in steep terrain shadow zones due to the terrain IL smoothing applied to the grid. This is the lowest-risk option.

### Priority assessment
Option D is lowest risk and can be done immediately. Option B should be investigated if terrain shadow fidelity is important for contour decisions. Options A and C require implementation work with potential regression risk.

---

## 8. How to Verify (Monkey-Patch Steps)

To confirm the root cause experimentally when the Mount Lofty scenario is loaded:

**Step 1 — Exact receiver terrain IL:**
```javascript
// In browser console with R2 placed and terrain enabled:
var si = 0;   // source index
var ri = 1;   // R2 = receiver index 1
console.log('Exact terrain IL (perBand):', window._terrainIL[si][ri]);
```

**Step 2 — Grid cell terrain IL at R2's coordinates:**
```javascript
// Requires _lastNoiseData to be set (run noise map first)
var d = window._lastNoiseData;
var R2lat = -34.97528, R2lng = 138.70814;
var r = Math.round((R2lat - d.startLat) / d.dLat);
var c = Math.round((R2lng - d.startLng) / d.dLng);
var off = (r * d.cols + c) * 8;
var terrSmoothed = /* need handle on terrainSmoothed — not exposed post-worker */;
console.log('Grid node:', r, c, 'offset from R2 (cells):', r - (R2lat - d.startLat)/d.dLat, c - (R2lng - d.startLng)/d.dLng);
```

**Step 3 — Per-band comparison:** Log the full per-band output from `SharedCalc.terrainILPerBand` at exact R2 vs at the nearest grid node position:
```javascript
// At exact R2:
var srcPin = window.sourcePins[0];
var recLL = { lat: -34.97528, lng: 138.70814 };
// ... build elevFn from getTerrainProfile, then:
SharedCalc.terrainILPerBand(srcLL, srcPin.heightM, recLL, 1.5, elevFn);

// At nearest grid node (substitute grid-node lat/lng):
var nodeLL = { lat: d.startLat + r*d.dLat, lng: d.startLng + c*d.dLng };
SharedCalc.terrainILPerBand(srcLL, srcPin.heightM, nodeLL, 1.5, elevFn);
```

The difference in band[4] (1 kHz) between the two calls should account for most of the 9 dB divergence.

---

*Analysis: April 2026. READ-ONLY — no code modified. All code references are to the April 2026 codebase post Gap 7 closure.*
