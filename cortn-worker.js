/**
 * cortn-worker.js — Web Worker for CoRTN road-noise contour grid computation.
 *
 * CoRTN (UK DoT 1988 + Australian adjustments) is an empirical broadband
 * road-traffic noise model, completely independent of the ISO 9613-2 pipeline
 * used in noise-worker.js. This worker sweeps the map grid, computes the
 * per-cell perpendicular distance and angle-of-view to every CoRTN road, runs
 * the full SharedCortn correction chain (distance/ground/angle/barrier/...)
 * per road, and energy-sums all road contributions into a broadband LA10/LAeq
 * grid pair.
 *
 * Receives:
 *   { bounds, gridResolutionM, receiverHeight, period, roads, buildings }
 *
 * Posts:
 *   { type: 'progress', percent }
 *   { type: 'complete', gridLa10, gridLaeq, rows, cols, bounds, dLat, dLng, startLat, startLng }
 *   { type: 'error', message }
 *
 * Simplifications (Phase 5):
 *   - Barrier geometry is taken per-road (fixed src→barrier→receiver geometry);
 *     not spatially varying per grid cell. SoundPLAN varies it per cell.
 *   - No terrain profile screening.
 *   - Reflections are forced to zero for grid cells (no facade geometry).
 */

/* eslint-env worker */
importScripts('shared-calc.js');

var calcCortnFreeField           = SharedCortn.calcCortnFreeField;
var calcCortnRoadPeriod          = SharedCortn.calcCortnRoadPeriod;
var cortnDistanceToPolyline      = SharedCortn.cortnDistanceToPolyline;
var cortnAngleOfViewFromReceiver = SharedCortn.cortnAngleOfViewFromReceiver;

