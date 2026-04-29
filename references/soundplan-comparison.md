# SoundPLAN Comparison Reference

**Purpose:** Documents every known simplification this tool makes relative to SoundPLAN, the acoustic impact on predicted levels, and whether the simplification is conservative or non-conservative. Use this file to make assessments defensible during peer review and to decide when SoundPLAN is needed instead.

---

## When to Use SoundPLAN Instead

Use SoundPLAN when any of the following apply:

- Predicted levels are within **3 dB of the criteria** and the site has features this tool simplifies (terrain, directional sources, dense reflections)
- **Complex terrain** with two or more ridgelines between source and receiver — this tool uses single dominant-ridge Maekawa diffraction (see Simplification 3)
- **Multiple barrier diffraction** — this tool uses single dominant barrier per path (see the acoustic gaps audit for status of Gap 4)
- **Cmet meteorological correction** — this tool implements ISO 9613-2:1996 §8 Cmet (toggle in Propagation accordion). If Cmet is OFF (default), the tool predicts downwind worst-case. Enable Cmet for long-term average assessments (see Simplification 1)
- **Low-frequency assessment (1/3 octave)** — this tool works in octave bands only
- **Directional sources** (exhausts, louvres, cooling towers with predominant discharge direction) where shielding in the primary direction is relevant — see Simplification 2
- **Dense urban environments** with second-order or higher reflections — this tool computes single dominant first-order reflection at ρ=1 (see Simplification 4)
- **Formal NIA or development approval report** requiring a certified prediction tool with an auditable validation trail

---

## Simplification Register

Active simplifications as of April 2026. See "Last reconciled" note at end of file.

---

### 1. Cmet (meteorological correction) — **implemented April 2026**

**Status:** Gap 1 closed. ISO 9613-2:1996 §8 equations (21) and (22) are implemented in `SharedCalc.calcCmet`. Toggle in the Propagation accordion (ISO 9613-2 mode only). Default OFF (worst-case downwind for conservative screening). See `references/calculations.md §ISO 9613-2:1996 §8`.

**Tool (Cmet OFF, default):** Cmet = 0 dB — equivalent to predicting the downwind worst-case. `Kmet = 1` in `calcBarrierAttenuation` is an unrelated diffraction modifier and is not the same quantity.

**Tool (Cmet ON):** Applies `Cmet = C0 · [1 − 10·(hs+hr)/dp]` for `dp > 10·(hs+hr)`, else Cmet = 0 (eq. 21/22). C0 default 2 dB, range 0–5 dB. Subtracted from A-weighted broadband Lp after per-band summation. Leq only — Lmax paths excluded.

**SoundPLAN:** Applies ISO 9613-2 §8 Cmet. For downwind worst-case SoundPLAN uses Cmet = 0, identical to this tool's default. For long-term average mode, SoundPLAN applies the same §8 formula.

**Impact (Cmet OFF):** 2–5 dB over-prediction at distances > 300 m for long-term average assessments. At distances < 100 m the effect is < 1 dB.

**Conservative?** Cmet OFF is conservative (worst-case over-prediction) relative to long-term average criteria. Cmet ON gives long-term average and is NOT conservative against worst-case downwind criteria.

**When to use Cmet ON:** When the applicable guideline requires long-term average (LA90/Leq LT) rather than worst-case. All Australian state noise policies reviewed to date use worst-case or percentile-based criteria — use the default (OFF) unless the guideline specifically references long-term average ISO 9613-2 assessment.

---

### 2. Directivity (Dc) — omnidirectional point source

**Tool:** No directivity term. All point sources radiate hemispherically with uniform power in all directions. The +6 dB hemisphere correction accounts for reflection off a hard ground plane but applies no angular weighting.

**SoundPLAN:** Applies ISO 9613-2 §7.6 Dc — per-band directivity correction relative to the free-field level in the direction of interest.

**Impact:** 3–6 dB under-prediction in the shielded direction for strongly directional sources (e.g. a fan stack radiating primarily upward with little lateral output). 3–6 dB over-prediction in the principal radiation direction if the source has a narrow beam.

**Conservative?** No — not conservative for shielded-direction assessments (tool may under-predict in directions the source radiates weakly). Flag when assessing exhaust stacks, directional louvres, or HVAC units with a dominant discharge axis.

---

### 3. Terrain — Deygout 3-edge with heatmap smoothing artefact

**Tool:**
- *Receiver panel:* Deygout 3-edge along the direct source–receiver ray per ISO 9613-2 Annex B. Per-band Maekawa with 25 dB/band cap. Unsmoothed — terrain IL computed at the exact receiver lat/lng from the DEM profile. Implemented via `SharedCalc.terrainILPerBand`.
- *Heatmap:* Same Deygout 3-edge per grid cell via `SharedCalc.terrainILPerBand`, but the terrain IL field is post-processed with a separable 5×5 Gaussian kernel (σ = 1.0 cell, radius 2 cells) for radial-spike artefact suppression (noise-worker.js:~329–426). Smoothing artificially reduces effective IL inside narrow terrain shadow zones.
- Lateral diffraction around terrain features beside the direct ray is not modelled in either path.

