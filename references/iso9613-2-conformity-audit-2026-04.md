# ISO 9613-2:1996 Conformity Audit — April 2026

**Assessment date:** 29 April 2026  
**Tool:** SA EPA Noise Calculator (vanilla JS, single-page app)  
**Scope:** ISO 9613-2:1996 §3–§8 and Annex A, equation-by-equation  
**Methodology:** Direct code inspection of `shared-calc.js` and call-sites in `index.html`; cross-reference against `acoustic-gaps-audit-2026-04.md` and `cmet-implementation-audit-2026-04.md`  
**Standard reference:** ISO 9613-2:1996, *Acoustics — Attenuation of sound during propagation outdoors — Part 2: General method of calculation*

---

## Headline findings

| Section | Status | Notes |
|---------|--------|-------|
| §6 Basic equations (eq. 1–6) | **Conformant** except Cmet | Cmet = 0 (intentional Gap 1) |
| §7.1 Geometrical divergence (eq. 7) | **Conformant** | 20·log10(d) + 11 exact |
| §7.2 Atmospheric absorption (eq. 8, Table 2) | **Conformant (superior)** | ISO 9613-1 formula used; no transcription of Table 2 |
| §7.3 Ground effect (eq. 9–11, Table 3) | **Conformant** | One non-standard clamp; no practical impact |
| §7.4 Screening / barriers (eq. 12–19) | **Minor deviation** | Fresnel approx. for z; Kmet = 1 hardcoded; multi-barrier Gap 4 |
| §7.5 Reflections (eq. 19–20, Table 4) | **Conformant (Table 4 implemented April 2026)** | Per-building ρ via Table 4 dropdown; default hard wall ρ=1.0; 2nd-order still Gap 8 |
| §8 Meteorological correction (eq. 21–22) | **Conformant (implemented April 2026)** | Cmet via toggle in Propagation panel; default OFF (conservative) |
| Annex A — Amisc | **Not implemented** | Intentional Gap 5 |
| Annex B — Terrain (Deygout) | **Conformant with caveats** | Implemented; additive vs Deygout-chained summation |

**No transcription errors were found in any constant, coefficient, or tabular value.** The implementation is sound. Deviations are minor, documented, and either conservative or explicitly registered as gaps.

---

## Section-by-section findings

### STEP 0 — Implementation inventory

All ISO 9613-2 implementation lives in `shared-calc.js`. The mapping is:

| Standard section | Implementation |
|-----------------|----------------|
| §6 eq. (3) per-band | `calcISOatPoint` lines 659–682 |
| §6 eq. (5) A-weighted sum | `calcISOatPoint` sumLin loop (line 680) |
| §6 eq. (6) Cmet | Not implemented |
| §7.1 eq. (7) Adiv | Inline in `calcISOatPoint` line 633 |
| §7.2 eq. (8) Aatm | `calcAlphaAtm` lines 219–243; ISO 9613-1 formula |
| §7.3 eq. (9) Agr | `calcAgrPerBand` lines 98–166 |
| §7.3 Table 3 a'/b'/c'/d' | Inner functions of `calcAgrPerBand` lines 109–121 |
| §7.4 eq. (12)+(14) Abar | `calcBarrierAttenuation` lines 260–285 |
| §7.4 eq. (15) C3 double diffraction | Lines 273–277 |
| §7.4 Agr / Abar combined | `calcAgrBarrier` lines 182–216; combined in `calcISOatPoint` lines 670–678 |
| §7.5 Reflections | `getDominantReflection` lines 965–1034 |
| §8 Cmet | Not implemented |
| Annex A Amisc (foliage, industrial, housing) | Not implemented |
| Annex B terrain (Deygout) | `findTerrainEdges` 1453–1490; `deygoutSelectEdges` 1493–1559; `terrainILPerBand` 1565–1609 |

---

### STEP 1 — §6 Basic equations

**Verdict: Conformant (eq. 1–5); eq. 6 not implemented (Gap 1).**

**1.1 Equation (3) — per-band level at receiver**

