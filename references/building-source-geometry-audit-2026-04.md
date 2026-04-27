# Building Source Radiation Geometry Audit — April 2026

**Audit scope:** Read-only investigation of façade vs roof surface handling in `_bsCalcDerived`, `_bsGenerateSubSources`, and `calcISOatPoint`.
**Date:** 2026-04-27
**Purpose:** Determine Gap 6 fix scope before implementation.

---

## Headline finding

**Scenario 1 applies with a minor Scenario 3 note.**
Heights are correct for the standard case (`baseHeightM = 0`). Roof sub-sources are placed at full building height; façade sub-sources are at fractional mid-wall heights. `calcISOatPoint` → `calcAgrPerBand` handles elevated sources correctly per ISO 9613-2 — Agr naturally approaches zero as source height increases. The `+6` hemCorrection is applied uniformly and identically to all surfaces (walls and roof). Surface areas S are already computed on-the-fly at the point of use; no new geometry helpers are needed. **Gap 6 is therefore a sign change only: replace `hemCorrection = 6` with `-6` at all call sites.**

---

## STEP 1 — Current `_bsCalcDerived` behaviour

**Location:** `index.html:33174–33218`

```javascript
function _bsCalcDerived(bs) {
  var walls = [], roofByPeriod = {day:null,eve:null,night:null}, totalByPeriod = ...;
  ...
  var roofArea = _asPolygonArea(bs.vertices);       // (line 33183) polygon footprint m²
  ['day','eve','night'].forEach(function(period) {
    ...
    walls.forEach(function(w, i) {
      var overr   = bs.facadeOverrides && bs.facadeOverrides[i];
      var wallHt  = (overr && Number.isFinite(overr.heightOverride))
                    ? overr.heightOverride : (bs.height_m || 6);     // (line 33195) — uses height_m, NOT bsHeight
      var wallArea = w.len * wallHt;                                 // (line 33196)
      var cons    = (overr && (overr.rw || overr.octaveR)) ? overr : bs.defaultConstruction;
      var lw      = _bsCalcOneFacade(lpBB, lpOct, cons, wallArea, overr, 6);  // (line 33202) ← hardcoded 6
      ...
    });
    if (bs.roofConstruction && bs.roofConstruction.enabled && roofArea > 0) {
      var rLw = _bsCalcOneFacade(lpBB, lpOct, bs.roofConstruction, roofArea, null, 6);  // (line 33210) ← same 6
      ...
    }
  });
}
```

**`_bsCalcOneFacade` formula** (`index.html:33121–33134`):

```javascript
function _bsCalcOneFacade(lpBB, lpOct, cons, area, overr, hemCorrection) {
  if (!Number.isFinite(hemCorrection)) hemCorrection = 6;   // (line 33123) default +6
  // Octave path:
  sum += Math.pow(10, (lp - r + 10*Math.log10(area) + BS_A_WEIGHTS[bi] + hemCorrection)/10);  // (line 33130)
  // Broadband path:
  lw = lpBB - cons.rw + 10*Math.log10(area) + hemCorrection;  // (line 33134)
}
```

**Finding:**
- The hemCorrection `+6` is **uniform** — applied identically to every wall and to the roof.
- There is **no differentiation** between façade and roof; both receive the same constant.
- The formula structure is already `Lp_in − TL + 10·log₁₀(S) + hemCorrection`.
- The only error vs the Strutt/VDI 3760 / SoundPLAN convention is the **sign**: the correct constant is `−6`, not `+6`.
- `residualArea` and sub-element area deduction within `_bsCalcOneFacade` are per-surface: each façade's residual area is handled independently.

---

## STEP 2 — Surface area access

**Roof area** — `index.html:33183`:
```javascript
var roofArea = _asPolygonArea(bs.vertices);
```
`_asPolygonArea` (`index.html:10842`) uses the spherical-excess shoelace formula on the polygon vertices. This gives the horizontal footprint area (m²). The value is recomputed on demand — not stored as a field on `bs`.

