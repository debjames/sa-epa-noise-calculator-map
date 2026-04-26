/**
 * calc.test.js — Reference case tests for EPA noise calculator
 *
 * All expected values hand-verified against formula:
 *   Lp = Lw - (20·log10(r) + 8)
 *
 * Run with:  npm test
 */

import { describe, it, expect } from 'vitest';
import {
  attenuatePoint,
  energySum,
  sourceCombinedLw,
  sourceContribution,
  totalAtReceiver,
  calcBarrierAttenuation,
  calcBarrierWithEndDiffraction,
  calcISOatPoint,
} from './calc.js';

// ---------------------------------------------------------------------------
// Case 1 — Basic formula, known distances
// Single item, Lw = 90 dB, qty = 1
// ---------------------------------------------------------------------------
describe('Case 1: attenuatePoint — basic formula', () => {
  it('10 m: Lp = 90 - (20 + 8) = 62.0 dB', () => {
    expect(attenuatePoint(90, 10)).toBeCloseTo(62.0, 1);
  });

  it('25 m: Lp = 90 - (27.96 + 8) = 54.0 dB', () => {
    expect(attenuatePoint(90, 25)).toBeCloseTo(54.04, 1);
  });

  it('50 m: Lp = 90 - (33.98 + 8) = 48.0 dB', () => {
    expect(attenuatePoint(90, 50)).toBeCloseTo(48.02, 1);
  });

  it('100 m: Lp = 90 - (40 + 8) = 42.0 dB', () => {
    expect(attenuatePoint(90, 100)).toBeCloseTo(42.0, 1);
  });

  it('10 m → 100 m (10× distance) drops exactly 20 dB', () => {
    const diff = attenuatePoint(90, 10) - attenuatePoint(90, 100);
    expect(diff).toBeCloseTo(20.0, 1);
  });

  it('10 m → 50 m (5× distance) drops ~14 dB', () => {
    const diff = attenuatePoint(90, 10) - attenuatePoint(90, 50);
    expect(diff).toBeCloseTo(13.98, 1);
  });
});

// ---------------------------------------------------------------------------
// Case 2 — Quantity > 1
// Lw = 90 dB, qty = 2, r = 10 m → combined Lw = 93.01 dB → Lp = 65.0 dB
// ---------------------------------------------------------------------------
describe('Case 2: sourceCombinedLw — quantity doubles power (+3 dB)', () => {
  it('qty = 2 adds 3.01 dB to source Lw', () => {
    const equipment = [{ Lw: 90, quantity: 2 }];
    expect(sourceCombinedLw(equipment)).toBeCloseTo(93.01, 1);
  });

  it('qty = 2 at 10 m: Lp = 65.0 dB (3 dB above qty = 1 case)', () => {
    const source = { equipment: [{ Lw: 90, quantity: 2 }] };
    expect(sourceContribution(source, 10)).toBeCloseTo(65.0, 1);
  });

  it('qty = 1 and qty = 2 at same distance differ by ~3 dB', () => {
    const src1 = { equipment: [{ Lw: 90, quantity: 1 }] };
    const src2 = { equipment: [{ Lw: 90, quantity: 2 }] };
    const diff = sourceContribution(src2, 10) - sourceContribution(src1, 10);
    expect(diff).toBeCloseTo(3.01, 1);
  });
});

// ---------------------------------------------------------------------------
// Case 3 — Two items at one source (energy sum at source)
// Item A: Lw = 90 qty = 1 | Item B: Lw = 84 qty = 1 → combined Lw = 90.97 dB
// At r = 10 m: Lp = 90.97 - 28 = 62.97 ≈ 63.0 dB
// ---------------------------------------------------------------------------
describe('Case 3: sourceCombinedLw — two items, energy summed', () => {
  const equipment = [
    { Lw: 90, quantity: 1 },
    { Lw: 84, quantity: 1 },
  ];

  it('combined Lw = 90.97 dB (6 dB gap → weaker adds ~1 dB)', () => {
    expect(sourceCombinedLw(equipment)).toBeCloseTo(90.97, 1);
  });

  it('at 10 m: Lp = 63.0 dB', () => {
    const source = { equipment };
    expect(sourceContribution(source, 10)).toBeCloseTo(62.97, 1);
  });

  it('combined is higher than either item alone', () => {
    const combined = sourceCombinedLw(equipment);
    expect(combined).toBeGreaterThan(90);
    expect(combined).toBeLessThan(91);
  });
});

