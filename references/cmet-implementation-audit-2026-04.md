# Cmet (ISO 9613-2 §8) Implementation Audit — April 2026

## Headline finding

ISO 9613-2 §8 Cmet is entirely absent from the current propagation chain. The term previously flagged in the gaps audit as "Kmet" is a separate quantity—it lives inside the Maekawa barrier diffraction formula, hardcoded to 1, and is acoustically unrelated to the broadband statistical correction that §8 Cmet describes. Adding Cmet is architecturally clean: it is a single broadband subtraction appended to the `return` statement of `calcISOatPoint` (line 684 of shared-calc.js), with no per-band changes and no interaction with the CONCAWE path. The CONCAWE met infrastructure (Pasquill class, wind/temperature UI) cannot be reused for ISO §8 Cmet but can serve as a UI precedent. Recommended scope is **Option B** (mode toggle + C0 input field, default 2 dB) with a **Small** effort estimate—one function change, two call-site adjustments, one save-format bump.

---

## Current Cmet handling (STEP 1)

### 1.1 Per-band attenuation chain in `calcISOatPoint`

Located at shared-calc.js lines 657–684. The per-band attenuation sums to:

```javascript
var A_f = Adiv + Aatm_f + AgrBar_f;
sumLin += Math.pow(10, (Lw_f + A_WEIGHTS_BANDS[i] + (adjDB || 0) - A_f) / 10);
```

`AgrBar_f` is already the combined max(Abar, Agr, Aterr) term. The chain is:

```
Adiv + Aatm_f + AgrBar_f  (per band, inside A-weighted energy sum)
```

**Cmet does not appear anywhere in this chain.** The audit's statement that Cmet = 0 (i.e. absent) is confirmed.

The function's final two lines (684–685) are:

```javascript
return 10 * Math.log10(sumLin);
```

This is the only place a broadband Cmet correction would be inserted:

```javascript
var lp = 10 * Math.log10(sumLin);
return lp - cmet;   // cmet ≥ 0; long-term average mode only
```

### 1.2 Kmet in `calcBarrierAttenuation` — confirmed ≠ Cmet

Located at shared-calc.js lines ~261–285. Kmet is hardcoded:

```javascript
var Kmet = 1;  // meteorological correction (no wind)
```

It is used **inside** the Maekawa diffraction parameter:

```javascript
var z_min = -Math.pow(C2 / C3, 2) * lambda / Kmet;
// ...
var Dz = 10 * Math.log10(3 + C2 * C3 * delta / lambda * Kmet);
```

Kmet modulates the Fresnel path-length ratio for each octave band inside the barrier formula. It is dimensionally tied to the diffraction geometry, not to long-term meteorological statistics. ISO 9613-2 §8 Cmet is a **broadband** statistical correction to the predicted level, applied after octave-band summation—an entirely different quantity. Setting Kmet = 1 correctly represents the worst-case downwind condition for barrier diffraction and should not be changed as part of this work.

### 1.3 Cmet search across codebase

A search for `Cmet`, `cMet`, `c_met`, `C_met`, `meteorological` in shared-calc.js and index.html returns:

- **shared-calc.js:** zero hits for any Cmet variant. The word "meteorological" appears only in the JSDoc comment `// meteorological correction (no wind)` at the Kmet hardcode (barrier function).
- **index.html:** zero hits for any Cmet variant. The word "meteorological" appears in the CONCAWE panel heading ("Meteorological conditions") and in the propagation-method descriptions; none relate to ISO §8.

**Verdict:** Cmet is entirely absent. The gaps-audit description was accurate and remains so.

---

## CONCAWE K4 infrastructure (STEP 2)

### 2.1 K4 implementation

Located at shared-calc.js lines ~1153–1186 (the `CONCAWE_K4_TABLE` and `calcConcaweK4`). The table is a lookup of per-octave-band corrections (dB) indexed by meteorological category 1–6 (1 = strong upwind, 6 = strong downwind). Signature:

```javascript
function calcConcaweK4(freqHz, metCategory)
// returns: K4 in dB (positive = upwind attenuation, negative = downwind enhancement)
```

K4 is applied **per band** inside `calcConcaweAtPoint` and `calcConcaweAtPointDetailed`:

```javascript
var K4_f = calcConcaweK4(freq, metCat);
// added per-band alongside K1 (divergence), K2 (atmospheric), K3 (ground),
// K5 (foliage) inside the CONCAWE A-weighted energy sum
```

K4 is thus a per-band correction inside the CONCAWE propagation path. ISO §8 Cmet is a scalar broadband subtraction applied after A-weighted summation on the ISO path. They are structurally different in kind and application.

### 2.2 Pasquill UI exposure

The CONCAWE panel (`#concaweMetPanel`) at index.html lines ~3862–3933 exposes:

- Wind speed (m/s) — `#concaweWindSpeed`
- Wind from (°) — `#concaweWindDir`
- Time of day — `#concaweTimeOfDay`
- Solar radiation (day) — `#concaweSolarRad`
- Cloud cover — `#concaweCloudCover`