**SoundPLAN:** Full 3D terrain model with multiple ray paths and lateral diffraction. No smoothing artefact.

**Impact:**
- *Receiver panel vs SoundPLAN:* 1–3 dB in highly complex terrain with significant lateral relief beside the direct propagation path. Negligible for terrain roughly uniform across the propagation corridor.
- *Heatmap vs receiver panel:* Exact agreement on open or broad-shadow terrain (shadow width > ~4× grid spacing). Can diverge by ~3–6 dB at the centre of narrow shadows (e.g. directly behind a small hill or at a site where the shadow zone is narrower than ~2× the grid spacing) — reduced from ~8–12 dB after σ was reduced from 1.0 to 0.5 in April 2026. The receiver panel value is authoritative; the always-visible Lp badge on each receiver marker shows the panel value on the map. The heatmap is for spatial overview only. See `references/heatmap-receiver-divergence-2026-04.md`.

**Conservative?**
- *Receiver panel:* Variable — the direct-ray Deygout result may over- or under-predict depending on whether lateral paths are shielded or exposed.
- *Heatmap inside narrow shadows:* **Non-conservative** — under-states terrain screening by up to 8–12 dB. Use the receiver panel for compliance, not the heatmap colour.

---

### 4. Reflections — single dominant first-order, per-surface ρ (Table 4) — **D6 implemented April 2026**

**Tool:** Computes the single shortest first-order reflected path (image-source method, 2D horizontal plane). Grazing cutoff at 80°. No second-order or higher reflections (Gap 8). Reflection coefficient ρ is now configurable per building via ISO 9613-2:1996 Table 4 standard values: hard wall (ρ=1.0, default), walls with windows/openings (ρ=0.8), factory walls 50% openings (ρ=0.4), open installations (ρ=0.0), or custom (0–1). `10·log10(ρ)` is applied to the reflected level before energy-summing with the direct path.

**SoundPLAN:** Supports configurable per-surface absorption coefficients, multiple reflection orders, and 3D geometry for inclined reflectors.

**Impact:**
- *ρ = 1.0 (default, hard wall):* No change from prior behaviour.
- *ρ < 1.0:* Reflected contribution reduced — `10·log10(ρ)` dB applied. For ρ=0.8: −1.0 dB; for ρ=0.4: −4.0 dB.
- *ρ = 0.0:* Reflected contribution suppressed entirely.
- *Second-order reflections:* Still not modelled (Gap 8). 0.5–3 dB under-prediction in dense urban canyons where reflections accumulate.

**Conservative?** With default ρ=1.0: conservative (over-prediction) when absorption is non-negligible. Use lower ρ values when the reflecting surface is known to be absorptive. Second-order reflection under-prediction is unchanged.

---

### 5. Amisc not implemented (no Asite, Ahouse, Afol)

**Tool:** No vegetation-belt attenuation (Afol) or housing-cluster screening (Ahouse). Total propagation loss is the ISO 9613-2 Formula (12) sum only.

**SoundPLAN:** Applies ISO 9613-2 Annex A vegetation and housing-cluster models when the user defines these zones.

**Impact:** 3–10+ dB over-prediction for paths that cross a dense tree belt (Afol) or a residential area where the housing acts as distributed screening (Ahouse). The over-prediction is conservative — it overestimates the level at the receiver — but may lead to unnecessary mitigation being recommended.

**Conservative?** Yes — over-predicts. However, the over-prediction can be so large (> 5 dB) that it makes design decisions unreliable. If a significant tree belt or housing cluster intervenes, either use SoundPLAN or explicitly note the omission in the assessment.

---

### 6. DEM resolution — GA LiDAR 5 m primary, SRTM 30 m fallback

**Tool:** Elevation data from Geoscience Australia WCS (5 m LiDAR tiles) where available, SRTM 30 m elsewhere. Samples elevation at object vertices only; terrain profile between vertices is linearly interpolated. Gaussian smoothing applied to grid contour rendering only — source/receiver elevation queries use raw DEM values.

**SoundPLAN:** Accepts user-supplied DTM at arbitrary resolution; Gaussian smoothing optional.

**Impact:** ±0.5–2 m elevation error in SRTM-only areas or in 5 m LiDAR coverage gaps, translating to ±1–3 dB uncertainty on paths where terrain screening is marginal (the source or receiver is just above or just below the screening ridge).

**Conservative?** Variable — elevation error may cause either over- or under-prediction of screening. Flag on sites in SRTM-only coverage (`console.log` shows `source: 'srtm'` entries in `DEMCache`).

---

### 7. Line source segmentation — fixed 1–5 m segment spacing

**Tool:** Line sources are discretised into point-source segments at fixed spacing (1–5 m depending on source length). Each segment is treated as an independent point source and energy-summed.

**SoundPLAN:** Uses continuous line source integration along the source geometry.

