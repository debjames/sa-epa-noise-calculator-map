# Engine Spectrum Convention Audit — April 2026

**Purpose:** Determine what format each source type passes to the engine, confirm or deny the Open Question from the GS integration audit, assess the scope of an Option A vs Option B unification, and recommend which approach to take for the unified custom-source UI.

**Status:** READ-ONLY — no source code or reference files modified.

**Date:** 2026-04-26

---

## Summary

**Recommendation: Option A** — fix at the data boundaries, engine unchanged.

Area sources are already handled correctly (a dedicated conversion function `_asGetSpectrumA` applies A-weighting before the engine call). Line sources and building sources pass raw dB(Z) to the engine — the same mismatch as point source GS library sources. Option A fixes all three with small, localised changes in `index.html`, no engine modification, no save-format migration, and no test-suite changes. Option B (move A-weighting inside the engine) would require a save-format migration, test reference updates, and multiple file changes — higher risk for equivalent correctness gain.

---

## Line/area spectrum_unweighted (STEP 1)

### Area sources

**Function:** `_asGetSpectrumA` (`index.html` lines 10626–10651)

```javascript
/** Build A-weighted octave-band spectrum for ISO 9613-2 propagation,
 *  scaled so that energy-sum equals targetLwA.
 *  Spectrum stored in as.spectrum[period] is UNWEIGHTED (from library_unweighted).
 *  Returns array[8] or null. */
function _asGetSpectrumA(as, period, targetLwA) {
  var bands = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  var AW    = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1];
  …
  var rawA = bands.map(function(f, i) {
    var v = specObj[f];
    return … parseFloat(v) + AW[i] …;   // ← A-weighting applied here
  });
  var adj = targetLwA - 10 * Math.log10(sumLin);
  return rawA.map(function(v) { return v + adj; });
}
```

`_asGetSpectrumA` reads `spectrum_unweighted` (dB(Z)) and **explicitly adds `AW[i]` per band** before normalising to `targetLwA`. The result (`specA`) passed to `calcISOatPoint` at line 10796 is **dB(A)**.

**Verdict: Area sources — CORRECT for current engine. `spectrum_unweighted` is dB(Z) stored; conversion to dB(A) happens in `_asGetSpectrumA` before the engine call.**

---

### Line sources

**Function:** `_lsGetEffectiveSpectrum` (`index.html` lines 10839–10851)

```javascript
function _lsGetEffectiveSpectrum(ls, period) {
  var mvt = (ls.movements && ls.movements[period]) || …;
  var adj = …; // movement adjustment only — no A-weighting
  if (ls.manualOverride && ls.manualOverride[period] && ls.manualSpectrum …) {
    var ms = ls.manualSpectrum[period];
    return [63,125,…].map(function(f) { return (ms[f] || 0) + adj; });
  }
  var base = ls.spectrum_m_base ? ls.spectrum_m_base[period] : null;
  // base = ls.spectrum_m_base[period] = found.spectrum_unweighted (dB(Z) from GS)
  return [63,125,…].map(function(f) { return (base[f] || 0) + adj; });
}
```

`_lsGetEffectiveSpectrum` returns `base[f] + movement_adj` — **no A-weighting**. `base` is `ls.spectrum_m_base[period]`, which is set to `found.spectrum_unweighted` at library-entry time (line 34697). `spectrum_unweighted` is dB(Z) from the GS sheet.

The returned array is then normalised by segment length and energy (lines 10993–10997) — a scalar shift, **no A-weighting step** — producing `specA` in dB(Z). This is passed directly to `calcISOatPoint` at line 11032.

**Verdict: Line sources — WRONG. `_lsGetEffectiveSpectrum` returns dB(Z); no conversion to dB(A) occurs before the engine call. Same mismatch as GS point sources.**

Note: the manual-override branch (`ls.manualSpectrum`) is unaffected by the library format bug, but its unit convention (what the line source panel UI saves) should be confirmed separately before fixing the library branch.

---

### Building sources (C1 fix status)

**Function:** `_bsOctavSpecA` (inside building-source IIFE, `index.html` ~line 32837)

