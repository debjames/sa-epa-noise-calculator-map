# ISO 17534-3 Conformity Test Suite — SA EPA Noise Calculator Map

## Purpose

Run the ISO/TR 17534-3:2015 test cases (T01–T19) against the calculator's ISO 9613-2 implementation to verify conformity per ISO 17534-1:2015. All test case results must fall within ±0.05 dB of the published values for frequency bands and total A-weighted level.

**Reference documents:**
- ISO 17534-1:2015 — Quality requirements and quality assurance
- ISO/TR 17534-3:2015 — Recommendations for quality assured implementation of ISO 9613-2

## Instructions

1. Read `shared-calc.js` (or wherever the ISO 9613-2 calculation functions live — check `index.html`, `calc.js`, `noise-worker.js` for the canonical implementations).
2. Create a test file `iso17534.test.js` using Vitest.
3. For each test case below, call the appropriate calculation functions directly with the specified inputs and compare against the published step-by-step and final results.
4. Tolerance: ±0.05 dB for all frequency-band and total A-weighted results (per ISO 17534-1 Annex A).
5. Run `npx vitest run iso17534.test.js` and report results.
6. For any failures, report the test case, frequency band, expected value, actual value, and deviation.

## Common Parameters (all test cases)

- **Temperature:** 20 °C
- **Humidity:** 70 %RH
- **Atmospheric absorption coefficients α (dB/km):** 0.1, 0.3, 1.1, 2.8, 5.0, 9.0, 22.9, 76.6 (63 Hz – 8 kHz)
- **A-weighting corrections (dB):** −26.2, −16.1, −8.6, −3.2, 0.0, +1.2, +1.0, −1.1 (63 Hz – 8 kHz)
- **Source sound power level LW (dB, linear):** 93 dB in all octave bands (63 Hz – 8 kHz)
- **Octave bands:** 63, 125, 250, 500, 1000, 2000, 4000, 8000 Hz

---

## TEST CASES — Free propagation (no barriers)

### T01 — Reflecting ground (G = 0)

**Geometry:**
- Source: (10, 10, 1) — x, y, z in metres
- Receiver: (200, 50, 4)
- Ground factor G = 0 (entire area)

**Key intermediate values:**
- dp (2D distance) = 194.16 m
- d3 (3D distance) = 194.19 m
- Adiv = 56.76 dB
- Source region length = 30.00 m, Receiver region = 120.00 m, Middle region = 44.16 m
- q = 0.23

**Expected Agr per band (dB):**

| Band | Agr_s | Agr_r | Agr_m | Agr |
|------|-------|-------|-------|-----|
| 63   | −1.50 | −1.50 | −0.68 | −3.68 |
| 125  | −1.50 | −1.50 | −0.68 | −3.68 |
| 250  | −1.50 | −1.50 | −0.68 | −3.68 |
| 500  | −1.50 | −1.50 | −0.68 | −3.68 |
| 1k   | −1.50 | −1.50 | −0.68 | −3.68 |
| 2k   | −1.50 | −1.50 | −0.68 | −3.68 |
| 4k   | −1.50 | −1.50 | −0.68 | −3.68 |
| 8k   | −1.50 | −1.50 | −0.68 | −3.68 |

**Expected Aatm per band (dB):** 0.02, 0.06, 0.21, 0.54, 0.97, 1.75, 4.45, 14.87

**Expected LA per band (dB):** 13.70, 23.76, 31.10, 36.17, 38.95, 39.37, 36.47, 23.94

**Expected total LA = 44.29 dB(A)**

---

### T02 — Mixed ground (G = 0.5)

**Geometry:** Same as T01. Ground factor G = 0.5.

**Expected Agr per band (dB):**

| Band | Agr_s | Agr_r | Agr_m | Agr |
|------|-------|-------|-------|-----|
| 63   | −1.50 | −1.50 | −0.68 | −3.68 |
| 125  | −0.27 |  0.62 | −0.34 |  0.01 |
| 250  |  3.10 |  0.25 | −0.34 |  3.01 |
| 500  |  3.58 | −0.75 | −0.34 |  2.49 |
| 1k   |  0.25 | −0.75 | −0.34 | −0.85 |
| 2k   | −0.75 | −0.75 | −0.34 | −1.84 |
| 4k   | −0.75 | −0.75 | −0.34 | −1.84 |
| 8k   | −0.75 | −0.75 | −0.34 | −1.84 |

