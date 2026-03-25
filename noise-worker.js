/**
 * noise-worker.js — Web Worker for noise contour grid computation.
 * Runs off the main thread to avoid blocking UI.
 *
 * Receives: { bounds, gridResolutionM, sources, buildings, prefix,
 *             propagationMethod, isoParams }
 * Posts:    { type: 'progress', percent }
 *           { type: 'complete', grid: [{lat,lng,dB}...] }
 *           { type: 'error', message }
 */

/* ─── Load shared ISO 9613-2 functions ─── */
importScripts('noise-calc-core.js');

var calcAgrPerBand = NoiseCalcCore.calcAgrPerBand;
var calcAlphaAtm = NoiseCalcCore.calcAlphaAtm;
var calcBarrierAttenuation = NoiseCalcCore.calcBarrierAttenuation;
var ISO_FREQS = NoiseCalcCore.OCT_FREQ;

/* ─── Inlined acoustic formulas (simple method — no module imports in workers) ─── */

function attenuatePoint(Lw, r) {
  if (r <= 0) r = 0.1;
  return Lw - (20 * Math.log10(r) + 8);
}

function energySum(levels) {
  if (!levels || levels.length === 0) return -Infinity;
  return 10 * Math.log10(
    levels.reduce(function(sum, L) { return sum + Math.pow(10, L / 10); }, 0)
  );
}

function sourceCombinedLw(equipment) {
  if (!equipment || equipment.length === 0) return -Infinity;
  var activeLevels = equipment
    .filter(function(item) { return item.quantity > 0; })
    .map(function(item) { return item.Lw + 10 * Math.log10(item.quantity); });
  if (activeLevels.length === 0) return -Infinity;
  return energySum(activeLevels);
}

/* ─── Geometry (inlined from geometry.js) ─── */

function segmentsIntersect(p1, p2, p3, p4) {
  var x1 = p1.lng, y1 = p1.lat, x2 = p2.lng, y2 = p2.lat;
  var x3 = p3.lng, y3 = p3.lat, x4 = p4.lng, y4 = p4.lat;
  var denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-12) return null;
  var t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  var u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { lat: y1 + t * (y2 - y1), lng: x1 + t * (x2 - x1) };
  }
  return null;
}

