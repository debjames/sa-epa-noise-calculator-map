/**
 * geometry.test.js — Tests for ray-polygon intersection geometry.
 *
 * Run with:  npm test
 */

import { describe, it, expect } from 'vitest';
import {
  segmentsIntersect,
  getBuildingEdges,
  flatDistM,
  getIntersectingEdges,
  getDominantBarrier
} from './geometry.js';

describe('segmentsIntersect', () => {
  it('detects two clearly crossing segments', () => {
    // X pattern: (0,0)→(1,1) crosses (0,1)→(1,0)
    var hit = segmentsIntersect(
      { lat: 0, lng: 0 }, { lat: 1, lng: 1 },
      { lat: 0, lng: 1 }, { lat: 1, lng: 0 }
    );
    expect(hit).not.toBeNull();
    expect(hit.lat).toBeCloseTo(0.5, 6);
    expect(hit.lng).toBeCloseTo(0.5, 6);
  });

  it('returns null for parallel segments', () => {
    var hit = segmentsIntersect(
      { lat: 0, lng: 0 }, { lat: 1, lng: 0 },
      { lat: 0, lng: 1 }, { lat: 1, lng: 1 }
    );
    expect(hit).toBeNull();
  });

  it('returns null for non-overlapping segments', () => {
    var hit = segmentsIntersect(
      { lat: 0, lng: 0 }, { lat: 0.4, lng: 0.4 },
      { lat: 0.6, lng: 0.6 }, { lat: 1, lng: 1 }
    );
    expect(hit).toBeNull();
  });

  it('handles T-intersection (endpoint on segment)', () => {
    // Vertical segment (0,0.5)→(1,0.5) hit by horizontal (0.5,0)→(0.5,0.5)
    var hit = segmentsIntersect(
      { lat: 0.5, lng: 0 }, { lat: 0.5, lng: 0.5 },
      { lat: 0, lng: 0.5 }, { lat: 1, lng: 0.5 }
    );
    expect(hit).not.toBeNull();
    expect(hit.lat).toBeCloseTo(0.5, 6);
    expect(hit.lng).toBeCloseTo(0.5, 6);
  });

  it('works with [lat, lng] array format', () => {
    var hit = segmentsIntersect(
      [0, 0], [1, 1],
      [0, 1], [1, 0]
    );
    expect(hit).not.toBeNull();
    expect(hit.lat).toBeCloseTo(0.5, 6);
  });
});

describe('getBuildingEdges', () => {
  it('returns correct edges for a triangle', () => {
    var poly = [[0, 0], [1, 0], [0.5, 1]];
    var edges = getBuildingEdges(poly);
    expect(edges.length).toBe(3);
    expect(edges[0]).toEqual([[0, 0], [1, 0]]);
    expect(edges[1]).toEqual([[1, 0], [0.5, 1]]);
    expect(edges[2]).toEqual([[0.5, 1], [0, 0]]);
  });

  it('returns 4 edges for a rectangle', () => {
    var poly = [[0, 0], [0, 1], [1, 1], [1, 0]];
    expect(getBuildingEdges(poly).length).toBe(4);
  });
});

describe('flatDistM', () => {
  it('returns ~111320m for 1 degree latitude at equator', () => {
    var d = flatDistM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeCloseTo(111320, -2); // within 100m
  });

  it('returns 0 for same point', () => {
    expect(flatDistM({ lat: -34.9, lng: 138.6 }, { lat: -34.9, lng: 138.6 })).toBe(0);
  });
});

describe('getIntersectingEdges', () => {
  // Simple square building from (0.0004, 0.0004) to (0.0006, 0.0006)
  // ~45m × 45m at Adelaide latitude
  var building = {
    id: 1,
    polygon: [
      [-34.9284, 138.5994],
      [-34.9284, 138.5996],
      [-34.9286, 138.5996],
      [-34.9286, 138.5994]
    ],
    heightM: 10,
    name: 'Test Building'
  };

  it('finds intersections when ray crosses building', () => {
    // Source west of building, receiver east
    var src = { lat: -34.9285, lng: 138.5990 };
    var rec = { lat: -34.9285, lng: 138.6000 };
    var hits = getIntersectingEdges(src, rec, [building]);
    expect(hits.length).toBe(2); // enters and exits
    hits.forEach(h => {
      expect(h.building.id).toBe(1);
      expect(h.intersection.lat).toBeCloseTo(-34.9285, 3);
    });
  });

  it('returns empty when ray misses building', () => {
    // Both points south of building
    var src = { lat: -34.9290, lng: 138.5990 };
    var rec = { lat: -34.9290, lng: 138.6000 };
    var hits = getIntersectingEdges(src, rec, [building]);
    expect(hits.length).toBe(0);
  });

  it('returns empty when source and receiver on same side', () => {
    // Both points west of building
    var src = { lat: -34.9285, lng: 138.5990 };
    var rec = { lat: -34.9285, lng: 138.5992 };
    var hits = getIntersectingEdges(src, rec, [building]);
    expect(hits.length).toBe(0);
  });
});

describe('getDominantBarrier', () => {
  it('returns null when no buildings intersect', () => {
    var src = { lat: 0, lng: 0 };
    var rec = { lat: 0, lng: 0.001 };
    var result = getDominantBarrier(src, rec, 1, 1.5, []);
    expect(result).toBeNull();
  });

  it('computes correct path length difference (hand-calc reference)', () => {
    // Source at origin, height 1m
    // Receiver 100m east, height 1.5m
    // Building edge at 50m, height 6m
    // Using latitude coords where 0.001 deg ≈ 111.32m at equator
    var dPer001 = 111320; // metres per 0.001 deg lat
    var srcLng = 0;
    var recLng = 100 / dPer001; // ~100m east in degrees
    var midLng = 50 / dPer001;  // ~50m east

    // Building edge crossing the path at midpoint
    var building = {
      id: 99,
      polygon: [
        [-0.0001, midLng],
        [ 0.0001, midLng],
        [ 0.0001, midLng + 0.00001],
        [-0.0001, midLng + 0.00001]
      ],
      heightM: 6,
      name: null
    };

    var src = { lat: 0, lng: srcLng };
    var rec = { lat: 0, lng: recLng };
    var result = getDominantBarrier(src, rec, 1, 1.5, [building]);

    expect(result).not.toBeNull();
    expect(result.barrierHeightM).toBe(6);

    // Hand-calc: d1 ≈ 50m, d2 ≈ 50m, barrier 6m
    // δ = sqrt(50² + 5²) + sqrt(50² + 4.5²) - 100
    //   = sqrt(2525) + sqrt(2520.25) - 100
    //   = 50.2494 + 50.2020 - 100 = 0.4514
    expect(result.pathLengthDiff).toBeCloseTo(0.45, 1);
  });

  it('uses default 3m height when building has no height', () => {
    var midLng = 50 / 111320;
    var recLng = 100 / 111320;
    var building = {
      id: 100,
      polygon: [
        [-0.0001, midLng],
        [ 0.0001, midLng],
        [ 0.0001, midLng + 0.00001],
        [-0.0001, midLng + 0.00001]
      ],
      heightM: null,
      name: null
    };
    var result = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      1, 1.5, [building]
    );
    expect(result).not.toBeNull();
    expect(result.barrierHeightM).toBe(3);
  });
});