**Expected LA per band (dB):** 13.70, 20.07, 24.42, 30.00, 36.11, 37.53, 34.63, 22.10

**Expected total LA = 41.53 dB(A)**

---

### T03 — Porous ground (G = 1)

**Geometry:** Same as T01. Ground factor G = 1.

**Expected Agr per band (dB):**

| Band | Agr_s | Agr_r | Agr_m | Agr |
|------|-------|-------|-------|-----|
| 63   | −1.50 | −1.50 | −0.68 | −3.68 |
| 125  |  0.95 |  2.74 |  0.00 |  3.69 |
| 250  |  7.70 |  2.00 |  0.00 |  9.69 |
| 500  |  8.66 |  0.01 |  0.00 |  8.66 |
| 1k   |  1.99 |  0.00 |  0.00 |  1.99 |
| 2k   |  0.00 |  0.00 |  0.00 |  0.00 |
| 4k   |  0.00 |  0.00 |  0.00 |  0.00 |
| 8k   |  0.00 |  0.00 |  0.00 |  0.00 |

**Expected LA per band (dB):** 13.70, 16.38, 17.73, 23.83, 33.27, 35.69, 32.79, 20.26

**Expected total LA = 39.14 dB(A)**

---

### T04 — Flat ground with spatially varying acoustic properties

**Geometry:** Same source/receiver as T01.

**Ground zones (rectangular areas):**

| Area | G   | x1  | y1 | x2  | y2 | x3  | y3  | x4 | y4  |
|------|-----|-----|----|-----|----|-----|-----|----|-----|
| A1   | 0.2 | 0   | 60 | 50  | 60 | 50  | −10 | 0  | −10 |
| A2   | 0.5 | 50  | 60 | 150 | 60 | 150 | −10 | 50 | −10 |
| A3   | 0.9 | 150 | 60 | 210 | 60 | 210 | −10 | 150| −10 |

**Key intermediates:**
- dp1 = 40.88 m, dp2 = 102.19 m, dp3 = 51.10 m
- Gs = 0.20, Gr = 0.67, Gm = 0.43

**Expected Agr per band (dB):**

| Band | Agr_s | Agr_r | Agr_m | Agr |
|------|-------|-------|-------|-----|
| 63   | −1.50 | −1.50 | −0.68 | −3.68 |
| 125  | −1.01 |  1.34 | −0.39 | −0.06 |
| 250  |  0.34 |  0.84 | −0.39 |  0.79 |
| 500  |  0.53 | −0.49 | −0.39 | −0.35 |
| 1k   | −0.80 | −0.49 | −0.39 | −1.69 |
| 2k   | −1.20 | −0.49 | −0.39 | −2.09 |
| 4k   | −1.20 | −0.49 | −0.39 | −2.09 |
| 8k   | −1.20 | −0.49 | −0.39 | −2.09 |

**Expected LA per band (dB):** 13.70, 20.14, 26.63, 32.84, 36.95, 37.77, 34.87, 22.35

**Expected total LA = 42.23 dB(A)**

---

### T05 — Same as T04, alternative method (ISO 9613-2:1996, 7.3.2)

**Geometry/ground:** Same as T04. Uses the alternative ground attenuation method.

**Key intermediates:**
- Agr = 4.32 dB (all bands)
- DΩ = 3.01 dB (all bands)

**Expected LA per band (dB):** 8.70, 18.76, 26.11, 31.18, 33.95, 34.37, 31.48, 18.95

**Expected total LA = 39.30 dB(A)**

*Note: Only test this if the calculator implements the alternative method (§7.3.2). Otherwise skip.*

---

### T06 — Ground with spatially varying heights and acoustic properties

**Geometry:**
- Source: (10, 10, 1) — z is height above ground
- Receiver: (200, 50, 4) — z is height above ground

**Ground zones:** Same areas as T04 but with G reversed: A1=0.9, A2=0.5, A3=0.2

**Contour lines (terrain):**

| z (m) | x min | x max | y min | y max |
|-------|-------|-------|-------|-------|
| 0     | 0     | 120   | −10   | 60    |
| 0     | 120   | 210   | −10   | 60    |
| 10    | 185   | 205   | −5    | 55    |

(Ground rises to 10 m between x=185 and x=205)

**Ray path geometry:**

| Point | x | y | z_abs | z_rel |
|-------|---|---|-------|-------|
| S     | 10 | 10 | 1.00 | 1.00 |
| P1    | 120 | 33.16 | 8.53 | 8.53 |
| P2    | 185 | 46.84 | 12.97 | 2.97 |
| R     | 200 | 50 | 14.00 | 4.00 |