**Wall (façade) area** — computed per-wall in the loop (`index.html:33195–33196`):
```javascript
var wallHt  = (overr && Number.isFinite(overr.heightOverride)) ? overr.heightOverride : (bs.height_m || 6);
var wallArea = w.len * wallHt;
```
Again recomputed on demand — not stored.

**Stored fields on `bs`** (from `_bsMakeDefault`, `index.html:33219`):
- `bs.height_m` — building height in metres (no base offset)
- `bs.baseHeightM` — base elevation above ground (default 0)
- `bs.vertices` — polygon vertices from which geometry is derived
- `bs.roofConstruction.enabled` — boolean enabling/disabling roof radiation

**Pitch fields:** None. `_bsMakeDefault` has no `roofPitch`, `roofSlope`, or equivalent field. Flat roofs are assumed throughout. Roof area = horizontal footprint `_asPolygonArea(bs.vertices)`.

**Conclusion:** Both façade area S and roof area S are **fully derivable without new geometry helpers**. They are already computed at the exact point where hemCorrection is applied. The Gap 6 fix does not require area derivation work.

---

## STEP 3 — Heights used in propagation

**Source:** `_bsGenerateSubSources` (`index.html:33319–33549`)

```javascript
var bsHeight = (bs.baseHeightM || 0) + (bs.height_m || 6);   // (line 33332) absolute roof height
```

### Façade sub-sources

For each wall face, vertical positions are drawn from `_vertRows(wallHt)` (`index.html:33390`):

```javascript
function _vertRows(wallHt) {
  if (wallHt <= 4) return [wallHt / 2];
  if (wallHt <= 8) return [wallHt / 3, wallHt * 2 / 3];
  return [wallHt * 0.25, wallHt * 0.5, wallHt * 0.75];
}
```

Where `wallHt = (overr && overr.heightOverride) ? overr.heightOverride : bsHeight` (line 33412).

Sub-source height: `heightM: hm` (line 33504) where `hm` is an element of `_vertRows(wallHt)`.

**For the standard case (`baseHeightM = 0`, `height_m = 6`):**
- `bsHeight = 6`, `wallHt = 6`
- `_vertRows(6)` = `[2, 4]` → sub-sources at 2 m and 4 m above ground
- These are correct mid-wall positions for a 0–6 m wall.

**Inconsistency noted (minor, `baseHeightM > 0`):**
- `_bsCalcDerived` uses `wallHt = bs.height_m` (line 33195) — excludes base.
- `_bsGenerateSubSources` uses `wallHt = bsHeight = baseHeightM + height_m` (line 33412) — includes base.
- For `baseHeightM = 3`, `height_m = 6`: Lw is computed using `wallArea = wallLen * 6`, but sub-sources span `_vertRows(9) = [2.25, 4.5, 6.75]` m, starting from 0 (ground), while the wall runs from 3 to 9 m.
- This is a pre-existing issue for elevated buildings; no baseHeightM != 0 use case has been tested. Not in scope for Gap 6.

### Roof sub-sources

`index.html:33541`:
```javascript
result.push({ lat: pt[0], lng: pt[1], heightM: bsHeight,
  lwBB: lwRS, specA: specRS, facadeIdx: -1, isRoof: true });
```

Roof sub-sources are placed at `heightM = bsHeight = baseHeightM + height_m` — the **absolute roof elevation**. This is correct.

### Both paths enter propagation via `_bsPropagateSub` (`index.html:33553`):
```javascript
lp = SharedCalc.calcISOatPoint(ss.specA, ss.heightM, d, 0, barrierDelta, recHt, isoP, endDL, endDR, barrInfoBs);
```

`ss.heightM` is passed directly as `srcHeight`. No special casing — façade and roof sub-sources enter the same propagation path with their own heights.

---

## STEP 4 — Propagation chain confirmation