// ---------------------------------------------------------------------------
// Case 4 — Two sources, energy sum at receiver
// Source 1: Lw = 90, r = 10 m → Lp₁ = 62.0 dB
// Source 2: Lw = 84, r = 10 m → Lp₂ = 56.0 dB
// Total = 63.0 dB
// ---------------------------------------------------------------------------
describe('Case 4: totalAtReceiver — two sources energy-summed', () => {
  const sources = [
    { equipment: [{ Lw: 90, quantity: 1 }] },
    { equipment: [{ Lw: 84, quantity: 1 }] },
  ];
  const distances = [10, 10];

  it('Lp₁ = 62.0 dB (Source 1 alone)', () => {
    expect(sourceContribution(sources[0], 10)).toBeCloseTo(62.0, 1);
  });

  it('Lp₂ = 56.0 dB (Source 2 alone)', () => {
    expect(sourceContribution(sources[1], 10)).toBeCloseTo(56.0, 1);
  });

  it('combined total = 63.0 dB (6 dB gap adds ~1 dB to dominant source)', () => {
    expect(totalAtReceiver(sources, distances)).toBeCloseTo(63.0, 1);
  });

  it('total is greater than either source alone', () => {
    const total = totalAtReceiver(sources, distances);
    expect(total).toBeGreaterThan(62.0);
    expect(total).toBeGreaterThan(56.0);
  });
});