The Pasquill class and derived met category are shown as **read-only computed results** (`#concawePasquillDisplay`, `#concaweMetCatDisplay`). The panel is hidden (`display:none`) when the propagation method is not CONCAWE.

### 2.3 Reusability for ISO Cmet

The CONCAWE met UI cannot be directly reused for ISO §8 Cmet. The two models differ:

| | CONCAWE K4 | ISO §8 Cmet |
|---|---|---|
| Input | Pasquill class (wind, time of day, solar, cloud) | C0 (or long-term wind fraction) |
| Output | Per-octave correction (dB) × 7 bands | Single broadband scalar (dB) |
| Formula | Lookup table (CONCAWE 4/81 §6.2) | Geometric formula: C0 × [1 − 10hs/(hs+hr) + 85·log(dp/(50·hs))] |
| Application | Inside per-band energy sum | After A-weighted broadband sum |

The CONCAWE UI design (labelled inputs, computed read-only result row) is a useful **structural precedent**—a small collapsible section visible only when ISO 9613-2 is selected, showing a C0 slider/input and a computed Cmet read-out. But the specific input fields (Pasquill, solar radiation, cloud cover) have no place in the ISO path.

**Potential mapping:** if desired, the Pasquill class from the CONCAWE UI could map to a default C0 (e.g. class F/G → C0 ≈ 2 dB; class D → C0 ≈ 1 dB). This is not needed for a minimum viable implementation—C0 = 2 dB default is a defensible starting point from ISO 9613-2 examples.

### 2.4 Mutual exclusivity confirmed

ISO 9613-2 and CONCAWE are **strictly mutually exclusive**—the propagation method is selected via a single `data-val` button group (`simple` / `iso9613` / `concawe`). At compute time, conditional branching calls either `calcISOatPoint()` or `calcConcaweAtPoint()`, never both. Cmet (ISO §8) and CONCAWE K4 will therefore never be simultaneously active. No conflict.

---

## UI design recommendation (STEP 3)

### Options considered

**Option A — Mode toggle only**

A single checkbox ("Long-term average (apply Cmet)") in the Propagation accordion, visible only when the ISO 9613-2 method is selected. When checked, Cmet is computed from a hardcoded C0 = 2 dB and the geometry (hs, hr, dp) for each receiver path. When unchecked (default), Cmet = 0 (downwind / worst-case).

*Pros:* Minimal UI. No new user data required. Acoustically defensible—ISO 9613-2 uses C0 = 2 dB as its illustrated value.
*Cons:* C0 = 2 dB may not match site-specific conditions. Australian regulators may ask what C0 was assumed.

**Option B — Mode toggle + C0 input (recommended)**

The toggle activates a small C0 input (number field, default 2, range 0–3 dB, step 0.5) alongside a read-only computed Cmet display for the currently active receiver. This follows the same pattern as the per-region G scalar / advanced mode introduced in the recent G implementation.

*Pros:* Allows site-specific calibration. C0 is self-documenting in the save JSON. User can always leave it at the default. Minimal additional UI footprint.
*Cons:* Slightly wider scope than Option A (one extra input field + validation).

**Option C — Mode toggle + wind-rose fraction**

Prompt the user for the fraction of time the wind blows from source toward receiver; derive C0 from that fraction. Physically most rigorous.

*Cons:* Requires met data users rarely possess for Australian screening assessments. Introduces a second input that changes per source–receiver pair, conflicting with the global Cmet concept as used in ISO 9613-2. Disproportionate to the screening-tool context.

### Recommendation: Option B

For a screening tool operating in SA/VIC/NSW regulatory contexts, the typical workflow is: apply ISO 9613-2 for worst-case, then optionally switch to long-term mode if the consent or assessment requires it. Option B provides the toggle plus a calibratable C0 with the right default. The per-region G precedent (scalar default + optional override) fits the same pattern. Option A is acceptable if the team prefers minimal UI surface; Option C is disproportionate and not recommended.

The C0 input should appear inline in the Propagation accordion, below the ISO 9613-2 method heading and only when ISO 9613-2 is the active method. A tooltip should state: "ISO 9613-2 §8 meteorological correction. C0 = 2 dB is the standard's illustrative value for downwind conditions. Cmet = 0 in worst-case (downwind) mode."

---

## Integration analysis (STEP 4)

### 4.1 Per-region G

Cmet uses hs and hr (source and receiver heights), the same inputs already present in `calcISOatPoint` for the Agr computation. No conflict. Cmet is a separate additive term applied after Agr is already incorporated in the per-band sum.

### 4.2 Deygout terrain

Terrain IL is per-band and modifies `AgrBar_f` inside the loop. Cmet is a broadband scalar applied after the loop. The two operate at different stages of the chain with no shared state. No conflict.

### 4.3 Building source diffuse-field

Each building sub-source calls `calcISOatPoint` independently. Cmet applies to the result of each call exactly as it would for a point source. No special case required; the Cmet parameter flows through the same function signature.

### 4.4 Option B spectrum convention

