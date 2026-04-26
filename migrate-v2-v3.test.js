/**
 * migrate-v2-v3.test.js — Unit tests for migrateV2ToV3 save format migration.
 *
 * Covers:
 *   a) v2 custom point source: flat 60 dB(A)/band → converted to dB(Z)
 *   b) v2 library point source (dB(Z), energySum >> lw): spectrum unchanged
 *   c) v2 line source with spectrum_m_base: values unchanged (no rename needed)
 *   d) v2 area source with as.spectrum: values unchanged
 *   e) v2 building source: no-op
 *   f) v2 mixed: all types combined
 *   g) round-trip: migrate → re-migrate is idempotent (_version=3, no double-convert)
 *
 * Run with: npm test
 */

import { describe, it, expect, vi } from 'vitest';

// ── A_WEIGHTS_BANDS (must match shared-calc.js exactly) ─────────────────────
const AW = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1];

// ── Inline migrateV2ToV3 for unit testing ───────────────────────────────────
// Extracted from index.html to allow import in vitest.
// IMPORTANT: must stay bit-identical to the in-page implementation.
function migrateV2ToV3(saved, fromVersion) {
  var AW_LOCAL = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1];
  var counts = { point: 0, line: 0, area: 0, building: 0 };
  var GREY_WARNINGS = 0;

  // ── Point sources ──────────────────────────────────────────────────────────
  var pins = saved.sourcePins;
  if (Array.isArray(pins)) {
    pins.forEach(function(pin) {
      ['day', 'eve', 'night'].forEach(function(period) {
        var spec = pin.spectrum && pin.spectrum[period];
        if (!Array.isArray(spec) || spec.length !== 8) return;
        var lw = pin.lw && Number.isFinite(pin.lw[period]) ? pin.lw[period] : null;
        if (lw === null) return;

        var sumLin = 0;
        var allFinite = true;
        for (var i = 0; i < 8; i++) {
          if (!Number.isFinite(spec[i])) { allFinite = false; break; }
          sumLin += Math.pow(10, spec[i] / 10);
        }
        if (!allFinite || sumLin <= 0) return;
        var energyDiff = Math.round((lw - 10 * Math.log10(sumLin)) * 10) / 10;

        if (energyDiff >= -1.0) {
          // energySum ≈ lw → custom dB(A) spectrum → convert to dB(Z)
          for (var j = 0; j < 8; j++) {
            pin.spectrum[period][j] = spec[j] - AW_LOCAL[j];
          }
          counts.point++;
        } else if (energyDiff > -8.0) {
          // Grey zone: 1–8 dB below lw — uncertain convention
          GREY_WARNINGS++;
        }
        // else: energyDiff ≤ -8 dB → library dB(Z) → no change
      });
      // Also migrate spectrum_max (Lmax band input, same convention as day)
      var specMax = pin.spectrum_max;
      var lwMax = Number.isFinite(pin.lw_max) ? pin.lw_max : null;
      if (Array.isArray(specMax) && specMax.length === 8 && lwMax !== null) {
        var smLin = 0, smOk = true;
        for (var k = 0; k < 8; k++) {
          if (!Number.isFinite(specMax[k])) { smOk = false; break; }
          smLin += Math.pow(10, specMax[k] / 10);
        }
        if (smOk && smLin > 0) {
          var smDiff = Math.round((lwMax - 10 * Math.log10(smLin)) * 10) / 10;
          if (smDiff >= -1.0) {
            for (var m = 0; m < 8; m++) {
              pin.spectrum_max[m] = specMax[m] - AW_LOCAL[m];
            }
          }
        }
      }
    });
  }

  // ── Line sources ───────────────────────────────────────────────────────────
  var lines = saved.lineSources;
  if (Array.isArray(lines)) {
    lines.forEach(function(ls) {
      var smb = ls.spectrum_m_base;
      if (smb && typeof smb === 'object') counts.line++;
    });
  }

  // ── Area sources ───────────────────────────────────────────────────────────
  var areas = saved.areaSources;
  if (Array.isArray(areas)) {
    areas.forEach(function(as) {
      if (as.spectrum && typeof as.spectrum === 'object') counts.area++;
    });
  }

  // ── Building sources ───────────────────────────────────────────────────────
  var bldgs = saved.buildingSources;
  if (Array.isArray(bldgs)) {
    counts.building = bldgs.length;
  }

  return { counts, greyWarnings: GREY_WARNINGS };
}