**Impact:** 1–2 dB discrepancy at short distances (< 50 m) or at receiver positions near the ends of line sources, where the discrete-segment approximation diverges most from the integral. At distances > 100 m and for central receiver positions the error is typically < 0.5 dB.

**Conservative?** Variable — may over- or under-predict depending on receiver geometry relative to line-source ends.

---

### 8. Area source grid — regular density

**Tool:** Area sources are discretised on a regular grid of point sources. Grid spacing is fixed (not adaptive to wavelength or distance).

**SoundPLAN:** Uses adaptive integration or fine subdivision near source edges for improved accuracy.

**Impact:** 1–2 dB near the edges of large area sources (> 50 m × 50 m) at short receiver distances (< 2× source dimension). Central-receiver predictions are typically < 0.5 dB in error.

**Conservative?** Variable — same character as line source segmentation.

---

### 9. Building source radiation — Strutt/VDI 3760 simplified formula

**Tool:** Building sources radiate via the Strutt/Bies-Hansen/VDI 3760 simplified formula:

```
Lw,surface = Lp_in − TL_surface + 10·log₁₀(S_surface) − 6
```

where `Lp_in` is the reverberant (diffuse-field) interior SPL entered by the user. The −6 dB constant is the diffuse-field-SPL to radiated-intensity-per-unit-area conversion (normal-component intensity in a diffuse field = p²/(4ρc), giving −6 dB relative to the free-field SPL). The same constant applies to façades and roof. Each surface's Lw,surface is propagated to the receiver via the standard ISO 9613-2 chain (`calcISOatPoint`). Interior room absorption is not modelled — the user's Lp input is assumed to already represent the well-mixed reverberant field.

**SoundPLAN:** Same Strutt formula in simplified mode. Full VDI 3760 interior calculation available when interior sources, surface absorptions, and hall reverberation are explicitly modelled (SoundBUILD module).

**Impact:** Within ±1 dB of SoundPLAN's simplified building-source mode when the interior Lp is correctly characterised as the reverberant-field level. The full VDI 3760 calculation (modelling interior sources, surface absorptions, Sabine correction) can differ by 2–5 dB when the interior is acoustically absorptive (lined plant rooms, open-structure sheds) or unusually reverberant (bare concrete). In those cases, use SoundPLAN.

**Conservative?** Variable — depends entirely on the accuracy of the user-supplied interior Lp. The tool formula itself is not inherently conservative or non-conservative relative to SoundPLAN's simplified mode.

---

## Comparison Workflow

Standard procedure when comparing this tool against SoundPLAN:

1. **Identical scenario setup** — same source positions (to nearest 0.1 m), same heights, same spectrum (octave-band Lw), same receiver positions, same barrier geometry and heights, same G, no additional objects in SoundPLAN that are absent here.

2. **Broadband LAeq comparison** — record predicted LAeq from both tools. If the delta is ≤ 2 dB for the scenario type (see Acceptable Tolerances below), the result is within expected tolerance.

3. **Per-band investigation** — if delta > 2 dB, extract per-octave-band Lp from both tools. The band(s) with the largest delta typically identify the term responsible (see step 4).

4. **Term-by-term identification** — isolate the offending term:
   - Large 63–125 Hz delta → likely Agr (ground factor or hS/hR geometry)
   - Large 250–1000 Hz delta → likely Agr or Abar (barrier path geometry)
   - Large > 2000 Hz delta → likely Aatm (temperature or humidity mismatch)
   - Uniform delta across all bands → likely Adiv (geometry or distance mismatch)

5. **Document findings** — record the delta, the likely cause, and whether it is within acceptable tolerance for the scenario, in the project assessment notes.

---

## Acceptable Tolerances

Expected agreement between this tool and SoundPLAN for scenarios within the stated scope:

| Scenario | Acceptable delta |
|----------|-----------------|
| Open field, no barriers, G=0 | ±0.5 dB |
| Open field, G=0.5 or G=1 | ±1.5 dB |
| With barrier, G=0 | ±2.0 dB |
| With barrier, G=0.5 or G=1 | ±3.0 dB |
| Complex terrain (single ridge) | ±3.0 dB |
| Building source radiation | ±2.0 dB |
| Line source or area source | ±2.0 dB |

Deltas outside these ranges warrant investigation before the result is used in a formal assessment.

---

*Last reconciled: 2026-04 (updated April 2026 post-Gap 6 implementation). Simplification 9 updated: +6 dB hemisphere constant replaced with correct Strutt/VDI 3760 −6 dB diffuse-field constant (Gap 6 closed). Building source predictions now ~12 dB lower. Simplification 9 now describes an accepted approximation (no interior absorption model) rather than a numerical error. Remaining open simplifications: 1 (Cmet), 2 (directivity), 3 (single-ridge terrain), 4 (single-barrier), 5 (Amisc), 6 (no interior absorption model), 7 (first-order reflection only), 8 (line source segmentation). 9 simplifications remain.*