The spectrum convention (Option B, per engine-convention-audit-2026-04.md) operates on Lw values fed into `calcISOatPoint`. Cmet is applied to the output broadband Lp after A-weighted summation—strictly downstream of spectrum convention. No interaction.

### 4.5 Save format

`_version` is currently 4. Cmet state (a boolean `cmetActive` and a number `cmetC0`) requires a version bump to 5. These are additive fields: assessments saved with `_version: 4` would load without Cmet fields present, defaulting correctly to `cmetActive = false` / `cmetC0 = 2` (off = downwind). No migration function is required; the version guard at line 24411 (`data._version > 4`) would surface a warning if a v5 file were loaded in an older session—acceptable behaviour.

### 4.6 ISO/TR 17534-3 test suite

The 25-scenario validation runs all test cases in worst-case downwind mode (Cmet = 0). With Cmet defaulting to inactive, the test suite remains unaffected. After implementation, the "Run validation" button should still pass 25/25 without modification.

---

## Effort and scope (STEP 5)

### Effort estimate: Small

The gaps audit estimated Medium effort. On current code, the estimate revises to **Small** because:

1. **`calcISOatPoint` change is one line.** Adding a `cmet` parameter (default 0) and subtracting it from the final `return` is a two-line change to the function body, with a one-line signature change.

2. **Call sites are limited.** The main propagation calls are:
   - Receiver-panel predictions (one call site in the index.html `calculateReceiver()` path)
   - Heatmap worker (one call in the worker's inner loop, passing the global `cmet` value)
   - Scenario comparison (re-uses the same receiver function; inherits automatically)
   
   Estimated 3–5 call-site adjustments total.

3. **No per-band changes.** Cmet is broadband—no changes to `calcAgrPerBand`, `calcBarrierAttenuation`, terrain IL, or atmospheric absorption.

4. **No CONCAWE path changes.** CONCAWE is a separate branch; it is untouched.

5. **State is global and scalar.** A single `window._cmetActive` bool and `window._cmetC0` number suffice, matching the pattern used by `_concaweMetCategory` and `_gIsPerRegion`.

### Files affected

| File | Change |
|------|--------|
| `shared-calc.js` | `calcISOatPoint`: add `cmet` parameter, subtract from return value |
| `index.html` | Add Cmet toggle + C0 input to Propagation accordion (ISO section only); wire `_cmetActive` / `_cmetC0` state; pass `cmet` to ISO call sites (receiver panel, heatmap worker dispatch); save/load fields; `_version: 5` |
| `references/changelog.md` | Add entry |
| `references/calculations.md` | Add §8 Cmet formula and parameter table |
| `references/uat-tests.md` | Add Cmet-off and Cmet-on test cases (at least one per source type) |
| `references/architecture.md` | Add `_cmetActive`, `_cmetC0` to global state inventory |

**Not affected:** `calcBarrierAttenuation` (Kmet stays at 1), `calcConcaweAtPoint`, criteria logic (SA/VIC/NSW), save migration functions.

### Approximate change count

- ~10–15 lines in `shared-calc.js`
- ~30–50 lines in `index.html` (UI element, state wiring, save/load, worker dispatch)
- Reference doc updates (~20–30 lines across 4 files)

Total: small—roughly half the effort of the per-region G implementation.

---

## Open questions

1. **C0 = 2 dB for Australian regulatory contexts.** ISO 9613-2 cites C0 = 2 dB as an illustrative value, but it notes that C0 should be determined from local meteorological statistics. SA EPA, VIC EPA, and NSW EPA guidance documents do not currently specify a C0 value or require long-term averaging via ISO §8 Cmet (they typically specify worst-case downwind). Confirm with the acoustic team whether C0 = 2 dB is accepted by SA/VIC/NSW regulators, or whether regulators expect worst-case (Cmet = 0) and the long-term mode is purely for informational/comparison use.

2. **Cmet clamp at Cmet = 0.** ISO 9613-2 §8 states Cmet ≥ 0 always, so the formula must be clamped to zero when hs or hr are large relative to dp (geometry where the formula would otherwise go negative). The clamp should be explicit in code, not implicit via `Math.max(0, ...)` scattered at call sites. Confirm the Cmet formula to use: whether the standard's `dp/(50·hs)` term uses slant distance or horizontal distance, and whether hs and hr are AGL heights or ASL heights relative to the local ground interpolated from the terrain model.

3. **Heatmap worker `cmet` dispatch.** The heatmap worker runs in a Web Worker context and receives its parameters via `postMessage`. Confirm whether the worker already receives all ISO parameters (temperature, humidity, ground factor) in one message object, and therefore that `cmet` can be appended to that same object without a structural change.

4. **Terminology in UI and help text.** "Long-term average" vs "downwind / worst-case" is technically correct but may be unfamiliar to non-acousticians. Consider whether the mode toggle should use plain-language labels ("Worst case — downwind" / "Long-term average — apply met correction") or technical ISO terminology. Check against the QR and Help Assistant for consistency with existing propagation-method descriptions.