function flatDistM(a, b) {
  var dLat = (b.lat - a.lat) * 111320;
  var dLng = (b.lng - a.lng) * 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

function pointInPolygon(point, polygon) {
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

function getDominantBarrier(srcLL, recLL, srcHeightM, recHeightM, buildings) {
  var best = null;
  var bestMidDiff = Infinity;
  var dDirect = flatDistM(srcLL, recLL);
  var midDist = dDirect / 2;

  for (var bi = 0; bi < buildings.length; bi++) {
    var b = buildings[bi];
    var poly = b.polygon;
    for (var i = 0; i < poly.length; i++) {
      var j = (i + 1) % poly.length;
      var p3 = { lat: poly[i][0], lng: poly[i][1] };
      var p4 = { lat: poly[j][0], lng: poly[j][1] };
      var hit = segmentsIntersect(srcLL, recLL, p3, p4);
      if (hit) {
        var distFromSrc = flatDistM(srcLL, hit);
        var diff = Math.abs(distFromSrc - midDist);
        if (diff < bestMidDiff) {
          bestMidDiff = diff;
          best = { building: b, intersection: hit, distFromSrc: distFromSrc };
        }
      }
    }
  }

  if (!best) return null;
  var barrierH = (best.building.heightM != null) ? best.building.heightM : 3.0;
  var d1 = best.distFromSrc;
  var d2 = flatDistM(best.intersection, recLL);
  var delta =
    Math.sqrt(d1 * d1 + (barrierH - srcHeightM) * (barrierH - srcHeightM)) +
    Math.sqrt(d2 * d2 + (barrierH - recHeightM) * (barrierH - recHeightM)) -
    dDirect;
  return { barrierHeightM: barrierH, pathLengthDiff: delta };
}

/* ─── ISO 9613-2 at a grid point (uses shared calcAgrPerBand + calcAlphaAtm) ─── */

function calcISOatPoint(spectrum, srcHeight, distM, adjDB, barrierDelta, recvHeight, isoParams) {
  if (!spectrum || distM <= 0) return NaN;
  var d = Math.max(distM, 1);
  var hS = Math.max(srcHeight, 0.01);
  var hR = recvHeight || 1.5;
  var alpha = calcAlphaAtm(isoParams.temperature || 10, isoParams.humidity || 70);
  var Adiv = 20 * Math.log10(d) + 11;
  var Agr = calcAgrPerBand(hS, hR, d, isoParams.groundFactor || 0.5);
  var Abar = calcBarrierAttenuation(barrierDelta || 0, ISO_FREQS);

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

/* ─── Main grid computation ─── */

self.onmessage = function(e) {
  try {
    var opts = e.data;
    var bounds = opts.bounds;
    var res = opts.gridResolutionM || 10;
    var sources = opts.sources || [];
    var buildings = opts.buildings || [];
    var method = opts.propagationMethod || 'simple';
    var isoParams = opts.isoParams || {};
    var recvHeight = isoParams.receiverHeight || 1.5;

    // Convert resolution to degrees
    var midLat = (bounds.north + bounds.south) / 2;
    var dLat = res / 111320;
    var dLng = res / (111320 * Math.cos(midLat * Math.PI / 180));

    var rows = Math.ceil((bounds.north - bounds.south) / dLat);
    var cols = Math.ceil((bounds.east - bounds.west) / dLng);
    var totalCells = rows * cols;

    // Filter sources with position and equipment
    var validSources = sources.filter(function(s) {
      return s.lat !== null && s.lng !== null && s.equipment && s.equipment.length > 0;
    });

    if (validSources.length === 0) {
      self.postMessage({ type: 'complete', grid: [], rows: rows, cols: cols });
      return;
    }

    // Pre-compute combined Lw for each source
    var srcData = validSources.map(function(s) {
      return {
        lat: s.lat, lng: s.lng,
        heightM: s.heightM || 1.5,
        combinedLw: sourceCombinedLw(s.equipment),
        equipment: s.equipment,
        spectrum: s.spectrum || null,
        spectrumAdj: s.spectrumAdj || 0
      };
    });

    var grid = [];
    var lastProgress = 0;

    for (var r = 0; r < rows; r++) {
      var lat = bounds.south + (r + 0.5) * dLat;
      for (var c = 0; c < cols; c++) {
        var lng = bounds.west + (c + 0.5) * dLng;
        var pt = { lat: lat, lng: lng };

        // Skip points inside buildings
        var insideBuilding = false;
        for (var bi = 0; bi < buildings.length; bi++) {
          if (pointInPolygon(pt, buildings[bi].polygon)) {
            insideBuilding = true;
            break;
          }
        }
        if (insideBuilding) {
          grid.push(NaN);
          continue;
        }

        // Compute total dB at this point from all sources
        var contributions = [];
        for (var si = 0; si < srcData.length; si++) {
          var src = srcData[si];
          var srcLL = { lat: src.lat, lng: src.lng };
          var dist = flatDistM(srcLL, pt);
          if (dist < 0.1) dist = 0.1;

          // Barrier check
          var barrierDelta = 0;
          if (buildings.length > 0) {
            var barrier = getDominantBarrier(srcLL, pt, src.heightM, recvHeight, buildings);
            if (barrier) barrierDelta = barrier.pathLengthDiff;
          }

          var lp;
          if (method === 'iso9613' && src.spectrum) {
            lp = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj, barrierDelta, recvHeight, isoParams);
          } else {
            lp = attenuatePoint(src.combinedLw, dist);
            // Apply barrier as simple A-weighted reduction (approx)
            if (barrierDelta > 0) {
              var avgBarrier = 10 * Math.log10(3 + 20 * barrierDelta / 0.34); // ~1kHz
              lp -= Math.min(avgBarrier, 20);
            }
          }

          if (isFinite(lp)) contributions.push(lp);
        }

        if (contributions.length === 0) {
          grid.push(NaN);
        } else {
          grid.push(energySum(contributions));
        }
      }

      // Progress update every ~5%
      var pct = Math.round((r + 1) / rows * 100);
      if (pct - lastProgress >= 5) {
        self.postMessage({ type: 'progress', percent: pct });
        lastProgress = pct;
      }
    }

    self.postMessage({
      type: 'complete',
      grid: grid,
      rows: rows,
      cols: cols,
      bounds: bounds,
      dLat: dLat,
      dLng: dLng
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