**Key intermediates:**
- d3 = 194.60 m, Adiv = 56.78 dB
- Gs = 0.90, Gr = 0.37, Gm = 0.60

**Expected LA per band (dB):** 13.68, 19.55, 21.10, 26.04, 34.82, 37.03, 34.13, 21.58

**Expected total LA = 40.59 dB(A)**

---

### T07 — Same as T06, alternative method (§7.3.2)

**Key intermediates:**
- hm = 4.99 m
- Agr = 3.85 dB (all bands), DΩ = 3.01 dB

**Expected LA per band (dB):** 9.16, 19.22, 26.56, 31.63, 34.40, 34.82, 31.92, 19.37

**Expected total LA = 39.75 dB(A)**

*Note: Only test if alternative method is implemented. Otherwise skip.*

---

## TEST CASES — With barriers/buildings (requires additional recommendations §5.2–5.9)

These test cases require the additional recommendations from ISO/TR 17534-3 §5.2–5.9 to be implemented. Test these only if the calculator supports barrier diffraction per ISO 9613-2 with the TR 17534-3 clarifications.

### T08 — Flat ground, varying G, long barrier

**Geometry:** Source/receiver same as T01.
**Ground zones:** Same as T06 (A1=0.9, A2=0.5, A3=0.2).

**Barrier upper edge:**
- S1: (100.0, 240.0, 6.0)
- S2: (265.0, −180.0, 6.0)

**Expected Abar per band (dB):** 5.04, 4.81, 0.00, 0.26, 7.58, 9.84, 12.12, 14.71

**Expected LA per band (dB):** 8.66, 14.75, 21.12, 25.81, 27.26, 27.21, 22.04, 6.92

**Expected total LA = 32.48 dB(A)**

---

### T09 — Flat ground, varying G, short barrier

**Geometry:** Source/receiver same as T01.
**Ground zones:** Same as T06.

**Barrier upper edge:**
- S1: (175.0, 50.0, 6.0)
- S2: (190.0, 10.0, 6.0)

**Expected Abar per band (dB):** 2.91, 3.31, 0.00, 0.06, 7.00, 9.34, 11.69, 14.32

**Expected LA per band (dB):** 10.79, 16.26, 21.12, 26.01, 27.84, 27.71, 22.46, 7.30

**Expected total LA = 32.93 dB(A)**

---

### T10 — Varying heights/G, short barrier

**Geometry:** Source (10,10,1 rel), Receiver (200,50,4 rel). Terrain as T06.
**Ground zones:** Same as T06.

**Barrier upper edge (absolute z):**
- S1: (175.0, 50.0, 17.0)
- S2: (190.0, 10.0, 14.0)

**Expected Abar per band (dB):** 3.54, 4.42, 1.52, 3.41, 10.69, 13.69, 16.54, 18.72

**Expected LA per band (dB):** 10.14, 15.12, 19.58, 22.64, 24.12, 23.34, 17.59, 2.86

**Expected total LA = 29.30 dB(A)**

---

### T11 — Cubic building, receiver at low height

**Geometry:**
- Source: (50, 10, 1)
- Receiver: (70, 10, 4)
- G = 0.5

**Building (10 m high):** corners at (55,5), (65,5), (65,15), (55,15)

**Expected Abar per band (dB):** 8.79, 12.24, 16.53, 20.12, 22.18, 23.41, 24.14, 24.55

**Expected LA per band (dB):** 23.89, 28.52, 30.60, 32.55, 34.77, 34.99, 33.78, 30.18

**Expected total LA = 41.30 dB(A)**

---

### T12 — Cubic building, receiver at large height

**Geometry:**
- Source: (50, 10, 1)
- Receiver: (70, 10, 15)
- G = 0.5

**Building:** Same as T11 (10 m high).

**Expected Abar per band (dB):** 6.20, 8.95, 12.23, 15.53, 18.59, 19.27, 19.62, 19.81

**Expected LA per band (dB):** 24.84, 30.61, 33.59, 35.50, 36.70, 37.46, 36.57, 32.97

**Expected total LA = 43.81 dB(A)**

---

### T13 — Polygonal building, receiver at low height

**Geometry:**
- Source: (0, 10, 1)
- Receiver: (30, 20, 6)
- G = 0.6

