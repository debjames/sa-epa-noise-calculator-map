# Spectrum Format Audit — April 2026

**Purpose:** Determine the units stored in `pin.spectrum[period]` for each source-entry path (custom UI, Supabase library, inline fallback, Google Sheets), verify whether the propagation engine consumes those units correctly, and quantify any prediction error arising from a mismatch.

**Status:** READ-ONLY — no source code changed by this audit.

**Date:** 2026-04-26

---

## Verdict Summary

| Path | Format stored in `pin.spectrum` | Engine expects | Match? |
|------|---------------------------------|----------------|--------|
| Custom UI (manual entry) | **dB(A)** per band | dB(A) | ✅ Correct |
| Inline fallback library | **dB(A)** per band | dB(A) | ✅ Correct |
| Supabase library (via `library-loader.js`) | **dB(Z)** per band | dB(A) | ❌ Mismatch |
| Google Sheets path (`rebuildSourceLibraries`) | **Unknown** — column names (`hz_63` …) do not specify unit | dB(A) | ⚠️ Unverified |

**Scenario classification:** Closest to **Scenario 1** — the Supabase library path stores unweighted (dB(Z)) per-band levels, but the engine expects A-weighted (dB(A)) per-band input. Custom UI and inline fallback are correct. The table calculation (Receiver Panel) and the noise-map worker are *consistent with each other* — both consume the same `pin.spectrum[period]` field — so the error is identical in both outputs.

---

## STEP 1 — Engine Format

**File:** `shared-calc.js` (function `calcISOatPoint`)

The JSDoc at the function definition is explicit:

```javascript
/**
 * @param {number[]} spectrum - A-weighted Lw per octave band [63..8k]
 * ...
 */
function calcISOatPoint(spectrum, srcHeight, distM, adjDB, ...)
```

Inside the per-band loop the engine computes:

```javascript
var Lw_f = spectrum[i];
var A_f  = Adiv + Aatm_f + AgrBar_f;
sumLin  += Math.pow(10, (Lw_f + (adjDB || 0) - A_f) / 10);
```

**No A-weighting table is present in `shared-calc.js`.** The value `Lw_f` is used directly as the A-weighted input level for band `i`. The engine therefore assumes its input is already A-weighted. Passing unweighted (dB(Z)) values produces a wrong spectral distribution after `specAdj` normalisation (see STEP 5).

**Verdict:** Engine expects **dB(A)** per band. No ambiguity.

---

## STEP 2 — Library Source Format

### 2a. Supabase path — `library-loader.js`

**A-weighting constants defined at line 28–29:**

```javascript
var A_WEIGHTS = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1];
```

**`overallLwA` function (lines 39–51):**

```javascript
function overallLwA(bands) {
  var sum = 0;
  for (var i = 0; i < 8; i++) {
    var v = bands[i];
    if (v === null || v === undefined || !isFinite(v)) continue;
    sum += Math.pow(10, (v + A_WEIGHTS[i]) / 10);   // ← adds A-weighting
  }
  return Math.round(10 * Math.log10(sum) * 10) / 10;
}
```

The function *adds* `A_WEIGHTS[i]` before energy-summing. This is the conversion from unweighted to A-weighted — it is only correct if the input `v` is dB(Z). If `v` were already dB(A), A-weighting would be applied twice (double-weighting error).

**`mapPointSourceRow` (lines 78–86):**

```javascript
function mapPointSourceRow(row) {
  var bands = rowBands(row);   // = [row.hz_63, row.hz_125, …]
  return {
    lw:      overallLwA(bands),   // broadband dB(A) computed by adding A-weights to raw bands
    spectrum: bands,              // raw dB(Z) bands stored as-is
    …
  };
}
```

`lw` (broadband Lw_A) is computed correctly. But `spectrum` is the *raw unweighted* Supabase column values. What enters `pin.spectrum[period]` from the library is therefore **dB(Z)**.

**Verdict:** Supabase library stores **dB(Z)** per band.

### 2b. Inline fallback library (inside `index.html` ~line 9230)

Sample entry: `{"name":"Small kitchen exhaust fan—Lw 70 dB(A)","lw":70.4,"spectrum":[47,53,58,63,66,64,61,53]}`

Empirical check (browser console, STEP 6):

| Test | Result | Distance from stated Lw 70.4 |
|------|--------|-------------------------------|
| `energySum([47,53,58,63,66,64,61,53])` | **70.35 dB** | 0.05 dB |
| `overallLwA([47,53,58,63,66,64,61,53])` | 70.03 dB | 0.37 dB |

`energySum` (treating as dB(A)) is 7× closer to the stated Lw than `overallLwA` (treating as dB(Z)). `specAdj` at use = 0.05 dB (effectively zero).