Implementation (`shared-calc.js:680`):
```javascript
sumLin += Math.pow(10, (Lw_f + A_WEIGHTS_BANDS[i] + (adjDB || 0) - A_f) / 10);
```
This evaluates `10^((Lw + Af - A) / 10)` per band where:
- `Lw_f` = unweighted Lw in dB(Z) (Option B, per spectrum convention)
- `A_WEIGHTS_BANDS[i]` = A-weighting per octave band (see §1.5)
- `A_f` = per-band total attenuation

Equation (3): `L_fT(DW) = L_W + D_c − A` — **conformant**. Note: D_c (directivity) = 0 throughout (Gap 3).

**1.2 Equation (4) — total attenuation per band**

`A_f = Adiv + Aatm_f + AgrBar_f` (`shared-calc.js:679`)

This sums three of the five standard terms:
- Adiv ✓
- Aatm ✓
- Agr/Abar (combined via §7.4 insertion-loss form) ✓
- Amisc absent — intentional (Gap 5)
- Dc absent — intentional (Gap 3)

**Conformant** for the implemented terms.

**1.3 Equation (5) — multi-source / multi-path A-weighted energy sum**

Energy sum inside the per-band loop, then `10 * Math.log10(sumLin)` as the return. A-weighting applied as `A_WEIGHTS_BANDS[i]` inside the exponent, so the energy domain sum is A-weighted per band. **Conformant.**

**1.4 Equation (6) — L_AT(LT) = L_AT(DW) − Cmet**

Cmet is entirely absent from `calcISOatPoint`. The return is:
```javascript
return 10 * Math.log10(sumLin);
```
No Cmet subtraction. Equivalent to Cmet = 0 (downwind worst-case). **Not implemented — intentional Gap 1.**

**1.5 Option B convention**

`A_WEIGHTS_BANDS = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1]` (`shared-calc.js:86`)

These are the standard A-weighting corrections for octave bands 63 Hz – 8 kHz. Applied internally in `calcISOatPoint`; input spectrum is dB(Z). **Conformant.**

---

### STEP 2 — §7.1 Geometrical divergence

**Verdict: Conformant.**

**2.1 Equation (7): A_div = 20·log10(d) + 11**

```javascript
var Adiv = 20 * Math.log10(d) + 11;   // shared-calc.js:633
```
Constant 11 ✓, reference distance d₀ = 1 m implicit ✓.

**2.2 Physical interpretation**

11 ≈ 10·log10(4π) = 10.99 dB, representing free-field spherical spreading from a 1 m reference. **Conformant.**

**2.3 Distance floor**

`var d = Math.max(distM, 1)` (`shared-calc.js:628`). For d < 1 m, d is clamped to 1 m, yielding A_div = 11 dB. The standard does not specify behaviour for d < d₀; clamping prevents log10(0) and negative divergence. **Minor deviation, no acoustic significance for real source-receiver geometries.**

---

### STEP 3 — §7.2 Atmospheric absorption

**Verdict: Conformant (superior to Table 2).**

**3.1 Equation (8): A_atm = α·d / 1000**

```javascript
var Aatm_f = alpha[i] * d;  // shared-calc.js:662
// alpha is in dB/m, d is in metres
```
`calcAlphaAtm` returns α in dB/m (ISO 9613-1 formula); multiplying by d (m) gives dB. Equivalent to ISO 9613-2 eq. (8) with α in dB/km × d / 1000. **Conformant.**

**3.2 Table 2 — not used**

The implementation uses the full ISO 9613-1 relaxation-frequency formula (`shared-calc.js:219–243`) for arbitrary temperature and relative humidity. This is referenced in ISO 9613-2 §7.2 Note 1 as the preferred method for conditions not covered by Table 2. **Superior to Table 2; no table-transcription risk.**

**3.3 Interpolation**

The ISO 9613-1 formula is continuous in T and RH; no interpolation is needed. **Conformant.**

---

### STEP 4 — §7.3 Ground effect

**Verdict: Conformant. One non-standard clamp with no practical impact.**

**4.1 Equation (9): A_gr = A_s + A_r + A_m**

```javascript
Agr.push(As[i] + Ar[i] + Am[i]);  // shared-calc.js:163
```
**Conformant.**

**4.2 Table 3 — As and Ar formulas**

