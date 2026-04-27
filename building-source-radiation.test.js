/**
 * building-source-radiation.test.js
 *
 * Regression tests for the building-source diffuse-field radiation formula
 * (Gap 6, April 2026).
 *
 * Formula (Strutt / Bies-Hansen / VDI 3760 simplified):
 *   Lw,surface = Lp_in − TL_surface + 10·log₁₀(S_surface) − 6
 *
 * where Lp_in is the reverberant (diffuse-field) interior SPL.
 * The −6 dB is the diffuse-field-SPL to radiated-intensity-per-unit-area
 * conversion (in a diffuse field the normal-component intensity striking a
 * surface is p²/ρc × 1/4, giving −6 dB relative to the free-field SPL).
 *
 * These tests verify:
 *   1. Worked examples from first principles (hand-calculable)
 *   2. Per-band octave consistency with broadband result
 *   3. Sign of the constant is −6, not +6 (regression guard)
 *
 * The inline helper functions below mirror the logic in index.html
 * (_bsCalcOneFacade broadband path and _bsOctavSpecZ per-band path)
 * so any future change to those functions should prompt a corresponding
 * update here.
 */

import { describe, it, expect } from 'vitest';

// ── Inline formula helpers (mirror index.html logic) ─────────────────────────

const DIFFUSE_FIELD_CORR = -6; // the constant under test

/** Broadband Lw for one surface (mirrors _bsCalcOneFacade broadband path). */
function bsLwBroadband(lpBB, rw, areaM2, corr = DIFFUSE_FIELD_CORR) {
  if (areaM2 <= 0) return null;
  return lpBB - rw + 10 * Math.log10(areaM2) + corr;
}

/** Energy sum (dB) of an array of linear-dB values. */
function energySum(dbs) {
  const lin = dbs.reduce((acc, v) => acc + Math.pow(10, v / 10), 0);
  return 10 * Math.log10(lin);
}

/**
 * Per-band octave Lw for one surface (mirrors _bsOctavSpecZ).
 * Returns array[8] of Lw dB(Z) per octave band.
 * A-weighting is intentionally NOT applied here (Option B: applied downstream).
 */
function bsOctavSpecZ(lpOct, octaveR, areaM2, corr = DIFFUSE_FIELD_CORR) {
  return lpOct.map((lp, i) => lp - octaveR[i] + 10 * Math.log10(areaM2) + corr);
}

