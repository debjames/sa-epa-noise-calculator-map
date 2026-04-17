# CONCAWE Coefficient Tables — DRAFT FOR VERIFICATION

**STATUS: These need checking against Appendix II of Report 4/81.**
**Deb: please open the PDF to pages ~87-95 (Appendix II) and correct.**

---

## K3 — Ground Attenuation (Soft Ground)

Polynomial form: `K3 = a₀ + a₁·log₁₀(d) + a₂·(log₁₀(d))² + a₃·(log₁₀(d))³`

Hard ground: K3 = −3 dB for all bands and distances (no table needed).

Soft ground coefficients — **THESE ARE MY BEST ESTIMATES, NOT VERIFIED:**

| Band (Hz) | a₀ | a₁ | a₂ | a₃ | Confidence |
|-----------|-----|-----|-----|-----|-----------|
| 63 | 33.4 | -35.04 | 9.159 | -0.3508 | Medium — K3 at 63 Hz is known to be ~0 at all distances |
| 125 | 8.96 | -35.8 | 20.4 | -2.85 | LOW — need from Appendix II |
| 250 | -64.2 | 48.6 | -9.53 | 0.634 | LOW — need from Appendix II |
| 500 | -74.9 | 82.23 | -26.921 | 2.9258 | LOW — need from Appendix II |
| 1000 | -100.1 | 104.68 | -34.693 | 3.8068 | LOW — need from Appendix II |
| 2000 | -7 | 3.5 | 0 | 0 | LOW — need from Appendix II |
| 4000 | -16.9 | 6.7 | 0 | 0 | LOW — need from Appendix II |

**I cannot reliably reconstruct the K3 polynomials without seeing
Figure 1 or Appendix II.** The OCR didn't capture the appendix.

### What we know about K3 from the report text:

- 63 Hz: ground effect is minimal (~0 dB) at all distances
- 125–500 Hz: ground effect is significant, peaking around 250 Hz
  at long distances. Values can reach 10–15+ dB at 1000m
- 1k–4k Hz: ground effect reduces again (less than mid-frequencies)
- At short distances (<100m): ground effect is small for all bands
- Curves are monotonically increasing with distance
- The curves were derived from Parkin & Scholes data, modified by
  fitting to the three CONCAWE measurement sites

---

## K4 — Meteorological Correction

### Full model (distance-dependent polynomials)

Same polynomial form as K3:
`K4 = a₀ + a₁·log₁₀(d) + a₂·(log₁₀(d))² + a₃·(log₁₀(d))³`

**Need 5 met categories × 7 bands = 35 sets of coefficients
from Appendix II.** Not extracted from the OCR.

Category 4 = 0 by definition (no table needed).

### Simplified model (distance-independent) — VERIFIED FROM REPORT

The report's "Simplification 2" (§6.2) gives single-value K4
corrections that are independent of distance. These were shown
to give only ~0.5 dB(A) worse accuracy than the full model.

**These values ARE directly from the report text (page ~34):**

| Met Cat | 63 Hz | 125 Hz | 250 Hz | 500 Hz | 1 kHz | 2 kHz | 4 kHz |
|---------|-------|--------|--------|--------|-------|-------|-------|
| 1 | 8.0 | 5.0 | 6.0 | 8.0 | 10.0 | 6.0 | 8.0 |
| 2 | 3.0 | 2.0 | 5.0 | 7.0 | 11.5 | 7.5 | 8.0 |
| 3 | 2.0 | 1.5 | 4.0 | 3.5 | 6.0 | 5.0 | 4.5 |
| 4 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| 5 | −1.0 | −2.0 | −4.0 | −4.0 | −4.5 | −3.0 | −4.5 |
| 6 | −2.0 | −4.0 | −5.0 | −6.0 | −5.0 | −4.5 | −7.0 |

**Convention:** positive = attenuation (upwind, reduces noise
at receiver). Negative = enhancement (downwind, increases noise).