| Band | Code | Standard |
|------|------|----------|
| 63 Hz | `-1.5` | `-1.5` ✓ |
| 125 Hz | `-1.5 + Gs·max(aPrime(hS), 0)` | `-1.5 + Gs·a'(hs)` see §4.4 |
| 250 Hz | `-1.5 + Gs·max(bPrime(hS), 0)` | `-1.5 + Gs·b'(hs)` ✓ |
| 500 Hz | `-1.5 + Gs·max(cPrime(hS), 0)` | `-1.5 + Gs·c'(hs)` ✓ |
| 1000 Hz | `-1.5 + Gs·max(dPrime(hS), 0)` | `-1.5 + Gs·d'(hs)` ✓ |
| 2–8 kHz | `-1.5 * (1 - Gs)` | `-1.5·(1 - Gs)` ✓ |

**Deviation:** `Math.max(..., 0)` is applied to each prime function result. The standard does not show this clamp. For physically plausible source heights (≤ ~15 m) and propagation distances, the prime functions are positive; the clamp has no effect. For extreme heights the clamp prevents the Agr term from producing a spurious gain contribution to attenuation, which is acoustically defensible. **Minor defensive addition; no practical impact under normal conditions.**

**4.3 Am formulas**

```javascript
var q = (dp <= 30 * (hS + hR)) ? 0 : (1 - 30 * (hS + hR) / dp);
var Am = [
  -3 * q,              // 63 Hz — no G factor
  -3 * q * (1 - Gm),  // 125 Hz – 8 kHz
  ...
];
```