**`calcISOatPoint`** (`shared-calc.js:626`):
```javascript
var hS = Math.max(srcHeight, 0.01);
var Agr = calcAgrPerBand(hS, hR, d, gFactor);
```

**`calcAgrPerBand`** (`shared-calc.js:98`):
```javascript
function aPrime(h) {
  return 1.5 + 3.0 * Math.exp(-0.12*(h-5)*(h-5)) * (1 - Math.exp(-dp/50))
             + 5.7 * Math.exp(-0.09*h*h) * (1 - Math.exp(-2.8e-6*dp*dp));
}
// Source region As:
As[i] = -1.5 + Gs * Math.max(aPrime_or_bPrime_etc(hS), 0)   // bands 1–4
As[i] = -1.5 * (1 - Gs)                                       // bands 5–7
// Middle region Am:
var q = (dp <= 30*(hS+hR)) ? 0 : (1 - 30*(hS+hR)/dp);   // (line 33148)
Am[i] = -3 * q * (1 - Gm)
```

**Elevated source behaviour:**
- For `hS = 8 m` (roof), `exp(-0.09 * 64) ≈ 0.003`, `exp(-0.46 * 64) ≈ 0`. The height-dependent enhancement terms in `aPrime`, `bPrime`, etc. approach zero. The As region converges toward `-1.5 * (1-Gs)` across all bands — i.e. height-dependent ground interaction is strongly suppressed, consistent with ISO 9613-2's physical model.
- For `hS = 2–4 m` (mid-wall façade), height-dependent terms are partial — As retains ground interaction at the intermediate bands.
- `q` increases as `hS` grows (denominator `30*(hS+hR)` grows relative to dp for near sources), reducing Am toward 0 — further reducing middle-region ground attenuation for elevated sources.

**Conclusion:** `calcAgrPerBand` correctly implements ISO 9613-2 §7.3 for elevated sources. No bypass or workaround exists for building sources — they use the same `calcISOatPoint` path as point sources. Agr naturally decreases as source height increases, providing the physically correct behaviour for roof vs façade paths without any special-case logic.

---

## STEP 5 — Scenario classification

**Primary scenario: Scenario 1 — Heights are correct, `+6` is uniform.**

| Criterion | Finding |
|-----------|---------|
| +6 applied uniformly | YES — identical hardcoded `6` for all walls AND roof at all call sites |
| Façade sub-sources at mid-wall height | YES — `_vertRows(wallHt)` for `baseHeightM=0` |
| Roof sub-sources at roof height | YES — `heightM = bsHeight` |
| ISO 9613-2 Agr responds correctly to hS | YES — `calcAgrPerBand` reduces ground interaction as height increases |
| Special propagation bypass for building sources | NO — same `calcISOatPoint` path |

**Minor Scenario 3 note:** Surface areas S are not stored as fields but are computed inline at the exact call site. No new geometry helpers needed — areas are available at the hemCorrection application point.

---

## STEP 6 — Recommended Gap 6 fix scope

**Required: Formula sign change only.**

The current formula in `_bsCalcOneFacade` is structurally correct per Strutt/VDI 3760:
```
Lw = Lp_in − TL + 10·log₁₀(S) + hemCorrection
```
The surface area S is already passed as the `area` argument. The **sole error** is the sign of hemCorrection: `+6` must become `−6`.

### Change list

