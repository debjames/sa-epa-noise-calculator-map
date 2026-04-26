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

  /** A-weighting per IEC 61672-1, octave bands 63 Hz through 8 kHz.
   *  Applied inside calcISOatPoint and calcISOatPointDetailed to convert
   *  dB(Z) per-band input to dB(A) at output (Option B convention, April 2026).
   *  See references/engine-convention-audit-2026-04.md. */
  var A_WEIGHTS_BANDS = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1];

  /**
   * ISO 9613-2 Table 3 ground attenuation (detailed method, §7.3.1).
   * Agr = As + Ar + Am (source, receiver, and middle regions).
   * @param {number} hS - source height (m)
   * @param {number} hR - receiver height (m)
   * @param {number} dp - propagation distance (m)
   * @param {number|object} G - ground factor: single value for all regions,
   *   or {Gs, Gr, Gm} for per-region ISO 9613-2 compliance.
   *   When a single number is passed, Gs = Gr = Gm = G.
   */
  function calcAgrPerBand(hS, hR, dp, G) {
    // Support spatially varying ground factors per ISO 9613-2
    var Gs, Gr, Gm;
    if (typeof G === 'object' && G !== null) {
      Gs = (G.Gs != null) ? G.Gs : 0.5;
      Gr = (G.Gr != null) ? G.Gr : 0.5;
      Gm = (G.Gm != null) ? G.Gm : 0.5;
    } else {
      Gs = Gr = Gm = (G != null) ? G : 0.5;
    }

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

    // Source region As — uses Gs
    var As = [
      -1.5,
      -1.5 + Gs * Math.max(aPrime(hS), 0),
      -1.5 + Gs * Math.max(bPrime(hS), 0),
      -1.5 + Gs * Math.max(cPrime(hS), 0),
      -1.5 + Gs * Math.max(dPrime(hS), 0),
      -1.5 * (1 - Gs),
      -1.5 * (1 - Gs),
      -1.5 * (1 - Gs)
    ];

    // Receiver region Ar — uses Gr
    var Ar = [
      -1.5,
      -1.5 + Gr * Math.max(aPrime(hR), 0),
      -1.5 + Gr * Math.max(bPrime(hR), 0),
      -1.5 + Gr * Math.max(cPrime(hR), 0),
      -1.5 + Gr * Math.max(dPrime(hR), 0),
      -1.5 * (1 - Gr),
      -1.5 * (1 - Gr),
      -1.5 * (1 - Gr)
    ];

    // Middle region Am — uses Gm
    var q = (dp <= 30 * (hS + hR)) ? 0 : (1 - 30 * (hS + hR) / dp);

    var Am = [
      -3 * q,
      -3 * q * (1 - Gm),
      -3 * q * (1 - Gm),
      -3 * q * (1 - Gm),
      -3 * q * (1 - Gm),
      -3 * q * (1 - Gm),
      -3 * q * (1 - Gm),
      -3 * q * (1 - Gm)
    ];

    var Agr = [];
    for (var i = 0; i < 8; i++) {
      Agr.push(As[i] + Ar[i] + Am[i]);
    }
    return Agr;
  }

  /**
   * ISO 9613-2 §7.4 ground attenuation for the barrier case.
   * When a barrier is present, Agr is recomputed along two sub-paths:
   *   source → barrier top, and barrier top → receiver.
   * The barrier top acts as a pseudo-receiver / pseudo-source at height hBar.
   * Agr_bar = As_subpath1 + Ar_subpath2 (summed per band).
   *
   * @param {number} hS - source height (m)
   * @param {number} hR - receiver height (m)
   * @param {number} dp - total (unobstructed) propagation distance (m); unused when sub-paths are provided but retained for fallback
   * @param {number|object} G - ground factor (scalar or {Gs, Gr, Gm})
   * @param {object} barrierInfo - { d1, d2, hBar } horizontal sub-path distances and barrier top height above ground
   * @returns {number[]} 8-band Agr_bar for the barrier-modified path
   */
  function calcAgrBarrier(hS, hR, dp, G, barrierInfo) {
    if (!barrierInfo || !(barrierInfo.d1 > 0) || !(barrierInfo.d2 > 0)) {
      // No usable sub-path geometry — fall back to unobstructed Agr
      return calcAgrPerBand(hS, hR, dp, G);
    }

    var Gs, Gr, Gm;
    if (typeof G === 'object' && G !== null) {
      Gs = (G.Gs != null) ? G.Gs : 0.5;
      Gr = (G.Gr != null) ? G.Gr : 0.5;
      Gm = (G.Gm != null) ? G.Gm : 0.5;
    } else {
      Gs = Gr = Gm = (G != null) ? G : 0.5;
    }

    var d1 = barrierInfo.d1;
    var d2 = barrierInfo.d2;
    var hBar = Math.max(barrierInfo.hBar || 0, 0.01);

    // Source-side sub-path: source at hS, "receiver" at barrier top (hBar),
    // distance d1. Source region uses Gs; the remote end of this sub-path
    // is the barrier itself — use Gm for the pseudo-receiver region since
    // the ground near the barrier is part of the middle region.
    var Agr_src = calcAgrPerBand(hS, hBar, d1, { Gs: Gs, Gr: Gm, Gm: Gm });

    // Receiver-side sub-path: "source" at barrier top (hBar), receiver at hR,
    // distance d2. Pseudo-source region uses Gm; real receiver region uses Gr.
    var Agr_rec = calcAgrPerBand(hBar, hR, d2, { Gs: Gm, Gr: Gr, Gm: Gm });

    var Agr_bar = [];
    for (var i = 0; i < 8; i++) {
      Agr_bar.push(Agr_src[i] + Agr_rec[i]);
    }
    return Agr_bar;
  }

  /** ISO 9613-1 atmospheric absorption coefficients (dB/km) per octave band. */
  function calcAlphaAtm(tempC, humPct) {
    // No shortcut — always compute from formula for accuracy
    // ALPHA_DEFAULT is kept for reference only
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
      alpha.push(a); // no rounding — full precision for ISO compliance
    }
    return alpha;
  }

  /** ISO 9613-2 Section 8 barrier attenuation per octave band.
   *  @param {number} delta - path length difference (m)
   *  @param {number[]} frequencies - octave band centre frequencies
   *  @param {boolean} [capped=true] - apply 20 dB single-diffraction cap.
   *    Per ISO/TR 17534-3 §5.3, the cap applies only to over-top diffraction.
   *    Lateral (side) paths must NOT be capped — pass capped=false for those. */
  /**
   * ISO 9613-2 Section 8 barrier attenuation per octave band.
   * @param {number} delta - path length difference (m)
   * @param {number[]} frequencies - octave band centre frequencies
   * @param {boolean} [capped=true] - apply Dz cap (20 dB single, 25 dB double).
   *    Per ISO/TR 17534-3 §5.3, cap applies only to over-top diffraction.
   * @param {number} [barrierThickness=0] - barrier/building thickness e (m).
   *    When e > 0, uses double diffraction with frequency-dependent C₃ and 25 dB cap.
   */
  function calcBarrierAttenuation(delta, frequencies, capped, barrierThickness) {
    if (capped === undefined) capped = true;
    if (delta <= 0) return frequencies.map(function() { return 0; });
    var C2 = 20;  // single diffraction constant
    var Kmet = 1;  // meteorological correction (no wind)
    var e = barrierThickness || 0;
    var maxDz = (e > 0) ? 25 : 20; // double diffraction cap = 25 dB per ISO 9613-2

    return frequencies.map(function(f) {
      var lambda = 340 / f;
      // C3: frequency-dependent for double diffraction (e > 0)
      // ISO 9613-2: C3 = (1 + (5λ/e)²) / (1/3 + (5λ/e)²) for double diffraction
      // C3 = 1 for single diffraction (e = 0)
      var C3 = 1;
      if (e > 0) {
        var r = 5 * lambda / e;
        C3 = (1 + r * r) / (1/3 + r * r);
      }
      // ISO/TR 17534-3 §5.4: two-step Dz with floor at zero
      var z_min = -Math.pow(C2 / C3, 2) * lambda / Kmet;
      if (delta <= z_min) return 0;
      var Dz = 10 * Math.log10(3 + C2 * C3 * delta / lambda * Kmet);
      Dz = Math.max(0, Dz);
      return capped ? Math.min(Dz, maxDz) : Dz;
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
            edgeVertexIdx: ei,   // index of edgeStart vertex in building.polygon
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
    var baseH    = (best.building.baseHeightM != null) ? best.building.baseHeightM : 0.0;
    var topH     = baseH + barrierH; // height of barrier top above ground
    var d1 = best.distFromSrc;
    var d2 = flatDistM(best.intersection, recLL);

    // Line-of-sight check: height of direct ray at barrier position
    var t = (dDirect > 0) ? d1 / dDirect : 0;
    var losHeight = srcHeightM + t * (recHeightM - srcHeightM);

    // Check if ray passes through the gap beneath a floating barrier
    var rayInGap = (baseH > 0) && (losHeight < baseH);

    // When the direct ray passes freely through the gap, the floating barrier
    // provides no attenuation on the direct path.  Prefer a ground-mounted
    // barrier (e.g. the building the parapet sits on) that actually blocks
    // the ray.  If one is found, also check whether the originally-selected
    // floating barrier sits on top of that building; if so, extend topH to
    // the composite top so the parapet's contribution is included.
    if (rayInGap) {
      var bestGnd = null, bestGndDiff = Infinity;
      for (var gi = 0; gi < edges.length; gi++) {
        var giBase = (edges[gi].building.baseHeightM != null) ? edges[gi].building.baseHeightM : 0;
        if (giBase > 0) continue; // skip other floating barriers
        var giDiff = Math.abs(edges[gi].distFromSrc - midDist);
        if (giDiff < bestGndDiff) { bestGndDiff = giDiff; bestGnd = edges[gi]; }
      }
      if (bestGnd) {
        // Switch to the ground-mounted barrier
        best    = bestGnd;
        barrierH = (best.building.heightM != null) ? best.building.heightM : 3.0;
        baseH    = 0;
        topH     = barrierH;
        d1 = best.distFromSrc;
        d2 = flatDistM(best.intersection, recLL);
        t  = (dDirect > 0) ? d1 / dDirect : 0;
        losHeight = srcHeightM + t * (recHeightM - srcHeightM);
        rayInGap  = false;
        // Composite: if a floating barrier in the path sits on top of this
        // building (its base ≥ building top), extend topH to its top.
        for (var ci = 0; ci < edges.length; ci++) {
          var cbk = edges[ci].building;
          var cbkBase = (cbk.baseHeightM != null) ? cbk.baseHeightM : 0;
          if (cbkBase > 0 && cbkBase >= barrierH) {
            var cbkTop = cbkBase + ((cbk.heightM != null) ? cbk.heightM : 3.0);
            if (cbkTop > topH) topH = cbkTop;
          }
        }
        barrierH = topH; // barrierH now equals composite top height (baseH=0)
      } else {
        // No ground-mounted barrier: direct ray passes freely under all
        // floating barriers in the path — no insertion loss.
        return {
          building: best.building,
          edgeStart: best.edgeStart,
          edgeEnd: best.edgeEnd,
          edgeVertexIdx: best.edgeVertexIdx,
          intersection: best.intersection,
          barrierHeightM: barrierH,
          baseHeightM: baseH,
          pathLengthDiff: 0,
          gapPathLengthDiff: 0,
          rayInGap: true,
          endDeltaLeft: 0,
          endDeltaRight: 0
        };
      }
    }

    // Composite extension for ground-mounted barriers: if any floating barrier
    // in the path sits on top of the selected barrier (its base ≥ barrier top),
    // raise topH to include the parapet so its contribution is not lost.
    if (!rayInGap && baseH === 0) {
      for (var xi = 0; xi < edges.length; xi++) {
        var xbk = edges[xi].building;
        var xbkBase = (xbk.baseHeightM != null) ? xbk.baseHeightM : 0;
        if (xbkBase > 0 && xbkBase >= barrierH) {
          var xbkTop = xbkBase + ((xbk.heightM != null) ? xbk.heightM : 3.0);
          if (xbkTop > topH) topH = xbkTop;
        }
      }
      barrierH = topH; // update to composite top height
    }

    // If barrier top is below the line of sight, no screening
    if (topH <= losHeight) {
      return {
        building: best.building,
        edgeStart: best.edgeStart,
        edgeEnd: best.edgeEnd,
        edgeVertexIdx: best.edgeVertexIdx,
        intersection: best.intersection,
        barrierHeightM: barrierH,
        baseHeightM: baseH,
        pathLengthDiff: 0,
        gapPathLengthDiff: 0,
        rayInGap: false
      };
    }

    // --- Over-top path (δ_top) — skipped when ray passes through gap ---
    // Path length difference δ — ISO 9613-2 §7.4 Fresnel approach
    var delta = 0;
    if (!rayInGap) {
      var h_eff = topH - losHeight; // effective height above line of sight
      var dss_3d = Math.sqrt(d1 * d1 + (topH - srcHeightM) * (topH - srcHeightM));
      var dsr_3d = Math.sqrt(d2 * d2 + (topH - recHeightM) * (topH - recHeightM));
      delta = (dss_3d + dsr_3d > 0) ? 2 * h_eff * h_eff / (dss_3d + dsr_3d) : 0;
    }

    // --- Gap path (δ_bot) — floating barriers only ---
    // h_eff_gap is +ve when ray is in the gap, -ve when ray hits the panel.
    // Squaring means gapDelta is always ≥ 0; Maekawa applied as a reduction.
    var gapDelta = 0;
    if (baseH > 0) {
      var h_eff_gap = baseH - losHeight;
      var dss_gap = Math.sqrt(d1 * d1 + (baseH - srcHeightM) * (baseH - srcHeightM));
      var dsr_gap = Math.sqrt(d2 * d2 + (baseH - recHeightM) * (baseH - recHeightM));
      gapDelta = (dss_gap + dsr_gap > 0) ? 2 * h_eff_gap * h_eff_gap / (dss_gap + dsr_gap) : 0;
    }

    // Horizontal end diffraction — around each endpoint of the barrier edge
    // Only applies to the over-top path (not the gap path)
    var ends = [best.edgeStart, best.edgeEnd];
    var endDeltas = [];
    for (var ei = 0; ei < 2; ei++) {
      var endPt = ends[ei];
      var dSrcEnd = flatDistM(srcLL, endPt);
      var dEndRec = flatDistM(endPt, recLL);
      var horizontalDelta = dSrcEnd + dEndRec - dDirect;
      endDeltas.push((!rayInGap && horizontalDelta > 0.01) ? horizontalDelta : 0);
    }

    return {
      building: best.building,
      edgeStart: best.edgeStart,
      edgeEnd: best.edgeEnd,
      edgeVertexIdx: best.edgeVertexIdx,
      intersection: best.intersection,
      barrierHeightM: barrierH,
      baseHeightM: baseH,
      d1: d1,
      d2: d2,
      pathLengthDiff: delta,
      gapPathLengthDiff: gapDelta,
      rayInGap: rayInGap,
      endDeltaLeft: endDeltas[0],
      endDeltaRight: endDeltas[1]
    };
  }

  /**
   * Compute combined barrier attenuation including over-top and end diffraction.
   * Returns per-band attenuation array (for ISO) or single broadband value (for simple).
   * Energy-sums the over-top screened level with end-diffraction contributions.
   * @param {number} topDelta - path length difference over barrier top (m)
   * @param {number} leftDelta - horizontal δ around left end (m), 0 if no shadow
   * @param {number} rightDelta - horizontal δ around right end (m), 0 if no shadow
   * @param {number[]} frequencies - octave band frequencies for per-band calc
   * @returns {number[]} effective insertion loss per band (dB), always >= 0
   */
  function calcBarrierWithEndDiffraction(topDelta, leftDelta, rightDelta, frequencies) {
    if (topDelta <= 0 && leftDelta <= 0 && rightDelta <= 0) {
      return frequencies.map(function() { return 0; });
    }
    // Compute insertion loss for each path
    // Per ISO/TR 17534-3 §5.3: 20 dB cap applies to over-top only, NOT to lateral paths
    var topIL = calcBarrierAttenuation(topDelta, frequencies, true);   // capped
    var leftIL = (leftDelta > 0) ? calcBarrierAttenuation(leftDelta, frequencies, false) : null;  // uncapped
    var rightIL = (rightDelta > 0) ? calcBarrierAttenuation(rightDelta, frequencies, false) : null; // uncapped

    // Energy-sum: the received level behind a barrier is the sum of energy
    // arriving via each diffraction path. Each path reduces the source level
    // by its insertion loss. The effective combined IL is:
    // IL_eff = -10*log10(10^(-IL_top/10) + 10^(-IL_left/10) + 10^(-IL_right/10))
    return frequencies.map(function(f, i) {
      var linSum = 0;
      if (topDelta > 0) linSum += Math.pow(10, -topIL[i] / 10);
      if (leftIL) linSum += Math.pow(10, -leftIL[i] / 10);
      if (rightIL) linSum += Math.pow(10, -rightIL[i] / 10);
      if (linSum <= 0) return 0;
      var effIL = -10 * Math.log10(linSum);
      return Math.max(0, effIL); // effective IL is always >= 0
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  ISO 9613-2 — Single point prediction (shared between main + worker)
  // ═══════════════════════════════════════════════════════════════

  /**
   * ISO 9613-2 prediction for a single source at a receiver point.
   * All parameters are explicit — no global state dependencies.
   * @param {number[]} spectrum - Unweighted Lw per octave band [63..8kHz] in dB(Z). A-weighting is applied internally.
   * @param {number} srcHeight - source height above ground (m)
   * @param {number} distM - distance source to receiver (m)
   * @param {number} adjDB - adjustment (quantity + opTime) in dB
   * @param {number} barrierDelta - path length difference for barrier (m), 0 if none
   * @param {number} recvHeight - receiver height above ground (m)
   * @param {object} isoParams - { temperature, humidity, groundFactor }
   * @returns {number} predicted LAeq at receiver, or NaN
   */
  /**
   * @param {number} barrierDelta - over-top path length difference (m)
   * @param {number} [endDeltaLeft=0] - horizontal δ around left end (m)
   * @param {number} [endDeltaRight=0] - horizontal δ around right end (m)
   * @param {object} [barrierInfo] - { d1, d2, hBar } for ISO 9613-2 §7.4 sub-path ground effect.
   *   When provided, Agr is recomputed for source→barrier and barrier→receiver sub-paths
   *   instead of the full unobstructed path.
   * @param {number[]} [terrainILPerBand] - 8-element array of per-band terrain diffraction
   *   IL (dB) from the Deygout multi-edge method. When provided, terrain IL is combined
   *   with the building/barrier screen per-band via max(Abar, Aterr) and then combined
   *   with Agr the same way Abar is — so terrain screening participates in ISO 9613-2
   *   Formula (12) without double-counting ground effect.
   */
  function calcISOatPoint(spectrum, srcHeight, distM, adjDB, barrierDelta, recvHeight, isoParams, endDeltaLeft, endDeltaRight, barrierInfo, terrainILPerBand) {
    if (!spectrum || distM <= 0) return NaN;
    var d = Math.max(distM, 1);
    var hS = Math.max(srcHeight, 0.01);
    var hR = recvHeight || 1.5;
    var params = isoParams || {};
    var alpha = calcAlphaAtm(params.temperature || 10, params.humidity || 70);
    var Adiv = 20 * Math.log10(d) + 11;
    var gFactor = (params.groundFactor != null) ? params.groundFactor : 0.5;
    var Agr = calcAgrPerBand(hS, hR, d, gFactor);

    // Use combined barrier attenuation (over-top + end diffraction) if end deltas provided
    var Abar;
    if ((endDeltaLeft || 0) > 0 || (endDeltaRight || 0) > 0) {
      Abar = calcBarrierWithEndDiffraction(barrierDelta || 0, endDeltaLeft || 0, endDeltaRight || 0, OCT_FREQ);
    } else {
      Abar = calcBarrierAttenuation(barrierDelta || 0, OCT_FREQ);
    }

    // ISO 9613-2 §7.4: Abar is an insertion loss, Abar = max(Dz - Agr, 0).
    // Combined AgrBar = Agr + Abar = max(Dz, Agr) per-band.
    // When barrierInfo supplies sub-path geometry, Agr is recomputed along
    // source→barrier and barrier→receiver sub-paths (Agr_bar). Otherwise we
    // fall back to the unobstructed-path Agr (conservative approximation).
    var hasBarrier = (barrierDelta || 0) > 0 || (endDeltaLeft || 0) > 0 || (endDeltaRight || 0) > 0;
    var hasTerrain = !!(terrainILPerBand && terrainILPerBand.length === 8);
    var Agr_bar = null;
    if (hasBarrier && barrierInfo && barrierInfo.d1 > 0 && barrierInfo.d2 > 0) {
      Agr_bar = calcAgrBarrier(hS, hR, d, gFactor, barrierInfo);
    }

    var sumLin = 0;
    var anyBand = false;
    for (var i = 0; i < 8; i++) {
      var Lw_f = spectrum[i];
      if (Lw_f === null || Lw_f === undefined || !isFinite(Lw_f)) continue;
      var Aatm_f = alpha[i] * d; // alpha is in dB/m, d is in metres
      // Per-band screen = max(barrier IL, terrain IL). Terrain and buildings
      // are parallel diffraction paths — the dominant one determines the
      // effective insertion loss.
      var Aterr_f = hasTerrain ? (terrainILPerBand[i] > 0 ? terrainILPerBand[i] : 0) : 0;
      var Abar_f = hasBarrier ? Abar[i] : 0;
      var Ascreen_f = Abar_f > Aterr_f ? Abar_f : Aterr_f;
      var AgrBar_f;
      if (Ascreen_f > 0) {
        // §7.4 insertion loss form: combined AgrBar = max(Dz, Agr_subpath)
        // When Dz > 0 the max() already prevents Agr<0 from yielding spurious
        // gain — no explicit clamp is needed.
        var AgrForBar = Agr_bar ? Agr_bar[i] : Agr[i];
        AgrBar_f = Math.max(Ascreen_f, AgrForBar);
      } else {
        AgrBar_f = Agr[i];
      }
      var A_f = Adiv + Aatm_f + AgrBar_f;
      sumLin += Math.pow(10, (Lw_f + A_WEIGHTS_BANDS[i] + (adjDB || 0) - A_f) / 10);
      anyBand = true;
    }
    if (!anyBand) return NaN;
    return 10 * Math.log10(sumLin);
  }

  /**
   * Detailed ISO 9613-2 prediction returning per-band intermediate values.
   * Same calculation as calcISOatPoint but returns full breakdown for §5.2.2 compliance.
   * @param {number[]} spectrum - Unweighted Lw per octave band [63..8kHz] in dB(Z). A-weighting is applied internally.
   * @returns {object} { total, bands: [{ freq, Lw, Adiv, Aatm, Agr, Abar, AgrBar, Lp, LA }] }
   */
  function calcISOatPointDetailed(spectrum, srcHeight, distM, adjDB, barrierDelta, recvHeight, isoParams, endDeltaLeft, endDeltaRight, barrierInfo, terrainILPerBand) {
    if (!spectrum || distM <= 0) return null;
    var d = Math.max(distM, 1);
    var hS = Math.max(srcHeight, 0.01);
    var hR = recvHeight || 1.5;
    var params = isoParams || {};
    var alpha = calcAlphaAtm(params.temperature || 10, params.humidity || 70);
    var Adiv = 20 * Math.log10(d) + 11;
    var gFactor = (params.groundFactor != null) ? params.groundFactor : 0.5;
    var Agr = calcAgrPerBand(hS, hR, d, gFactor);

    var Abar;
    if ((endDeltaLeft || 0) > 0 || (endDeltaRight || 0) > 0) {
      Abar = calcBarrierWithEndDiffraction(barrierDelta || 0, endDeltaLeft || 0, endDeltaRight || 0, OCT_FREQ);
    } else {
      Abar = calcBarrierAttenuation(barrierDelta || 0, OCT_FREQ);
    }

    var hasBarrier = (barrierDelta || 0) > 0 || (endDeltaLeft || 0) > 0 || (endDeltaRight || 0) > 0;
    var hasTerrain = !!(terrainILPerBand && terrainILPerBand.length === 8);
    var Agr_bar = null;
    if (hasBarrier && barrierInfo && barrierInfo.d1 > 0 && barrierInfo.d2 > 0) {
      Agr_bar = calcAgrBarrier(hS, hR, d, gFactor, barrierInfo);
    }
    var bands = [];
    var sumLin = 0;

    for (var i = 0; i < 8; i++) {
      var Lw_f = spectrum[i];
      var Aterr_f_d = hasTerrain ? (terrainILPerBand[i] > 0 ? terrainILPerBand[i] : 0) : 0;
      if (Lw_f === null || Lw_f === undefined || !isFinite(Lw_f)) {
        bands.push({ freq: OCT_FREQ[i], Lw: NaN, Adiv: Adiv, Aatm: 0, Agr: Agr[i], Abar: Abar[i], Aterr: Aterr_f_d, AgrBar: 0, Lp: NaN });
        continue;
      }
      var Aatm_f = alpha[i] * d;
      // Per-band screen = max(barrier IL, terrain IL).
      var Abar_f_d = hasBarrier ? Abar[i] : 0;
      var Ascreen_f_d = Abar_f_d > Aterr_f_d ? Abar_f_d : Aterr_f_d;
      var AgrBar_f;
      if (Ascreen_f_d > 0) {
        // ISO 9613-2 §7.4: AgrBar = max(Dz, Agr_subpath); clamp not needed
        // because Dz > 0 already dominates any negative Agr contribution.
        var AgrForBar = Agr_bar ? Agr_bar[i] : Agr[i];
        AgrBar_f = Math.max(Ascreen_f_d, AgrForBar);
      } else {
        AgrBar_f = Agr[i];
      }
      var A_f = Adiv + Aatm_f + AgrBar_f;
      var Lp_f = Lw_f + A_WEIGHTS_BANDS[i] + (adjDB || 0) - A_f;
      sumLin += Math.pow(10, Lp_f / 10);
      bands.push({
        freq: OCT_FREQ[i],
        Lw: Lw_f + A_WEIGHTS_BANDS[i] + (adjDB || 0),
        Adiv: Adiv,
        Aatm: Aatm_f,
        Agr: Agr_bar ? Agr_bar[i] : Agr[i],
        Abar: Abar[i],
        Aterr: Aterr_f_d,
        AgrBar: AgrBar_f,
        Lp: Lp_f
      });
    }

    return {
      total: sumLin > 0 ? 10 * Math.log10(sumLin) : NaN,
      distance: d,
      srcHeight: hS,
      recvHeight: hR,
      Adiv: Adiv,
      bands: bands
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONCAWE prediction — complete K1–K6 calculation chain
  // ═══════════════════════════════════════════════════════════════

  /**
   * CONCAWE prediction at a single point (Report 4/81, Manning 1981).
   * Lp(f) = Lw(f) + adj − (K1 + K2 + K3 + K4 + K5 + Kscreen)
   * where Kscreen = max(K6_barrier, Aterr).
   *
   * @param {number[]} spectrum  - Unweighted Lw per octave band [63..8kHz] in dB(Z). A-weighting is applied internally.
   * @param {number} srcHeight   - source height above ground (m)
   * @param {number} distM       - source-receiver distance (m)
   * @param {number} adjDB       - broadband adjustment (opTime + quantity)
   * @param {number} barrierDelta - barrier path-length difference (m), 0 if none
   * @param {number} recvHeight  - receiver height above ground (m)
   * @param {object} concaweParams - { temperature, humidity, groundFactor, metCategory }
   * @param {number} endDeltaLeft  - left end-diffraction delta (m)
   * @param {number} endDeltaRight - right end-diffraction delta (m)
   * @param {object} barrierInfo   - { d1, d2, hBar } (unused by CONCAWE ground, passed for future)
   * @param {number[]} terrainILPerBand - 8-band terrain insertion loss (dB), or null
   * @returns {number} overall A-weighted Lp (dB)
   */
  function calcConcaweAtPoint(spectrum, srcHeight, distM, adjDB, barrierDelta,
    recvHeight, concaweParams, endDeltaLeft, endDeltaRight, barrierInfo, terrainILPerBand) {
    if (!spectrum || distM <= 0) return NaN;
    var d = Math.max(distM, 1);
    var hS = Math.max(srcHeight, 0.01);
    var hR = recvHeight || 1.5;
    var params = concaweParams || {};

    // K1: geometric divergence (= Adiv)
    var K1 = 20 * Math.log10(d) + 11;

    // K2: atmospheric absorption per band (= Aatm)
    var alpha = calcAlphaAtm(params.temperature || 10, params.humidity || 70);

    // Ground type for K3
    var gFactor = (params.groundFactor != null) ? params.groundFactor : 0.5;
    // CONCAWE binary ground: G=0 → hard, G>0 → soft
    // When gFactor is an object {Gs,Gr,Gm}, use the average to decide hard/soft
    var gScalar = (typeof gFactor === 'object')
      ? ((gFactor.Gs || 0) + (gFactor.Gr || 0) + (gFactor.Gm || 0)) / 3
      : gFactor;
    var groundType = (gScalar === 0) ? 'hard' : 'soft';

    // K4: meteorological correction
    var metCat = params.metCategory || 4;

    // K6: barrier/building screen (reuse Maekawa diffraction)
    var hasBarrier = (barrierDelta || 0) > 0 || (endDeltaLeft || 0) > 0 || (endDeltaRight || 0) > 0;
    var hasTerrain = !!(terrainILPerBand && terrainILPerBand.length === 8);
    var Abar;
    if (hasBarrier) {
      if ((endDeltaLeft || 0) > 0 || (endDeltaRight || 0) > 0) {
        Abar = calcBarrierWithEndDiffraction(barrierDelta || 0, endDeltaLeft || 0, endDeltaRight || 0, OCT_FREQ);
      } else {
        Abar = calcBarrierAttenuation(barrierDelta || 0, OCT_FREQ);
      }
    }

    var sumLin = 0;
    var anyBand = false;
    for (var i = 0; i < 8; i++) {
      var Lw_f = spectrum[i];
      if (Lw_f === null || Lw_f === undefined || !isFinite(Lw_f)) continue;

      var freq = OCT_FREQ[i];
      var K2_f = alpha[i] * d;
      var K3_f = calcConcaweK3(d, freq, groundType);
      var K4_f = calcConcaweK4(freq, metCat);
      var K5_f = calcConcaweK5(K3_f, K4_f, hS, hR, d);

      // Screen = max(barrier IL, terrain IL)
      var K6_f = hasBarrier ? Abar[i] : 0;
      var Aterr_f = hasTerrain ? (terrainILPerBand[i] > 0 ? terrainILPerBand[i] : 0) : 0;
      var Kscreen_f = K6_f > Aterr_f ? K6_f : Aterr_f;

      // CONCAWE: K3 is always applied (no §7.4 insertion-loss interaction)
      var A_f = K1 + K2_f + K3_f + K4_f + K5_f + Kscreen_f;
      sumLin += Math.pow(10, (Lw_f + A_WEIGHTS_BANDS[i] + (adjDB || 0) - A_f) / 10);
      anyBand = true;
    }
    if (!anyBand) return NaN;
    return 10 * Math.log10(sumLin);
  }

  /**
   * Detailed CONCAWE prediction returning per-band intermediate values.
   * Same calculation as calcConcaweAtPoint but returns full breakdown.
   * @param {number[]} spectrum - Unweighted Lw per octave band [63..8kHz] in dB(Z). A-weighting is applied internally.
   */
  function calcConcaweAtPointDetailed(spectrum, srcHeight, distM, adjDB, barrierDelta,
    recvHeight, concaweParams, endDeltaLeft, endDeltaRight, barrierInfo, terrainILPerBand) {
    if (!spectrum || distM <= 0) return null;
    var d = Math.max(distM, 1);
    var hS = Math.max(srcHeight, 0.01);
    var hR = recvHeight || 1.5;
    var params = concaweParams || {};

    var K1 = 20 * Math.log10(d) + 11;
    var alpha = calcAlphaAtm(params.temperature || 10, params.humidity || 70);
    var gFactor = (params.groundFactor != null) ? params.groundFactor : 0.5;
    var gScalar = (typeof gFactor === 'object')
      ? ((gFactor.Gs || 0) + (gFactor.Gr || 0) + (gFactor.Gm || 0)) / 3
      : gFactor;
    var groundType = (gScalar === 0) ? 'hard' : 'soft';
    var metCat = params.metCategory || 4;

    var hasBarrier = (barrierDelta || 0) > 0 || (endDeltaLeft || 0) > 0 || (endDeltaRight || 0) > 0;
    var hasTerrain = !!(terrainILPerBand && terrainILPerBand.length === 8);
    var Abar;
    if (hasBarrier) {
      if ((endDeltaLeft || 0) > 0 || (endDeltaRight || 0) > 0) {
        Abar = calcBarrierWithEndDiffraction(barrierDelta || 0, endDeltaLeft || 0, endDeltaRight || 0, OCT_FREQ);
      } else {
        Abar = calcBarrierAttenuation(barrierDelta || 0, OCT_FREQ);
      }
    }

    var bands = [];
    var sumLin = 0;
    for (var i = 0; i < 8; i++) {
      var Lw_f = spectrum[i];
      var freq = OCT_FREQ[i];
      var K2_f = alpha[i] * d;
      var K3_f = calcConcaweK3(d, freq, groundType);
      var K4_f = calcConcaweK4(freq, metCat);
      var K5_f = calcConcaweK5(K3_f, K4_f, hS, hR, d);
      var K6_f = hasBarrier ? Abar[i] : 0;
      var Aterr_f = hasTerrain ? (terrainILPerBand[i] > 0 ? terrainILPerBand[i] : 0) : 0;
      var Kscreen_f = K6_f > Aterr_f ? K6_f : Aterr_f;

      if (Lw_f === null || Lw_f === undefined || !isFinite(Lw_f)) {
        bands.push({ freq: freq, Lw: NaN, K1: K1, K2: K2_f, K3: K3_f, K4: K4_f, K5: K5_f, K6: K6_f, Aterr: Aterr_f, Lp: NaN });
        continue;
      }
      var A_f = K1 + K2_f + K3_f + K4_f + K5_f + Kscreen_f;
      var Lp_f = Lw_f + A_WEIGHTS_BANDS[i] + (adjDB || 0) - A_f;
      sumLin += Math.pow(10, Lp_f / 10);
      bands.push({
        freq: freq,
        Lw: Lw_f + A_WEIGHTS_BANDS[i] + (adjDB || 0),
        K1: K1, K2: K2_f, K3: K3_f, K4: K4_f, K5: K5_f,
        K6: K6_f, Aterr: Aterr_f, Lp: Lp_f
      });
    }

    return {
      total: sumLin > 0 ? 10 * Math.log10(sumLin) : NaN,
      distance: d, srcHeight: hS, recvHeight: hR, K1: K1,
      metCategory: metCat, groundType: groundType,
      bands: bands
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  Facade reflection — ISO 9613-2 §7.5 image source method
  // ═══════════════════════════════════════════════════════════════

  /**
   * Convert {lat, lng} to local metric [x, y] (metres) relative to ref.
   * x = east (positive), y = north (positive).
   */
  function latLngToLocal2D(pt, ref) {
    var cosLat = Math.cos(ref.lat * Math.PI / 180);
    return [
      (pt.lng - ref.lng) * 111320 * cosLat,
      (pt.lat - ref.lat) * 111320
    ];
  }

  /**
   * Mirror point P = [px, py] in the infinite line through A and B (2-D metric).
   * Returns mirrored [mx, my] or null if A === B.
   */
  function mirrorPoint2D(P, A, B) {
    var dx = B[0] - A[0], dy = B[1] - A[1];
    var lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) return null;
    var t = ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / lenSq;
    return [2 * (A[0] + t * dx) - P[0], 2 * (A[1] + t * dy) - P[1]];
  }

  /**
   * Find the dominant facade reflection for a source-receiver pair.
   * ISO 9613-2 §7.5 image source method, 2-D horizontal plane.
   *
   * Considers all building/barrier edges within 50 m of the receiver.
   * Applies grazing-incidence cutoff at 80°.
   * Returns the single dominant reflection (shortest reflected path =
   * highest level contribution).
   *
   * @param {Object} srcLL    {lat, lng} source position
   * @param {Object} recLL    {lat, lng} receiver position
   * @param {number} srcH     source height m (reserved — 2-D method)
   * @param {number} recH     receiver height m (reserved)
   * @param {Array}  buildings  [{polygon, heightM, isBarrier}]
   * @returns {{reflectedDistM: number, imageSourceLL: {lat,lng}}|null}
   */
  function getDominantReflection(srcLL, recLL, srcH, recH, buildings) {
    if (!buildings || buildings.length === 0) return null;
    var MAX_EDGE_DIST = 50;  // metres from receiver
    var MAX_INC_DEG   = 80;  // grazing incidence cutoff (degrees)
    var cosRef = Math.cos(recLL.lat * Math.PI / 180);

    // Source in local metric coords centred on receiver (receiver = origin)
    var S = latLngToLocal2D(srcLL, recLL);
    var best = null;

    for (var bi = 0; bi < buildings.length; bi++) {
      var bld = buildings[bi];
      if (!bld.polygon) continue;
      var edges = getBuildingEdges(bld.polygon, !!bld.isBarrier);

      for (var ei = 0; ei < edges.length; ei++) {
        var ev = edges[ei];
        var Av = ev[0], Bv = ev[1];
        var A_ll = Array.isArray(Av) ? { lat: Av[0], lng: Av[1] } : Av;
        var B_ll = Array.isArray(Bv) ? { lat: Bv[0], lng: Bv[1] } : Bv;

        // Quick distance filter — skip edges far from receiver
        var midD = flatDistM(
          { lat: (A_ll.lat + B_ll.lat) * 0.5, lng: (A_ll.lng + B_ll.lng) * 0.5 },
          recLL
        );
        if (midD > MAX_EDGE_DIST) continue;

        var A = latLngToLocal2D(A_ll, recLL);
        var B = latLngToLocal2D(B_ll, recLL);

        // Mirror source in this edge
        var Sm = mirrorPoint2D(S, A, B);
        if (!Sm) continue;

        // Reflected path length = distance from image source to receiver (origin)
        var reflDist = Math.sqrt(Sm[0] * Sm[0] + Sm[1] * Sm[1]);
        if (reflDist < 0.5) continue;

        // Image source in lat/lng (needed for segmentsIntersect)
        var Sm_ll = {
          lat: recLL.lat + Sm[1] / 111320,
          lng: recLL.lng + Sm[0] / (111320 * cosRef)
        };

        // Validate: line from image source to receiver must intersect the edge
        var hit = segmentsIntersect(Sm_ll, recLL, A_ll, B_ll);
        if (!hit) continue;

        // Angle of incidence: between incident ray S→P and the edge normal
        var P = latLngToLocal2D(hit, recLL);
        var edX = B[0] - A[0], edY = B[1] - A[1];
        var edLen = Math.sqrt(edX * edX + edY * edY);
        if (edLen < 0.01) continue;
        var iX = P[0] - S[0], iY = P[1] - S[1];
        var iLen = Math.sqrt(iX * iX + iY * iY);
        if (iLen < 0.01) continue;
        // Unit normal to edge; abs handles both face orientations
        var cosTheta = Math.abs((-edY / edLen) * (iX / iLen) + (edX / edLen) * (iY / iLen));
        var incDeg = Math.acos(Math.min(1.0, cosTheta)) * 180 / Math.PI;
        if (incDeg > MAX_INC_DEG) continue;

        // Keep dominant reflection (shortest path = strongest contribution)
        if (!best || reflDist < best.reflectedDistM) {
          best = { reflectedDistM: reflDist, imageSourceLL: Sm_ll };
        }
      }
    }
    return best;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONCAWE (Report 4/81, Manning 1981) — K3 Ground + K5 Height
  // ═══════════════════════════════════════════════════════════════

  // K3 polynomial coefficients — verified against CONCAWE Report 4/81
  // Appendix II. Polynomial form:
  //   K3 = a0 + a1·log10(d) + a2·(log10(d))² + a3·(log10(d))³
  // where d = source-receiver distance in metres.
  // 2000 and 4000 Hz are linear (a2=a3=0).
  // 8000 Hz: use 4000 Hz coefficients (extrapolation beyond CONCAWE range).
  var CONCAWE_K3_COEFFS = {
    63:   [33.4, -35.04, 9.159, -0.3508],
    125:  [8.96, -35.8, 20.4, -2.85],
    250:  [-64.2, 48.6, -9.53, 0.634],
    500:  [-74.9, 82.23, -26.921, 2.9258],
    1000: [-100.1, 104.68, -34.693, 3.8068],
    2000: [-7.0, 3.5, 0.0, 0.0],
    4000: [-16.9, 6.7, 0.0, 0.0]
  };

  /**
   * K3 ground attenuation — CONCAWE Report 4/81.
   * Hard ground: K3 = −3 dB (hemispherical correction) for all bands/distances.
   * Soft ground: polynomial lookup per octave band.
   * @param {number} d   - source-receiver distance (m)
   * @param {number} freqHz - octave band centre frequency (63–8000)
   * @param {string} groundType - 'hard' or 'soft'
   * @returns {number} K3 in dB
   */
  function calcConcaweK3(d, freqHz, groundType) {
    if (groundType === 'hard') return -3;

    // Clamp distance: curves validated 100–2000 m.
    // Below 100 m: use 100 m value.
    // Above 2000 m: use 2000 m value (500/1000 Hz cubic terms cause
    // rollover beyond this range).
    var dClamped = Math.max(100, Math.min(d, 2000));

    // Map 8 kHz to 4 kHz coefficients
    var band = freqHz;
    if (band === 8000) band = 4000;

    var c = CONCAWE_K3_COEFFS[band];
    if (!c) return 0;

    var logD = Math.log10(dClamped);
    var K3 = c[0]
           + c[1] * logD
           + c[2] * logD * logD
           + c[3] * logD * logD * logD;

    return K3;
  }

  // Gamma vs grazing angle — verified from CONCAWE Figure 9.
  // Do NOT use the exp(-0.6ψ) approximation — it is too inaccurate
  // at small angles where most real scenarios fall.
  var CONCAWE_GAMMA_TABLE = [
    [0.0, 1.00],
    [0.5, 0.90],
    [1.0, 0.70],
    [1.5, 0.54],
    [2.0, 0.38],
    [2.5, 0.26],
    [3.0, 0.16],
    [4.0, 0.06],
    [5.0, 0.01]
  ];

  /**
   * Linear interpolation of gamma from the Figure 9 table.
   * @param {number} psiDeg - grazing angle in degrees
   * @returns {number} gamma (0–1)
   */
  function lookupGamma(psiDeg) {
    var tbl = CONCAWE_GAMMA_TABLE;
    if (psiDeg <= tbl[0][0]) return tbl[0][1];
    if (psiDeg >= tbl[tbl.length - 1][0]) return tbl[tbl.length - 1][1];

    for (var i = 0; i < tbl.length - 1; i++) {
      if (psiDeg >= tbl[i][0] && psiDeg < tbl[i + 1][0]) {
        var t = (psiDeg - tbl[i][0]) / (tbl[i + 1][0] - tbl[i][0]);
        return tbl[i][1] + t * (tbl[i + 1][1] - tbl[i][1]);
      }
    }
    return 0;
  }

  /**
   * K5 source height correction — CONCAWE Report 4/81.
   * Reduces K3+K4 effect for elevated sources based on the grazing angle.
   * @param {number} K3 - ground attenuation from calcConcaweK3()
   * @param {number} K4 - meteorological correction (0 until Prompt 2)
   * @param {number} hs - source height above ground (m)
   * @param {number} hr - receiver height above ground (m)
   * @param {number} d  - source-receiver distance (m)
   * @returns {number} K5 in dB
   */
  function calcConcaweK5(K3, K4, hs, hr, d) {
    // K5 only applies when source height > 2 m
    if (hs <= 2) return 0;

    // No correction when ground+met effect is already small
    if ((K3 + K4) <= -3) return 0;

    // Grazing angle in degrees
    var psiRad = Math.atan((hs + hr) / d);
    var psiDeg = psiRad * 180 / Math.PI;

    // Gamma from Figure 9 lookup
    var gamma = lookupGamma(psiDeg);

    var K5 = (K3 + K4 + 3) * (gamma - 1);
    return K5;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONCAWE — K4 Meteorological Correction (Simplification 2)
  // ═══════════════════════════════════════════════════════════════

  // K4 correction table — Simplification 2 (distance-independent).
  // Verified against CONCAWE Report 4/81 §6.2.
  // Convention: positive = upwind attenuation, negative = downwind enhancement.
  // Category 4 = neutral (zero correction).
  var CONCAWE_K4_TABLE = {
    1: {63:8.0, 125:5.0, 250:6.0, 500:8.0, 1000:10.0, 2000:6.0, 4000:8.0},
    2: {63:3.0, 125:2.0, 250:5.0, 500:7.0, 1000:11.5, 2000:7.5, 4000:8.0},
    3: {63:2.0, 125:1.5, 250:4.0, 500:3.5, 1000:6.0, 2000:5.0, 4000:4.5},
    4: {63:0, 125:0, 250:0, 500:0, 1000:0, 2000:0, 4000:0},
    5: {63:-1.0, 125:-2.0, 250:-4.0, 500:-4.0, 1000:-4.5, 2000:-3.0, 4000:-4.5},
    6: {63:-2.0, 125:-4.0, 250:-5.0, 500:-6.0, 1000:-5.0, 2000:-4.5, 4000:-7.0}
  };

  /**
   * K4 meteorological correction — CONCAWE Simplification 2.
   * @param {number} freqHz      - octave band centre frequency (63–8000)
   * @param {number} metCategory - integer 1–6 (1=strong upwind … 6=strong downwind)
   * @returns {number} K4 in dB (positive=upwind attenuation, negative=downwind enhancement)
   */
  function calcConcaweK4(freqHz, metCategory) {
    var cat = Math.round(metCategory);
    if (cat < 1) cat = 1;
    if (cat > 6) cat = 6;

    // Map 8 kHz to 4 kHz (CONCAWE covers 63–4000 Hz)
    var band = freqHz;
    if (band === 8000) band = 4000;

    var row = CONCAWE_K4_TABLE[cat];
    if (!row || row[band] === undefined) return 0;

    return row[band];
  }

  /**
   * Pasquill stability class from meteorological inputs.
   * @param {number} windSpeed      - wind speed at 10 m height (m/s)
   * @param {string} timeOfDay      - 'day' | 'night' | 'transition'
   * @param {string} solarRadiation - '>60' | '30-60' | '<30' (mW/cm², day only)
   * @param {string} cloudCover     - '0-3' | '4-7' | '8' (octas, night only)
   * @returns {string} Pasquill class ('A' through 'G', including 'A-B','B-C','C-D')
   */
  function getPasquillClass(windSpeed, timeOfDay, solarRadiation, cloudCover) {
    // Wind speed bins
    var ws;
    if (windSpeed <= 1.5) ws = 0;
    else if (windSpeed <= 2.5) ws = 1;
    else if (windSpeed <= 4.5) ws = 2;
    else if (windSpeed <= 6.0) ws = 3;
    else ws = 4;

    if (timeOfDay === 'day') {
      var sr;
      if (solarRadiation === '>60') sr = 0;
      else if (solarRadiation === '30-60') sr = 1;
      else sr = 2; // '<30'

      var dayTable = [
        //  >60     30-60   <30
        ['A',    'A-B',  'B'   ],  // <=1.5
        ['A-B',  'B',    'C'   ],  // 2.0-2.5
        ['B',    'B-C',  'C'   ],  // 3.0-4.5
        ['C',    'C-D',  'D'   ],  // 5.0-6.0
        ['D',    'D',    'D'   ]   // >6.0
      ];
      return dayTable[ws][sr];

    } else if (timeOfDay === 'transition') {
      return 'D';

    } else {
      // Night: index by cloud cover
      var cc;
      if (cloudCover === '0-3') cc = 0;
      else if (cloudCover === '4-7') cc = 1;
      else cc = 2; // '8'

      var nightTable = [
        //  0-3     4-7     8
        ['F',    'F',    'D'   ],  // <=1.5
        ['F',    'E',    'D'   ],  // 2.0-2.5
        ['E',    'D',    'D'   ],  // 3.0-4.5
        ['D',    'D',    'D'   ],  // 5.0-6.0
        ['D',    'D',    'D'   ]   // >6.0
      ];

      var result = nightTable[ws][cc];

      // Category G: night, <1 octa, wind <0.5 m/s
      if (cloudCover === '0-3' && windSpeed < 0.5) {
        result = 'G';
      }

      return result;
    }
  }

  /**
   * Map Pasquill class to stability group for met category lookup.
   * @param {string} pasquill - Pasquill class ('A' through 'G', including intermediates)
   * @returns {string} 'AB' | 'CDE' | 'FG'
   */
  function pasquillToGroup(pasquill) {
    if (['A', 'A-B', 'B', 'B-C'].indexOf(pasquill) >= 0) return 'AB';
    if (['F', 'G'].indexOf(pasquill) >= 0) return 'FG';
    return 'CDE'; // C, C-D, D, E
  }

  /**
   * CONCAWE met category (1–6) from Pasquill group + vector wind.
   * @param {string} pasquillGroup - 'AB' | 'CDE' | 'FG'
   * @param {number} vectorWind    - m/s, positive = downwind (source → receiver)
   * @returns {number} integer 1–6
   */
  function getConcaweMetCategory(pasquillGroup, vectorWind) {
    var v = vectorWind;

    if (pasquillGroup === 'AB') {
      if (v < -3.0) return 1;
      if (v < -0.5) return 2;
      if (v < 0.5)  return 3;
      if (v < 3.0)  return 4;
      return 5;
    }

    if (pasquillGroup === 'CDE') {
      if (v < -3.0) return 2;
      if (v < -0.5) return 3;
      if (v < 0.5)  return 4;
      if (v < 3.0)  return 5;
      return 6;
    }

    // FG
    if (v < -3.0) return 3;
    if (v < -0.5) return 4;
    if (v < 0.5)  return 5;
    if (v < 3.0)  return 6;
    return 6; // F/G + strong downwind = cat 6
  }

  /**
   * Full-chain K4 from raw meteorological inputs.
   * @param {number} freqHz         - octave band centre frequency
   * @param {number} windSpeed      - wind speed at 10 m (m/s)
   * @param {number} windDirection  - degrees, direction wind is coming FROM (met convention)
   * @param {number} sourceBearing  - degrees, bearing from receiver to source
   * @param {string} timeOfDay      - 'day' | 'night' | 'transition'
   * @param {string} solarRadiation - '>60' | '30-60' | '<30' (day only)
   * @param {string} cloudCover     - '0-3' | '4-7' | '8' (night only)
   * @returns {{K4:number, metCategory:number, pasquillClass:string, vectorWind:number}}
   */
  function calcConcaweK4FromMet(freqHz, windSpeed, windDirection,
                                 sourceBearing, timeOfDay,
                                 solarRadiation, cloudCover) {
    // Vector wind = component of wind blowing source → receiver.
    // Wind direction is "from" (met convention) — when windDir equals
    // sourceBearing the wind blows FROM the source TOWARD the receiver,
    // which is downwind (positive). No +180 flip needed.
    var angleDiff = (windDirection - sourceBearing) * Math.PI / 180;
    var vectorWind = windSpeed * Math.cos(angleDiff);

    var pasquill = getPasquillClass(windSpeed, timeOfDay, solarRadiation, cloudCover);
    var group = pasquillToGroup(pasquill);
    var metCat = getConcaweMetCategory(group, vectorWind);

    return {
      K4: calcConcaweK4(freqHz, metCat),
      metCategory: metCat,
      pasquillClass: pasquill,
      vectorWind: vectorWind
    };
  }

  // ── CONCAWE console test harness ──────────────────────────────
  if (typeof window !== 'undefined') {
    window.testConcaweK3K5 = function() {
      var bands = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
      var distances = [100, 200, 500, 1000, 2000];

      console.log('=== K3 SOFT GROUND ===');
      for (var i = 0; i < distances.length; i++) {
        var d = distances[i];
        var row = 'd=' + d + 'm: ';
        for (var j = 0; j < bands.length; j++) {
          var v = calcConcaweK3(d, bands[j], 'soft');
          row += bands[j] + 'Hz=' + v.toFixed(1) + '  ';
        }
        console.log(row);
      }

      console.log('');
      console.log('=== K3 HARD GROUND ===');
      console.log('All bands, all distances: -3.0');
      console.log('Check: ' + calcConcaweK3(500, 500, 'hard'));

      console.log('');
      console.log('=== K3 expected at key points ===');
      console.log('250Hz @ 1000m should be ~12.9: ' +
        calcConcaweK3(1000, 250, 'soft').toFixed(1));
      console.log('63Hz @ 100m should be ~-2.9: ' +
        calcConcaweK3(100, 63, 'soft').toFixed(1));
      console.log('500Hz @ 500m should be ~8.5: ' +
        calcConcaweK3(500, 500, 'soft').toFixed(1));

      console.log('');
      console.log('=== K5 (hs=10, hr=1.5) ===');
      for (var i = 0; i < distances.length; i++) {
        var d = distances[i];
        var K3 = calcConcaweK3(d, 500, 'soft');
        var K5 = calcConcaweK5(K3, 0, 10, 1.5, d);
        var psi = Math.atan(11.5 / d) * 180 / Math.PI;
        console.log('d=' + d +
          ' psi=' + psi.toFixed(2) + 'deg' +
          ' gamma=' + lookupGamma(psi).toFixed(2) +
          ' K3=' + K3.toFixed(1) +
          ' K5=' + K5.toFixed(1));
      }

      console.log('');
      console.log('=== K5 should be 0 when hs<=2 ===');
      console.log('K5(hs=1.5): ' + calcConcaweK5(5, 0, 1.5, 1.5, 500));

      console.log('');
      console.log('=== Gamma interpolation check ===');
      var testPsi = [0, 0.25, 0.5, 1, 1.5, 2, 3, 5];
      for (var i = 0; i < testPsi.length; i++) {
        console.log('psi=' + testPsi[i] +
          ' gamma=' + lookupGamma(testPsi[i]).toFixed(3));
      }
    };

    window.testConcaweK4 = function() {
      console.log('=== K4 direct lookup ===');
      var cats = [1, 2, 3, 4, 5, 6];
      var bands = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
      for (var i = 0; i < cats.length; i++) {
        var row = 'Cat ' + cats[i] + ': ';
        for (var j = 0; j < bands.length; j++) {
          row += bands[j] + '=' +
            calcConcaweK4(bands[j], cats[i]).toFixed(1) + '  ';
        }
        console.log(row);
      }

      console.log('');
      console.log('=== Category 4 should be all zeros ===');
      console.log('1kHz Cat4: ' + calcConcaweK4(1000, 4));

      console.log('');
      console.log('=== 8kHz should equal 4kHz ===');
      console.log('Cat6 4kHz: ' + calcConcaweK4(4000, 6) +
        '  8kHz: ' + calcConcaweK4(8000, 6));

      console.log('');
      console.log('=== Pasquill class tests ===');
      console.log('Day >60 1m/s: ' +
        getPasquillClass(1.0, 'day', '>60', null));
      console.log('Night 0-3 0.3m/s: ' +
        getPasquillClass(0.3, 'night', null, '0-3'));
      console.log('Night 8 3m/s: ' +
        getPasquillClass(3.0, 'night', null, '8'));
      console.log('Transition 2m/s: ' +
        getPasquillClass(2.0, 'transition', null, null));

      console.log('');
      console.log('=== Met category tests ===');
      console.log('AB v=-4: ' + getConcaweMetCategory('AB', -4));
      console.log('CDE v=0: ' + getConcaweMetCategory('CDE', 0));
      console.log('FG v=2: ' + getConcaweMetCategory('FG', 2));

      console.log('');
      console.log('=== Full chain test ===');
      var result = calcConcaweK4FromMet(500, 3.0, 0, 0, 'day', '>60', null);
      console.log('Day >60 3m/s downwind:');
      console.log('  Pasquill=' + result.pasquillClass +
        ' vectorWind=' + result.vectorWind.toFixed(1) +
        ' metCat=' + result.metCategory +
        ' K4(500Hz)=' + result.K4);
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  Terrain diffraction — Deygout 3-edge (ISO 9613-2 Annex B)
  //
  //  These three functions were previously local to noise-worker.js.
  //  They are now the single source of truth, used by both the grid
  //  worker and the single-point receiver path in index.html.
  //
  //  elevFn(lat, lng) → number|null  — synchronous elevation lookup
  //  supplied by the caller so these functions remain context-free.
  // ═══════════════════════════════════════════════════════════════

  function _terrainEmptyBands() { return [0, 0, 0, 0, 0, 0, 0, 0]; }

  /** Find every local maximum above the source→receiver LOS.
   *  @param {function} elevFn - synchronous (lat,lng)→elev|null lookup */
  function findTerrainEdges(srcLL, srcTip, recLL, recTip, totalDist, elevFn) {
    var N = Math.max(20, Math.min(100, Math.round(totalDist / 5)));
    var profile = [];
    for (var i = 1; i < N; i++) {
      var t = i / N;
      var lat = srcLL.lat + t * (recLL.lat - srcLL.lat);
      var lng = srcLL.lng + t * (recLL.lng - srcLL.lng);
      var elev = elevFn(lat, lng);
      if (elev === null) continue;
      var losElev = srcTip + t * (recTip - srcTip);
      profile.push({
        t: t,
        dist: t * totalDist,
        elev: elev,
        protrusion: elev - losElev
      });
    }

    var edges = [];
    for (var j = 0; j < profile.length; j++) {
      var p = profile[j];
      if (p.protrusion <= 0) continue;
      var prevProt = (j > 0) ? profile[j - 1].protrusion : 0;
      var nextProt = (j < profile.length - 1) ? profile[j + 1].protrusion : 0;
      // Local maximum above LOS (ties included so plateaus still register)
      if (p.protrusion >= prevProt && p.protrusion >= nextProt) {
        edges.push({
          t: p.t,
          dist: p.dist,
          elev: p.elev,
          protrusion: p.protrusion,
          d1: p.dist,
          d2: totalDist - p.dist
        });
      }
    }
    return edges;
  }

  /** Deygout selection: principal edge + up to one edge on each sub-path. */
  function deygoutSelectEdges(edges, srcTip, recTip, totalDist) {
    if (edges.length === 0) return [];
    if (edges.length === 1) return edges.slice();

    // Principal edge: highest Fresnel number proxy.
    // ν ∝ h × √(2 / (λ · d1·d2/(d1+d2))) — for ranking across edges at the
    // same wavelength we can drop λ and rank by h² × (d1+d2)/(d1·d2).
    var bestIdx = 0, bestScore = -Infinity;
    for (var i = 0; i < edges.length; i++) {
      var e = edges[i];
      var score = e.protrusion * e.protrusion * (e.d1 + e.d2) / (e.d1 * e.d2);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    var principal = edges[bestIdx];
    var result = [principal];

    // Source-side sub-path: source tip → principal edge tip.
    var bestSrc = null, bestSrcScore = -Infinity;
    for (var s = 0; s < edges.length; s++) {
      var se = edges[s];
      if (se.dist >= principal.dist - 1) continue;
      var tRel = se.dist / principal.dist;
      var losAtSe = srcTip + tRel * (principal.elev - srcTip);
      var subProt = se.elev - losAtSe;
      if (subProt <= 0) continue;
      var sd1 = se.dist;
      var sd2 = principal.dist - se.dist;
      if (sd1 <= 0 || sd2 <= 0) continue;
      var sScore = subProt * subProt * (sd1 + sd2) / (sd1 * sd2);
      if (sScore > bestSrcScore) {
        bestSrcScore = sScore;
        bestSrc = {
          t: se.t, dist: se.dist, elev: se.elev,
          protrusion: subProt, d1: sd1, d2: sd2
        };
      }
    }
    if (bestSrc) result.unshift(bestSrc);

    // Receiver-side sub-path: principal edge tip → receiver tip.
    var bestRec = null, bestRecScore = -Infinity;
    for (var r2 = 0; r2 < edges.length; r2++) {
      var re = edges[r2];
      if (re.dist <= principal.dist + 1) continue;
      var tRel2 = (re.dist - principal.dist) / (totalDist - principal.dist);
      var losAtRe = principal.elev + tRel2 * (recTip - principal.elev);
      var subProt2 = re.elev - losAtRe;
      if (subProt2 <= 0) continue;
      var rd1 = re.dist - principal.dist;
      var rd2 = totalDist - re.dist;
      if (rd1 <= 0 || rd2 <= 0) continue;
      var rScore = subProt2 * subProt2 * (rd1 + rd2) / (rd1 * rd2);
      if (rScore > bestRecScore) {
        bestRecScore = rScore;
        bestRec = {
          t: re.t, dist: re.dist, elev: re.elev,
          protrusion: subProt2, d1: rd1, d2: rd2
        };
      }
    }
    if (bestRec) result.push(bestRec);

    return result; // 1-3 edges, ordered source → receiver
  }

  /** Per-band terrain IL for a single source→receiver ray. Returns an
   *  8-element array (one value per octave band, 63 Hz … 8 kHz) in dB.
   *  @param {function} elevFn - synchronous (lat,lng)→elev|null lookup;
   *                             pass null to skip (returns all-zero array). */
  function terrainILPerBand(srcLL, srcH, recLL, recH, elevFn) {
    if (!elevFn) return _terrainEmptyBands();

    var srcElev = elevFn(srcLL.lat, srcLL.lng);
    var recElev = elevFn(recLL.lat, recLL.lng);
    // If elevation is unavailable, treat as flat — 0 dB terrain IL, render normally
    if (srcElev === null || recElev === null) return _terrainEmptyBands();

    var srcTip = srcElev + srcH;
    var recTip = recElev + recH;
    var totalDist = flatDistM(srcLL, recLL);
    if (totalDist < 1) return _terrainEmptyBands();

    var allEdges = findTerrainEdges(srcLL, srcTip, recLL, recTip, totalDist, elevFn);
    if (allEdges.length === 0) return _terrainEmptyBands();

    var selected = deygoutSelectEdges(allEdges, srcTip, recTip, totalDist);
    if (selected.length === 0) return _terrainEmptyBands();

    var total = _terrainEmptyBands();
    for (var e = 0; e < selected.length; e++) {
      var edge = selected[e];
      var d1 = edge.d1;
      var d2 = edge.d2;
      var prot = edge.protrusion;
      // Fresnel path-length difference (same approximation as the earlier
      // single-ridge code — retained so single-edge cases match exactly).
      var d1_3d = Math.sqrt(d1 * d1 + prot * prot);
      var d2_3d = Math.sqrt(d2 * d2 + prot * prot);
      var delta = (d1_3d + d2_3d > 0) ? 2 * prot * prot / (d1_3d + d2_3d) : 0;
      if (delta <= 0) continue;

      // Per-band Maekawa IL via the shared (unchanged) formula.
      var perBand = calcBarrierAttenuation(delta, OCT_FREQ, true);
      for (var b = 0; b < 8; b++) {
        var v = perBand[b];
        if (v > 0) total[b] += v;
      }
    }

    // Cap total terrain IL at 25 dB per band (ISO 9613-2 practical limit).
    for (var b2 = 0; b2 < 8; b2++) {
      if (total[b2] > 25) total[b2] = 25;
    }

    return total;
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
    A_WEIGHTS_BANDS: A_WEIGHTS_BANDS,
    calcAgrPerBand: calcAgrPerBand,
    calcAgrBarrier: calcAgrBarrier,
    calcAlphaAtm: calcAlphaAtm,
    calcBarrierAttenuation: calcBarrierAttenuation,
    calcISOatPoint: calcISOatPoint,
    calcISOatPointDetailed: calcISOatPointDetailed,
    calcBarrierWithEndDiffraction: calcBarrierWithEndDiffraction,
    // Geometry
    segmentsIntersect: segmentsIntersect,
    getBuildingEdges: getBuildingEdges,
    flatDistM: flatDistM,
    pointInPolygonLatLng: pointInPolygonLatLng,
    getIntersectingEdges: getIntersectingEdges,
    getDominantBarrier: getDominantBarrier,
    // Terrain — Deygout 3-edge (ISO 9613-2 Annex B)
    findTerrainEdges: findTerrainEdges,
    deygoutSelectEdges: deygoutSelectEdges,
    terrainILPerBand: terrainILPerBand,
    // Facade reflection
    getDominantReflection: getDominantReflection,
    // CONCAWE (Report 4/81)
    CONCAWE_K3_COEFFS: CONCAWE_K3_COEFFS,
    CONCAWE_GAMMA_TABLE: CONCAWE_GAMMA_TABLE,
    CONCAWE_K4_TABLE: CONCAWE_K4_TABLE,
    calcConcaweK3: calcConcaweK3,
    calcConcaweK5: calcConcaweK5,
    lookupGamma: lookupGamma,
    calcConcaweAtPoint: calcConcaweAtPoint,
    calcConcaweAtPointDetailed: calcConcaweAtPointDetailed,
    calcConcaweK4: calcConcaweK4,
    getPasquillClass: getPasquillClass,
    pasquillToGroup: pasquillToGroup,
    getConcaweMetCategory: getConcaweMetCategory,
    calcConcaweK4FromMet: calcConcaweK4FromMet
  };
})();

/* ═════════════════════════════════════════════════════════════════════════════
 * SharedCortn — CoRTN Road Traffic Noise (UK DoT 1988) with Australian
 * adjustments.  Pure, state-free implementation shared between the main thread
 * (index.html) and the cortn-worker.js grid worker added in Phase 5.
 *
 * The formulas MUST stay identical to the reference implementation documented
 * in references/calculations.md §CoRTN.  Do not simplify or rearrange any
 * correction step.  The main-thread wrappers in index.html delegate to this
 * namespace so there is only ONE copy of the math.
 * ═════════════════════════════════════════════════════════════════════════════ */
var SharedCortn = (function() {

  /* ── CoRTN Charts 9 + 9a — polynomial barrier diffraction ───────────────── */
  function cortnCalculateBarrier(road, recv_h) {
    var b = road && road.barrier;
    if (!b || !b.enabled) return { applied: false };

    var sourceRL   = (road.roadHeight_m || 0) + 0.5;        // standard 0.5 m source height per spec
    var barrierRL  = (b.baseRL_m || 0) + (b.height_m || 0);
    var receiverRL = recv_h;
    var srcToBarrier = (road.distFromKerb_m || 0) + 3.5 - (b.distToBarrier_m || 0);
    if (!(srcToBarrier > 0) || !isFinite(srcToBarrier)) {
      return { applied: false, error: 'Receiver-to-barrier distance is ≥ source line (barrier behind source).' };
    }

    var rToB = b.distToBarrier_m || 0;
    var term_rb = Math.sqrt(rToB * rToB + Math.pow(barrierRL - receiverRL, 2));
    var term_sb = Math.sqrt(srcToBarrier * srcToBarrier + Math.pow(barrierRL - sourceRL, 2));
    var term_sr = Math.sqrt(Math.pow(rToB + srcToBarrier, 2) + Math.pow(receiverRL - sourceRL, 2));
    var delta = term_rb + term_sb - term_sr;
    if (!isFinite(delta) || delta <= 0) {
      return { applied: false, error: 'Path difference is zero or invalid — no barrier screening.' };
    }

    var losHeightAtBarrier = (receiverRL - sourceRL) * srcToBarrier / (rToB + srcToBarrier) + sourceRL;
    var zone = (barrierRL >= losHeightAtBarrier) ? 'Shadow' : 'Illuminated';

    var x = Math.log10(delta);
    var atten;
    if (zone === 'Shadow') {
      if (x < -3)       atten = -5;
      else if (x > 1.2) atten = -30;
      else {
        atten = -15.4
              + (-8.26) * x
              + (-2.787) * Math.pow(x, 2)
              + (-0.831) * Math.pow(x, 3)
              + (-0.198) * Math.pow(x, 4)
              +  0.1539  * Math.pow(x, 5)
              +  0.12248 * Math.pow(x, 6)
              +  0.02175 * Math.pow(x, 7);
      }
    } else {
      atten = 0
            +  0.109  * x
            + (-0.815) * Math.pow(x, 2)
            +  0.479  * Math.pow(x, 3)
            +  0.3284 * Math.pow(x, 4)
            +  0.04385 * Math.pow(x, 5);
    }
    atten = Math.round(atten * 10) / 10;

    var corr_ground_barrier = (zone === 'Shadow') ? 0 : null;

    return {
      applied: true,
      atten: atten,
      delta: delta,
      x: x,
      zone: zone,
      srcToBarrier: srcToBarrier,
      sourceRL: sourceRL,
      barrierRL: barrierRL,
      receiverRL: receiverRL,
      corr_ground_barrier: corr_ground_barrier
    };
  }

  /* ── CoRTN free-field correction chain (Chart 2 → LA10/LAeq) ────────────── */
  function calcCortnFreeField(road, period, overrides) {
    overrides = overrides || {};
    var aadt = Number(road.aadt);
    if (!isFinite(aadt) || aadt <= 0) {
      return { la10: null, laeq: null, breakdown: { error: 'AADT is 0 or missing' } };
    }

    // A. Traffic flow for period
    var aadtPct       = (period === 'day') ? road.aadtPctDay  : (road.aadtPctNight != null ? road.aadtPctNight : (1 - road.aadtPctDay));
    var hoursInPeriod = (period === 'day') ? road.dayHours    : road.nightHours;
    var rawCvPct      = (period === 'day') ? road.cv_pct_day  : road.cv_pct_night;

    var flowFrac  = (overrides.flowFrac != null) ? overrides.flowFrac : 1;
    var totalFlow = aadt * aadtPct * flowFrac;
    if (hoursInPeriod <= 0) {
      return { la10: null, laeq: null, breakdown: { error: 'Invalid hours in period' } };
    }
    var hourlyFlow = totalFlow / hoursInPeriod;
    if (hourlyFlow <= 0) {
      return { la10: null, laeq: null, breakdown: { error: 'Hourly flow <= 0' } };
    }

    var cvPct = (overrides.cvPctSpeedCorr != null) ? overrides.cvPctSpeedCorr : rawCvPct;

    // B. Basic noise level
    var L_basic = 42.2 + 10 * Math.log10(hourlyFlow);

    // C. Speed correction
    var gradientTerm = (0.73 + (2.3 - 1.15 * cvPct / 100) * cvPct / 100) * road.gradient_pct;
    var V_adj = road.speed_kmh - Math.round(gradientTerm * 10) / 10;
    if (V_adj < 1) V_adj = 1;

    var corr_speed = 33 * Math.log10(V_adj + 40 + 500 / V_adj)
                   + 10 * Math.log10(1 + 5 * cvPct / V_adj)
                   - 68.8;

    // D. Gradient correction
    var corr_gradient = 0.3 * road.gradient_pct;

    // E. Distance correction
    var sourceH = (overrides.sourceHeight_m != null) ? overrides.sourceHeight_m : 0.5;
    var distOffset = overrides.distOffset || 0;
    var recv_h = (road.receiverHeight_m != null) ? road.receiverHeight_m : 1.5;
    var d_horiz = road.distFromKerb_m + distOffset + 3.5;
    var dz = recv_h - sourceH - (road.roadHeight_m || 0);
    var d_slant = Math.sqrt(d_horiz * d_horiz + dz * dz);
    if (d_slant < 0.1) d_slant = 0.1;
    var corr_distance = -10 * Math.log10(d_slant / 13.5);

    // F. Ground absorption correction
    var abs = road.groundAbsorption || 0;
    var G;
    if (abs < 0.1)      G = 0;
    else if (abs < 0.4) G = 0.25;
    else if (abs < 0.6) G = 0.5;
    else if (abs < 0.9) G = 0.75;
    else                G = 1;

    var H = road.meanPropHeight_m;
    var d_ground = d_horiz;
    var corr_ground;
    if (H >= (d_ground + 5) / 6) {
      corr_ground = 0;
    } else if (H < 0.75) {
      corr_ground = 5.2 * G * Math.log10(3 / d_ground);
    } else {
      corr_ground = 5.2 * G * Math.log10((6 * H - 1.5) / d_ground);
    }

    // G. Angle of view correction
    var angleOfView = road.angleOfView_deg > 0 ? road.angleOfView_deg : 180;
    var corr_angle = 10 * Math.log10(angleOfView / 180);

    // H. Reflection correction
    var corr_reflection = 1.5 * (road.reflectionAngle_deg || 0) / angleOfView;

    // I. Road surface correction
    var applySurface = overrides.applySurface !== false;
    var corr_surface = applySurface ? (road.surfaceCorrection || 0) : 0;

    // J. Low volume correction (LA10 only)
    var d_prime = Math.sqrt(d_horiz * d_horiz + Math.pow(recv_h - sourceH, 2));
    if (d_prime < 0.1) d_prime = 0.1;
    var D = 30 / d_prime;
    var C = hourlyFlow / 200;
    var corr_lowVol = 0;
    var lowVolWarning = false;
    if (D <= 1 || C >= 1) {
      corr_lowVol = 0;
    } else if (D <= 4 || C >= 0.25) {
      corr_lowVol = -16.6 * Math.log10(D) * Math.pow(Math.log10(C), 2);
    } else {
      corr_lowVol = 0;
      lowVolWarning = true;
    }

    // K. Australian adjustment
    var corr_aust = (period === 'day')
        ? (road.austAdjDay != null ? road.austAdjDay : -1.7)
        : (road.austAdjNight != null ? road.austAdjNight : 0.5);

    // Additional correction (3-source-height sub-sources only)
    var corr_additional = overrides.additionalCorrection || 0;

    // N. CoRTN barrier diffraction (Charts 9/9a)
    var corr_ground_final = corr_ground;
    var corr_barrier = 0;
    var barrierInfo = null;
    if (road && road.barrier && road.barrier.enabled) {
      var barr = cortnCalculateBarrier(road, recv_h);
      barrierInfo = barr;
      if (barr.applied) {
        if (barr.corr_ground_barrier !== null && barr.corr_ground_barrier !== undefined) {
          corr_ground_final = barr.corr_ground_barrier;
        }
        corr_barrier = barr.atten;
      }
    }

    // L. LA10 assembly
    var la10 = L_basic + corr_speed + corr_gradient + corr_distance
             + corr_ground_final + corr_angle + corr_lowVol + corr_reflection
             + corr_surface + corr_aust + corr_additional + corr_barrier;

    // M. LAeq assembly (excludes low-vol, −3 conversion)
    var laeq = L_basic + corr_speed + corr_gradient + corr_distance
             + corr_ground_final + corr_angle + corr_reflection
             + corr_surface + corr_aust + corr_additional + corr_barrier - 3;

    return {
      la10: la10,
      laeq: laeq,
      breakdown: {
        totalFlow:       totalFlow,
        hourlyFlow:      hourlyFlow,
        cvPct:           cvPct,
        L_basic:         L_basic,
        V_adj:           V_adj,
        corr_speed:      corr_speed,
        corr_gradient:   corr_gradient,
        d_horiz:         d_horiz,
        d_slant:         d_slant,
        corr_distance:   corr_distance,
        G_factor:        G,
        corr_ground:     corr_ground,
        corr_ground_final: corr_ground_final,
        corr_angle:      corr_angle,
        corr_reflection: corr_reflection,
        corr_surface:    corr_surface,
        corr_lowVol:     corr_lowVol,
        lowVolWarning:   lowVolWarning,
        corr_aust:       corr_aust,
        corr_additional: corr_additional,
        corr_barrier:    corr_barrier,
        barrier:         barrierInfo
      }
    };
  }

  /* ── Dual-carriageway + 3-source-height wrapper ──────────────────────────── */
  function calcCortnRoadPeriod(road, period) {
    var aadt = Number(road.aadt);
    if (!isFinite(aadt) || aadt <= 0) {
      return { la10: null, laeq: null, contributions: [] };
    }

    var lanes;
    if (road.carriageway === 'dual') {
      var split = (road.trafficSplit != null) ? road.trafficSplit : 0.5;
      var offset = (road.laneOffset_m != null) ? road.laneOffset_m : 7;
      lanes = [
        { flowFrac: split,       distOffset: 0,      label: 'Near lane' },
        { flowFrac: 1 - split,   distOffset: offset, label: 'Far lane'  }
      ];
    } else {
      lanes = [{ flowFrac: 1, distOffset: 0, label: 'One-way' }];
    }

    var rawCvPct = (period === 'day') ? road.cv_pct_day : road.cv_pct_night;
    var contributions = [];

    lanes.forEach(function(lane) {
      if (road.threeSourceHeight) {
        var subs = [
          { name: 'Cars',        flowMul: 1 - rawCvPct / 100, cvPctSpeedCorr: 0,   sourceHeight: 0.5,        applySurface: true,  addCorr: 0     },
          { name: 'CV tyres',    flowMul: rawCvPct / 100,     cvPctSpeedCorr: 100, sourceHeight: 0.5,        applySurface: true,  addCorr: -3    },
          { name: 'CV engines',  flowMul: rawCvPct / 100,     cvPctSpeedCorr: 100, sourceHeight: 0.5 + 1.0,  applySurface: false, addCorr: -3.6  },
          { name: 'CV exhausts', flowMul: rawCvPct / 100,     cvPctSpeedCorr: 100, sourceHeight: 0.5 + 3.1,  applySurface: false, addCorr: -11.6 }
        ];
        subs.forEach(function(src) {
          if (src.flowMul <= 0) return;
          var result = calcCortnFreeField(road, period, {
            flowFrac:             lane.flowFrac * src.flowMul,
            distOffset:           lane.distOffset,
            sourceHeight_m:       src.sourceHeight,
            applySurface:         src.applySurface,
            additionalCorrection: src.addCorr,
            cvPctSpeedCorr:       src.cvPctSpeedCorr
          });
          if (result.la10 != null) {
            result.label = lane.label + ' — ' + src.name;
            contributions.push(result);
          }
        });
      } else {
        var result = calcCortnFreeField(road, period, {
          flowFrac:   lane.flowFrac,
          distOffset: lane.distOffset
        });
        if (result.la10 != null) {
          result.label = lane.label;
          contributions.push(result);
        }
      }
    });

    if (contributions.length === 0) {
      return { la10: null, laeq: null, contributions: [] };
    }

    var la10_sum = contributions.reduce(function(s, c) { return s + Math.pow(10, c.la10 / 10); }, 0);
    var laeq_sum = contributions.reduce(function(s, c) { return s + Math.pow(10, c.laeq / 10); }, 0);
    var la10 = 10 * Math.log10(la10_sum);
    var laeq = 10 * Math.log10(laeq_sum);

    return { la10: la10, laeq: laeq, contributions: contributions };
  }

  /* ── Perpendicular distance from a receiver point to a polyline (metres) ── */
  function cortnDistanceToPolyline(recvLat, recvLng, verts) {
    if (!verts || verts.length < 2) return Infinity;
    var cosPhi = Math.cos(recvLat * Math.PI / 180);
    function toXY(lat, lng) {
      return { x: (lng - recvLng) * cosPhi * 111320, y: (lat - recvLat) * 111320 };
    }
    var P = { x: 0, y: 0 };
    var minDist = Infinity;
    for (var i = 0; i < verts.length - 1; i++) {
      var A = toXY(verts[i][0], verts[i][1]);
      var B = toXY(verts[i + 1][0], verts[i + 1][1]);
      var ABx = B.x - A.x, ABy = B.y - A.y;
      var lenSq = ABx * ABx + ABy * ABy;
      var t = lenSq > 0 ? ((P.x - A.x) * ABx + (P.y - A.y) * ABy) / lenSq : 0;
      if (t < 0) t = 0;
      if (t > 1) t = 1;
      var Qx = A.x + t * ABx, Qy = A.y + t * ABy;
      var dx = Qx - P.x, dy = Qy - P.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  /* ── Angle of view subtended at a receiver by a polyline (degrees) ──────── */
  function cortnAngleOfViewFromReceiver(recvLat, recvLng, verts) {
    if (!verts || verts.length < 2) return 0;
    var first = verts[0];
    var last  = verts[verts.length - 1];
    var cosPhi = Math.cos(recvLat * Math.PI / 180);
    var v1x = (first[1] - recvLng) * cosPhi;
    var v1y =  first[0] - recvLat;
    var v2x = (last[1]  - recvLng) * cosPhi;
    var v2y =  last[0]  - recvLat;
    var dot = v1x * v2x + v1y * v2y;
    var m1 = Math.sqrt(v1x * v1x + v1y * v1y);
    var m2 = Math.sqrt(v2x * v2x + v2y * v2y);
    if (m1 === 0 || m2 === 0) return 0;
    var cosTheta = dot / (m1 * m2);
    if (cosTheta > 1) cosTheta = 1;
    if (cosTheta < -1) cosTheta = -1;
    return Math.acos(cosTheta) * 180 / Math.PI;
  }

  return {
    calcCortnFreeField:             calcCortnFreeField,
    calcCortnRoadPeriod:            calcCortnRoadPeriod,
    cortnCalculateBarrier:          cortnCalculateBarrier,
    cortnDistanceToPolyline:        cortnDistanceToPolyline,
    cortnAngleOfViewFromReceiver:   cortnAngleOfViewFromReceiver
  };
})();

// Support Node.js require() for testing
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = SharedCalc;
  module.exports.SharedCortn = SharedCortn;
}