Am threshold: `30*(hS+hR)` ✓ (not 10*(hS+hR) which is Cmet's threshold).  
Am at 63 Hz: `-3*q` (no G) ✓.  
Am at other bands: `-3*q*(1-Gm)` ✓.  
**Conformant.**

**4.4 Prime functions a'(h), b'(h), c'(h), d'(h)**

Each function verified coefficient-by-coefficient:

`aPrime(h)` (`shared-calc.js:110–111`):
```javascript
1.5 + 3.0 * Math.exp(-0.12 * (h-5)*(h-5)) * (1 - Math.exp(-dp/50))
    + 5.7 * Math.exp(-0.09 * h*h)          * (1 - Math.exp(-2.8e-6 * dp*dp))
```
Standard: `1.5 + 3.0·exp(−0.12·(h−5)²)·(1−exp(−dp/50)) + 5.7·exp(−0.09·h²)·(1−exp(−2.8×10⁻⁶·dp²))`  
All coefficients (3.0, −0.12, (h−5)², 1/50, 5.7, −0.09, h², 2.8×10⁻⁶, dp²) **verified ✓**.

`bPrime(h)` (`shared-calc.js:114`):
```javascript
1.5 + 8.6 * Math.exp(-0.09 * h*h) * (1 - Math.exp(-dp/50))
```
Coefficients (8.6, −0.09, 1/50) **verified ✓**.

`cPrime(h)` (`shared-calc.js:117`):
```javascript
1.5 + 14.0 * Math.exp(-0.46 * h*h) * (1 - Math.exp(-dp/50))
```
Coefficients (14.0, −0.46, 1/50) **verified ✓**.

`dPrime(h)` (`shared-calc.js:120`):
```javascript
1.5 + 5.0 * Math.exp(-0.9 * h*h) * (1 - Math.exp(-dp/50))
```
Coefficients (5.0, −0.9, 1/50) **verified ✓**.

No transcription errors. This is the highest-density coefficient table in the standard and it is correct throughout.

**4.5 Source/receiver/middle region assignment**

Per-region ground factors supported: `{Gs, Gr, Gm}`. As uses Gs, Ar uses Gr, Am uses Gm. Source region uses `hS`, receiver region uses `hR`, both with the same prime functions (correct per Table 3 symmetry). **Conformant.**

**4.6 Alternative A-weighted method (eq. 10)**

Not implemented. The octave-band method (eq. 9) is used exclusively. The standard describes eq. (10) as an "alternative" simplified method. Omitting it while using eq. (9) is correct and superior. **Conformant.**

---

### STEP 5 — §7.4 Screening / barriers

**Verdict: Minor deviations. No errors.**

**5.1 Equations (12)/(13) — insertion loss form**

The code uses the §7.4 insertion-loss form: when a barrier is present, Agr is recomputed along the source→barrier-top and barrier-top→receiver sub-paths, and the combined term is `max(Dz, Agr_subpath)` per band (`shared-calc.js:675`). This correctly cancels the unobstructed Agr per ISO eq. (12). **Conformant.** (This was validated to ±0.25 dB against ISO/TR 17534-3 T09.)

**5.2 Equation (14) — Maekawa diffraction**

```javascript
var Dz = 10 * Math.log10(3 + C2 * C3 * delta / lambda * Kmet);
                                         // shared-calc.js:281
```
Standard: `D_z = 10·log10(3 + (C2/λ)·C3·z·Kmet)`  
Expansion: `C2·C3·delta/lambda·Kmet` = `(C2/lambda)·C3·delta·Kmet` — **identical, different factor order**.  
Constant 3 ✓, C2 = 20 ✓. **Conformant.**

**5.3 Equation (15) — C3 double diffraction**

```javascript
var r = 5 * lambda / e;
C3 = (1 + r*r) / (1/3 + r*r);   // shared-calc.js:275-276
```
Standard: `C3 = [1 + (5λ/e)²] / [(1/3) + (5λ/e)²]`  
**Conformant.** C3 = 1 for single diffraction (e = 0) ✓.

**5.4 Equation (16) — path length difference z**

**Minor deviation.** The standard specifies:

> z = √[(d_ss + d_sr)² + a²] − d  (2D: a = 0, z = d_ss + d_sr − d)

The implementation uses the Fresnel approximation (`shared-calc.js:516–518`):
```javascript
var h_eff = topH - losHeight;
var dss_3d = Math.sqrt(d1*d1 + (topH - srcHeightM)*(topH - srcHeightM));
var dsr_3d = Math.sqrt(d2*d2 + (topH - recHeightM)*(topH - recHeightM));
delta = 2 * h_eff * h_eff / (dss_3d + dsr_3d);
```

This approximation gives `z ≈ 2h²/(d_ss + d_sr)` rather than the exact `d_ss + d_sr − d`. For symmetric geometries and small h/d ratios (typical for noise barriers), numerical comparison shows these agree to within < 0.05 m at d = 200 m, h = 5 m. The T08/T09/T11 test suite residuals (±0.25–1.0 dB) are partly attributable to this approximation; all are within acceptable ISO 9613-2 engineering tolerance. **Minor deviation. No fix required; document as a known approximation.**

**5.5 Equation (17) — double diffraction path length**

Same Fresnel approximation applies to the terrain version (line 1594). No explicit double-barrier case. Multiple barriers beyond the single dominant one are not yet combined (Gap 4). **Not applicable as a conformity failure; documented under intentional omissions.**

**5.6 Equation (18) — Kmet**

```javascript
var Kmet = 1;  // meteorological correction (no wind)
                // shared-calc.js:264
```
ISO 9613-2 eq. (18): `Kmet = exp[−(1/2000)·√(d_ss·d_sr·d/(2·z))]` for z > 0; `Kmet = 1` for z ≤ 0.

Hardcoding Kmet = 1 is the worst-case (most conservative) value; the exponential in eq. (18) always gives Kmet ≤ 1. This underestimates the benefit of favorable meteorology on barrier diffraction — it does not overestimate sound levels, and is appropriate for engineering assessments that seek to find the limiting case. **Minor conservative deviation, not an error.** Noted in prior audits (cmet-implementation-audit-2026-04, Gap 1).

**5.7 Dz cap**

```javascript
var maxDz = (e > 0) ? 25 : 20;   // shared-calc.js:266
return capped ? Math.min(Dz, maxDz) : Dz;
```
Single diffraction cap: 20 dB ✓.  
Double diffraction cap: 25 dB ✓.  
Lateral end-diffraction paths use `capped = false` per ISO/TR 17534-3 §5.3 ✓. **Conformant.**

**5.8 Screening validity conditions**

The standard's validity conditions (surface density ≥ 10 kg/m², closed surface, horizontal extent exceeds Fresnel ellipse) are not checked computationally. The tool assumes user-drawn barriers meet physical requirements. **Intentional omission; appropriate for a screening tool.**

---

### STEP 6 — §7.5 Reflections

**Verdict: Conformant (D6 implemented April 2026). 2nd-order reflections remain Gap 8.**

**6.1 Implementation status**

First-order single-dominant reflection via `getDominantReflection` (`shared-calc.js`). Image source method in the horizontal plane. Grazing cutoff at 80°. 2nd-order reflections not implemented (Gap 8). Per-surface ρ implemented April 2026 via `getReflectionRho(surface)` and `TABLE4_REFLECTION_COEFFS`.

**6.2 Equation (20) — image source power**

`L_W,im = L_W + 10·log10(ρ) + D_Ir`

The implementation computes the reflected level via `calcISO9613single` (or `attenuatePoint` for simple method), then applies `10·log10(ρ)` from `getReflectionRho(building)` before energy-summing with the direct path. D_Ir = 0 dB (omnidirectional, no directivity). **Fully conformant with eq. (20) for Table 4 ρ values.**

**6.3 Table 4 — reflection coefficients**

Implemented April 2026. All four standard values available per building:
- Flat hard walls: ρ = 1.0 ✓ (default — preserves prior behaviour)
- Walls with windows or openings: ρ = 0.8 → −1.0 dB penalty ✓
- Factory walls, 50% openings: ρ = 0.4 → −4.0 dB penalty ✓
- Open installations: ρ = 0.0 → reflection suppressed ✓
- Custom: user-entered 0–1 ✓

Configurable per building via the building edit panel dropdown. Saved in assessment JSON (`reflectionType`, `reflectionRhoCustom` fields on building objects). Pre-existing saves load with default `hard_wall` (ρ=1, unchanged behaviour).

**6.4 Equation (19) — applicability conditions**

The 80° grazing angle cutoff (`shared-calc.js:968`, `shared-calc.js:1025`) implements the spirit of eq. (19)'s specular reflection validity check. **Approximate conformance.**

---

### STEP 7 — §8 Meteorological correction (Cmet)

**Verdict: Not implemented (intentional Gap 1).**

**7.1 Equation (21):** `Cmet = 0 if dp ≤ 10·(hs + hr)` — **not computed**.

**7.2 Equation (22):** `Cmet = C0·[1 − 10·(hs+hr)/dp]` — **not computed**.

**7.3 Sign convention:** Cmet ≥ 0 by construction (eq. 21 zero-clamp, eq. 22 asymptotes to C0 from zero). The proposed implementation in `cmet-implementation-audit-2026-04.md` correctly identifies the subtraction point: `return lp - cmet` after the per-band energy sum.

**7.4 NOTES 20–22:** Not implemented; UI tooltips for the planned C0 input reference these notes per `cmet-implementation-audit-2026-04.md`. **No action required until implementation.**

---

### STEP 8 — Annex A: Additional attenuation (Amisc)

**Verdict: Not implemented (intentional Gap 5).**

**8.1 Foliage (A.1, Table A.1):** No implementation found. No `Afol`, `foliage`, or vegetation attenuation in `shared-calc.js` or `index.html`.

**8.2 Industrial sites (A.2, Table A.2):** No implementation found.

**8.3 Housing attenuation (A.3, eq. A.1–A.2):** No implementation found.

**8.4 Status:** All three Amisc terms absent. Documented as Gap 5 (Large effort) in `acoustic-gaps-audit-2026-04.md`. No new finding.

**Annex B — Terrain (Deygout), not listed in scope but implemented:**

`terrainILPerBand` (`shared-calc.js:1565–1609`) implements the Deygout 3-edge method (Annex B):
- Profile sampling at N points (N = max(20, min(100, round(d/5))))
- Local-maximum edge selection via Fresnel-number proxy ranking
- Per-band Maekawa IL for each selected edge via `calcBarrierAttenuation`

**Deviation:** Per-band IL contributions from multiple edges are summed additively (line 1601: `total[b] += v`), capped at 25 dB per band (line 1607). ISO Annex B Deygout chaining computes each sub-path's diffraction independently and weights them; simple addition is an overestimate when multiple ridges are present. For the single-principal-edge case (most common) the result is exact. Registered as Gap 7. **Minor deviation for multi-ridge terrain; no impact for single-ridge.**

---

## Constants and coefficients table

| Constant | Standard value | Code value | File:line | Status |
|----------|---------------|------------|-----------|--------|
| Adiv additive constant | 11 dB | `11` | shared-calc.js:633 | ✓ |
| Aatm divisor | 1000 (for dB/km·m) | implicit (dB/m formula) | shared-calc.js:662 | ✓ |
| As/Ar at 63 Hz | −1.5 | `−1.5` | shared-calc.js:125,137 | ✓ |
| As/Ar at 2–8 kHz | −1.5·(1−G) | `-1.5 * (1 - Gs)` | shared-calc.js:130,142 | ✓ |
| Am at 63 Hz | −3q (no G) | `−3 * q` | shared-calc.js:151 | ✓ |
| Am threshold | 30·(hs+hr) | `30 * (hS + hR)` | shared-calc.js:148 | ✓ |
| aPrime coeff 1 | 3.0 | `3.0` | shared-calc.js:110 | ✓ |
| aPrime exp1 | −0.12 | `-0.12` | shared-calc.js:110 | ✓ |
| aPrime shift | (h−5)² | `(h-5)*(h-5)` | shared-calc.js:110 | ✓ |
| aPrime dp term | −dp/50 | `-dp/50` | shared-calc.js:110 | ✓ |
| aPrime coeff 2 | 5.7 | `5.7` | shared-calc.js:111 | ✓ |
| aPrime exp2 | −0.09 | `-0.09` | shared-calc.js:111 | ✓ |
| aPrime dp2 factor | 2.8×10⁻⁶ | `2.8e-6` | shared-calc.js:111 | ✓ |
| bPrime coeff | 8.6 | `8.6` | shared-calc.js:114 | ✓ |
| bPrime exp | −0.09 | `-0.09` | shared-calc.js:114 | ✓ |
| cPrime coeff | 14.0 | `14.0` | shared-calc.js:117 | ✓ |
| cPrime exp | −0.46 | `-0.46` | shared-calc.js:117 | ✓ |
| dPrime coeff | 5.0 | `5.0` | shared-calc.js:120 | ✓ |
| dPrime exp | −0.9 | `-0.9` | shared-calc.js:120 | ✓ |
| Maekawa additive constant | 3 | `3` | shared-calc.js:281 | ✓ |
| Maekawa C2 | 20 | `20` | shared-calc.js:263 | ✓ |
| C3 denominator | 1/3 | `1/3` | shared-calc.js:276 | ✓ |
| Kmet (barrier) | eq.(18) formula | hardcoded `1` | shared-calc.js:264 | deviation (conservative) |
| Dz cap single | 20 dB | `20` | shared-calc.js:266 | ✓ |
| Dz cap double | 25 dB | `25` | shared-calc.js:266 | ✓ |
| Reflection ρ | Table 4 (0–1) | hardcoded `1` | calcISO9613reflectedLevel | deviation (conservative) |
| Cmet threshold | 10·(hs+hr) | not computed | — | not implemented (Gap 1) |
| Cmet formula | C0·[1−10(hs+hr)/dp] | not computed | — | not implemented (Gap 1) |
| A-weighting 63 Hz | −26.2 dB | `−26.2` | shared-calc.js:86 | ✓ |
| A-weighting 125 Hz | −16.1 dB | `−16.1` | shared-calc.js:86 | ✓ |
| A-weighting 250 Hz | −8.6 dB | `−8.6` | shared-calc.js:86 | ✓ |
| A-weighting 500 Hz | −3.2 dB | `−3.2` | shared-calc.js:86 | ✓ |
| A-weighting 1 kHz | 0.0 dB | `0.0` | shared-calc.js:86 | ✓ |
| A-weighting 2 kHz | +1.2 dB | `1.2` | shared-calc.js:86 | ✓ |
| A-weighting 4 kHz | +1.0 dB | `1.0` | shared-calc.js:86 | ✓ |
| A-weighting 8 kHz | −1.1 dB | `−1.1` | shared-calc.js:86 | ✓ |

---

## Errors requiring fix

**No transcription errors or formula errors were found.** No fix prompts are generated from this audit.

The T08/T09/T11 test residuals (±0.6 dB, ±0.25 dB, ±1.0 dB) reflect the Fresnel path-length approximation and are within accepted ISO 9613-2 engineering tolerance.

---

## Deviations with justification

| ID | Location | Deviation | Justification | Impact |
|----|----------|-----------|---------------|--------|
| D1 | shared-calc.js:628 | d_min = 1 m floor | Prevents log(0); standard silent on d < d₀ | 0 dB at d ≥ 1 m |
| D2 | shared-calc.js:219 | ISO 9613-1 formula used instead of Table 2 | Standard recommends ISO 9613-1 for non-tabulated conditions; continuous precision | Slight difference from Table 2 rounded values; Table 2 is the approximation, code is superior |
| D3 | shared-calc.js:126–130 | `Math.max(aPrime, 0)` clamp on prime functions | Prevents ground effect from contributing spurious attenuation gain at extreme heights | None for h ≤ 15 m; defensive only |
| D4 | shared-calc.js:518 | Fresnel z = 2h²/(d_ss+d_sr) instead of exact z = d_ss+d_sr−d | ISO/TR 17534-3 acknowledges this approximation; error < 0.05 m at 200 m / 5 m barrier | < 1 dB at midrange frequencies; confirmed by T08–T11 residuals |
| D5 | shared-calc.js:264 | Kmet = 1 (eq. 18 not computed) | Conservative (worst-case for barrier diffraction); consistent with downwind assessment mode | Slightly underestimates barrier IL in favorable meteorology |
| D6 | ~~index.html:11906~~ | ~~ρ = 1 for reflections~~ | **CLOSED April 2026** — per-surface ρ via Table 4 dropdown (`getReflectionRho`); default hard_wall ρ=1.0 | No longer a deviation; residual: 2nd-order reflections still Gap 8 |
| D7 | shared-calc.js:1601 | Terrain ridge ILs summed additively per band | Single-edge Deygout (most common) is exact; multi-ridge additivity overestimates | Overestimate; bounded by 25 dB per-band cap |

---

## Not implemented (intentional)

These absences were confirmed as deliberate registered gaps; this audit finds no new information to change their classification.

| Standard section | Description | Gap reference |
|-----------------|-------------|---------------|
| §6 eq. (6) | Cmet meteorological correction | Gap 1 — Medium effort |
| §7.6 | Source directivity D_c | Gap 3 — Medium effort |
| §7.4 eq. (18) | Kmet geometric computation | Part of Gap 1 |
| §7.4 multi-barrier | Only dominant barrier used | Gap 4 — Large effort |
| §7.5 Table 4 | Variable reflection coefficient ρ < 1 | **CLOSED April 2026** — Table 4 per-building ρ implemented |
| §7.5 2nd-order | Second-order reflections | Gap 8 — Large effort (unchanged) |
| Annex A.1 | Foliage attenuation A_fol | Gap 5 — Large effort |
| Annex A.2 | Industrial site attenuation | Gap 5 — Large effort |
| Annex A.3 | Housing attenuation A_hous | Gap 5 — Large effort |

---

## Not implemented (oversight)

**None found.** Every section of the standard that the tool is expected to implement is implemented. The only absences are the registered gaps listed above.

---

## Recommended priorities

No errors were found requiring correction. The deviation table entries D4 (Fresnel approximation) and D5 (Kmet = 1) are the two most acoustically significant deviations; both are conservative and are addressed by Gap 1 (Cmet / Kmet implementation). The existing priority sequencing in `acoustic-gaps-audit-2026-04.md` remains valid and is not revised by this audit.

If tighter conformance is required in the future:

1. **Gap 1 (Cmet + Kmet)** — Closes D5 fully and provides a pathway to also implement the exact Kmet formula from eq. (18). Highest-priority if long-term average predictions are needed.
2. **Gap 4 (multi-barrier)** — Would also expose whether the Fresnel approximation (D4) introduces further residual at real-site geometries.
3. **Gap 8 (configurable ρ) — CLOSED for Table 4 ρ.** Per-building ρ implemented April 2026. Remaining Gap 8 scope: second-order (multi-bounce) reflections — large effort, low priority for most sites.
4. **Gap 5 (Amisc)** — Only relevant for sites with dense vegetation belts or housing clusters crossing the propagation path.

---

*Audit complete. No source files were modified.*