| # | File | Line | Current | Change to |
|---|------|------|---------|-----------|
| 1 | `index.html` | 33123 | `hemCorrection = 6` (default in `_bsCalcOneFacade`) | `hemCorrection = -6` |
| 2 | `index.html` | 33202 | `_bsCalcOneFacade(lpBB, lpOct, cons, wallArea, overr, 6)` (wall in `_bsCalcDerived`) | `..., -6)` |
| 3 | `index.html` | 33210 | `_bsCalcOneFacade(lpBB, lpOct, bs.roofConstruction, roofArea, null, 6)` (roof in `_bsCalcDerived`) | `..., -6)` |
| 4 | `index.html` | 33249 | `hemCorrection = 6` (default in `_bsOctavSpecZ`) | `hemCorrection = -6` |
| 5 | `index.html` | 33435 | `_bsCalcOneFacade(... el._clampedArea, null, 6)` (element, `_bsGenerateSubSources`) | `..., -6)` |
| 6 | `index.html` | 33438 | `_bsOctavSpecZ(... el._clampedArea, 6)` (element spec, `_bsGenerateSubSources`) | `..., -6)` |
| 7 | `index.html` | 33457 | `_bsCalcOneFacade(... residualArea, null, 6)` (residual wall, `_bsGenerateSubSources`) | `..., -6)` |
| 8 | `index.html` | 33460 | `_bsOctavSpecZ(... residualArea, 6)` (residual spec, `_bsGenerateSubSources`) | `..., -6)` |
| 9 | `index.html` | 33487 | `_bsCalcOneFacade(... wallArea, null, 6)` (no-elements wall, `_bsGenerateSubSources`) | `..., -6)` |
| 10 | `index.html` | 33490 | `_bsOctavSpecZ(... wallArea, 6)` (wall spec, `_bsGenerateSubSources`) | `..., -6)` |
| 11 | `index.html` | 33517 | `_bsCalcOneFacade(... roofArea, null, 6)` (roof, `_bsGenerateSubSources`) | `..., -6)` |
| 12 | `index.html` | 33520 | `_bsOctavSpecZ(... roofArea, 6)` (roof spec, `_bsGenerateSubSources`) | `..., -6)` |

**Not required:**
- Area derivation — areas already computed inline.
- Height correction — façade and roof heights are correct for `baseHeightM = 0`.
- Pitch handling — flat roofs only; no pitched roof geometry exists.
- New UI inputs — the `−6` constant is a derived physical constant (diffuse-field half-space convention), not user-tunable. Interior Lp and per-surface TL already exist as user inputs.
- Separate façade vs roof handling — the −6 constant applies equally to both per the standard.

**Net acoustic effect of the fix:** `−12 dB` reduction across all building source Lw predictions (−6 replacing +6). Assessments where building sources dominate will be significantly affected.

---

## Open questions

1. **Magnitude check before commit:** The `−12 dB` shift is large. Before implementing, the implementer should confirm against a SoundPLAN reference case (or Strutt calculator output) for a known building with known interior Lp, TL, and area. The UAT test suite (`references/uat-tests.md`) should be updated with an expected Lw for a reference building prior to implementation.

2. **`baseHeightM > 0` height bug (out of scope for Gap 6):** When `baseHeightM > 0`, `_bsGenerateSubSources` uses `bsHeight` (= baseHeightM + height_m) for both `wallHt` and for the row-height calculation, but `_vertRows` returns heights measured from 0, not from baseHeightM. Wall sub-sources are therefore misplaced vertically for elevated buildings. This is pre-existing and separate from Gap 6 — but should be flagged as a future issue.

3. **A-weighting double-application in `_bsCalcOneFacade`:** Line 33130 applies `BS_A_WEIGHTS[bi]` during the octave summation, producing an A-weighted Lw from `_bsCalcOneFacade`. But `_bsOctavSpecZ` (used for propagation) returns **unweighted** dB(Z) per-band spectra — A-weighting is applied downstream in `calcISOatPoint`. These are two separate code paths that must not be confused: `_bsCalcOneFacade` (broadband summary, display only) vs `_bsOctavSpecZ` (propagation, unweighted). The Gap 6 fix does not affect this split, but the implementer should verify that the `−6` change is correctly applied to both paths independently.

4. **`hemCorrection` parameter name:** After the fix, the parameter `hemCorrection` with value `−6` represents a diffuse-field correction, not a hemisphere correction. Renaming to `diffuseFieldCorr` or simply inlining `−6` as a constant with a comment would improve clarity, but is optional.