// ---------------------------------------------------------------------------
// energySum — direct unit tests
// ---------------------------------------------------------------------------
describe('energySum', () => {
  it('two equal levels add 3 dB', () => {
    expect(energySum([60, 60])).toBeCloseTo(63.01, 1);
  });

  it('single level returns itself', () => {
    expect(energySum([72.5])).toBeCloseTo(72.5, 2);
  });

  it('10 dB gap: weaker adds ~0.4 dB to dominant', () => {
    expect(energySum([70, 60])).toBeCloseTo(70.41, 1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
describe('Edge cases', () => {
  it('r = 0: clamps to 0.1 m, returns finite result', () => {
    const result = attenuatePoint(90, 0);
    expect(isFinite(result)).toBe(true);
    expect(result).not.toBeNaN();
  });

  it('r < 0: clamps to 0.1 m, returns finite result', () => {
    const result = attenuatePoint(90, -5);
    expect(isFinite(result)).toBe(true);
  });

  it('qty = 0: item is excluded, returns -Infinity for empty source', () => {
    const equipment = [{ Lw: 90, quantity: 0 }];
    expect(sourceCombinedLw(equipment)).toBe(-Infinity);
  });

  it('empty equipment list: source contributes nothing', () => {
    const source = { equipment: [] };
    expect(sourceContribution(source, 10)).toBe(-Infinity);
  });

  it('source with no equipment excluded from totalAtReceiver', () => {
    const sources = [
      { equipment: [{ Lw: 90, quantity: 1 }] },
      { equipment: [] }, // empty source — should be ignored
    ];
    const distances = [10, 10];
    // should equal single source result
    expect(totalAtReceiver(sources, distances)).toBeCloseTo(62.0, 1);
  });

  it('all sources empty: totalAtReceiver returns -Infinity', () => {
    const sources = [{ equipment: [] }, { equipment: [] }];
    expect(totalAtReceiver(sources, [10, 10])).toBe(-Infinity);
  });
});

// ---------------------------------------------------------------------------
// ISO 9613-2 barrier attenuation
// ---------------------------------------------------------------------------
const FREQS = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

describe('calcBarrierAttenuation', () => {
  it('delta = 0: returns all zeros', () => {
    const result = calcBarrierAttenuation(0, FREQS);
    result.forEach(v => expect(v).toBe(0));
  });

  it('delta < 0: returns all zeros', () => {
    const result = calcBarrierAttenuation(-0.1, FREQS);
    result.forEach(v => expect(v).toBe(0));
  });

  it('delta = 0.45m, 1kHz band: ~14.7 dB', () => {
    // lambda at 1kHz = 340/1000 = 0.34m
    // Abar = 10*log10(3 + 20*0.45/0.34) = 10*log10(29.47) = 14.69 dB
    const result = calcBarrierAttenuation(0.45, FREQS);
    expect(result[4]).toBeCloseTo(14.7, 1); // index 4 = 1000Hz
  });

  it('delta = 0.45m, 63Hz band: ~6.7 dB (less screening at low freq)', () => {
    // lambda at 63Hz = 340/63 = 5.40m
    // Abar = 10*log10(3 + 20*0.45/5.40) = 10*log10(4.67) = 6.69 dB
    const result = calcBarrierAttenuation(0.45, FREQS);
    expect(result[0]).toBeCloseTo(6.7, 1); // index 0 = 63Hz
  });

  it('large delta: all values capped at 20 dB', () => {
    const result = calcBarrierAttenuation(10, FREQS);
    result.forEach(v => expect(v).toBeLessThanOrEqual(20));
  });

  it('returns 8 values for 8 frequency bands', () => {
    expect(calcBarrierAttenuation(0.5, FREQS).length).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// calcISOatPoint — shared ISO 9613-2 prediction
// ---------------------------------------------------------------------------
// ISO_SPECTRUM: dB(Z) unweighted per band (converted from dB(A) April 2026, Option B convention).
// Engine applies A-weighting internally; expected Lp values are unchanged.
// Original dB(A): [37, 43, 48, 53, 56, 54, 51, 43]
// Converted dBZ[i] = dBA[i] - AW[i]: AW=[-26.2,-16.1,-8.6,-3.2,0,1.2,1.0,-1.1]
const ISO_SPECTRUM = [63.2, 59.1, 56.6, 56.2, 56.0, 52.8, 50.0, 44.1]; // small exhaust fan reference, dB(Z)

describe('calcISOatPoint', () => {
  it('returns a finite number for valid inputs', () => {
    const result = calcISOatPoint(ISO_SPECTRUM, 1.5, 50, 0, 0, 1.5, {
      temperature: 10, humidity: 70, groundFactor: 0.5
    });
    expect(Number.isFinite(result)).toBe(true);
  });

  it('regression: small exhaust fan at 50m ≈ 15.3 dB', () => {
    const result = calcISOatPoint(ISO_SPECTRUM, 1.0, 50, 0, 0, 1.5, {
      temperature: 10, humidity: 70, groundFactor: 0.5
    });
    expect(Math.abs(result - 15.26)).toBeLessThan(0.5);
  });

  it('returns NaN for null spectrum', () => {
    expect(calcISOatPoint(null, 1.5, 50, 0, 0, 1.5, {})).toBeNaN();
  });

  it('returns NaN for zero distance', () => {
    expect(calcISOatPoint(ISO_SPECTRUM, 1.5, 0, 0, 0, 1.5, {})).toBeNaN();
  });

  it('barrier delta > 0 reduces result vs no barrier', () => {
    const noBarrier = calcISOatPoint(ISO_SPECTRUM, 1.5, 50, 0, 0, 1.5, {
      temperature: 10, humidity: 70, groundFactor: 0.5
    });
    const withBarrier = calcISOatPoint(ISO_SPECTRUM, 1.5, 50, 0, 0.45, 1.5, {
      temperature: 10, humidity: 70, groundFactor: 0.5
    });
    expect(withBarrier).toBeLessThan(noBarrier);
  });

  it('adjDB shifts the result by the expected amount', () => {
    const base = calcISOatPoint(ISO_SPECTRUM, 1.5, 50, 0, 0, 1.5, {
      temperature: 10, humidity: 70, groundFactor: 0.5
    });
    const plus3 = calcISOatPoint(ISO_SPECTRUM, 1.5, 50, 3, 0, 1.5, {
      temperature: 10, humidity: 70, groundFactor: 0.5
    });
    expect(plus3 - base).toBeCloseTo(3, 0);
  });

  it('end diffraction reduces effective barrier attenuation', () => {
    // With end diffraction paths, more sound arrives at receiver → lower effective IL
    const noEnd = calcISOatPoint(ISO_SPECTRUM, 1.5, 50, 0, 0.45, 1.5, {
      temperature: 10, humidity: 70, groundFactor: 0.5
    }, 0, 0);
    const withEnd = calcISOatPoint(ISO_SPECTRUM, 1.5, 50, 0, 0.45, 1.5, {
      temperature: 10, humidity: 70, groundFactor: 0.5
    }, 0.3, 0.3);
    // End diffraction adds energy → higher level behind barrier
    expect(withEnd).toBeGreaterThan(noEnd);
  });
});

// ---------------------------------------------------------------------------
// calcBarrierWithEndDiffraction — combined over-top + end diffraction
// ---------------------------------------------------------------------------
describe('calcBarrierWithEndDiffraction', () => {
  it('no deltas → all zero insertion loss', () => {
    const result = calcBarrierWithEndDiffraction(0, 0, 0, FREQS);
    result.forEach(v => expect(v).toBe(0));
  });

  it('top-only (no end diffraction) matches calcBarrierAttenuation', () => {
    const topOnly = calcBarrierWithEndDiffraction(0.45, 0, 0, FREQS);
    const direct = calcBarrierAttenuation(0.45, FREQS);
    topOnly.forEach((v, i) => expect(v).toBeCloseTo(direct[i], 2));
  });

  it('adding end diffraction reduces effective IL vs top-only', () => {
    const topOnly = calcBarrierWithEndDiffraction(0.45, 0, 0, FREQS);
    const withEnds = calcBarrierWithEndDiffraction(0.45, 0.3, 0.3, FREQS);
    // More paths → more energy → lower effective IL
    withEnds.forEach((v, i) => expect(v).toBeLessThanOrEqual(topOnly[i]));
  });

  it('effective IL is always >= 0', () => {
    const result = calcBarrierWithEndDiffraction(0.1, 0.05, 0.05, FREQS);
    result.forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });

  it('large end deltas still bounded by top delta IL', () => {
    // When end deltas are much larger than top delta, end paths contribute less
    const smallEnd = calcBarrierWithEndDiffraction(0.45, 5.0, 5.0, FREQS);
    const topOnly = calcBarrierWithEndDiffraction(0.45, 0, 0, FREQS);
    // With very large end deltas, their IL is high → small contribution → near top-only
    smallEnd.forEach((v, i) => {
      expect(v).toBeGreaterThan(topOnly[i] * 0.7); // within 30% of top-only
    });
  });
});
