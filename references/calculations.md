# Calculations

Reference for all non-trivial acoustic calculation paths in the app.

## Terrain Screening — Deygout 3-edge method

The noise-map worker uses the Deygout principal-edge algorithm from
ISO 9613-2 to estimate terrain-diffraction insertion loss over arbitrary
digital elevation model (DEM) profiles. This is the same method used by
SoundPLAN and CadnaA, and replaces the earlier single-highest-ridge
implementation.

### Algorithm — [`shared-calc.js:terrainILPerBand`](../shared-calc.js)

`findTerrainEdges`, `deygoutSelectEdges`, and `terrainILPerBand` live in
`shared-calc.js` and are exposed on `SharedCalc`. Both the noise-map grid
worker (`noise-worker.js`) and the single-point receiver path (`index.html
updateTerrainIL`) use this single implementation. The caller supplies an
`elevFn(lat, lng) → number|null` — a synchronous elevation lookup scoped
to the caller's DEM cache — so the algorithm remains context-free.

1. **Sample the terrain profile** — `findTerrainEdges()` steps along the
   source→receiver line at `N = clamp(round(totalDist / 5), 20, 100)`
   fractional samples. At each sample `t ∈ (0, 1)` the DEM is queried via
   the caller-supplied `elevFn(lat, lng)` and the protrusion above the
   straight line-of-sight `srcTip + t·(recTip − srcTip)` is recorded.

2. **Collect all ridge candidates** — every sample whose protrusion is
   above LOS *and* is a local maximum (≥ both immediate neighbours) is
   kept as a candidate edge. Plateaus register (ties included) so the
   algorithm is not defeated by flat-topped ridgelines.

3. **Principal edge** — `deygoutSelectEdges()` picks the edge with the
   largest Fresnel-number proxy `h² · (d1 + d2) / (d1 · d2)`. This is
   the wavelength-independent part of `ν² ∝ 2h²/λ · (d1+d2)/(d1·d2)` and
   ranks edges identically to the full Fresnel number.

4. **Secondary edges** — the same proxy is then run separately on two
   sub-paths:
   - **Source-side**: source tip → principal-edge tip. For every candidate
     edge lying source-side of the principal, the protrusion is recomputed
     relative to the sub-path LOS (`srcTip + tRel·(principal.elev − srcTip)`)
     before ranking.
   - **Receiver-side**: principal-edge tip → receiver tip. Same
     treatment in the opposite direction.
   - Each sub-path contributes at most one additional edge. The final
     result is 1–3 edges ordered source→receiver.

5. **Per-band Maekawa per edge** — for each selected edge, the Fresnel
   path-length difference is approximated as
   `δ ≈ 2·h² / (d1_3d + d2_3d)` where
   `d1_3d = √(d1² + h²)` and `d2_3d = √(d2² + h²)`. This is the same
   approximation the earlier single-ridge code used, so single-edge
   cases match within float epsilon. The per-band IL
   `calcBarrierAttenuation(δ, [63,125,250,500,1000,2000,4000,8000], true)`
   is computed using the unchanged shared Maekawa formula.

6. **Sum across edges, cap per band** — edge contributions are summed
   into an 8-element total. Each band is then capped at 25 dB per the
   ISO 9613-2 practical terrain limit. The cap is also the upper bound
   enforced by CadnaA and SoundPLAN.

The Deygout method is known to be slightly conservative (over-predict
screening by ≈1 dB per edge) when multiple edges are present. No
correction is currently applied — the conservative bias is preferable
to under-predicting. If SoundPLAN comparison shows consistent drift, a
future tuning option can apply the ITU-R P.526 correction (−2 dB for
two edges, −3 dB for three).

### Pre-pass grid storage

For every noise-map source, the worker pre-computes terrain IL at every
grid cell and stores the result as a stride-8 `Float32Array`:

```
terrainSmoothed[si] = Float32Array(rows * cols * 8)
index = (r * cols + c) * 8 + bandIdx        // 0..7 = 63 Hz … 8 kHz
```

Each octave band is Gaussian-smoothed independently using a separable
5-tap kernel (radius 2, σ = 1.0 grid cells) applied to a flat
per-band scratch buffer, then written back into the stride-8 output.
Smoothing eliminates radial spikes at DEM cell boundaries near the
source without blurring the large-scale acoustic shadow shape.

### Integration with ISO 9613-2

The main propagation loop reads an 8-element `terrBands` array per
grid cell and passes it as the 11th parameter to
[`calcISOatPoint`](../shared-calc.js:598). Inside the per-band loop the
effective screening is
`Ascreen_f = max(Abar[i], Aterr[i])` — parallel diffraction paths take
the dominant one. The combined attenuation is then
`AgrBar_f = max(Ascreen_f, Agr_subpath[i])` per ISO 9613-2 §7.4, so
terrain participates in Formula (12) alongside barrier IL without
double-counting ground effect.

For simple/broadband paths (simple Leq, simple Lmax, ISO without
spectrum) the 1 kHz band value `terrBands[4]` is used as the
representative broadband terrain IL — same behaviour as the earlier
single-ridge code.

## DEM Cache — `DEMCache.sampleRaster`

`sampleRaster(tile, lat, lng)` reads elevation from a cached WCS GeoTIFF
raster tile. As of April 2026 it uses **bilinear interpolation** across the
four surrounding DEM pixels:

```
fy = (tile.north − lat) / latSpan × tile.height   // fractional row (0 = N)
fx = (lng − tile.west) / lngSpan × tile.width      // fractional col (0 = W)
z  = bilinear(v00, v10, v01, v11, dx, dy)
```

If any of the four corners is nodata (value ≤ `WCS_NODATA = −999`), the
function returns the nearest valid corner rather than propagating nodata
through the interpolation weights.

Prior to this fix, `sampleRaster` used `Math.round()` (nearest-neighbor),
which caused ±10 m positional snapping and visible staircase steps on terrain
contour lines.

### Terrain contour rendering

`generateTerrainContours()` builds a merged elevation grid from all cached
LiDAR (solid) and SRTM-fallback (dashed) tiles, then:

1. **Gaussian pre-smooth** — `gaussianSmoothGrid(grid, W, H, 1.5)` is applied
   to the raw elevation grid before marching squares. This is a separable 1D
   Gaussian (horizontal pass then vertical pass) with σ = 1.5 grid cells and
   radius = ceil(3σ) = 5. Normalised convolution excludes NaN (no-coverage)
   cells from both the weighted sum and weight denominator, so coverage
   boundaries don't propagate artefacts. The smoothed grid is used for contour
   tracing only — the raw `ctGridLidar`/`ctGridSrtm` arrays are not mutated and
   `sampleRaster` (used for source/receiver elevations in ISO 9613-2 geometry)
   is completely unaffected. This step suppresses false linear "ridges" at
   LiDAR survey footprint seams that would otherwise be faithfully traced by
   marching squares.