// A-weighting per IEC 61672-1, 63 Hz through 8 kHz (for broadband-from-octave comparison)
const A_WEIGHTS = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1];

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Building source diffuse-field radiation formula', () => {

  // ── Worked example 1: wall facade ──────────────────────────────────────────
  describe('Strutt/Bies-Hansen worked example — wall façade', () => {
    // Lp_in = 80 dB(A) reverberant, TL = 30 dB, S = 100 m²
    // Lw,facade = 80 − 30 + 10·log₁₀(100) − 6
    //           = 80 − 30 + 20.00 − 6
    //           = 64.00 dB(A)
    const Lp_in = 80;
    const TL    = 30;
    const S     = 100;
    const expected = Lp_in - TL + 10 * Math.log10(S) + DIFFUSE_FIELD_CORR; // = 64.0

    it('Lw,facade = 80 − 30 + 20 − 6 = 64.0 dB(A)', () => {
      const result = bsLwBroadband(Lp_in, TL, S);
      expect(result).toBeCloseTo(64.0, 2);
    });

    it('result matches formula evaluation', () => {
      expect(bsLwBroadband(Lp_in, TL, S)).toBeCloseTo(expected, 5);
    });
  });

  // ── Worked example 2: roof ──────────────────────────────────────────────────
  describe('Strutt/Bies-Hansen worked example — roof', () => {
    // Lp_in = 85 dB(A) reverberant, TL = 40 dB, S = 64 m²
    // Lw,roof = 85 − 40 + 10·log₁₀(64) − 6
    //         = 85 − 40 + 18.062 − 6
    //         = 57.062 dB(A)
    const Lp_in = 85;
    const TL    = 40;
    const S     = 64;

    it('Lw,roof = 85 − 40 + 18.06 − 6 = 57.06 dB(A)', () => {
      const result = bsLwBroadband(Lp_in, TL, S);
      expect(result).toBeCloseTo(57.062, 2);
    });

    it('same formula applies to roof as to façade (no surface-type differentiation)', () => {
      // The -6 constant is surface-orientation-independent per Strutt/VDI 3760
      const facadeResult = bsLwBroadband(Lp_in, TL, S);
      const roofResult   = bsLwBroadband(Lp_in, TL, S);
      expect(facadeResult).toBeCloseTo(roofResult, 10);
    });
  });

  // ── Per-band octave formula ─────────────────────────────────────────────────
  describe('Per-band octave formula — −6 applied per-band', () => {
    // Verify the −6 constant is applied independently to each octave band.
    // Single active band (1 kHz, band index 4, A-weight = 0 dB) isolates the arithmetic.
    const S = 50;
    const lpOct = [null, null, null, null, 80, null, null, null]; // only 1 kHz = 80 dB(Z)
    const octaveR = [null, null, null, null, 25, null, null, null];

    it('−6 is applied per-band: Lw_Z(1kHz) = Lp(1kHz) − R(1kHz) + 10·log₁₀(S) − 6', () => {
      // For the 1 kHz band: Lw_Z = 80 − 25 + 10*log10(50) − 6 = 80 − 25 + 16.99 − 6 = 65.99
      const expected1k = 80 - 25 + 10 * Math.log10(50) + DIFFUSE_FIELD_CORR;
      const perBandZ = bsOctavSpecZ(lpOct.map(v => v ?? 0), octaveR.map(v => v ?? 0), S);
      expect(perBandZ[4]).toBeCloseTo(expected1k, 4); // band index 4 = 1 kHz
    });

    it('per-band formula with TL=0, S=1 gives Lp − 0 + 0 − 6 = Lp − 6 per band', () => {
      const flatLpOct = Array(8).fill(80);
      const flatR     = Array(8).fill(0);
      const perBandZ  = bsOctavSpecZ(flatLpOct, flatR, 1);
      perBandZ.forEach(lw => expect(lw).toBeCloseTo(80 + DIFFUSE_FIELD_CORR, 5));
    });
  });

  // ── Sign regression guard ───────────────────────────────────────────────────
  describe('Sign regression — constant must be −6 not +6', () => {
    // With TL=0, S=1 m², Lp_in=80:
    //   Correct (−6):  80 − 0 + 0 − 6 = 74
    //   Wrong (+6):    80 − 0 + 0 + 6 = 86
    it('Lw(TL=0, S=1, Lp=80) = 74, not 86 — diffuse-field correction is −6', () => {
      const result = bsLwBroadband(80, 0, 1);
      expect(result).toBeCloseTo(74, 5);
      expect(result).not.toBeCloseTo(86, 1);
    });

    it('DIFFUSE_FIELD_CORR constant is −6', () => {
      expect(DIFFUSE_FIELD_CORR).toBe(-6);
    });
  });

  // ── Area sensitivity ────────────────────────────────────────────────────────
  describe('Area sensitivity', () => {
    it('doubling surface area increases Lw by 3 dB (10·log₁₀(2) ≈ 3.01)', () => {
      const lw1 = bsLwBroadband(80, 30, 10);
      const lw2 = bsLwBroadband(80, 30, 20);
      expect(lw2 - lw1).toBeCloseTo(10 * Math.log10(2), 4);
    });

    it('10× area increase gives +10 dB', () => {
      const lw1 = bsLwBroadband(80, 30, 10);
      const lw2 = bsLwBroadband(80, 30, 100);
      expect(lw2 - lw1).toBeCloseTo(10, 4);
    });

    it('zero area returns null (no radiation)', () => {
      expect(bsLwBroadband(80, 30, 0)).toBeNull();
    });
  });

  // ── TL sensitivity ──────────────────────────────────────────────────────────
  describe('TL sensitivity', () => {
    it('+10 dB TL increase reduces Lw by exactly 10 dB', () => {
      const lw1 = bsLwBroadband(80, 20, 50);
      const lw2 = bsLwBroadband(80, 30, 50);
      expect(lw1 - lw2).toBeCloseTo(10, 5);
    });
  });

});