**Verdict:** Inline fallback stores **dB(A)** per band. ✅

### 2c. Google Sheets path (`rebuildSourceLibraries` in `index.html` ~line 9427–9457)

```javascript
spectrum: [row.hz_63, row.hz_125, row.hz_250, row.hz_500,
           row.hz_1000, row.hz_2000, row.hz_4000, row.hz_8000],
lw: row.lp_dba,
```

Column names use `hz_NNN` notation — unit not encoded in the name. The broadband level comes from a separate column `lp_dba` (implying dB(A)), but the per-band values are assigned directly with no A-weighting conversion, identical to the Supabase path. Whether they are dB(A) or dB(Z) depends entirely on what was populated in the sheet.

**Verdict:** **Unknown** — unit depends on sheet population convention. Requires out-of-band confirmation. If the sheet was populated to match the Supabase database, bands are dB(Z); if manually entered matching the custom-UI convention, bands are dB(A).

---

## STEP 3 — Custom UI Format

**Save handler (`index.html` line 16162):**

```javascript
pin.spectrum[period][bandIdx] = parseFloat(val);   // direct save, no conversion
```

**UI labels (lines 2906, 3720):** Column headings read `"Octave bands dB(A)"`.

Users enter A-weighted per-band levels directly. Values are stored unchanged. No A-weighting is applied or removed.

**Verdict:** Custom UI stores **dB(A)** per band. ✅

---

## STEP 4 — Table vs Noise-Map Consistency

Both the receiver panel (table calculation) and the noise-map worker use the identical field:

**Receiver panel (`calcISO9613forSourcePin`, `index.html` ~line 11303–11313):**
```javascript
var spectrumA = pin.spectrum ? pin.spectrum[prefix] : null;
…
var specAdj = lwVal - 10 * log10(specEnergyLin);
// passes spectrumA to calcISOatPoint with adjDB = lwVal + specAdj
```

**Worker (`buildWorkerSources`, `index.html` ~line 36579–36604):**
```javascript
spec = pin.spectrum[period];
specAdj = lwVal - SharedCalc.energySum(spec) + opAdj + quantityAdjWorker;
result.push({ spectrum: spec, spectrumAdj: specAdj, … });
```

Both paths read `pin.spectrum[period]` and apply the same `specAdj = Lw_A − energySum(spectrum)` normalisation. The normalisation is a **uniform scalar offset** applied to all 8 bands — it does not introduce or remove A-weighting. It corrects only the total energy, not the spectral shape.

**Verdict:** Table and noise-map are **fully consistent** with each other. Any spectrum format error (dB(Z) from Supabase) manifests equally in both outputs. There is no table-only or worker-only anomaly.

---

## STEP 5 — The specAdj Normalisation and Why It Doesn't Fix the Mismatch

`specAdj = Lw_A − energySum(spectrum)` adjusts the total energy so that the sum of all bands equals the stated broadband Lw_A. It is a single scalar added to every band:

```
Lp_f = spectrum[f] + specAdj − Atot_f
```

For a Supabase source:
- `spectrum[f]` = dB(Z) band level (e.g. 80 dB at all 8 bands)
- `energySum(spectrum)` = 89.03 dB(Z)
- `specAdj` = Lw_A − 89.03 (a negative value, e.g. −2.03 for Lw_A = 87 dB(A))

After the offset, every band becomes `dBZ[f] + specAdj` — still a flat distribution, still wrong relative to the true A-weighted spectral shape. The engine then applies frequency-dependent `Aatm_f`, `Agr_f`, `Abar_f` to this wrong distribution. Because low-frequency energy is disproportionately represented in the unweighted spectrum, and low frequencies experience less atmospheric attenuation with distance, the Supabase-path result **over-predicts** the receiver level.

---

## STEP 6 — Empirical Verification

All calls used `SharedCalc.calcISOatPoint` directly in the browser console (no source-code change).

**Test A — Worst-case flat spectrum** (`spec_dBZ = [80…80]`, `spec_dBA = spec_dBZ + A_WEIGHTS`)
Both normalised to the same broadband Lw_A = 87.0 dB(A). G = 0, T = 10°C, RH = 70%.

| Distance | Lp with dBZ (wrong) | Lp with dBA (correct) | Over-prediction |
|----------|---------------------|-----------------------|-----------------|
| 50 m     | 44.28 dB            | 43.86 dB              | **+0.42 dB**    |
| 100 m    | 38.17 dB            | 37.41 dB              | **+0.77 dB**    |
| 200 m    | 33.04 dB            | 31.73 dB              | **+1.31 dB**    |
| 500 m    | 25.11 dB            | 22.66 dB              | **+2.45 dB**    |