2. **Marching squares** — traces iso-elevation segments across the smoothed grid.

3. **Chaikin smoothing** — `chaikinSmooth(chain, 3)` is applied to each
   polyline chain before adding to the Leaflet map — matching the 3-iteration
   convention used by the noise map and CoRTN contour renderers.

## CoRTN Road Traffic Noise

Implements UK DoT *Calculation of Road Traffic Noise* (1988) with Australian
adjustments. Entry points live in [index.html:6170](../index.html:6170)
onwards and are exposed via script scope to the map-code IIFE.

### Public API

```js
calcCortnFreeField(road, period, overrides)
    → { la10, laeq, breakdown }

calcCortnRoadPeriod(road, period)
    → { la10, laeq, contributions: [ ... ] }

recalcCortnRoad(road)
    → road.results (day + night written in place)
```

`period` is `'day'` or `'night'`. `road` is an entry from `cortnRoads[]`
(see [architecture.md](./architecture.md#cortn-road-traffic-sources-cortnroads--phase-1)).
`overrides` lets the wrapper replace `flowFrac`, `distOffset`,
`sourceHeight_m`, `applySurface`, `additionalCorrection`, and
`cvPctSpeedCorr` for dual-lane and 3-source-height sub-sources.

### Correction chain (free field)

All values in dB unless noted. Every step from Step 1 of the Phase 2 spec
is implemented exactly — no shortcuts, no rearrangement.

#### A. Traffic flow for period

```
aadtPct       = period === 'day' ? road.aadtPctDay : (road.aadtPctNight ?? 1 - road.aadtPctDay)
hoursInPeriod = period === 'day' ? road.dayHours  : road.nightHours
totalFlow     = road.aadt × aadtPct × flowFrac       // flowFrac from overrides (default 1)
hourlyFlow    = totalFlow / hoursInPeriod
cvPct         = overrides.cvPctSpeedCorr ?? (period === 'day' ? road.cv_pct_day : road.cv_pct_night)
```

AADT ≤ 0 or non-finite returns `{la10: null, laeq: null}` — the panel shows
"Enter AADT to compute results.".

#### B. Basic noise level (Chart 2)

```
L_basic = 42.2 + 10 × log10(hourlyFlow)
```

#### C. Speed correction (Charts 4 + 5)

First adjust speed for gradient (Chart 5):

```
V_adj = road.speed_kmh − round((0.73 + (2.3 − 1.15·cvPct/100)·cvPct/100) × road.gradient_pct, 1)
```

If `V_adj < 1` it is clamped to 1 to avoid `log10(0)` / `500/0`.

Then Chart 4:

```
corr_speed = 33 × log10(V_adj + 40 + 500/V_adj)
           + 10 × log10(1 + 5·cvPct/V_adj)
           − 68.8
```

#### D. Gradient correction (Chart 6)

```
corr_gradient = 0.3 × road.gradient_pct
```

#### E. Distance correction (Chart 7)

```
sourceH   = overrides.sourceHeight_m ?? 0.5                           // 3-source-height overrides
recv_h    = road.receiverHeight_m ?? iso_receiverHeight ?? 1.5
d_horiz   = road.distFromKerb_m + overrides.distOffset + 3.5          // distOffset = 0 for near lane, laneOffset_m for far lane
dz        = recv_h − sourceH − road.roadHeight_m
d_slant   = √(d_horiz² + dz²)
corr_distance = −10 × log10(d_slant / 13.5)
```

`d_slant` is clamped to a minimum of 0.1 m for safety.

#### F. Ground absorption correction (Chart 8)

Absorption (0–1 continuous from the panel) is first binned into a discrete
`G` factor:

| Absorption | G |
|---|---|
| < 0.1 | 0 |
| < 0.4 | 0.25 |
| < 0.6 | 0.5 |
| < 0.9 | 0.75 |
| ≤ 1.0 | 1 |

Then with `H = road.meanPropHeight_m` and `d = road.distFromKerb_m + distOffset + 3.5`:

```
if H >= (d + 5) / 6:          corr_ground = 0
else if H < 0.75:             corr_ground = 5.2·G·log10(3 / d)
else:                         corr_ground = 5.2·G·log10((6·H − 1.5) / d)
```

#### G. Angle of view correction (Chart 10)

```
corr_angle = 10 × log10(angleOfView_deg / 180)
```

Defaults to `angleOfView_deg = 180` if zero or negative.

#### H. Reflection correction (Fig 5)

```
corr_reflection = 1.5 × reflectionAngle_deg / angleOfView_deg
```

#### I. Road surface correction

```
corr_surface = overrides.applySurface === false ? 0 : road.surfaceCorrection
```

The 3-source-height CV engines + exhausts sub-sources pass
`applySurface: false` because the surface noise is only generated at the
tyre contact patch. Surface presets: DGA 0, Concrete +3, OGA −2, SMA −1,
14mm Chip Seal +4, 7mm Chip Seal +2, Custom (user-entered).

#### J. Low volume correction (Chart 12, LA10 only)

```
d_prime = √(d_horiz² + (recv_h − sourceH)²)
D = 30 / d_prime
C = hourlyFlow / 200

if D ≤ 1 OR C ≥ 1:            corr_lowVol = 0
else if D ≤ 4 OR C ≥ 0.25:    corr_lowVol = −16.6·log10(D)·(log10(C))²
else:                         corr_lowVol = 0  + lowVolWarning flag
```

The low-volume correction is **not** applied in the LAeq calculation.

#### K. Australian adjustment

```
corr_aust = period === 'day' ? road.austAdjDay : road.austAdjNight   // defaults −1.7 / +0.5
```

#### L. LA10 assembly

```
LA10 = L_basic + corr_speed + corr_gradient + corr_distance
     + corr_ground + corr_angle + corr_lowVol + corr_reflection
     + corr_surface + corr_aust + corr_additional
```

`corr_additional` is `0` by default, set to `−3 / −3.6 / −11.6` for the
three CV sub-sources of the NSW 3-source-height model.

#### M. LAeq derivation

```
LAeq = L_basic + corr_speed + corr_gradient + corr_distance
     + corr_ground + corr_angle + corr_reflection
     + corr_surface + corr_aust + corr_additional − 3
```

LAeq omits the low-volume correction and applies a fixed −3 dB LA10→LAeq
conversion per the Australian practice documented by Tom.

### Dual carriageway

When `road.carriageway === 'dual'`:

```
lanes = [
  { flowFrac: trafficSplit,       distOffset: 0 },
  { flowFrac: 1 − trafficSplit,   distOffset: laneOffset_m },   // default 7 m
]
```

Each lane is computed by `calcCortnFreeField` independently, then the two
contributions are energy-summed:

```
L_total = 10 × log10(10^(L_near/10) + 10^(L_far/10))
```

When `road.carriageway === 'one-way'`, the wrapper runs a single
calculation with `flowFrac = 1, distOffset = 0`.

### NSW 3-source-height model

When `road.threeSourceHeight === true`, the per-lane calculation is
replaced by **four** sub-sources per lane, each run through
`calcCortnFreeField` with its own overrides:

| Sub-source | flowMul | cvPctSpeedCorr | sourceHeight_m | applySurface | additionalCorrection |
|---|---|---|---|---|---|
| Cars | `1 − rawCvPct/100` | 0 | 0.5 | `true` | 0 |
| CV tyres | `rawCvPct/100` | 100 | 0.5 | `true` | −3 |
| CV engines | `rawCvPct/100` | 100 | 1.5 (0.5 + 1.0) | `false` | −3.6 |
| CV exhausts | `rawCvPct/100` | 100 | 3.6 (0.5 + 3.1) | `false` | −11.6 |

`rawCvPct` is the period's `cv_pct_day` / `cv_pct_night`. Each sub-source's
full CoRTN math runs independently (distance correction reflects the
elevated source height, etc.), then all sub-sources across all lanes are
energy-summed.

### Edge cases

| Input | Behaviour |
|---|---|
| `aadt` null / 0 / negative / non-finite | returns `{la10: null, laeq: null}` with breakdown `{error: "AADT is 0 or missing"}` |
| `hoursInPeriod` ≤ 0 | returns null with `error: "Invalid hours in period"` |
| `V_adj` < 1 after gradient adjust | clamped to 1 |
| `d_slant` < 0.1 m | clamped to 0.1 |
| `d_prime` < 0.1 m | clamped to 0.1 |
| `angleOfView_deg` ≤ 0 | treated as 180 |

### Validation against SoundSurfer spreadsheet

`_cortnRunValidation()` hardcodes the spreadsheet's reference scenario
(AADT 23600, 60 km/h, 5% CV, 11 day hours / 9 night hours, DGA, one-way)
and logs pass/fail. Expected values from the spreadsheet:

| | LA10 | LAeq |
|---|---|---|
| Day | 75.8 | 72.8 |
| Night | 69.3 | 66.3 |

Enable via `?cortn_validate=1` in the URL or `window._cortnValidate = true`.
Reported results at verification time: Day 75.73 / 72.73, Night 69.26 / 66.26.
All four values match within 0.1 dB of the spreadsheet — rounding drift.

### Barrier diffraction — CoRTN Charts 9 + 9a (Phase 3)

When `road.barrier.enabled === true`, an additional correction is applied
to both LA10 and LAeq. The CoRTN barrier method is a polynomial fit to
path difference, separate from ISO 9613-2 barrier diffraction and from
the app's `userBarriers[]` system.

**Entry point**: `_cortnCalculateBarrier(road, recv_h)` at
[index.html:6158](../index.html:6158). Called from inside
`calcCortnFreeField` just before LA10 assembly.

#### Geometry

```
sourceRL    = road.roadHeight_m + 0.5                   // standard 0.5 m source height
barrierRL   = barrier.baseRL_m + barrier.height_m
receiverRL  = recv_h                                    // same as used in free-field calc
srcToBarrier = road.distFromKerb_m + 3.5 − barrier.distToBarrier_m
```

If `srcToBarrier ≤ 0` the barrier is behind the near-source line (i.e.
between the source and the far lane's virtual source); the helper returns
`{applied: false, error: "Receiver-to-barrier distance is ≥ source line
(barrier behind source)."}` and the road calculation reverts to the
free-field result.

#### Path difference δ

```
term_rb = √(distToBarrier² + (barrierRL − receiverRL)²)   // receiver → barrier top
term_sb = √(srcToBarrier² + (barrierRL − sourceRL)²)      // source → barrier top
term_sr = √((distToBarrier + srcToBarrier)² + (receiverRL − sourceRL)²)   // source → receiver direct
δ       = term_rb + term_sb − term_sr
```

`δ ≤ 0` is treated as "no screening" — the helper returns
`{applied: false, error: "Path difference is zero or invalid — no
barrier screening."}`.

#### Zone detection

The line-of-sight height at the barrier's x-location:

```
losHeightAtBarrier = (receiverRL − sourceRL) × srcToBarrier / (distToBarrier + srcToBarrier) + sourceRL
zone = barrierRL ≥ losHeightAtBarrier ? 'Shadow' : 'Illuminated'
```

#### Attenuation

With `x = log10(δ)`:

**Shadow zone** (Chart 9):

```
if x < −3:      atten = −5        // clamped
else if x > 1.2: atten = −30      // clamped
else:
  atten = −15.4
        + (−8.26)·x
        + (−2.787)·x²
        + (−0.831)·x³
        + (−0.198)·x⁴
        + 0.1539·x⁵
        + 0.12248·x⁶
        + 0.02175·x⁷
```

**Illuminated zone** (Chart 9a):

```
atten = 0
      + 0.109·x
      + (−0.815)·x²
      + 0.479·x³
      + 0.3284·x⁴
      + 0.04385·x⁵
```

Result is rounded to 1 decimal place.

#### Ground correction interaction

When the barrier is in the **Shadow** zone, the free-field ground
correction is replaced with 0 (hard-ground equivalent) per the
spreadsheet's simplification. When **Illuminated**, the free-field
`corr_ground` is retained.

#### Application to LA10 and LAeq

Inside `calcCortnFreeField`, just before the LA10 assembly:

```js
corr_ground_final = barrier.corr_ground_barrier ?? corr_ground;
corr_barrier      = barrier.atten;

LA10 = L_basic + corr_speed + corr_gradient + corr_distance
     + corr_ground_final + corr_angle + corr_lowVol + corr_reflection
     + corr_surface + corr_aust + corr_additional + corr_barrier;

LAeq = L_basic + corr_speed + corr_gradient + corr_distance
     + corr_ground_final + corr_angle + corr_reflection
     + corr_surface + corr_aust + corr_additional + corr_barrier − 3;
```

Both LA10 and LAeq receive the barrier attenuation. LAeq still excludes
the low-volume correction; the barrier correction is orthogonal.

#### Dual-carriageway + 3-source-height interaction

The barrier geometry uses the **standard 0.5 m source height** regardless
of the 3-source-height override (`sourceRL = roadHeight_m + 0.5`) per the
spec. This keeps the barrier calculation tied to a single, well-defined
source line for the road even when the free-field calculation splits into
elevated sub-sources. In dual-carriageway mode, each lane (near and far)
runs its own `calcCortnFreeField` which independently calls the barrier
helper — so the far lane sees `srcToBarrier` adjusted by the lane offset
via `distOffset` applied to `distFromKerb_m` upstream. In practice the
barrier helper reads `road.distFromKerb_m` directly (unmodified by
`distOffset`), which means all lanes share the same geometry relative to
the barrier's receiver-side distance. If per-lane barrier geometry is ever
needed, it would require extending `_cortnCalculateBarrier` to accept the
lane offset.

#### Validation against SoundSurfer barrier scenario

Inputs: source RL 0.5 m, barrier base RL 0 m, barrier height 1.5 m,
receiver RL 1.5 m, receiver-to-barrier 3 m, source-to-barrier 4.5 m
(= 4 m kerb offset + 3.5 m standard offset − 3 m receiver-to-barrier).

Computed:

| | Computed | Expected |
|---|---|---|
| `δ` | 0.0434 m | 0.0434 m |
| `x` | −1.362 | −1.363 |
| Zone | Shadow | Shadow |
| Attenuation | −8.0 dB | −8.0 dB |
| Day LA10 | 67.7 dB | 67.8 dB |
| Day LAeq | 64.7 dB | 64.8 dB |
| Night LA10 | 61.3 dB | 61.3 dB |
| Night LAeq | 58.3 dB | 58.3 dB |

All values within 0.1 dB — the day LA10/LAeq 0.1 dB offset carries
through from the Phase 2 free-field rounding drift.

### Receiver integration (Phase 4)

The static `distFromKerb_m` and `angleOfView_deg` fields on the CoRTN panel are the **defaults** used when no receivers are placed or when the panel is shown standalone. When receivers are placed on the map, the `calcTotalISO9613` aggregator computes a **per-receiver** CoRTN contribution for each road by cloning the road with receiver-specific geometry:

```js
var clone = Object.assign({}, road);
clone.distFromKerb_m  = _cortnDistanceToPolyline(recvLat, recvLng, road.vertices);
clone.angleOfView_deg = _cortnAngleOfViewFromReceiver(recvLat, recvLng, road.vertices);
clone.receiverHeight_m = getReceiverHeight(receiverIdx);
var result = calcCortnRoadPeriod(clone, period);
```

The clone isolates the receiver-specific overrides so the panel's static configuration is never mutated. The barrier object is a nested reference — not modified, so the shallow clone suffices.

#### Perpendicular distance — `_cortnDistanceToPolyline`

Uses a local flat-earth ENU projection anchored at the receiver:

```js
cosPhi = cos(recvLat · π/180);
toXY(lat, lng) = { x: (lng − recvLng) · cosPhi · 111320, y: (lat − recvLat) · 111320 };
```

For each polyline segment `[A, B]`, the foot of the perpendicular from the receiver-at-origin `P = {0, 0}` onto segment `AB` is clamped to `t ∈ [0, 1]`:

```js
t = ((P − A) · (B − A)) / |B − A|²
Q = A + clamp(t, 0, 1) · (B − A)
dist² = Q.x² + Q.y²
```

The minimum over all segments is the perpendicular distance. 111 320 m per degree is the standard "metres per degree of latitude" constant; longitude is corrected by `cos(lat)`. Accurate to <1 m for distances up to a few km (where the flat-earth approximation starts to lose precision).

#### Angle of view — `_cortnAngleOfViewFromReceiver`

Approximation: the angle subtended at the receiver by the polyline's **first** and **last** vertices only.

```js
v1 = (firstVert − recv), v2 = (lastVert − recv)   // both in local ENU metres
cosθ = (v1 · v2) / (|v1| · |v2|)
angle = acos(clamp(cosθ, −1, +1)) · 180/π     // degrees, 0..180
```

Exact for straight-line roads. For curved polylines (e.g. a road that bends back on itself) it can under-represent the true angle of view; in that case the road should be split into multiple straight segments and registered as separate `cortnRoads[]` entries. CoRTN's broad `angleOfView_deg` bin (default 180°) makes this approximation adequate for real-world road geometries.

### Broadband → octave spectrum conversion

CoRTN produces broadband A-weighted LA10 and LAeq, but the existing ISO 9613-2 pipeline works internally with octave-band spectra. `cortnBroadbandToSpectrum(laeq)` at [index.html:6540ish](../index.html:6540) performs the conversion using the **MBS 010 road-traffic shape**:

```
Octave:    63   125   250   500   1k    2k    4k    8k
Relative:  18   14    10    7     4     6     11    11     (dB, unweighted)
```

The energy sum of the shape is normalised and then shifted so the per-band energy sum equals the input LAeq exactly:

```js
shapeSum = 10 · log₁₀(Σ 10^(rel[i]/10))
shift    = laeq − shapeSum
spectrum = rel.map(r => r + shift)
```

Verified: `cortnBroadbandToSpectrum(75)` returns an 8-band array whose energy sum is exactly 75.0 dB.

The spectrum converter is exposed via `window.cortnBroadbandToSpectrum` for future use by octave-band consumers. The current Phase 4 integration energy-sums at the broadband level inside `calcTotalISO9613`, so the spectrum converter is available but not yet called by the aggregator — it will become relevant if CoRTN results are ever passed to the noise map grid worker (Phase 5+).

### Energy summation into `calcTotalISO9613`

The per-receiver CoRTN loop is appended after the existing point/line/area/building source loops:

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

**Only day and night periods** produce contributions — CoRTN does not define eve or lmax, so `calcCortnRoadAtReceiver` returns `null` for those prefixes and the loop body never adds. Criteria panels that consume the day / night totals automatically see CoRTN contributions; the eve and lmax totals are unaffected.

The aggregation is at the **broadband** level — `totalLin` accumulates `10^(Laeq/10)` values. For simple predicted-level display this is fine. A future enhancement could call `cortnBroadbandToSpectrum(laeq)` inside the loop to contribute an 8-band spectrum for per-band ISO 9613-2 comparisons, but that is not needed by the current pipeline.

### CoRTN grid computation (Phase 5)

CoRTN roads now participate in a dedicated grid worker ([`cortn-worker.js`](../cortn-worker.js)), completely separate from the ISO 9613-2 noise map worker. The worker sweeps every grid cell in the current map bounds, computes the per-cell perpendicular distance and angle-of-view to every CoRTN road, and runs the same `SharedCortn.calcCortnRoadPeriod` correction chain used by the Phase 4 receiver integration.

The pure CoRTN math functions live in a `SharedCortn` IIFE namespace at the bottom of [`shared-calc.js`](../shared-calc.js) so the main thread and the worker can share a single copy of the formulas:

```
SharedCortn.calcCortnFreeField(road, period, overrides)
SharedCortn.calcCortnRoadPeriod(road, period)
SharedCortn.cortnCalculateBarrier(road, recv_h)
SharedCortn.cortnDistanceToPolyline(recvLat, recvLng, verts)
SharedCortn.cortnAngleOfViewFromReceiver(recvLat, recvLng, verts)
```

These are byte-for-byte identical to the equivalent functions in `index.html` (kept as a mechanical port; not yet refactored to delegate).

#### Per-cell loop

For every `(r, c)` cell and every valid CoRTN road:

1. Compute the grid cell's lat/lng from `startLat + r × dLat`, `startLng + c × dLng`.
2. `perpDist = cortnDistanceToPolyline(cellLat, cellLng, road.vertices)`.
3. `angleOfView = cortnAngleOfViewFromReceiver(cellLat, cellLng, road.vertices)`.
4. Build a shallow clone of the serialised road with these overrides:
   - `distFromKerb_m = max(perpDist − 3.5, 0.5)`
   - `angleOfView_deg = angle` (or 180 if `angle ≤ 0`)
   - `reflectionAngle_deg = 0`
   - `receiverHeight_m = message.receiverHeight`
5. Call `SharedCortn.calcCortnRoadPeriod(clone, period)` — this internally handles dual-carriageway + NSW 3-source-height energy summation.
6. Energy-sum the result's `laeq` and `la10` into per-cell accumulators.

After the road loop, the per-cell totals are written to the output grids:

```js
gridLaeq[r * cols + c] = 10 × log₁₀(Σ 10^(laeq_i/10))
gridLa10[r * cols + c] = 10 × log₁₀(Σ 10^(la10_i/10))
```

Cells with no valid road contribution stay at `NaN` (renderer treats as transparent).

#### Distance convention

Phase 4's `calcCortnRoadAtReceiver` uses `clone.distFromKerb_m = perpDist`. With that, `calcCortnFreeField` computes `d_horiz = perpDist + 3.5`, treating the perpendicular distance as the distance-to-kerb.

Phase 5's worker uses `clone.distFromKerb_m = perpDist − 3.5`. With that, `d_horiz = perpDist`, treating the perpendicular distance as the distance-to-effective-source-line.

Both conventions are defensible, but they produce different values at the same spatial location. For a cell 10 m from a road the difference is `-10 × log10(10/13.5) ≈ 1.3 dB`. Receiver points and grid cells at the same location will therefore disagree by ~1–1.5 dB for short distances (the gap closes at larger distances). Aligning the two conventions is Phase 6+ work.

#### Barrier handling (Phase 5 simplification)

The CoRTN barrier model uses a collinear source → barrier → receiver geometry. The worker passes the road's UI-configured `barrier` sub-object through unchanged (`height_m`, `baseRL_m`, `distToBarrier_m`). Because `clone.distFromKerb_m` varies per cell, `cortnCalculateBarrier` computes a different `srcToBarrier` for every cell — which is *not* physically correct (a real barrier has a fixed absolute position), but it does correctly fall back to "no screening" (`applied: false`) for cells closer than `distToBarrier_m` to the road, which is the main case the user cares about.

A rigorous fix would require an absolute barrier position (e.g. a Leaflet polyline for each barrier) and per-cell ray/barrier intersection — out of scope for Phase 5.

#### Other Phase 5 simplifications

- **No terrain profile screening** — flat-ground assumption, same as Phase 4.
- **Reflections forced to zero** — no facade geometry is available per cell.
- **Minimum grid is 5 m** — the CoRTN grid selector deliberately omits 1 m and 2 m. CoRTN's broadband output doesn't benefit from finer spacing, and the per-cell perpendicular-distance math is the dominant cost.
- **Metric toggle is a re-render, not a recompute** — the worker returns both `gridLaeq` and `gridLa10` in one pass, and the LAeq ↔ LA10 switch just paints the other grid.

### What the engine does NOT do (Phase 6+)

- **Terrain profile effects** — flat-ground assumption. Real terrain between source and receiver (cuttings, embankments, hills) is not modelled.
- **Per-lane barrier geometry in dual carriageway** — a single barrier geometry still applies to both lanes. Asymmetric near/far barriers would need a helper extension.
- **Source-height-aware barrier** — 3-source-height sub-sources all use the standard `roadHeight_m + 0.5` in the barrier calc. Per the Phase 3 spec.
- **Spectrum-level energy sum with ISO 9613-2 contributions** — Phase 4 sums at the broadband level. A spectrum-level aggregation would use `cortnBroadbandToSpectrum` and feed the 8 bands into the same energy accumulator the ISO 9613-2 pipeline uses internally. Not currently required because criteria comparisons only need the broadband total.
- **Unified distance convention** — Phase 4 receiver points and Phase 5 grid cells use different conventions for mapping `perpDist` into `d_horiz` (see above). ~1.3 dB discrepancy at short distances.
- **Absolute barrier positioning in grid mode** — barriers are treated as road-relative properties, not absolute map features.

## ISO 9613-2 §7.4 Ground–barrier interaction

ISO 9613-2 defines the barrier term `Abar` as an **insertion loss**, not a
separate additive attenuation. Formally:

```
Abar = max(Dz − Agr, 0)
```

where `Dz` is the Maekawa diffraction attenuation and `Agr` is the ground
attenuation. Because the total ground-plus-barrier attenuation that goes
into the propagation equation is `Agr + Abar`, substituting the insertion
loss definition gives the working form used in the code:

```
AgrBar = Agr + max(Dz − Agr, 0) = max(Dz, Agr)     per band
```

The subtlety the standard is very explicit about in §7.4 is that `Agr` in
the barrier case is **not** the ground effect on the unobstructed source→
receiver path. When a barrier is present the ground effect is recomputed
along two sub-paths — source → barrier top, and barrier top → receiver —
because the barrier top acts as a pseudo-receiver then a pseudo-source for
Table 3 purposes. The per-region ground factors are:

| Sub-path | source-side Gs | middle Gm | receiver-side Gr |
|----------|----------------|-----------|------------------|
| source → barrier | user `Gs` | user `Gm` | user `Gm` (barrier sits in the middle region) |
| barrier → receiver | user `Gm` | user `Gm` | user `Gr` |

**Per-region UI wiring (April 2026):** When `propagation.groundFactorPerRegion.enabled` is `true`, `_effectiveGroundFactor()` returns `{Gs, Gm, Gr}` and this object is passed directly to `calcAgrPerBand()` and `calcAgrBarrier()` in `shared-calc.js` (which already accepted the three-region form). The noise map worker (`_wkPathG` in `noise-worker.js`) detects an object-typed `isoParams.groundFactor` and returns it directly, bypassing ray-sampling from `groundZones[]`. When disabled, a scalar `iso_groundFactor` is used throughout (same behaviour as before this change).

Both sub-path Agr spectra are summed per band to get the barrier-case ground
effect, which is labelled `Agr_bar` in the code. The final combined term
used in the ISO 9613-2 Formula (12) attenuation sum is:

```
AgrBar_f = max(Ascreen_f, Agr_bar[i])    // per band, only when Ascreen > 0
        = Agr[i]                          // when no barrier / terrain screen
```

where `Ascreen = max(Abar, Aterr)` combines building / user barriers with
Deygout terrain diffraction (see the terrain screening section for that
combination).

### Why the `max()` instead of `Dz + Agr`

Writing `AgrBar = max(Dz, Agr_bar)` looks different from the textbook
`Agr + Abar` but it is mathematically identical **as long as** `Abar` is
strictly the insertion loss `max(Dz − Agr_bar, 0)`. The `max()` form is
numerically cleaner because it never requires evaluating a negative
intermediate: when `Dz > Agr_bar` the combined term is `Dz`, otherwise it
is `Agr_bar`. The `Abar + Agr` form introduces a cancellation that can lose
precision when `Dz ≈ Agr_bar`.

### The Agr ≥ 0 clamp is unnecessary inside the barrier branch

ISO/TR 17534-3 §5.5 suggests clamping `Agr` to zero to prevent "spurious
gain" when negative Agr (reflecting ground) is combined with a dominant
barrier. This clamp is redundant when the `max(Dz, Agr_bar)` form is used:
inside the barrier branch `Dz > 0` is guaranteed, so if `Agr_bar < 0` then
`max(Dz, Agr_bar) = Dz` — the negative Agr is automatically discarded
without an explicit clamp. The code therefore skips the clamp. The clamp
is only needed when the `Agr + Abar` form is used with a clipped `Abar`.

### Implementation

[`calcAgrBarrier(hS, hR, dp, G, barrierInfo)`](../shared-calc.js) in
`shared-calc.js` calls [`calcAgrPerBand`](../shared-calc.js) twice (once
per sub-path) with the spatially-varying G regions above, and returns the
8-band sum.

[`calcISOatPoint`](../shared-calc.js) and
[`calcISOatPointDetailed`](../shared-calc.js) take an optional
`barrierInfo = {d1, d2, hBar}` as their 10th parameter:

- `d1` — horizontal distance from source to the barrier edge intersection (m)
- `d2` — horizontal distance from that intersection to the receiver (m)
- `hBar` — height of the barrier top above the reference ground plane (m).
  When terrain is enabled and `vertexElevations` are cached on the barrier
  object, `hBar` is **terrain-aware**: `_barrierHBar(bw)` (index.html) /
  inline interpolation in `noise-worker.js` interpolates the absolute-ASL
  terrain elevation at the path-crossing point along the barrier edge, then
  returns `terrainElev + baseHeightM + barrierHeightM`. The crossing point
  is identified by `edgeVertexIdx` (threaded from `getIntersectingEdges` →
  `getDominantBarrier` → every `barrierInfo` construction site). When terrain
  is off or elevations unavailable, falls back to `baseHeightM + barrierHeightM`.

When `barrierInfo` is omitted or missing fields, the functions fall back to
the unobstructed-path `Agr` (backward compatible). Every ISO-path call
site constructs `barrierInfo` from the `getDominantBarrier` return value
via `_barrierHBar(bw)`.

#### Key functions — terrain-aware barrier height

- **`_fetchVertexElevations(obj)`** — async, queries `DEMCache.getElevations()` per vertex, stores absolute-ASL values in `obj.vertexElevations`. Called on creation, drag-end (partial re-fetch), and by `_fetchMissingVertexElevations()` on terrain-on and after load.
- **`_fetchMissingVertexElevations()`** — iterates all 6 object arrays and fetches any that lack `vertexElevations`.
- **`_interpolateBarrierTerrain(bw)`** — given a `getDominantBarrier` result, uses `bw.building.vertexElevations[iA..iB]` and the crossing intersection to linearly interpolate terrain elevation at the crossing.
- **`_barrierHBar(bw)`** — top-level helper; returns flat `baseHeightM + barrierHeightM` when terrain off, otherwise returns `_interpolateBarrierTerrain(bw) + baseHeightM + barrierHeightM`.
- **`edgeVertexIdx`** — new field on `getDominantBarrier` result (index of `edgeStart` in `building.polygon`). Added to `getIntersectingEdges` results in `shared-calc.js`; threaded through all 3 return paths in `getDominantBarrier`.

### When the §7.4 fix actually moves the number

The sub-path Agr calculation only changes the final attenuation when
`Agr_bar` exceeds the combined screen `Ascreen`. For tall barriers /
short distances / high lateral diffraction the barrier IL dominates and
`max(Ascreen, Agr_bar) = Ascreen` regardless — the sub-path calculation
is a no-op in that case. The §7.4 form matters most for grazing
geometries where the barrier is short enough that per-band ground
attenuation can exceed the barrier's diffraction loss at some frequencies.

Empirically against ISO/TR 17534-3 reference values:

| Test | Reference | Before §7.4 | After §7.4 | Effect |
|------|-----------|-------------|------------|--------|
| T08 (long barrier, varying G) | 32.48 | 31.97 | 31.97 | none — barrier IL dominates |
| T09 (short barrier, varying G) | 32.93 | 32.61 | 32.80 | +0.19 dB, within ±0.25 |
| T11 (cubic building)           | 41.30 | 40.34 | 40.34 | none — 25 dB cap dominates |

The residual error in T08 / T11 is from approximations elsewhere (Fresnel
z, region-extent G averaging, lateral-path energy summation) — not from
the ground-barrier interaction.

## CONCAWE Propagation Model (Report 4/81, Manning 1981)

Alternative propagation method. CONCAWE expresses total excess attenuation
as K1 + K2 + K3 + K4 + K5 + K6 + K7, where each K-term is an independent
correction. This section documents the terms implemented so far.

### K3 — Ground attenuation — [`shared-calc.js:calcConcaweK3`](../shared-calc.js)

Polynomial form per octave band:

    K3 = a₀ + a₁·log₁₀(d) + a₂·(log₁₀(d))² + a₃·(log₁₀(d))³

where d = source-receiver distance in metres.

#### Coefficient table (Report 4/81 Appendix II)

| Band (Hz) | a₀    | a₁     | a₂     | a₃     |
|-----------|-------|--------|--------|--------|
| 63        | 33.4  | −35.04 | 9.159  | −0.3508|
| 125       | 8.96  | −35.8  | 20.4   | −2.85  |
| 250       | −64.2 | 48.6   | −9.53  | 0.634  |
| 500       | −74.9 | 82.23  | −26.921| 2.9258 |
| 1000      | −100.1| 104.68 | −34.693| 3.8068 |
| 2000      | −7.0  | 3.5    | 0.0    | 0.0    |
| 4000      | −16.9 | 6.7    | 0.0    | 0.0    |

- 2000 Hz and 4000 Hz are linear (a₂ = a₃ = 0).
- 8000 Hz: not in CONCAWE; uses 4000 Hz coefficients as extrapolation.

#### Hard vs soft ground

- **Hard ground** (G = 0): K3 = −3 dB for all frequencies and distances.
  This is the hemispherical spreading correction (coherent reflection from
  a perfectly reflecting plane).
- **Soft ground** (G > 0): polynomial lookup as above.

The tool's existing ground factor G maps directly: G = 0 → hard, G > 0 → soft.
CONCAWE does not use intermediate G values — ground is binary.

#### Distance clamping (100–2000 m)

The polynomial curves were empirically fitted over the 100–2000 m range.
Below 100 m the 100 m value is used. Above 2000 m the 2000 m value is
used — the 500 Hz and 1000 Hz cubic terms cause physical rollover (K3
starts decreasing) beyond ~2000 m, which is non-physical.

### K5 — Source height correction — [`shared-calc.js:calcConcaweK5`](../shared-calc.js)

K5 reduces the ground + meteorological effect (K3 + K4) for elevated
sources, based on the grazing angle between source, receiver, and ground.

    ψ = atan((hs + hr) / d)      [grazing angle, degrees]
    γ = lookupGamma(ψ)           [from Figure 9 table]
    K5 = (K3 + K4 + 3) · (γ − 1)

#### Guards

- K5 = 0 when hs ≤ 2 m (source at or near ground level).
- K5 = 0 when (K3 + K4) ≤ −3 dB (ground + met effect already small).

#### Gamma table (Figure 9, linear interpolation)

| ψ (deg) | γ    |
|---------|------|
| 0.0     | 1.00 |
| 0.5     | 0.90 |
| 1.0     | 0.70 |
| 1.5     | 0.54 |
| 2.0     | 0.38 |
| 2.5     | 0.26 |
| 3.0     | 0.16 |
| 4.0     | 0.06 |
| 5.0     | 0.01 |

Values between table entries use linear interpolation. Below 0° returns
1.00; above 5° returns 0.01 (clamped).

The exp(−0.6ψ) approximation cited in some references is NOT used — it
is too inaccurate at small grazing angles (ψ < 2°) where most real
industrial noise scenarios fall.

### Complete CONCAWE prediction chain — [`shared-calc.js:calcConcaweAtPoint`](../shared-calc.js)

    Lp(f) = Lw(f) + adj − (K1 + K2 + K3 + K4 + K5 + Kscreen)

Where:
- K1 = geometric divergence = 20·log₁₀(d) + 11 dB (= Adiv, reused from ISO)
- K2 = atmospheric absorption = α(f) × d (= Aatm, reused from ISO via calcAlphaAtm)
- K3 = CONCAWE ground attenuation (polynomial or −3 dB hard)
- K4 = CONCAWE meteorological correction (Simplification 2)
- K5 = CONCAWE source height correction (gamma table)
- Kscreen = max(K6, Aterr) where K6 = barrier IL (Maekawa, reused), Aterr = terrain IL

**Key difference from ISO 9613-2:** K3 is always applied regardless of barrier
presence. ISO uses the §7.4 insertion-loss form where Agr and Abar interact
via `AgrBar = max(Dz, Agr_subpath)`. CONCAWE treats ground and barrier as
independent additive terms.

### K4 — Meteorological correction — [`shared-calc.js:calcConcaweK4`](../shared-calc.js)

Uses Simplification 2 from CONCAWE Report 4/81 §6.2 — single value per
meteorological category per octave band, independent of distance. Accuracy
loss vs the full distance-dependent polynomial model is only 0.5 dB(A).

Convention: **positive K4 = upwind attenuation** (reduces noise at
receiver), **negative K4 = downwind enhancement** (increases noise).

#### K4 table (Simplification 2)

| Cat | 63 Hz | 125 Hz | 250 Hz | 500 Hz | 1 kHz | 2 kHz | 4 kHz |
|-----|-------|--------|--------|--------|-------|-------|-------|
| 1   | 8.0   | 5.0    | 6.0    | 8.0    | 10.0  | 6.0   | 8.0   |
| 2   | 3.0   | 2.0    | 5.0    | 7.0    | 11.5  | 7.5   | 8.0   |
| 3   | 2.0   | 1.5    | 4.0    | 3.5    | 6.0   | 5.0   | 4.5   |
| 4   | 0     | 0      | 0      | 0      | 0     | 0     | 0     |
| 5   | −1.0  | −2.0   | −4.0   | −4.0   | −4.5  | −3.0  | −4.5  |
| 6   | −2.0  | −4.0   | −5.0   | −6.0   | −5.0  | −4.5  | −7.0  |

- Category 1 = strong upwind, Category 6 = strong downwind.
- Category 4 = neutral (zero correction).
- 8 kHz: uses 4 kHz values (extrapolation beyond CONCAWE range).

#### Meteorological category determination

Three-layer lookup: raw met inputs → Pasquill class → stability group →
CONCAWE met category.

**Layer 1: Pasquill stability class** (`getPasquillClass`)

Inputs: wind speed at 10 m (m/s), time of day, solar radiation (day) or
cloud cover (night).

Day table (solar radiation in mW/cm²):

| Wind (m/s)  | >60  | 30–60 | <30 |
|-------------|------|-------|-----|
| ≤1.5        | A    | A-B   | B   |
| 2.0–2.5     | A-B  | B     | C   |
| 3.0–4.5     | B    | B-C   | C   |
| 5.0–6.0     | C    | C-D   | D   |
| >6.0        | D    | D     | D   |

Night table (cloud cover in octas):

| Wind (m/s)  | 0–3  | 4–7   | 8   |
|-------------|------|-------|-----|
| ≤1.5        | F    | F     | D   |
| 2.0–2.5     | F    | E     | D   |
| 3.0–4.5     | E    | D     | D   |
| 5.0–6.0     | D    | D     | D   |
| >6.0        | D    | D     | D   |

Special cases:
- Transition (1 hr before sunset / after sunrise): always D.
- Category G: night, clear sky (0–3 octas), wind < 0.5 m/s.

**Layer 2: Pasquill group** (`pasquillToGroup`)

| Classes           | Group |
|-------------------|-------|
| A, A-B, B, B-C    | AB    |
| C, C-D, D, E      | CDE   |
| F, G              | FG    |

**Layer 3: Met category** (`getConcaweMetCategory`)

From Pasquill group + vector wind speed (m/s, positive = downwind):

| Group | v < −3 | −3 ≤ v < −0.5 | −0.5 ≤ v < 0.5 | 0.5 ≤ v < 3 | v ≥ 3 |
|-------|--------|---------------|-----------------|-------------|-------|
| AB    | 1      | 2             | 3               | 4           | 5     |
| CDE   | 2      | 3             | 4               | 5           | 6     |
| FG    | 3      | 4             | 5               | 6           | 6     |

#### Vector wind calculation

    vectorWind = windSpeed × cos(windDirection − sourceBearing)

- `windDirection`: degrees, direction wind is coming FROM (met convention).
- `sourceBearing`: degrees, bearing from receiver to source.
- When `windDirection = sourceBearing`, wind blows from source toward
  receiver = downwind = positive vectorWind.

The convenience wrapper `calcConcaweK4FromMet()` computes vectorWind,
derives Pasquill class → group → met category, and returns K4 plus all
intermediate values.

---

## Building Source Radiation

### Convention

Building sources use the Strutt/Bies-Hansen/VDI 3760 simplified inside-to-outside transmission formula:

```
Lw,surface = Lp_in − TL_surface + 10·log₁₀(S_surface) − 6
```

**Parameters:**
- `Lp_in` — reverberant (diffuse-field) interior SPL in dB(A). This is the well-mixed, spatially averaged level measured away from sources and hard surfaces in the central zone of the space. It must NOT be the level near a source, at a wall surface, or in a free-field environment.
- `TL_surface` — transmission loss of the surface in dB (broadband Rw, or per-octave-band R values)
- `S_surface` — radiating area of the surface in m²
- `−6` — diffuse-field-SPL to radiated-intensity-per-unit-area constant

**Derivation of the −6 constant:** In a diffuse reverberant sound field, the normal-component acoustic intensity incident on a surface is I = p²/(4ρc), where the factor of 4 reduces the isotropic free-field intensity p²/(ρc) by 4 (= 6 dB). The transmitted power per unit area is I / TL_linear, giving Lw = Lp_in − TL + 10·log₁₀(S) − 6. This is the standard result in Strutt (Arup internal), Bies & Hansen "Engineering Noise Control" (§8.3), and VDI 3760 (simplified mode).

**Warning:** Using a free-field Lp (measured at a given distance from the source) as the `Lp_in` input will give grossly incorrect results. The input convention is strictly the reverberant-field SPL.

### Surface types

The same formula applies to **façades** and **roofs**. There is no surface-orientation-dependent constant — the −6 dB derives from the diffuse-field input convention, not from the radiation geometry. Downstream geometry (source height, distance, ground factor Agr) is handled by the standard ISO 9613-2 propagation chain.

### Sub-source generation

`_bsGenerateSubSources` (index.html) converts the building polygon and height into discrete point sub-sources for propagation:

- **Façade sub-sources**: placed 0.5 m outward from each wall face. Vertical positions from `_vertRows(wallHt)`:
  - Wall height ≤ 4 m: one sub-source at mid-height (H/2)
  - Wall height ≤ 8 m: two sub-sources at H/3 and 2H/3
  - Wall height > 8 m: three sub-sources at H×0.25, H×0.5, H×0.75
  - Horizontal: evenly spaced with spacing ≤ 3 m (walls < 10 m), ≤ 5 m (10–30 m), ≤ 10 m (> 30 m)
- **Roof sub-sources**: distributed on a grid over the polygon footprint (spacing 2–10 m depending on area) at height = `baseHeightM + height_m` (absolute roof elevation)
- Each sub-source carries a fraction of the total surface Lw: `Lw_sub = Lw_total − 10·log₁₀(N_sub)`
- Façade sub-sources have an outward wall-normal and only radiate into the outward half-space (directivity filter in `_bsPropagateSub`)

### Propagation

Each sub-source is propagated to the receiver via `SharedCalc.calcISOatPoint` (or Concawe if the propagation method is set to Concawe). Source height `ss.heightM` is passed directly as `srcHeight`, so `calcAgrPerBand` correctly reduces ground interaction for elevated sources (e.g. roof at 8 m has minimal Agr contribution relative to a 0.5 m source). No building-source-specific bypass of the ISO 9613-2 chain exists.

### Octave-band path

When interior Lp is entered as octave-band values, `_bsOctavSpecZ` returns an unweighted dB(Z) spectrum per band:

```
Lw_Z(f) = Lp_in(f) − R(f) + 10·log₁₀(S) − 6
```

A-weighting is applied downstream by `calcISOatPoint` (Option B convention). The broadband `_bsCalcOneFacade` path applies A-weighting inside the octave summation and is used for the derived-Lw display panel only; the propagation chain always uses the octave path when octave Lp data is available.

### Regression tests

`building-source-radiation.test.js` (vitest) covers:
- Strutt worked example: Lp=80, TL=30, S=100 m² → Lw,facade = 64.0 dB(A)
- Roof example: Lp=85, TL=40, S=64 m² → Lw,roof = 57.06 dB(A)
- Per-band formula: Lw_Z(1 kHz) = Lp(1 kHz) − R(1 kHz) + 10·log₁₀(S) − 6
- Sign guard: Lw(TL=0, S=1, Lp=80) = 74 dB (not 86 dB — verifies −6 not +6)
- Area sensitivity: doubling S increases Lw by 3.01 dB
- TL sensitivity: +10 dB TL reduces Lw by exactly 10 dB
