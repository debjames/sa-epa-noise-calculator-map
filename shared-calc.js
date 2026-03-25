/**
 * shared-calc.js — Single canonical source for all acoustic and geometry functions.
 * Loaded by:
 *   - noise-worker.js via importScripts('shared-calc.js')
 *   - index.html via <script src="shared-calc.js">
 *   - calc.js and geometry.js re-export from SharedCalc for ES module consumers (tests)
 *
 * Uses an IIFE namespace pattern — no ES module syntax — so it works everywhere.
 */

/* exported SharedCalc */
var SharedCalc = (function() {

  // ═══════════════════════════════════════════════════════════════
  //  ACOUSTIC — Simple propagation
  // ═══════════════════════════════════════════════════════════════

  /**
   * Attenuation from a point source at distance r.
   * Lp = Lw - (20·log10(r) + 8)  [hemispherical propagation]
   */
  function attenuatePoint(Lw, r) {
    if (r <= 0) r = 0.1;
    return Lw - (20 * Math.log10(r) + 8);
  }

  /** Energy-sum an array of sound pressure levels. */
  function energySum(levels) {
    if (!levels || levels.length === 0) return -Infinity;
    return 10 * Math.log10(
      levels.reduce(function(sum, L) { return sum + Math.pow(10, L / 10); }, 0)
    );
  }

  /** Combined Lw for one source's equipment list. */
  function sourceCombinedLw(equipment) {
    if (!equipment || equipment.length === 0) return -Infinity;
    var activeLevels = equipment
      .filter(function(item) { return item.quantity > 0; })
      .map(function(item) { return item.Lw + 10 * Math.log10(item.quantity); });
    if (activeLevels.length === 0) return -Infinity;
    return energySum(activeLevels);
  }

  /** Lp at a receiver from a single source. */
  function sourceContribution(source, distance) {
    var Lw = sourceCombinedLw(source.equipment);
    if (!isFinite(Lw)) return -Infinity;
    return attenuatePoint(Lw, distance);
  }

  /** Total Lp at a receiver from all sources. */
  function totalAtReceiver(sources, distances) {
    var contributions = sources.map(function(src, i) {
      return sourceContribution(src, distances[i]);
    });
    var finite = contributions.filter(isFinite);
    if (finite.length === 0) return -Infinity;
    return energySum(finite);
  }

  // ═══════════════════════════════════════════════════════════════
  //  ISO 9613-2 — Ground attenuation, atmospheric absorption, barrier
  // ═══════════════════════════════════════════════════════════════

  var OCT_FREQ = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  var ALPHA_DEFAULT = [0.1, 0.4, 1.0, 1.9, 3.7, 9.7, 32.8, 117.0];

  /**
   * ISO 9613-2 Table 3 ground attenuation (detailed method, §7.3.1).
   * Agr = As + Ar + Am (source, receiver, and middle regions)
   */
  function calcAgrPerBand(hS, hR, dp, G) {
    function aPrime(h) {
      return 1.5 + 3.0 * Math.exp(-0.12 * (h - 5) * (h - 5)) * (1 - Math.exp(-dp / 50))
           + 5.7 * Math.exp(-0.09 * h * h) * (1 - Math.exp(-2.8e-6 * dp * dp));
    }
    function bPrime(h) {
      return 1.5 + 8.6 * Math.exp(-0.09 * h * h) * (1 - Math.exp(-dp / 50));
    }
    function cPrime(h) {
      return 1.5 + 14.0 * Math.exp(-0.46 * h * h) * (1 - Math.exp(-dp / 50));
    }
    function dPrime(h) {
      return 1.5 + 5.0 * Math.exp(-0.9 * h * h) * (1 - Math.exp(-dp / 50));
    }

    var As = [
      -1.5,
      -1.5 + G * Math.max(aPrime(hS), 0),
      -1.5 + G * Math.max(bPrime(hS), 0),
      -1.5 + G * Math.max(cPrime(hS), 0),
      -1.5 + G * Math.max(dPrime(hS), 0),
      -1.5 * (1 - G),
      -1.5 * (1 - G),
      -1.5 * (1 - G)
    ];

    var Ar = [
      -1.5,
      -1.5 + G * Math.max(aPrime(hR), 0),
      -1.5 + G * Math.max(bPrime(hR), 0),
      -1.5 + G * Math.max(cPrime(hR), 0),
      -1.5 + G * Math.max(dPrime(hR), 0),
      -1.5 * (1 - G),
      -1.5 * (1 - G),
      -1.5 * (1 - G)
    ];

    var q = (dp <= 30 * (hS + hR)) ? 0 : (1 - 30 * (hS + hR) / dp);

    var Am = [
      -3 * q,
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G)
    ];

    var Agr = [];
    for (var i = 0; i < 8; i++) {
      Agr.push(As[i] + Ar[i] + Am[i]);
    }
    return Agr;
  }

  /** ISO 9613-1 atmospheric absorption coefficients (dB/km) per octave band. */
  function calcAlphaAtm(tempC, humPct) {
    if (tempC === 10 && humPct === 70) return ALPHA_DEFAULT.slice();
    var T = tempC + 273.15;
    var T0 = 293.15;
    var T01 = 273.16;
    var psat = Math.pow(10, -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151);
    var h = humPct * psat;
    var alpha = [];
    for (var i = 0; i < OCT_FREQ.length; i++) {
      var f = OCT_FREQ[i];
      var frO = (24 + 4.04e4 * h * (0.02 + h) / (0.391 + h));
      var frN = Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T0, -1 / 3) - 1)));
      var f2 = f * f;
      var a = 8.686 * f2 * (
        1.84e-11 * Math.pow(T / T0, 0.5) +
        Math.pow(T / T0, -2.5) * (
          0.01275 * Math.exp(-2239.1 / T) / (frO + f2 / frO) +
          0.1068 * Math.exp(-3352.0 / T) / (frN + f2 / frN)
        )
      );
      alpha.push(Math.round(a * 100) / 100);
    }
    return alpha;
  }

  /** ISO 9613-2 Section 8 barrier attenuation per octave band. */
  function calcBarrierAttenuation(delta, frequencies) {
    if (delta <= 0) return frequencies.map(function() { return 0; });
    return frequencies.map(function(f) {
      var lambda = 340 / f;
      var raw = 10 * Math.log10(3 + (20 * delta) / lambda);
      return Math.max(0, Math.min(raw, 20));
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  GEOMETRY — Ray-polygon intersection for barrier screening
  // ═══════════════════════════════════════════════════════════════

  /** Does line segment (p1→p2) intersect segment (p3→p4)? */
  function segmentsIntersect(p1, p2, p3, p4) {
    var x1 = Array.isArray(p1) ? p1[1] : p1.lng;
    var y1 = Array.isArray(p1) ? p1[0] : p1.lat;
    var x2 = Array.isArray(p2) ? p2[1] : p2.lng;
    var y2 = Array.isArray(p2) ? p2[0] : p2.lat;
    var x3 = Array.isArray(p3) ? p3[1] : p3.lng;
    var y3 = Array.isArray(p3) ? p3[0] : p3.lat;
    var x4 = Array.isArray(p4) ? p4[1] : p4.lng;
    var y4 = Array.isArray(p4) ? p4[0] : p4.lat;

    var denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-12) return null;

    var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    var u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { lat: y1 + t * (y2 - y1), lng: x1 + t * (x2 - x1) };
    }
    return null;
  }

  /** Returns all edges of a building polygon or barrier polyline as segment pairs.
   *  @param {Array} vertices - array of [lat, lng] coordinate pairs
   *  @param {boolean} [isPolyline=false] - true for barrier polylines (no closing edge) */
  function getBuildingEdges(vertices, isPolyline) {
    var edges = [];
    var n = vertices.length;
    if (isPolyline) {
      // Open polyline: emit only consecutive segments, no closing edge vN→v0
      for (var i = 0; i < n - 1; i++) {
        edges.push([vertices[i], vertices[i + 1]]);
      }
    } else {
      // Closed polygon: include closing edge from last vertex back to first
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        edges.push([vertices[i], vertices[j]]);
      }
    }
    return edges;
  }

  /** Flat-earth distance in metres between two {lat,lng} points. */
  function flatDistM(a, b) {
    var dLat = (b.lat - a.lat) * 111320;
    var dLng = (b.lng - a.lng) * 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  /** Point-in-polygon test (ray casting).
   *  WARNING: coordinate order is {lat, lng} (Leaflet) — do NOT use with GeoJSON [lng, lat] arrays.
   *  Use pointInPolygonGeoJSON() in index.html for GeoJSON inputs. */
  function pointInPolygonLatLng(point, polygon) {
    var x = point.lng, y = point.lat;
    var inside = false;
    for (var i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var xi = polygon[i][1], yi = polygon[i][0];
      var xj = polygon[j][1], yj = polygon[j][0];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  /** Returns all building edges that intersect the ray from srcLL to recLL. */
  function getIntersectingEdges(srcLL, recLL, buildings) {
    var results = [];
    for (var bi = 0; bi < buildings.length; bi++) {
      var b = buildings[bi];
      var edges = getBuildingEdges(b.polygon, !!b.isBarrier);
      for (var ei = 0; ei < edges.length; ei++) {
        var edge = edges[ei];
        var p3 = { lat: edge[0][0], lng: edge[0][1] };
        var p4 = { lat: edge[1][0], lng: edge[1][1] };
        var hit = segmentsIntersect(srcLL, recLL, p3, p4);
        if (hit) {
          results.push({
            building: b,
            edgeStart: p3,
            edgeEnd: p4,
            intersection: hit,
            distFromSrc: flatDistM(srcLL, hit)
          });
        }
      }
    }
    return results;
  }

  /**
   * From all intersecting edges, find the dominant barrier.
   * Includes line-of-sight check: if barrier height is below
   * the direct line from source to receiver at the barrier position,
   * δ is forced to 0 (no screening).
   *
   * NOTE: selects edge closest to path midpoint, not max δ —
   * may under/overestimate in multi-barrier scenarios.
   * This is a deliberate performance trade-off.
   */
  function getDominantBarrier(srcLL, recLL, srcHeightM, recHeightM, buildings) {
    var edges = getIntersectingEdges(srcLL, recLL, buildings);
    if (edges.length === 0) return null;

    var dDirect = flatDistM(srcLL, recLL);
    var midDist = dDirect / 2;

    var best = null;
    var bestMidDiff = Infinity;
    for (var i = 0; i < edges.length; i++) {
      var diff = Math.abs(edges[i].distFromSrc - midDist);
      if (diff < bestMidDiff) {
        bestMidDiff = diff;
        best = edges[i];
      }
    }

    var barrierH = (best.building.heightM != null) ? best.building.heightM : 3.0;
    var d1 = best.distFromSrc;
    var d2 = flatDistM(best.intersection, recLL);

    // Line-of-sight check: height of direct ray at barrier position
    var t = (dDirect > 0) ? d1 / dDirect : 0;
    var losHeight = srcHeightM + t * (recHeightM - srcHeightM);

    // If barrier top is below the line of sight, no screening
    if (barrierH <= losHeight) {
      return {
        building: best.building,
        edgeStart: best.edgeStart,
        edgeEnd: best.edgeEnd,
        intersection: best.intersection,
        barrierHeightM: barrierH,
        pathLengthDiff: 0
      };
    }

    // Path length difference δ (Maekawa)
    var delta =
      Math.sqrt(d1 * d1 + (barrierH - srcHeightM) * (barrierH - srcHeightM)) +
      Math.sqrt(d2 * d2 + (barrierH - recHeightM) * (barrierH - recHeightM)) -
      dDirect;

    return {
      building: best.building,
      edgeStart: best.edgeStart,
      edgeEnd: best.edgeEnd,
      intersection: best.intersection,
      barrierHeightM: barrierH,
      pathLengthDiff: delta
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  ISO 9613-2 — Single point prediction (shared between main + worker)
  // ═══════════════════════════════════════════════════════════════

  /**
   * ISO 9613-2 prediction for a single source at a receiver point.
   * All parameters are explicit — no global state dependencies.
   * @param {number[]} spectrum - A-weighted Lw per octave band [63..8k]
   * @param {number} srcHeight - source height above ground (m)
   * @param {number} distM - distance source to receiver (m)
   * @param {number} adjDB - adjustment (quantity + opTime) in dB
   * @param {number} barrierDelta - path length difference for barrier (m), 0 if none
   * @param {number} recvHeight - receiver height above ground (m)
   * @param {object} isoParams - { temperature, humidity, groundFactor }
   * @returns {number} predicted LAeq at receiver, or NaN
   */
  function calcISOatPoint(spectrum, srcHeight, distM, adjDB, barrierDelta, recvHeight, isoParams) {
    if (!spectrum || distM <= 0) return NaN;
    var d = Math.max(distM, 1);
    var hS = Math.max(srcHeight, 0.01);
    var hR = recvHeight || 1.5;
    var params = isoParams || {};
    var alpha = calcAlphaAtm(params.temperature || 10, params.humidity || 70);
    var Adiv = 20 * Math.log10(d) + 11;
    var Agr = calcAgrPerBand(hS, hR, d, params.groundFactor != null ? params.groundFactor : 0.5);
    var Abar = calcBarrierAttenuation(barrierDelta || 0, OCT_FREQ);

    var sumLin = 0;
    var anyBand = false;
    for (var i = 0; i < 8; i++) {
      var Lw_f = spectrum[i];
      if (Lw_f === null || Lw_f === undefined || !isFinite(Lw_f)) continue;
      var A_f = Adiv + alpha[i] * d / 1000 + Agr[i] + Abar[i];
      sumLin += Math.pow(10, (Lw_f + (adjDB || 0) - A_f) / 10);
      anyBand = true;
    }
    if (!anyBand) return NaN;
    return 10 * Math.log10(sumLin);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Public API
  // ═══════════════════════════════════════════════════════════════

  return {
    // Acoustic — simple
    attenuatePoint: attenuatePoint,
    energySum: energySum,
    sourceCombinedLw: sourceCombinedLw,
    sourceContribution: sourceContribution,
    totalAtReceiver: totalAtReceiver,
    // ISO 9613-2
    OCT_FREQ: OCT_FREQ,
    ALPHA_DEFAULT: ALPHA_DEFAULT,
    calcAgrPerBand: calcAgrPerBand,
    calcAlphaAtm: calcAlphaAtm,
    calcBarrierAttenuation: calcBarrierAttenuation,
    calcISOatPoint: calcISOatPoint,
    // Geometry
    segmentsIntersect: segmentsIntersect,
    getBuildingEdges: getBuildingEdges,
    flatDistM: flatDistM,
    pointInPolygonLatLng: pointInPolygonLatLng,
    getIntersectingEdges: getIntersectingEdges,
    getDominantBarrier: getDominantBarrier
  };
})();

// Support Node.js require() for testing
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = SharedCalc;
}