```javascript
return BS_OCTAVE_BANDS.map(function(b, bi) {
  var linSum = 0;
  if (residualArea > 0)
    linSum += Math.pow(10, (lpOct[b] - cons.octaveR[b] + 10*Math.log10(residualArea) + hemCorrection)/10);
  …
  // C1 fix: return unweighted per-band Lw; A-weighting is applied by calcISOatPoint during propagation
  return linSum > 0 ? 10*Math.log10(linSum) : -Infinity;
});
```

The comment "C1 fix: return unweighted per-band Lw; A-weighting is applied by calcISOatPoint during propagation" documents an **incomplete partial migration**. The C1 fix changed the function to return dB(Z) (unweighted Lw per band), with the intent that the engine would apply A-weighting. The engine was never modified. The result: building sources pass dB(Z) to an engine expecting dB(A) — the same mismatch.

`specA_facade` and `specA_roof` (both from `_bsOctavSpecA`) are stored in sub-source objects and passed to `calcISOatPoint` at line 33157 as `ss.specA`.

**Verdict: Building sources — WRONG. The C1 fix was the first step of an intended Option B migration. The engine half of that migration was never implemented.**

---

## Engine call site inventory (STEP 2)

Worker handles **point sources only**. `lineSources`, `areaSources`, and `buildingSources` are calculated entirely within `index.html` receiver-panel functions.

| File | Line(s) | Function | Spectrum field read | Inline A-weight transform | Unit at engine | Status |
|------|---------|----------|--------------------|-----------------------------|----------------|--------|
| `index.html` | 10796 | `calcAreaSourceAtReceiver` | `specA` ← `_asGetSpectrumA(as, period, lwPoint)` | ✅ Yes — `_asGetSpectrumA` adds `AW[i]` | dB(A) | Correct |
| `index.html` | 11032 | `calcLineSourceAtReceiver` | `specA` ← `_lsGetEffectiveSpectrum(ls, period)` | ❌ None | dB(Z) | **Wrong** |
| `index.html` | 11187 | `calcISO9613forSourcePin` (Leq path) | `pin.spectrum[prefix]` | ❌ None | dB(A) custom / dB(Z) GS | Mixed |
| `index.html` | 11195 | `calcISO9613forSourcePin` (terrain detailed) | `pin.spectrum[prefix]` | ❌ None | Mixed | Mixed |
| `index.html` | 11417, 11421 | Reflection path | `pin.spectrum_max` / flat array | ❌ None | dB(A) custom | Correct (for custom sources) |
| `index.html` | 11602–11632 | Lmax path | `pin.spectrum_max` / flat | ❌ None | dB(A) custom | Correct (for custom sources) |
| `index.html` | 17810 | Detailed breakdown panel | `spectrum` (from `pin`) | ❌ None | Mixed | Mixed |
| `index.html` | 33157 | `_bsPropagateSub` (building source) | `ss.specA` ← `_bsOctavSpecA(…)` | ❌ A-weighting removed by C1 fix | dB(Z) | **Wrong** |
| `noise-worker.js` | 597, 599, 604 | Lmax ISO (worker) | `src.spectrum` ← `buildWorkerSources` ← `pin.spectrum[period]` | ❌ None | Mixed | Mixed |
| `noise-worker.js` | 624, 626, 631 | CONCAWE+spectrum (worker) | `src.spectrum` | ❌ None | Mixed | Mixed |
| `calc.test.js` | 241–287 | Test suite | `ISO_SPECTRUM = [37,43,48,53,56,54,51,43]` | None (hard-coded dB(A)) | dB(A) | Calibrated for current engine |
| `index.html` | 18179–18191 | In-app CAT 6 validation | `spec = AW6.map(w => 93+w)` | Applied at construction | dB(A) explicit | Calibrated for current engine |

**Summary by source type:**

| Source type | Storage format | Inline conversion | Engine receives | Correct? |
|-------------|----------------|-------------------|-----------------|----------|
| Point — custom UI | dB(A) | None | dB(A) | ✅ |
| Point — GS library | dB(Z) | None | dB(Z) | ❌ |
| Line — GS library | dB(Z) | None (movement adj only) | dB(Z) | ❌ |
| Area — GS library | dB(Z) | `_asGetSpectrumA` adds AW | dB(A) | ✅ |
| Building | dB(Z) (post C1 fix) | None | dB(Z) | ❌ |

---

## Option B scope (STEP 3)