**Building (10 m high, octagonal):** vertices at (10.96,15.50), (12.00,13.00), (14.50,11.96), (17.00,13.00), (18.04,15.50), (17.00,18.00), (14.50,19.04), (12.00,18.00)

**Ray geometry:**

| Path | Length (m) | dss | dsr | e | z | Kmet |
|------|-----------|-----|-----|---|---|------|
| top  | 35.18 | 15.21 | 13.41 | 6.55 | 3.17 | 0.98 |
| left | 33.04 | 14.59 | 15.71 | 2.74 | 1.02 | 1.00 |
| right| 32.49 | 14.81 | 14.94 | 2.74 | 0.48 | 1.00 |
| direct| 32.02 | — | — | — | — | — |

**Expected Abar per band (dB):** 3.72, 5.54, 7.89, 11.24, 15.36, 18.78, 21.14, 22.71

**Expected LA per band (dB):** 24.97, 30.56, 34.26, 36.08, 37.00, 35.22, 32.22, 26.83

**Expected total LA = 42.71 dB(A)**

---

### T14 — Varying heights/G, polygonal building

**Geometry:**
- Source: (10, 10, 1)
- Receiver: (200, 50, 28.5)
- Terrain as T06.

**Ground zones:** A1=0.5, A2=0.9, A3=0.2 (different from T06!)

**Building (30 m high, octagonal):** vertices at (169.39,41.00), (172.50,33.50), (180.00,30.39), (187.50,33.50), (190.61,41.00), (187.50,48.50), (180.00,51.61), (172.50,48.50)

**Expected Abar per band (dB):** 4.20, 6.50, 8.21, 11.02, 15.34, 18.28, 20.96, 22.51

**Expected LA per band (dB):** 8.73, 14.32, 16.58, 18.35, 20.14, 18.61, 13.00, −1.18

**Expected total LA = 25.38 dB(A)**

---

### T15 — Polygonal building, receiver at large height

**Geometry:**
- Source: (8, 10, 1)
- Receiver: (25, 20, 23)
- G = 0.2

**Building:** Same octagonal building as T13 (10 m high).

**Expected Abar per band (dB):** 2.10, 3.24, 4.86, 7.12, 10.11, 13.39, 16.56, 18.68

**Expected LA per band (dB):** 27.29, 35.61, 40.99, 44.01, 44.60, 42.53, 38.76, 32.95

**Expected total LA = 49.92 dB(A)**

---

### T16 — Three buildings

**Geometry:**
- Source: (50, 10, 1)
- Receiver: (100, 15, 5)
- G = 0.5

**Three buildings:**

Object 1 (8 m): (55,5), (65,5), (65,15), (55,15)

Object 2 (12 m): (70,14.5), (80,10.17), (80,20.17)

Object 3 (10 m): (90.11,19.48), (93.27,17.78), (87.27,6.61), (84.11,8.31)

**Expected Abar per band (dB):** 9.91, 14.04, 17.29, 19.87, 22.11, 23.32, 24.08, 24.51

**Expected LA per band (dB):** 14.83, 18.18, 20.73, 23.44, 26.45, 26.88, 25.22, 19.97

**Expected total LA = 32.54 dB(A)**

---

### T17 — Three buildings, alternative source/receiver position

**Geometry:**
- Source: (50, 19, 1)
- Receiver: (98, 3.5, 5)
- G = 0.5

**Buildings:** Same as T16.

**Expected Abar per band (dB):** 9.37, 13.01, 16.03, 19.28, 22.12, 23.33, 24.09, 24.52

**Expected LA per band (dB):** 15.34, 19.18, 21.95, 23.98, 26.39, 26.83, 25.17, 19.92

**Expected total LA = 32.72 dB(A)**

---

### T18 — Complex building with backyard

**Geometry:**
- Source: (15.00, 35.00, 2.00)
- Receiver: (44.64, 63.66, 4.00)
- G = 0

**Building (10 m high, complex polygon):** vertices at (36.83,7.19), (54.15,17.19), (29.15,60.49), (−5.49,40.49), (9.51,14.51), (18.17,19.51), (8.17,36.83), (25.49,46.83), (40.49,20.85), (31.83,15.85)

**Expected Abar per band (dB):** 11.47, 14.79, 18.97, 23.08, 24.74, 24.87, 24.93, 24.97

**Expected LA per band (dB):** 15.01, 21.79, 25.07, 26.29, 27.74, 28.65, 27.81, 23.46

**Expected total LA = 34.89 dB(A)**

---

