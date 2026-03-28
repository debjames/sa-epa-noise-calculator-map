/**
 * noise-worker.js — Web Worker for noise contour grid computation.
 * All acoustic, geometry, and ISO functions loaded from shared-calc.js.
 *
 * Receives: { bounds, gridResolutionM, sources, buildings, prefix,
 *             propagationMethod, isoParams }
 * Posts:    { type: 'progress', percent }
 *           { type: 'complete', grid: [...] }
 *           { type: 'error', message }
 */

/* ─── Load all shared functions ─── */
importScripts('shared-calc.js');

var attenuatePoint       = SharedCalc.attenuatePoint;
var energySum            = SharedCalc.energySum;
var sourceCombinedLw     = SharedCalc.sourceCombinedLw;
var flatDistM            = SharedCalc.flatDistM;
var pointInPolygonLatLng = SharedCalc.pointInPolygonLatLng;
var getDominantBarrier   = SharedCalc.getDominantBarrier;
var calcAgrPerBand       = SharedCalc.calcAgrPerBand;
var calcAlphaAtm         = SharedCalc.calcAlphaAtm;
var calcBarrierAttenuation = SharedCalc.calcBarrierAttenuation;
var calcBarrierWithEndDiffraction = SharedCalc.calcBarrierWithEndDiffraction;
var calcISOatPoint        = SharedCalc.calcISOatPoint;
var ISO_FREQS            = SharedCalc.OCT_FREQ;

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
    var demTile = opts.demTile || null;
    var terrainEnabled = !!opts.terrainEnabled;
    var debugTerrain = !!opts.debugTerrain;

    if (debugTerrain) {
      if (terrainEnabled && demTile) {
        console.log('[noise-worker] Terrain screening ON — DEM tile received:', demTile.rows, '×', demTile.cols,
          'points | sample elev[0]:', demTile.elevations[0]);
      } else if (terrainEnabled && !demTile) {
        console.warn('[noise-worker] Terrain screening ON but demTile is null — no terrain IL will be applied.');
      } else {
        console.log('[noise-worker] Terrain screening OFF.');
      }
    }

    // DEM tile lookup: nearest-neighbour elevation from pre-fetched grid
    function demElevAt(lat, lng) {
      if (!demTile) return null;
      // Find nearest row/col
      var ri = 0, bestLatDiff = Infinity;
      for (var i = 0; i < demTile.rows; i++) {
        var d = Math.abs(demTile.lats[i] - lat);
        if (d < bestLatDiff) { bestLatDiff = d; ri = i; }
      }
      var ci = 0, bestLngDiff = Infinity;
      for (var j = 0; j < demTile.cols; j++) {
        var d2 = Math.abs(demTile.lngs[j] - lng);
        if (d2 < bestLngDiff) { bestLngDiff = d2; ci = j; }
      }
      var val = demTile.elevations[ri * demTile.cols + ci];
      return (val !== null && val !== undefined) ? val : null;
    }

    // Terrain diffraction: check if ridgeline obstructs source→receiver ray
    // Returns { delta, perBand: number[8], broadband: number } or null
    // Only called when terrainEnabled=true and demTile is non-null.
    function terrainILForRay(srcLL, srcH, recLL, recH) {
      if (!demTile) return null;
      var srcElev = demElevAt(srcLL.lat, srcLL.lng);
      var recElev = demElevAt(recLL.lat, recLL.lng);
      if (srcElev === null || recElev === null) {
        if (debugTerrain) console.log('[noise-worker] terrainILForRay: null elevation at src or recv — skipping');
        return null;
      }

      var srcTip = srcElev + srcH;
      var recTip = recElev + recH;
      var totalDist = flatDistM(srcLL, recLL);
      if (totalDist < 1) return null;

      var bestProtrusion = 0;
      var bestD1 = 0, bestD2 = 0;
      var N_SAMPLES = 20;
      for (var i = 1; i < N_SAMPLES; i++) {
        var t = i / N_SAMPLES;
        var sLat = srcLL.lat + t * (recLL.lat - srcLL.lat);
        var sLng = srcLL.lng + t * (recLL.lng - srcLL.lng);
        var elev = demElevAt(sLat, sLng);
        if (elev === null) continue;
        var losElev = srcTip + t * (recTip - srcTip);
        var protrusion = elev - losElev;
        if (protrusion > bestProtrusion) {
          bestProtrusion = protrusion;
          bestD1 = t * totalDist;
          bestD2 = (1 - t) * totalDist;
        }
      }

      if (bestProtrusion <= 0) return null;

      // Fresnel zone delta (same as building barriers)
      var d1_3d = Math.sqrt(bestD1 * bestD1 + bestProtrusion * bestProtrusion);
      var d2_3d = Math.sqrt(bestD2 * bestD2 + bestProtrusion * bestProtrusion);
      var delta = (d1_3d + d2_3d > 0) ? 2 * bestProtrusion * bestProtrusion / (d1_3d + d2_3d) : 0;
      if (delta <= 0) return null;

      // Per-band Maekawa IL using SharedCalc (same formula as building barriers)
      var perBand = calcBarrierAttenuation(delta, ISO_FREQS, true);
      if (debugTerrain) {
        console.log('[noise-worker] Terrain obstruction detected: protrusion=' + bestProtrusion.toFixed(1) +
          'm, delta=' + delta.toFixed(3) + 'm, IL@1kHz=' + perBand[4].toFixed(1) + 'dB');
      }
      return { delta: delta, perBand: perBand, broadband: perBand[4] }; // [4] = 1kHz
    }

    var midLat = (bounds.north + bounds.south) / 2;
    var dLat = res / 111320;
    var dLng = res / (111320 * Math.cos(midLat * Math.PI / 180));

    var rows = Math.ceil((bounds.north - bounds.south) / dLat);
    var cols = Math.ceil((bounds.east - bounds.west) / dLng);

    var validSources = sources.filter(function(s) {
      return s.lat !== null && s.lng !== null && s.equipment && s.equipment.length > 0;
    });

    if (validSources.length === 0) {
      self.postMessage({ type: 'complete', grid: [], rows: rows, cols: cols });
      return;
    }

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

        var insideBuilding = false;
        for (var bi = 0; bi < buildings.length; bi++) {
          if (buildings[bi].isBarrier) continue; // barriers are polylines, not closed polygons
          if (pointInPolygonLatLng(pt, buildings[bi].polygon)) {
            insideBuilding = true;
            break;
          }
        }
        if (insideBuilding) {
          grid.push(NaN);
          continue;
        }

        var contributions = [];
        for (var si = 0; si < srcData.length; si++) {
          var src = srcData[si];
          var srcLL = { lat: src.lat, lng: src.lng };
          var dist = flatDistM(srcLL, pt);
          if (dist < 0.1) dist = 0.1;

          var barrierDelta = 0;
          var endDeltaLeft = 0;
          var endDeltaRight = 0;
          if (buildings.length > 0) {
            var barrier = getDominantBarrier(srcLL, pt, src.heightM, recvHeight, buildings);
            if (barrier) {
              barrierDelta = barrier.pathLengthDiff;
              endDeltaLeft = barrier.endDeltaLeft || 0;
              endDeltaRight = barrier.endDeltaRight || 0;
            }
          }

          // Compute building barrier IL (broadband at 1kHz for simple method)
          var buildingIL_broadband = 0;
          if (barrierDelta > 0 || endDeltaLeft > 0 || endDeltaRight > 0) {
            var Abar_bb = calcBarrierWithEndDiffraction(barrierDelta, endDeltaLeft, endDeltaRight, [1000]);
            buildingIL_broadband = Math.min(Abar_bb[0], 20);
          }

          // Compute terrain IL (per-band) — only when terrain screening is enabled and DEM data available
          var terrResult = (terrainEnabled && demTile) ? terrainILForRay(srcLL, src.heightM, pt, recvHeight) : null;
          var terrIL_broadband = terrResult ? terrResult.broadband : 0;

          var lp;
          if (method === 'iso9613' && src.spectrum) {
            // ISO: apply per-band terrain IL where it exceeds building barrier
            // Building barrier is already applied per-band inside calcISOatPoint
            lp = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj, barrierDelta, recvHeight, isoParams, endDeltaLeft, endDeltaRight);
            if (terrResult && terrIL_broadband > buildingIL_broadband && isFinite(lp)) {
              // Terrain exceeds building — apply the per-band excess
              var bldgPerBand = (barrierDelta > 0 || endDeltaLeft > 0 || endDeltaRight > 0)
                ? calcBarrierWithEndDiffraction(barrierDelta, endDeltaLeft, endDeltaRight, ISO_FREQS)
                : ISO_FREQS.map(function() { return 0; });
              // Recompute with terrain IL replacing building IL where terrain is larger
              var terrPerBand = terrResult.perBand;
              var excessSum = 0;
              for (var bi = 0; bi < 8; bi++) {
                var excess = Math.max(0, terrPerBand[bi] - bldgPerBand[bi]);
                excessSum += excess;
              }
              // Apply average per-band excess as broadband adjustment
              if (excessSum > 0) lp -= (excessSum / 8);
            }
          } else {
            // Simple method: apply max(building, terrain) broadband
            var effectiveIL = Math.max(buildingIL_broadband, terrIL_broadband);
            lp = attenuatePoint(src.combinedLw, dist);
            lp -= effectiveIL;
          }

          if (isFinite(lp)) contributions.push(lp);
        }

        if (contributions.length === 0) {
          grid.push(NaN);
        } else {
          grid.push(energySum(contributions));
        }
      }

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