Option B: change the engine (`calcISOatPoint` and `calcISOatPointDetailed`) to consume dB(Z) per band and apply A-weighting internally.

### 3a. Engine change (shared-calc.js)

The per-band summation in `calcISOatPoint` (line 661) currently:

```javascript
sumLin += Math.pow(10, (Lw_f + (adjDB || 0) - A_f) / 10);
```

Under Option B, an A-weighting table must be added to `shared-calc.js` and applied:

```javascript
var AW_BANDS = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1];
…
sumLin += Math.pow(10, (Lw_f + AW_BANDS[i] + (adjDB || 0) - A_f) / 10);
```

The same change is needed in `calcISOatPointDetailed` (line 673). Total: 2 functions, ~3 lines added.

### 3b. `_asGetSpectrumA` — must be simplified

Area sources currently convert dB(Z)→dB(A) in `_asGetSpectrumA` before the engine call. Under Option B this would double-weight. The `+ AW[i]` step must be removed: `rawA[i] = parseFloat(v)` (not `+ AW[i]`). The normalisation to `targetLwA` would then normalise the unweighted spectrum.

### 3c. Validation suite alignment (iso17534.test.js)

The iso17534.test.js `computePerBandLA` helper already uses **Option B convention** — it takes unweighted input and applies `LA_f = Lp_f + A_WEIGHT[i]` at output. The NOTE at line 22-23 explicitly documents that the engine currently uses the opposite convention. Under Option B, the NOTE and any direct `calcISOatPoint` calls in that file would need updating; however, the **reference values** produced by `computePerBandLA` would not change, since they are already computed in Option B style.

The `calc.test.js` regression test (`ISO_SPECTRUM = [37,43,48,53,56,54,51,43]`, expected ~15.26 dB) uses A-weighted input. Under Option B, the spectrum would need to change to its dB(Z) equivalent and the expected value recomputed.

### 3d. Save format — migration required

`pin.spectrum[period]` currently stores **dB(A)** for custom-UI and inline-fallback sources. Under Option B, the engine expects dB(Z). All existing saves containing custom spectra would produce wrong results without migration. Minimum change: bump `_version` from 3 to 4 and add migration code in `loadAssessment` to subtract `A_WEIGHTS[i]` from each `pin.spectrum[period][i]` in pre-v4 files. This is doable but non-trivial and error-prone.

For GS-library-sourced spectra already stored in saves as dB(Z): these would become correct under Option B without migration, but the saved dB(A) spectra from custom sources still need the reverse-conversion.

### 3e. Spectrum chart display

The spectrum chart (`spectrumChart`) reads `picked.spectrum[b]` from `SOURCE_LIBRARY` and labels the axis "A-weighted sound power level per octave band". Under Option B, `picked.spectrum[b]` would be dB(Z) — the chart label and potentially the axis values would need updating.

### 3f. Effort estimate: **Medium**

Files changed: `shared-calc.js` (engine + detailed), `index.html` (`_asGetSpectrumA`, CAT 6 test, save migration code, chart label), `calc.test.js` (new reference value), `iso17534.test.js` (NOTE + any direct calls), inline fallback source data. Plus save-format version bump with migration. 7–9 change sites across 4 files.

---

## Option A scope (STEP 4)

Option A: engine unchanged; fix the three wrong source types at the data boundaries.

### 4a. Point sources (GS library) — `rebuildSourceLibraries`, `index.html` line 9437

```javascript
// BEFORE:
spectrum: [row.hz_63, row.hz_125, row.hz_250, row.hz_500,
           row.hz_1000, row.hz_2000, row.hz_4000, row.hz_8000],

// AFTER:
spectrum: [row.hz_63  + AW[0], row.hz_125  + AW[1], row.hz_250 + AW[2],
           row.hz_500 + AW[3], row.hz_1000 + AW[4], row.hz_2000+ AW[5],
           row.hz_4000+ AW[6], row.hz_8000 + AW[7]],
```

`AW` already defined in scope or added at function top. `lp_dba` (the broadband Lw_A) is already correct and requires no change.

### 4b. Line sources — `_lsGetEffectiveSpectrum`, `index.html` line 10850

**Library-entry branch only.** The `manualSpectrum` branch stores values from the line-source panel UI; its unit convention must be confirmed before touching it. The library branch:

```javascript
// BEFORE:
return [63,125,…].map(function(f) { return (base[f] || 0) + adj; });

// AFTER:
var AW = [-26.2,-16.1,-8.6,-3.2,0.0,1.2,1.0,-1.1];
return [63,125,250,500,1000,2000,4000,8000].map(function(f, i) { return (base[f] || 0) + AW[i] + adj; });
```

(1 line changed, AW array added once in function scope)

### 4c. Building sources — `_bsOctavSpecA`, `index.html` ~line 32845

Revert the C1 partial migration: add `A_WEIGHTS[bi]` back to the per-band return value:

```javascript
// BEFORE (C1 fix — returns dB(Z)):
return linSum > 0 ? 10*Math.log10(linSum) : -Infinity;

// AFTER (Option A fix — returns dB(A)):
return linSum > 0 ? 10*Math.log10(linSum) + BS_A_WEIGHTS[bi] : -Infinity;
```

`BS_A_WEIGHTS` is already defined at line 10435 in scope. 1 line changed.

### 4d. Area sources — no change

`_asGetSpectrumA` already converts dB(Z)→dB(A). No change needed.

### 4e. Custom UI / inline fallback — no change

Custom UI saves dB(A) (correct). Inline fallback `[47,53,58,63,66,64,61,53]` sums to ≈stated Lw_A (correct, confirmed in spectrum-format-audit).

### 4f. Save format — no change needed

`pin.spectrum[period]` stores dB(A) for custom and inline sources — unchanged. GS library spectra, once re-imported from the rebuilt library, would be correct. No version bump or migration code.

The `data/sources-fallback.json` uses the same `hz_*` dB(Z) values as the live sheet. Since the fix is applied in `rebuildSourceLibraries` (and `rebuildLineSourceGrouped` etc.) — not in `normaliseRow` — the fallback JSON `hz_*` values remain dB(Z) but the conversion happens correctly at the rebuild step. No change to the fallback JSON file is required.

### 4g. Effort estimate: **Small**

Files changed: `index.html` only. Three targeted single-line changes (point source rebuild, line source spectrum getter, building source radiation function). Engine, test suites, save format, and all other reference files unchanged.

---

## Other downstream consumers (STEP 5)

| Consumer | Reads spectrum from | Current unit | Under Option A | Under Option B |
|----------|--------------------|--------------|--------------  |----------------|
| **Spectrum chart** (`updateSpectrumChart` / `getSpectrumData`) | `picked.spectrum[b]` from `SOURCE_LIBRARY_GROUPED` | dB(Z) (GS library) | Becomes dB(A) after fix — matches "A-weighted" label ✅ | Stays dB(Z) — label wrong, axis values change |
| **Source library admin** (`supabase-admin.js`) | Reads/writes Supabase directly | Admin stores dB(Z) (per "dB, unweighted" label) | No change | No change |
| **Save Assessment JSON** | `pin.spectrum[period]` | dB(A) (custom/fallback) | No change | Requires migration to dB(Z) |
| **Octave band panel display** (custom UI inputs) | User-entered bands rendered in inputs | dB(A) per label "Octave bands dB(A)" | No change | Label changes to dB(Z); input/display convention changes |
| **ISO/TR 17534-3 validation** (`computePerBandLA`) | `LW_UNWEIGHTED` (dB(Z)) internally | N/A — reference helper not engine | No change | Already aligned ✅ |
| **calc.test.js regression** | `ISO_SPECTRUM = [37,43,48,53,56,54,51,43]` (dB(A)) | dB(A) | No change | Reference value must change |
| **In-app CAT 6 test** | `spec = AW6.map(w => 93+w)` (dB(A) explicit) | dB(A) | No change | Change to `[93,93,…]` |
| **PDF export** | No per-band spectrum in PDF output | N/A | No change | No change |

---

## Recommendation (STEP 6)

**Option A. Fix at the data boundaries. Engine unchanged.**

Decision factors:

| Factor | Option A | Option B |
|--------|---------|---------|
| Engine changes | None | `shared-calc.js` (2 functions) |
| Acoustic risk | Zero — engine formula unchanged | Low, but any engine change can introduce subtle regressions across all source types |
| Files changed | 1 (`index.html`) | 4+ (`shared-calc.js`, `index.html`, `calc.test.js`, `iso17534.test.js`) |
| Save format migration | None | Required (version bump 3→4; subtract AW from pre-v4 custom spectra) |
| Validation suite | No changes | `calc.test.js` reference value changes; iso17534 NOTE/calls update |
| Area sources | Already correct | Must simplify `_asGetSpectrumA` (removes correct conversion) |
| Line sources | 1-line fix in `_lsGetEffectiveSpectrum` | No change needed |
| Building sources | Revert C1 partial migration (1 line) | No change needed |
| Maintainability | Convention stays at data boundary | Convention moves into engine (simpler long-term) |
| Custom UI redesign | User enters dB(Z); save path converts to dB(A) (1 extra step) | User enters dB(Z); saved as dB(Z) (simpler data flow) |

**The decisive factor is save-format migration.** Option B requires a `_version` bump and migration code that inverse-converts every `pin.spectrum[period]` array in existing saves. Without migration, every loaded assessment with custom spectra would produce incorrect predictions. Writing correct migration code for all save paths (point sources, area sources, line source manual spectra, building sources interior Lp) is risky and difficult to test.

Option A has no migration, no engine risk, fixes all three wrong paths in three lines of `index.html`, and leaves the test suite unchanged.

**The only condition that would change this recommendation:** if a decision is made to invest in a full Option B migration as a separate implementation effort (version bump, migration code, test updates, UI label changes). In that case, Option A should still be done first as an immediate fix, with Option B following in a later PR. The C1 comment ("A-weighting is applied by calcISOatPoint during propagation") documents that Option B was the intended destination — Option A is the safe interim state.

---

## Implications for unified custom UI

The planned unified custom-source UI includes:
- Overall dB(A) broadband level (existing convention, unchanged)
- Per-band dB(Z) octave levels (what the user sees on screen)
- Metric selector: **Lw** / **Lw/m** / **Lp** (building interior)

### Under Option A (recommended)

**Convention:** User displays dB(Z) per band; save path converts to dB(A) before storing in `pin.spectrum[period]`.

Concretely, the save handler gains one conversion step:

```javascript
// User enters dBZ[i]; save as dB(A):
pin.spectrum[period][i] = dBZ[i] + AW[i];
```

No other changes to downstream calculation or storage.

**Metric selector dispatch** — Lw / Lw/m / Lp are fundamentally different source types with independent data structures and calculation paths. A unified UI panel would need to dispatch to different backends:

| Metric | Source type | Data structure | Calculation function |
|--------|-------------|----------------|---------------------|
| Lw | `sourcePins` (point) | `pin.spectrum[period]` | `calcISO9613forSourcePin` → `calcISOatPoint` |
| Lw/m | `lineSources` | `ls.spectrum_m_base[period]` | `calcLineSourceAtReceiver` → `calcISOatPoint` per segment |
| Lw/m² | `areaSources` | `as.spectrum[period]` → `_asGetSpectrumA` | `calcAreaSourceAtReceiver` → `calcISOatPoint` per cell |
| Lp | `buildingSources` | interior `lpOct` + construction | `calcBuildingSourceAtReceiver` → `_bsOctavSpecA` → `calcISOatPoint` |

These are not interchangeable. The custom UI metric selector selects WHICH type of source object to create and persist. This is a UI architecture question separate from the spectrum convention; the spectrum format fix does not change the dispatch structure.

### Under Option B

User enters dB(Z); stored as dB(Z) directly in `pin.spectrum[period]`. The conversion step is removed. Metric selector dispatch remains the same. However, as noted, existing saves require migration.

---

*Audit conducted: 2026-04-26. Evidence: `index.html` (`_asGetSpectrumA` line 10626–10651, `_lsGetEffectiveSpectrum` line 10839–10851, `rebuildSourceLibraries` line 9427–9457, `rebuildLineSourceGrouped` line 10398–10417, `_bsOctavSpecA` line 32837–32848, `calcAreaSourceAtReceiver` line 10746–10796, `calcLineSourceAtReceiver` line 10940–11048, `_bsPropagateSub` line 33123–33163), `shared-calc.js` (`calcISOatPoint` line 607–666), `noise-worker.js` (lines 309–321, 597–632), `calc.test.js` (lines 237–290), `iso17534.test.js` (lines 1–80). No source code modified.*