**Recommendation:** For v1 implementation, use these simplified
distance-independent K4 values. They are verified, published,
and the report shows only 0.5 dB(A) accuracy loss vs the full
polynomial model. The distance-dependent polynomials can be
added later if needed.

---

## Pasquill Stability Class Lookup

From wind speed + solar radiation / cloud cover:

| Wind Speed (m/s) | Day: >60 mW/cm² | Day: 30–60 | Day: <30 | Overcast | 1hr sun | Night: 0–3 octas | Night: 4–7 | Night: 8 |
|-------------------|-----------------|------------|----------|----------|---------|-------------------|------------|----------|
| ≤1.5 | A | A-B | B | C | D | F (or G*) | F | D |
| 2.0–2.5 | A-B | B | C | C | D | F | E | D |
| 3.0–4.5 | B | B-C | C | C | D | E | D | D |
| 5.0–6.0 | C | C-D | D | D | D | D | D | D |
| >6.0 | D | D | D | D | D | D | D | D |

*G = night, <1 octa cloud, wind <0.5 m/s

For intermediate classes (A-B, B-C, C-D): use the more unstable
class (A-B → A for conservative upwind, B for conservative
downwind).

---

## Meteorological Category from Pasquill + Wind

v = vector wind (m/s), positive = downwind (source → receiver)

| Met Category | Pasquill A, B | Pasquill C, D, E | Pasquill F, G |
|-------------|---------------|------------------|---------------|
| 1 | v < −3.0 | — | — |
| 2 | −3.0 < v < −0.5 | v < −3.0 | — |
| 3 | −0.5 < v < 0.5 | −3.0 < v < −0.5 | v < −3.0 |
| 4* | 0.5 < v < 3.0 | −0.5 < v < 0.5 | −3.0 < v < −0.5 |
| 5 | v > 3.0 | 0.5 < v < 3.0 | −0.5 < v < 0.5 |
| 6 | — | v > 3.0 | 0.5 < v < 3.0 |

*Category 4 = zero meteorological influence

---

## K5 — Source Height Correction

```
ψ = atan((hs + hr) / d)   [degrees]

If (K3 + K4) > −3 dB:
    γ = f(ψ)              [from Figure 9]
    K5 = (K3 + K4 + 3) × (γ − 1)
Else:
    K5 = 0
```

γ vs ψ (from Figure 9 — **NEED TO VERIFY against PDF**):

| ψ (degrees) | γ (approx) |
|-------------|-----------|
| 0.0 | 1.00 |
| 0.5 | 0.90 |
| 1.0 | 0.70 |
| 1.5 | 0.54 |
| 2.0 | 0.38 |
| 2.5 | 0.26 |
| 3.0 | 0.16 |
| 4.0 | 0.06 |
| 5.0 | 0.01 |

Approximation: `γ = exp(−0.6 × ψ)` or linear interpolation
from the table above. **Check against Figure 9.**

---

## K7 — In-Plant Screening (empirical, Site C only)

From the report text (verified, §4 excess attenuations):

| Band (Hz) | 63 | 125 | 250 | 500 | 1k | 2k | 4k |
|-----------|-----|------|------|------|-----|-----|-----|
| K7 (dB) | 6 | 6 | 4 | 7 | 8 | 9 | 7 |

**Not recommended for implementation** — site-specific, not
reliably predictable. Conservative to omit (K7 = 0).

---

## What Deb needs to do

1. Open the CONCAWE PDF at Appendix II (pages ~87–95)
2. Extract the K3 polynomial coefficients (7 bands × 4 coeffs)
3. Optionally extract the K4 polynomial coefficients (35 sets)
   — or use the Simplification 2 table above
4. Check the γ vs ψ curve (Figure 9) against the table above
5. Edit this file with corrected values
6. We proceed with Prompt 1 using the verified coefficients