self.onmessage = function(e) {
  try {
    var opts = e.data || {};
    var bounds         = opts.bounds;
    var res            = opts.gridResolutionM || 10;
    var receiverHeight = opts.receiverHeight || 1.5;
    var period         = opts.period || 'day';
    var roads          = opts.roads || [];

    // Filter roads with usable traffic + geometry
    var validRoads = roads.filter(function(r) {
      return r && r.vertices && r.vertices.length >= 2 &&
             isFinite(r.aadt) && r.aadt > 0;
    });

    /* ── Grid geometry (mirrors noise-worker.js) ────────────────────── */
    var midLat = (bounds.north + bounds.south) / 2;
    var dLat = res / 111320;
    var dLng = res / (111320 * Math.cos(midLat * Math.PI / 180));

    if (validRoads.length === 0) {
      var _defRows = Math.ceil((bounds.north - bounds.south) / dLat);
      var _defCols = Math.ceil((bounds.east  - bounds.west)  / dLng);
      self.postMessage({
        type: 'complete',
        gridLaeq: [], gridLa10: [],
        rows: _defRows, cols: _defCols,
        bounds: bounds, dLat: dLat, dLng: dLng,
        startLat: bounds.south, startLng: bounds.west
      });
      return;
    }

    // Snap grid origin to the centroid of all road vertices so roads line up
    // with grid nodes (same motivation as the ISO worker's source-centroid snap).
    var _refLat = 0, _refLng = 0, _nPts = 0;
    validRoads.forEach(function(r) {
      r.vertices.forEach(function(v) {
        _refLat += v[0]; _refLng += v[1]; _nPts++;
      });
    });
    _refLat /= _nPts;
    _refLng /= _nPts;

    var _nSouth = Math.ceil((_refLat - bounds.south) / dLat);
    var startLat = _refLat - _nSouth * dLat;
    if (startLat > bounds.south) startLat -= dLat;

    var _nWest = Math.ceil((_refLng - bounds.west) / dLng);
    var startLng = _refLng - _nWest * dLng;
    if (startLng > bounds.west) startLng -= dLng;

    var rows = Math.ceil((bounds.north - startLat) / dLat) + 1;
    var cols = Math.ceil((bounds.east  - startLng) / dLng) + 1;

    // Output grids: one cell per (r, c), row-major
    var gridLaeq = new Float32Array(rows * cols);
    var gridLa10 = new Float32Array(rows * cols);
    for (var _i = 0; _i < rows * cols; _i++) {
      gridLaeq[_i] = NaN;
      gridLa10[_i] = NaN;
    }

    /* ── Progress reporting ─────────────────────────────────────────── */
    var progressStep = Math.max(1, Math.floor(rows / 20));

    /* ── Main sweep ─────────────────────────────────────────────────── */
    for (var r = 0; r < rows; r++) {
      var lat = startLat + r * dLat;

      for (var c = 0; c < cols; c++) {
        var lng = startLng + c * dLng;

        var sumLinLaeq = 0;
        var sumLinLa10 = 0;
        var anyValid = false;

        for (var ri = 0; ri < validRoads.length; ri++) {
          var road = validRoads[ri];

          // Per-cell distance and angle of view to this road
          var perpDist = cortnDistanceToPolyline(lat, lng, road.vertices);
          if (!(perpDist > 0) || !isFinite(perpDist)) continue;

          var angle = cortnAngleOfViewFromReceiver(lat, lng, road.vertices);

          // Build a receiver-specific clone of the road.
          // distFromKerb_m = perpDist - 3.5 so that d_horiz (= distFromKerb_m
          // + 3.5) equals the actual perpendicular distance to the cell.
          // Clamped to 0.5 m so d_horiz ≥ 4.0 m (receiver-at-kerbside floor).
          var distFromKerb = perpDist - 3.5;
          if (distFromKerb < 0.5) distFromKerb = 0.5;

          var clone = {
            id:               road.id,
            aadt:             road.aadt,
            speed_kmh:        road.speed_kmh,
            gradient_pct:     road.gradient_pct,
            cv_pct_day:       road.cv_pct_day,
            cv_pct_night:     road.cv_pct_night,
            distFromKerb_m:   distFromKerb,
            roadHeight_m:     road.roadHeight_m,
            surfaceCorrection:road.surfaceCorrection,
            surfaceType:      road.surfaceType,
            carriageway:      road.carriageway,
            trafficSplit:     road.trafficSplit,
            laneOffset_m:     road.laneOffset_m,
            periodConfig:     road.periodConfig,
            aadtPctDay:       road.aadtPctDay,
            aadtPctNight:     road.aadtPctNight,
            dayHours:         road.dayHours,
            nightHours:       road.nightHours,
            austAdjDay:       road.austAdjDay,
            austAdjNight:     road.austAdjNight,
            threeSourceHeight:road.threeSourceHeight,
            groundAbsorption: road.groundAbsorption,
            meanPropHeight_m: road.meanPropHeight_m,
            angleOfView_deg:  (angle > 0 && isFinite(angle)) ? angle : 180,
            reflectionAngle_deg: 0,                    // no reflections in grid mode
            receiverHeight_m: receiverHeight,
            // Barrier (Phase 5 simplification) — distToBarrier_m, height_m
            // and baseRL_m come from the road's UI config. The helper reads
            // clone.distFromKerb_m for srcToBarrier, so cells closer to the
            // road than distToBarrier_m correctly fall back to "no screening"
            // (helper returns applied:false); cells further away see a
            // geometry-scaled IL. Full per-cell barrier repositioning would
            // require an absolute barrier position — out of scope for Phase 5.
            barrier: road.barrier
              ? {
                  enabled:         !!road.barrier.enabled,
                  height_m:        road.barrier.height_m || 0,
                  baseRL_m:        road.barrier.baseRL_m || 0,
                  distToBarrier_m: road.barrier.distToBarrier_m || 0
                }
              : null
          };

          var result = calcCortnRoadPeriod(clone, period);
          if (!result || result.laeq == null || !isFinite(result.laeq)) continue;

          sumLinLaeq += Math.pow(10, result.laeq / 10);
          sumLinLa10 += Math.pow(10, result.la10 / 10);
          anyValid = true;
        }

        if (anyValid) {
          gridLaeq[r * cols + c] = 10 * Math.log10(sumLinLaeq);
          gridLa10[r * cols + c] = 10 * Math.log10(sumLinLa10);
        }
      }

      if ((r + 1) % progressStep === 0 || r === rows - 1) {
        self.postMessage({
          type: 'progress',
          percent: Math.round(((r + 1) / rows) * 100)
        });
      }
    }

    self.postMessage({
      type: 'complete',
      gridLaeq: gridLaeq,
      gridLa10: gridLa10,
      rows: rows, cols: cols,
      bounds: bounds,
      dLat: dLat, dLng: dLng,
      startLat: startLat, startLng: startLng,
      period: period
    });
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: (err && err.message) ? err.message : String(err)
    });
  }
};
