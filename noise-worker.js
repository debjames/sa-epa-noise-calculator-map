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
var pointInPolygon       = SharedCalc.pointInPolygon;
var getDominantBarrier   = SharedCalc.getDominantBarrier;
var calcAgrPerBand       = SharedCalc.calcAgrPerBand;
var calcAlphaAtm         = SharedCalc.calcAlphaAtm;
var calcBarrierAttenuation = SharedCalc.calcBarrierAttenuation;
var ISO_FREQS            = SharedCalc.OCT_FREQ;

/* ─── ISO 9613-2 at a grid point ─── */

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
          if (pointInPolygon(pt, buildings[bi].polygon)) {
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
          if (buildings.length > 0) {
            var barrier = getDominantBarrier(srcLL, pt, src.heightM, recvHeight, buildings);
            if (barrier) barrierDelta = barrier.pathLengthDiff;
          }

          var lp;
          if (method === 'iso9613' && src.spectrum) {
            lp = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj, barrierDelta, recvHeight, isoParams);
          } else {
            lp = attenuatePoint(src.combinedLw, dist);
            if (barrierDelta > 0) {
              var avgBarrier = 10 * Math.log10(3 + 20 * barrierDelta / 0.34);
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
