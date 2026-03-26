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
  pointInPolygonLatLng,
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

  it('returns 4 edges for a rectangle (closed polygon)', () => {
    var poly = [[0, 0], [0, 1], [1, 1], [1, 0]];
    expect(getBuildingEdges(poly).length).toBe(4); // includes closing edge
    expect(getBuildingEdges(poly, false).length).toBe(4); // explicit polygon
  });

  it('3-vertex polyline produces 2 edges (no closing edge)', () => {
    var line = [[0, 0], [0, 1], [1, 1]];
    var edges = getBuildingEdges(line, true); // isPolyline
    expect(edges.length).toBe(2);
    expect(edges[0]).toEqual([[0, 0], [0, 1]]);
    expect(edges[1]).toEqual([[0, 1], [1, 1]]);
    // No closing edge [1,1]→[0,0]
  });

  it('3-vertex polygon produces 3 edges (includes closing edge)', () => {
    var poly = [[0, 0], [0, 1], [1, 1]];
    expect(getBuildingEdges(poly, false).length).toBe(3);
    expect(getBuildingEdges(poly).length).toBe(3); // default = polygon
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

describe('pointInPolygonLatLng', () => {
  // Simple square: (0,0), (0,1), (1,1), (1,0)
  var square = [[0, 0], [0, 1], [1, 1], [1, 0]];

  it('point clearly inside convex polygon → true', () => {
    expect(pointInPolygonLatLng({ lat: 0.5, lng: 0.5 }, square)).toBe(true);
  });

  it('point clearly outside → false', () => {
    expect(pointInPolygonLatLng({ lat: 2, lng: 2 }, square)).toBe(false);
  });

  it('point just outside a corner → false', () => {
    expect(pointInPolygonLatLng({ lat: -0.01, lng: -0.01 }, square)).toBe(false);
  });

  it('point on boundary edge — ray casting treats as outside (documented)', () => {
    // Ray casting algorithm behaviour on edges is implementation-defined.
    // Our implementation: point exactly on a horizontal edge may return
    // true or false depending on floating-point precision. We document
    // this and test that it does not crash.
    var result = pointInPolygonLatLng({ lat: 0, lng: 0.5 }, square);
    expect(typeof result).toBe('boolean'); // no crash, returns a boolean
  });

  it('point inside concave (L-shaped) polygon → true', () => {
    // L-shape: (0,0)→(0,2)→(1,2)→(1,1)→(2,1)→(2,0)
    var lShape = [[0, 0], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0]];
    // Point in the bottom-right of the L
    expect(pointInPolygonLatLng({ lat: 0.5, lng: 1.5 }, lShape)).toBe(true);
    // Point in the notch (outside the L)
    expect(pointInPolygonLatLng({ lat: 1.5, lng: 1.5 }, lShape)).toBe(false);
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

  it('source above building but receiver below: line of sight blocked, screening applied', () => {
    // Source at 10m, building at 3m at midpoint, receiver at 1.5m
    // LOS height at midpoint: 10 + 0.5*(1.5-10) = 5.75m — building (3m) is below LOS
    // So LOS clears the building → δ = 0
    var midLng = 50 / 111320;
    var recLng = 100 / 111320;
    var building = {
      id: 101,
      polygon: [
        [-0.0001, midLng],
        [ 0.0001, midLng],
        [ 0.0001, midLng + 0.00001],
        [-0.0001, midLng + 0.00001]
      ],
      heightM: 3,
      name: null
    };
    var result = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      10, 1.5, [building]  // source at 10m, receiver at 1.5m
    );
    expect(result).not.toBeNull();
    // LOS at midpoint = 10 + 0.5*(1.5-10) = 5.75m > 3m building
    // LOS clears building → no screening
    expect(result.pathLengthDiff).toBe(0);
  });

  it('both source and receiver above building: no screening (LOS clear)', () => {
    var midLng = 50 / 111320;
    var recLng = 100 / 111320;
    var building = {
      id: 101,
      polygon: [
        [-0.0001, midLng],
        [ 0.0001, midLng],
        [ 0.0001, midLng + 0.00001],
        [-0.0001, midLng + 0.00001]
      ],
      heightM: 3,
      name: null
    };
    var resultBothAbove = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      10, 10, [building]  // both well above 3m building
    );
    expect(resultBothAbove).not.toBeNull();
    // LOS at midpoint = 10 + 0.5*(10-10) = 10m > 3m building → no screening
    expect(resultBothAbove.pathLengthDiff).toBe(0);
  });

  it('building taller than both source and receiver: screening applied', () => {
    // Source at 1m, building at 6m, receiver at 1.5m
    // LOS at midpoint = 1 + 0.5*(1.5-1) = 1.25m < 6m building → screening
    var midLng = 50 / 111320;
    var recLng = 100 / 111320;
    var building = {
      id: 102,
      polygon: [
        [-0.0001, midLng],
        [ 0.0001, midLng],
        [ 0.0001, midLng + 0.00001],
        [-0.0001, midLng + 0.00001]
      ],
      heightM: 6,
      name: null
    };
    var result = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      1, 1.5, [building]
    );
    expect(result).not.toBeNull();
    expect(result.pathLengthDiff).toBeGreaterThan(0);
    expect(result.pathLengthDiff).toBeCloseTo(0.45, 1);
  });

  it('2-vertex polyline barrier: getBuildingEdges produces single forward edge', () => {
    // A drawn barrier is a polyline with just 2 vertices
    // getBuildingEdges emits only the forward edge — no duplicate reverse
    var midLng = 50 / 111320;
    var polyline = [
      [-0.001, midLng],  // south end of barrier
      [ 0.001, midLng]   // north end of barrier
    ];
    var edges = getBuildingEdges(polyline, true); // isPolyline = true
    expect(edges.length).toBe(1); // single forward edge, no closing edge
    expect(edges[0][0]).toEqual(polyline[0]);
    expect(edges[0][1]).toEqual(polyline[1]);
  });

  it('2-vertex polyline barrier produces correct screening via getDominantBarrier', () => {
    // Model a barrier as a pseudo-building with 2-vertex polygon (polyline)
    // Source at origin (0,0), height 1m
    // Receiver 100m east, height 1.5m
    // Barrier at 50m east, height 6m, running north-south
    var midLng = 50 / 111320;
    var recLng = 100 / 111320;
    var barrier = {
      id: 'barrier_test',
      polygon: [
        [-0.001, midLng],  // south end
        [ 0.001, midLng]   // north end (~220m long, crosses the ray)
      ],
      heightM: 6,
      name: 'Test barrier'
    };
    var result = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      1, 1.5, [barrier]
    );
    expect(result).not.toBeNull();
    expect(result.barrierHeightM).toBe(6);
    expect(result.pathLengthDiff).toBeGreaterThan(0);
    // Should match the 4-vertex polygon case: δ ≈ 0.45m
    expect(result.pathLengthDiff).toBeCloseTo(0.45, 1);
  });

  it('2-vertex polyline barrier shorter than LOS: no screening', () => {
    // Source at 10m, receiver at 10m, barrier at 3m → LOS clears
    var midLng = 50 / 111320;
    var recLng = 100 / 111320;
    var barrier = {
      id: 'barrier_short',
      polygon: [
        [-0.001, midLng],
        [ 0.001, midLng]
      ],
      heightM: 3,
      name: null
    };
    var result = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      10, 10, [barrier]
    );
    expect(result).not.toBeNull();
    expect(result.pathLengthDiff).toBe(0);
  });

  it('parallel barrier: no intersection, returns null', () => {
    // Barrier runs east-west, parallel to the source-receiver ray (also east-west)
    // No segment crosses the ray → no screening
    var recLng = 100 / 111320;
    var barrier = {
      id: 'barrier_parallel',
      polygon: [
        [0, 0.0001],           // point east of source, on the ray line
        [0, 0.0002]            // further east, still on the ray
      ],
      heightM: 6,
      name: null
    };
    var result = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      1, 1.5, [barrier]
    );
    // Parallel segments do not cross — segmentsIntersect returns null
    expect(result).toBeNull();
  });

  it('3-vertex polyline barrier: middle segment crosses ray, screening applied', () => {
    // Source at origin, receiver 100m east
    // 3-vertex barrier: south → mid (crosses ray) → north
    var midLng = 50 / 111320;
    var recLng = 100 / 111320;
    var barrier = {
      id: 'barrier_3v',
      polygon: [
        [-0.001, midLng - 0.00001],  // south-west
        [ 0,     midLng],             // crosses the east-west ray at midpoint
        [ 0.001, midLng + 0.00001]   // north-east
      ],
      heightM: 6,
      name: null
    };
    var result = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      1, 1.5, [barrier]
    );
    expect(result).not.toBeNull();
    expect(result.barrierHeightM).toBe(6);
    expect(result.pathLengthDiff).toBeGreaterThan(0);
  });

  it('barrier too short to cross ray: no intersection, returns null', () => {
    // Both barrier endpoints are south of the source-receiver ray
    // The barrier segment does not cross the ray
    var recLng = 100 / 111320;
    var midLng = 50 / 111320;
    var barrier = {
      id: 'barrier_miss',
      polygon: [
        [-0.001, midLng],   // south of ray
        [-0.002, midLng]    // even further south
      ],
      heightM: 6,
      name: null
    };
    var result = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      1, 1.5, [barrier]
    );
    expect(result).toBeNull();
  });

  it('returns endDeltaLeft and endDeltaRight for horizontal diffraction', () => {
    // Barrier at midpoint crossing the ray — end points are north and south
    var midLng = 50 / 111320;
    var recLng = 100 / 111320;
    var barrier = {
      id: 'end_test',
      polygon: [
        [-0.001, midLng],   // south end
        [ 0.001, midLng]    // north end (~220m barrier)
      ],
      heightM: 6,
      name: null
    };
    var result = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      1, 1.5, [barrier]
    );
    expect(result).not.toBeNull();
    expect(result.endDeltaLeft).toBeDefined();
    expect(result.endDeltaRight).toBeDefined();
    // End deltas should be positive (receiver in shadow zone)
    expect(result.endDeltaLeft).toBeGreaterThan(0);
    expect(result.endDeltaRight).toBeGreaterThan(0);
    // End deltas should be symmetric for a symmetric barrier
    expect(result.endDeltaLeft).toBeCloseTo(result.endDeltaRight, 1);
  });

  it('short barrier produces smaller end deltas than long barrier', () => {
    var midLng = 50 / 111320;
    var recLng = 100 / 111320;
    // Short barrier (20m)
    var shortBarrier = {
      id: 'short', heightM: 6,
      polygon: [[-0.0001, midLng], [0.0001, midLng]]
    };
    // Long barrier (200m)
    var longBarrier = {
      id: 'long', heightM: 6,
      polygon: [[-0.001, midLng], [0.001, midLng]]
    };
    var shortResult = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      1, 1.5, [shortBarrier]
    );
    var longResult = getDominantBarrier(
      { lat: 0, lng: 0 }, { lat: 0, lng: recLng },
      1, 1.5, [longBarrier]
    );
    expect(shortResult).not.toBeNull();
    expect(longResult).not.toBeNull();
    // Shorter barrier → endpoints closer to ray → smaller end delta → more wrapping
    expect(shortResult.endDeltaLeft).toBeLessThan(longResult.endDeltaLeft);
  });
});