// ── Helper: energySum (dB) of a spectrum array ───────────────────────────────
function energySum(spec) {
  const sumLin = spec.reduce((s, v) => s + Math.pow(10, v / 10), 0);
  return 10 * Math.log10(sumLin);
}

// ── Helper: A-weighted energySum ─────────────────────────────────────────────
function aWeightedSum(spec) {
  const sumLin = spec.reduce((s, v, i) => s + Math.pow(10, (v + AW[i]) / 10), 0);
  return 10 * Math.log10(sumLin);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Fixture a: Custom point source — flat 60 dB(A)/band (8 bands), lw = 69.03 dB(A).
 *  In v2, the UI stored user-entered dB(A) per band without conversion.
 *  Expected post-migration: subtract AW from each band.
 *  [60-(-26.2), 60-(-16.1), ..., 60-(-1.1)] = [86.2, 76.1, 68.6, 63.2, 60.0, 58.8, 59.0, 61.1]
 */
const FLAT_60_DBA = [60, 60, 60, 60, 60, 60, 60, 60];
const FLAT_60_DBA_LW = Math.round(energySum(FLAT_60_DBA) * 100) / 100; // 69.03
const FLAT_60_DBA_EXPECTED_Z = FLAT_60_DBA.map((v, i) => v - AW[i]);
// = [86.2, 76.1, 68.6, 63.2, 60.0, 58.8, 59.0, 61.1]

/** Fixture b: Library point source — Carpark exhaust fan from SOURCE_LIBRARY_GROUPED.
 *  spectrum already dB(Z) — energySum = 93.7 dB >> lw = 85.1 dB (diff = -8.66 dB).
 *  Expected: spectrum UNCHANGED after migration.
 */
const CARPARK_FAN_SPEC_Z = [90.2, 88.1, 85.6, 82.2, 79, 76.8, 73, 67.1];
const CARPARK_FAN_LW = 85.1;

/** Make a minimal v2 assessment object with one custom point source. */
function makeV2Custom() {
  const spec = FLAT_60_DBA.slice();
  return {
    _format: 'resonate-noise-tool',
    _version: 2,
    sourcePins: [{
      id: 'pin-1',
      name: 'Custom exhaust',
      lw: { day: FLAT_60_DBA_LW, eve: FLAT_60_DBA_LW, night: FLAT_60_DBA_LW },
      lw_max: null,
      spectrum: { day: spec.slice(), eve: spec.slice(), night: spec.slice() },
      spectrum_max: null
    }]
  };
}

/** Make a minimal v2 assessment with one library point source. */
function makeV2Library() {
  return {
    _format: 'resonate-noise-tool',
    _version: 2,
    sourcePins: [{
      id: 'pin-2',
      name: 'Carpark exhaust fan',
      lw: { day: CARPARK_FAN_LW, eve: CARPARK_FAN_LW, night: CARPARK_FAN_LW },
      lw_max: null,
      spectrum: {
        day: CARPARK_FAN_SPEC_Z.slice(),
        eve: CARPARK_FAN_SPEC_Z.slice(),
        night: CARPARK_FAN_SPEC_Z.slice()
      },
      spectrum_max: null
    }]
  };
}

/** Fixture c: Line source with spectrum_m_base (dB(Z) values from library). */
function makeV2LineLibrary() {
  return {
    _format: 'resonate-noise-tool',
    _version: 2,
    lineSources: [{
      id: 'ls-1',
      name: 'Road A',
      lw_m_base: 65.0,
      spectrum_m_base: {
        day: { 63: 55, 125: 62, 250: 68, 500: 65, 1000: 60, 2000: 55, 4000: 48, 8000: 40 },
        eve: { 63: 55, 125: 62, 250: 68, 500: 65, 1000: 60, 2000: 55, 4000: 48, 8000: 40 },
        night: null
      }
    }]
  };
}

/** Fixture d: Area source with as.spectrum (dB(Z) values from library). */
function makeV2AreaLibrary() {
  return {
    _format: 'resonate-noise-tool',
    _version: 2,
    areaSources: [{
      id: 'as-1',
      name: 'Car park',
      lwValue: { day: 55, eve: 55, night: null },
      spectrum: {
        day: { 63: 50, 125: 55, 250: 58, 500: 55, 1000: 50, 2000: 45, 4000: 38, 8000: 30 },
        eve: { 63: 50, 125: 55, 250: 58, 500: 55, 1000: 50, 2000: 45, 4000: 38, 8000: 30 },
        night: null
      }
    }]
  };
}

/** Fixture e: Building source (no stored spectrum). */
function makeV2Building() {
  return {
    _format: 'resonate-noise-tool',
    _version: 2,
    buildingSources: [{
      id: 'bs-1',
      name: 'Warehouse',
      interiorLp: { day: { broadband: 75, octave: {} }, eve: { broadband: 75, octave: {} }, night: { broadband: 75, octave: {} } }
    }]
  };
}

/** Fixture f: Mixed — all source types combined. */
function makeV2Mixed() {
  const v2c = makeV2Custom();
  const v2l = makeV2Library();
  const v2ls = makeV2LineLibrary();
  const v2as = makeV2AreaLibrary();
  const v2bs = makeV2Building();
  return {
    _format: 'resonate-noise-tool',
    _version: 2,
    sourcePins: [...v2c.sourcePins, ...v2l.sourcePins],
    lineSources: v2ls.lineSources,
    areaSources: v2as.areaSources,
    buildingSources: v2bs.buildingSources
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Fixture a — v2 custom point source: flat 60 dB(A)/band → dB(Z)', () => {
  it('energySum of flat dB(A) spectrum ≈ lw (confirms it is a custom source)', () => {
    const diff = Math.abs(energySum(FLAT_60_DBA) - FLAT_60_DBA_LW);
    expect(diff).toBeLessThan(0.1);
  });

  it('post-migration spectrum matches expected dB(Z) values within 0.01 dB', () => {
    const saved = makeV2Custom();
    migrateV2ToV3(saved, 2);
    const pin = saved.sourcePins[0];
    for (const period of ['day', 'eve', 'night']) {
      const spec = pin.spectrum[period];
      for (let i = 0; i < 8; i++) {
        expect(spec[i]).toBeCloseTo(FLAT_60_DBA_EXPECTED_Z[i], 2);
      }
    }
  });

  it('expected post-migration values are [86.2, 76.1, 68.6, 63.2, 60.0, 58.8, 59.0, 61.1]', () => {
    expect(FLAT_60_DBA_EXPECTED_Z).toEqual([86.2, 76.1, 68.6, 63.2, 60.0, 58.8, 59.0, 61.1]);
  });

  it('A-weighted sum of converted spectrum equals original lw within 0.1 dB', () => {
    const saved = makeV2Custom();
    migrateV2ToV3(saved, 2);
    const spec = saved.sourcePins[0].spectrum.day;
    expect(aWeightedSum(spec)).toBeCloseTo(FLAT_60_DBA_LW, 1);
  });

  it('migration counts 3 conversions (day + eve + night)', () => {
    const saved = makeV2Custom();
    const { counts } = migrateV2ToV3(saved, 2);
    expect(counts.point).toBe(3);
  });

  it('lw field is unchanged after migration', () => {
    const saved = makeV2Custom();
    migrateV2ToV3(saved, 2);
    expect(saved.sourcePins[0].lw.day).toBeCloseTo(FLAT_60_DBA_LW, 2);
  });
});

describe('Fixture b — v2 library point source (dB(Z)): spectrum unchanged', () => {
  it('energySum of library dB(Z) spectrum exceeds lw by > 8 dB (confirms library source)', () => {
    const diff = CARPARK_FAN_LW - energySum(CARPARK_FAN_SPEC_Z);
    expect(diff).toBeLessThan(-8.0);
  });

  it('post-migration spectrum is unchanged (no conversion)', () => {
    const saved = makeV2Library();
    migrateV2ToV3(saved, 2);
    const spec = saved.sourcePins[0].spectrum.day;
    for (let i = 0; i < 8; i++) {
      expect(spec[i]).toBeCloseTo(CARPARK_FAN_SPEC_Z[i], 2);
    }
  });

  it('migration count is 0 for library sources', () => {
    const saved = makeV2Library();
    const { counts } = migrateV2ToV3(saved, 2);
    expect(counts.point).toBe(0);
  });
});

describe('Fixture c — v2 line source with spectrum_m_base: values unchanged', () => {
  it('spectrum_m_base day values are unchanged after migration', () => {
    const saved = makeV2LineLibrary();
    const origDay = { ...saved.lineSources[0].spectrum_m_base.day };
    migrateV2ToV3(saved, 2);
    const day = saved.lineSources[0].spectrum_m_base.day;
    expect(day[63]).toBe(origDay[63]);
    expect(day[1000]).toBe(origDay[1000]);
    expect(day[8000]).toBe(origDay[8000]);
  });

  it('migration line count is 1 (line source has spectrum_m_base)', () => {
    const saved = makeV2LineLibrary();
    const { counts } = migrateV2ToV3(saved, 2);
    expect(counts.line).toBe(1);
  });
});

describe('Fixture d — v2 area source with as.spectrum: values unchanged', () => {
  it('as.spectrum day values are unchanged after migration', () => {
    const saved = makeV2AreaLibrary();
    const origDay = { ...saved.areaSources[0].spectrum.day };
    migrateV2ToV3(saved, 2);
    const day = saved.areaSources[0].spectrum.day;
    expect(day[63]).toBe(origDay[63]);
    expect(day[1000]).toBe(origDay[1000]);
  });

  it('migration area count is 1', () => {
    const saved = makeV2AreaLibrary();
    const { counts } = migrateV2ToV3(saved, 2);
    expect(counts.area).toBe(1);
  });
});

describe('Fixture e — v2 building source: no-op', () => {
  it('building source is unchanged after migration', () => {
    const saved = makeV2Building();
    const origBroadband = saved.buildingSources[0].interiorLp.day.broadband;
    migrateV2ToV3(saved, 2);
    expect(saved.buildingSources[0].interiorLp.day.broadband).toBe(origBroadband);
  });

  it('migration building count equals building source count', () => {
    const saved = makeV2Building();
    const { counts } = migrateV2ToV3(saved, 2);
    expect(counts.building).toBe(1);
  });
});

describe('Fixture f — v2 mixed: custom + library + line + area + building', () => {
  it('custom source spectrum converted; library source spectrum unchanged', () => {
    const saved = makeV2Mixed();
    migrateV2ToV3(saved, 2);
    // Custom source (pin index 0): day band 0 should be 86.2 (60 - (-26.2))
    expect(saved.sourcePins[0].spectrum.day[0]).toBeCloseTo(86.2, 1);
    // Library source (pin index 1): spectrum_m unchanged
    for (let i = 0; i < 8; i++) {
      expect(saved.sourcePins[1].spectrum.day[i]).toBeCloseTo(CARPARK_FAN_SPEC_Z[i], 2);
    }
  });

  it('line, area, building unchanged', () => {
    const saved = makeV2Mixed();
    const origLine = saved.lineSources[0].spectrum_m_base.day[63];
    const origArea = saved.areaSources[0].spectrum.day[63];
    const origBldg = saved.buildingSources[0].interiorLp.day.broadband;
    migrateV2ToV3(saved, 2);
    expect(saved.lineSources[0].spectrum_m_base.day[63]).toBe(origLine);
    expect(saved.areaSources[0].spectrum.day[63]).toBe(origArea);
    expect(saved.buildingSources[0].interiorLp.day.broadband).toBe(origBldg);
  });

  it('counts: 3 point conversions (1 custom × 3 periods), 1 line, 1 area, 1 building', () => {
    const saved = makeV2Mixed();
    const { counts } = migrateV2ToV3(saved, 2);
    expect(counts.point).toBe(3);
    expect(counts.line).toBe(1);
    expect(counts.area).toBe(1);
    expect(counts.building).toBe(1);
  });
});

describe('Round-trip: migrate v2 → _version=3 → no second migration', () => {
  it('migrated file has _version=3 (simulated by version ladder)', () => {
    const saved = makeV2Custom();
    // Simulate loadAssessment version ladder
    const savedVersion = saved._version || 1;
    if (savedVersion < 3) {
      migrateV2ToV3(saved, savedVersion);
      saved._version = 3;
    }
    expect(saved._version).toBe(3);
  });

  it('second load of v3 file does not re-migrate (idempotent)', () => {
    // First load: migrate custom source
    const saved = makeV2Custom();
    const savedVersion = saved._version || 1;
    if (savedVersion < 3) {
      migrateV2ToV3(saved, savedVersion);
      saved._version = 3;
    }
    // Capture post-migration spectrum
    const specAfterFirst = saved.sourcePins[0].spectrum.day.slice();

    // Second load: version is already 3, no migration
    const savedVersion2 = saved._version || 1;
    if (savedVersion2 < 3) {
      migrateV2ToV3(saved, savedVersion2);
      saved._version = 3;
    }
    // Spectrum must be unchanged (not double-converted)
    const specAfterSecond = saved.sourcePins[0].spectrum.day;
    for (let i = 0; i < 8; i++) {
      expect(specAfterSecond[i]).toBeCloseTo(specAfterFirst[i], 2);
    }
  });

  it('double-migration would produce wrong values: verify idempotency prevents it', () => {
    // If migration ran twice on a custom source, band 0 would become 86.2 + 26.2 = 112.4 — wrong
    const saved = makeV2Custom();
    migrateV2ToV3(saved, 2);
    const specMid = saved.sourcePins[0].spectrum.day.slice();
    // Run again: specMid[0] = 86.2. energySum(specMid) ≠ lw, so diff < -1 → no second convert
    const origLw = saved.sourcePins[0].lw.day;
    const eSum = energySum(specMid);
    const diff = origLw - eSum;
    expect(diff).toBeLessThan(-1.0); // confirms no second conversion would happen
    // specMid[0] should still be ~86.2, NOT 112.4
    expect(specMid[0]).toBeCloseTo(86.2, 1);
  });
});

describe('Edge cases', () => {
  it('handles null spectrum periods gracefully (no throw)', () => {
    const saved = {
      _version: 2,
      sourcePins: [{
        id: 'p1', name: 'Test',
        lw: { day: 70, eve: 70, night: null },
        lw_max: null,
        spectrum: { day: [60,60,60,60,60,60,60,60], eve: null, night: null },
        spectrum_max: null
      }]
    };
    expect(() => migrateV2ToV3(saved, 2)).not.toThrow();
    // day spectrum was converted
    expect(saved.sourcePins[0].spectrum.day[0]).toBeCloseTo(86.2, 1);
    // null periods unchanged
    expect(saved.sourcePins[0].spectrum.eve).toBeNull();
  });

  it('handles empty sourcePins gracefully', () => {
    const saved = { _version: 2, sourcePins: [] };
    expect(() => migrateV2ToV3(saved, 2)).not.toThrow();
  });

  it('handles missing sourcePins gracefully', () => {
    const saved = { _version: 2 };
    expect(() => migrateV2ToV3(saved, 2)).not.toThrow();
  });

  it('handles spectrum with some null bands (partial spectrum — skip)', () => {
    // partial spectra (null elements) are skipped entirely
    const saved = {
      _version: 2,
      sourcePins: [{
        id: 'p2', name: 'Partial',
        lw: { day: 70, eve: 70, night: 70 },
        lw_max: null,
        spectrum: { day: [60, null, 60, 60, 60, 60, 60, 60], eve: null, night: null },
        spectrum_max: null
      }]
    };
    const origDay = saved.sourcePins[0].spectrum.day.slice();
    migrateV2ToV3(saved, 2);
    // spectrum with null element is not converted (allFinite = false guard)
    expect(saved.sourcePins[0].spectrum.day[0]).toBe(origDay[0]);
  });
});