### T19 — Varying heights/G, reflecting barrier

**Geometry:** Same as T06 (Source 10,10,1rel; Receiver 200,50,4rel; terrain with hill).
**Ground zones:** Same as T06 (A1=0.9, A2=0.5, A3=0.2).

**Additional reflecting barrier:**
- Upper edge: S1 (114,52,15), S2 (170,60,15)
- Absorption coefficients per band: 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.5

**Direct path:** Same results as T06 (LA total = 40.59 dB(A))

**Reflected path LW adjusted for reflection loss:**
- LW_refl per band: —, —, —, 90.78, 89.99, 89.02, 87.77, 89.99

**Expected combined LA per band (dB):** 13.68, 19.55, 21.10, 28.01, 36.51, 38.43, 35.20, 23.18

**Expected total LA = 42.00 dB(A)**

---

## Implementation Notes

### What to test based on current calculator capabilities

**Phase 1 — Core propagation (implement first):**
- T01, T02, T03: Tests Adiv, Aatm, and Agr for G=0, 0.5, 1 on flat ground. These are the essential conformity tests.

**Phase 2 — Spatially varying ground:**
- T04: Tests weighted G values (Gs, Gr, Gm) across multiple ground zones.
- T05: Alternative method — skip if not implemented.

**Phase 3 — Terrain:**
- T06: Tests terrain elevation integration with varying G.
- T07: Alternative method — skip if not implemented.

**Phase 4 — Barriers and buildings:**
- T08–T19: Tests barrier diffraction (Dz, Abar), lateral diffraction, multiple buildings, reflections. Requires ISO/TR 17534-3 §5.2–5.9 additional recommendations.

### Key additional recommendations from ISO/TR 17534-3 §5.2–5.9

These must be implemented for T08+ to pass:

1. **§5.2 Screening:** Rubber-band construction for ray paths; lateral diffraction for multiple objects; lateral paths ignored if side detour > 8× top detour.
2. **§5.3 Dz cap:** 20 dB single / 25 dB double diffraction limit applies only to top-edge diffraction, not lateral.
3. **§5.4 Negative z:** If z < 0 (ray passes above barrier), set Dz = 0 (don't allow negative/amplifying Dz).
4. **§5.5 Reflecting ground + barrier:** Don't apply Formula (12) when Agr < 0.
5. **§5.6 No level increase from barriers:** If combined Abar (top + sides) < 0, set Abar = 0.
6. **§5.7 Ground effect for lateral paths:** Agr only calculated from vertical plane path, not lateral paths.
7. **§5.8 No lateral diffraction for ground screening:** If terrain (not a barrier object) screens the direct ray, don't calculate lateral diffraction.
8. **§5.9 Higher-order reflections:** Mirror image sources for nth order reflections.

### TRC Form structure (per ISO 17534-1 Annex B)

For each test case, log results in this format:

```
Test Case | Band | Upper Limit | Lower Limit | Calculated | Pass? | Comment
T01       | 63   | 13.75       | 13.65       | ???        | ???   |
T01       | 125  | 23.81       | 23.71       | ???        | ???   |
...       | Total| 44.34       | 44.24       | ???        | ???   |
```

### GoI Form (Grade of Implementation)

After running tests, fill in which capabilities are implemented:

```
Feature                                          | Yes | Limited | No
A-weighted SPL (ref 500 Hz)                      |     |         |
Octave bands 63 Hz – 8 kHz                       |     |         |
Point sources                                    |     |         |
Line sources                                     |     |         |
Area sources                                     |     |         |
Image sources (1st order reflections)             |     |         |
Higher order reflections (to order n=?)           |     |         |
Adiv per Formula (7)                             |     |         |
Aatm per Formula (8) / Table 2                   |     |         |
Agr per Formula (9) / Table 3 (detailed)         |     |         |
Agr alternative method §7.3.2                    |     |         |
Screening — diffraction over top edge            |     |         |
Screening — lateral diffraction                  |     |         |
Screening per §5.2 (TR 17534-3)                 |     |         |
Dz cap per §5.3 (TR 17534-3)                    |     |         |
Negative z handling per §5.4 (TR 17534-3)        |     |         |
Agr<0 barrier fix per §5.5 (TR 17534-3)         |     |         |
No barrier amplification per §5.6 (TR 17534-3)  |     |         |
Agr vertical plane only per §5.7 (TR 17534-3)   |     |         |
No lateral diff for terrain per §5.8 (TR 17534-3)|     |         |
```