With G = 0.5 (soft ground, adds frequency-dependent Agr):

| Distance | Lp with dBZ (wrong) | Lp with dBA (correct) | Over-prediction |
|----------|---------------------|-----------------------|-----------------|
| 100 m    | 35.64 dB            | 35.02 dB              | **+0.62 dB**    |
| 200 m    | 29.83 dB            | 28.42 dB              | **+1.42 dB**    |

**Test B — Realistic HVAC source** (Supabase-style spectrum `[68,72,76,79,78,74,68,60]` dB(Z), Lw_A = 81.7 dB(A))
This spectrum is already peaked in the mid-frequencies, closer to an A-weighted distribution, so the dB(Z) vs dB(A) shape difference is smaller.

| Distance | Lp as stored (dBZ) | Lp if correctly dBA | Over-prediction |
|----------|--------------------|----------------------|-----------------|
| 50 m     | 39.56 dB           | 39.44 dB             | **+0.11 dB**    |
| 100 m    | 33.66 dB           | 33.45 dB             | **+0.21 dB**    |
| 200 m    | 28.69 dB           | 28.30 dB             | **+0.39 dB**    |
| 500 m    | 20.77 dB           | 19.93 dB             | **+0.84 dB**    |

**Test C — Inline fallback format check** (confirmed empirically, see §2b above)

### Interpretation

- Error **always over-predicts** (conservative direction for compliance purposes but misleading for design).
- Error **grows with distance** — driven by frequency-dependent `Aatm_f` accumulating over path length.
- Magnitude depends on spectral shape: a flat dB(Z) source (worst case) produces ~0.8–2.5 dB over-prediction at typical assessment distances; a source whose dB(Z) spectrum is already midfrequency-peaked produces ~0.1–0.8 dB.
- Errors below ~0.5 dB fall within the acceptable tolerance for point-source results without barriers (±0.5 dB, per `soundplan-comparison.md`). Errors above ~1 dB at distances ≥ 200 m warrant a fix.

---

## Fix Scope

The mismatch is confined to **`library-loader.js`, function `mapPointSourceRow`** (and, if applicable, the Google Sheets `rebuildSourceLibraries` path once its unit convention is confirmed).

**Required change (one line):**

```javascript
// BEFORE (stores raw dB(Z)):
spectrum: bands,

// AFTER (converts to dB(A) at import time):
spectrum: bands.map(function(v, i) { return v + A_WEIGHTS[i]; }),
```

With this fix:
- `energySum(spectrum)` = `overallLwA(bands)` = `lw` — so `specAdj` ≈ 0 at use.
- The spectral shape passed to `calcISOatPoint` is correct (A-weighted).
- Saved assessments containing previously-imported library sources would need re-importing to get corrected spectra; existing `pin.spectrum` values in saved JSON remain dB(Z) until the source is reloaded from the library.

**Migration risk:**
- LOW for new assessments — fix is transparent at import.
- MEDIUM for existing saved assessments containing library sources — the saved `pin.spectrum[period]` arrays remain in dB(Z) until the source is re-imported. A one-time migration note in the UI (or a version check in `loadAssessment`) could prompt re-import. However, since the current prediction is over-estimated by at most ~2.5 dB (conservative), existing results are not invalidated; they are merely slightly pessimistic.
- Custom UI sources: **unaffected** — they are stored as dB(A) and will remain correct.
- Inline fallback sources: **unaffected** — already dB(A), no conversion needed (conversion would double-weight them).
- Google Sheets sources: **pending unit confirmation** before any change.

---

## Open Questions

1. **Google Sheets column convention** — Is `hz_63` in the sheet populated as dB(A) or dB(Z)? Check with whoever maintains the sheet template. If dB(Z), the same `+ A_WEIGHTS[i]` fix applies to the `rebuildSourceLibraries` path.
2. **Saved-assessment migration** — Should `loadAssessment` detect and convert dB(Z) spectra from pre-fix saves? A simple heuristic: if `energySum(spectrum) − lw > 3 dB` for a library source, the spectrum is likely dB(Z) and should be converted. Needs separate implementation task.
3. **Inline fallback sourcing** — The inline fallback data was entered as dB(A) per band (confirmed). Ensure any future additions to the inline library continue to use dB(A) — add a comment to the inline data block in `index.html`.

---

*Audit conducted: 2026-04-26. Evidence: `shared-calc.js` (JSDoc + per-band loop), `library-loader.js` (A_WEIGHTS, overallLwA, mapPointSourceRow), `index.html` (custom UI save handler, inline fallback energy check, buildWorkerSources, calcISO9613forSourcePin). Empirical verification via `SharedCalc.calcISOatPoint` browser console calls — no source code modified.*
