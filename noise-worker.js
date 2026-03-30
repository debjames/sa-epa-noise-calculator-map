/**
 * noise-worker.js — Web Worker for noise contour grid computation.
 * All acoustic, geometry, and ISO functions loaded from shared-calc.js.
 *
 * Receives: { bounds, gridResolutionM, sources, buildings, prefix,
 *             propagationMethod, isoParams,
 *             demCache: [{lat, lng, elev}], demSpacing: number,
 *             terrainEnabled: bool, debugTerrain: bool }
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
    var demCache = opts.demCache || null;   // flat [{lat, lng, elev}] from main thread
    var terrainEnabled = !!opts.terrainEnabled;
    var debugTerrain = !!opts.debugTerrain;
    var period = opts.period || 'day';     // 'day'|'eve'|'night'|'lmax'
    var lmaxMethod = opts.lmaxMethod || 'simple'; // 'simple'|'iso9613_g0'|'iso9613_g_sel'
    var isLmaxSimple = (period === 'lmax') && (lmaxMethod === 'simple');

    if (debugTerrain) {
      if (terrainEnabled && demCache && demCache.length > 0) {
        console.log('[noise-worker] Terrain screening ON — DEM cache received:', demCache.length,
          'points | sample elev[0]:', demCache[0].elev);
      } else if (terrainEnabled && (!demCache || demCache.length === 0)) {
        console.warn('[noise-worker] Terrain screening ON but demCache is empty — no terrain IL will be applied.');
      } else {
        console.log('[noise-worker] Terrain screening OFF.');
      }
    }

    /* ── Build structured DEM grid for bilinear interpolation ── */
    // Extract unique sorted lat/lng axes from the flat cache array.
    // Points were fetched on a regular grid so this reconstructs that structure,
    // handling any gaps where the API returned null (those were not pushed to demCache).
    var _cacheLats = [];  // sorted unique lat values
    var _cacheLngs = [];  // sorted unique lng values
    var _cacheElev = [];  // 2D: _cacheElev[latIdx][lngIdx], undefined where data is missing

    if (demCache && demCache.length > 0) {
      var _latSet = Object.create(null), _lngSet = Object.create(null);
      for (var _i = 0; _i < demCache.length; _i++) {
        _latSet[demCache[_i].lat] = true;
        _lngSet[demCache[_i].lng] = true;
      }
      _cacheLats = Object.keys(_latSet).map(Number).sort(function(a, b) { return a - b; });
      _cacheLngs = Object.keys(_lngSet).map(Number).sort(function(a, b) { return a - b; });

      // Reverse index: value → array index (used when filling elevGrid)
      var _latToIdx = Object.create(null), _lngToIdx = Object.create(null);
      for (var _ii = 0; _ii < _cacheLats.length; _ii++) _latToIdx[_cacheLats[_ii]] = _ii;
      for (var _jj = 0; _jj < _cacheLngs.length; _jj++) _lngToIdx[_cacheLngs[_jj]] = _jj;

      // Allocate 2D elevation array (undefined = missing/null from API)
      for (var _ri = 0; _ri < _cacheLats.length; _ri++) {
        _cacheElev.push(new Array(_cacheLngs.length));
      }
      for (var _k = 0; _k < demCache.length; _k++) {
        var _ri2 = _latToIdx[demCache[_k].lat];
        var _ci2 = _lngToIdx[demCache[_k].lng];
        if (_ri2 !== undefined && _ci2 !== undefined) {
          _cacheElev[_ri2][_ci2] = demCache[_k].elev;
        }
      }
    }

    /* ── Binary bracket search ──
     * Returns the index lo such that arr[lo] <= val <= arr[lo+1].
     * Returns -1 if val is outside [arr[0], arr[last]].
     */
    function bracketIdx(arr, val) {
      if (arr.length < 2 || val < arr[0] || val > arr[arr.length - 1]) return -1;
      var lo = 0, hi = arr.length - 2;
      while (lo < hi) {
        var mid = (lo + hi + 1) >> 1;
        if (arr[mid] <= val) lo = mid; else hi = mid - 1;
      }
      return lo;
    }

    /* ── Nearest-neighbour fallback (no snap threshold) ──
     * Always returns the closest cached elevation regardless of distance.
     * Used when the query is outside the DEM extent or too few bilinear
     * corners are available. No snap threshold ensures points outside the
     * DEM extent receive the nearest edge elevation rather than null,
     * eliminating any hard rectangular clip at the cache boundary.
     */
    function nearestElev(lat, lng) {
      if (!demCache || demCache.length === 0) return null;
      var bestDsq = Infinity, bestElev = null;
      for (var _ni = 0; _ni < demCache.length; _ni++) {
        var dlat = demCache[_ni].lat - lat;
        var dlng = demCache[_ni].lng - lng;
        var dsq = dlat * dlat + dlng * dlng;
        if (dsq < bestDsq) { bestDsq = dsq; bestElev = demCache[_ni].elev; }
      }
      return bestElev;
    }

    /* ── Bilinear elevation lookup ──
     * Finds the four surrounding DEM grid points bracketing (lat, lng) and
     * bilinearly interpolates. Falls back to nearest-neighbour when:
     *   - the query is outside the DEM cache extent
     *   - fewer than 3 of the 4 corners have valid elevations
     * This produces smooth elevation gradients between DEM sample points,
     * eliminating the stepped artefacts from nearest-neighbour transitions.
     */
    function lookupElev(lat, lng) {
      if (!demCache || demCache.length === 0) return null;

      var i0 = bracketIdx(_cacheLats, lat);
      var j0 = bracketIdx(_cacheLngs, lng);

      // Outside DEM extent → nearest-neighbour extends coverage to grid edges
      if (i0 < 0 || j0 < 0) return nearestElev(lat, lng);

      var i1 = i0 + 1, j1 = j0 + 1;
      var e00 = _cacheElev[i0][j0]; // SW corner
      var e01 = _cacheElev[i0][j1]; // SE corner
      var e10 = _cacheElev[i1][j0]; // NW corner
      var e11 = _cacheElev[i1][j1]; // NE corner

      // Count valid corners
      var validVals = [];
      if (e00 !== undefined) validVals.push(e00);
      if (e01 !== undefined) validVals.push(e01);
      if (e10 !== undefined) validVals.push(e10);
      if (e11 !== undefined) validVals.push(e11);

      if (validVals.length === 0) return nearestElev(lat, lng);
      if (validVals.length < 3) return nearestElev(lat, lng);

      // Fill any single missing corner with the mean of the other three
      var mean = 0;
      for (var _vi = 0; _vi < validVals.length; _vi++) mean += validVals[_vi];
      mean /= validVals.length;
      if (e00 === undefined) e00 = mean;
      if (e01 === undefined) e01 = mean;
      if (e10 === undefined) e10 = mean;
      if (e11 === undefined) e11 = mean;

      // Fractional position within the quad
      var tLat = (lat - _cacheLats[i0]) / (_cacheLats[i1] - _cacheLats[i0]);
      var tLng = (lng - _cacheLngs[j0]) / (_cacheLngs[j1] - _cacheLngs[j0]);

      // Bilinear: interpolate along south edge, north edge, then between them
      var e_s = e00 * (1 - tLng) + e01 * tLng;
      var e_n = e10 * (1 - tLng) + e11 * tLng;
      return e_s * (1 - tLat) + e_n * tLat;
    }

    /* ── Terrain diffraction IL for a single source→receiver ray ──
     * Samples 20 points along the ray, finds maximum protrusion above the
     * line-of-sight, computes Fresnel δ and per-band Maekawa IL.
     * Returns broadband IL in dB (≥ 0), or 0 if no obstruction or no data.
     * Always returns a number (never null) so callers can safely write to
     * the terrain IL pre-pass grid without special-casing missing data.
     */
    function terrainILBroadband(srcLL, srcH, recLL, recH) {
      if (!demCache || demCache.length === 0) return 0;

      var srcElev = lookupElev(srcLL.lat, srcLL.lng);
      var recElev = lookupElev(recLL.lat, recLL.lng);
      // If elevation is unavailable, treat as flat — 0 dB terrain IL, render normally
      if (srcElev === null || recElev === null) return 0;

      var srcTip = srcElev + srcH;
      var recTip = recElev + recH;
      var totalDist = flatDistM(srcLL, recLL);
      if (totalDist < 1) return 0;

      var bestProtrusion = 0;
      var bestD1 = 0, bestD2 = 0;
      var N_SAMPLES = 20;
      for (var _si2 = 1; _si2 < N_SAMPLES; _si2++) {
        var t = _si2 / N_SAMPLES;
        var sLat = srcLL.lat + t * (recLL.lat - srcLL.lat);
        var sLng = srcLL.lng + t * (recLL.lng - srcLL.lng);
        var elev = lookupElev(sLat, sLng);
        if (elev === null) continue;
        var losElev = srcTip + t * (recTip - srcTip);
        var protrusion = elev - losElev;
        if (protrusion > bestProtrusion) {
          bestProtrusion = protrusion;
          bestD1 = t * totalDist;
          bestD2 = (1 - t) * totalDist;
        }
      }

      if (bestProtrusion <= 0) return 0;

      // Fresnel path-length difference
      var d1_3d = Math.sqrt(bestD1 * bestD1 + bestProtrusion * bestProtrusion);
      var d2_3d = Math.sqrt(bestD2 * bestD2 + bestProtrusion * bestProtrusion);
      var delta = (d1_3d + d2_3d > 0) ? 2 * bestProtrusion * bestProtrusion / (d1_3d + d2_3d) : 0;
      if (delta <= 0) return 0;

      // Per-band Maekawa IL; return broadband at 1 kHz
      var perBand = calcBarrierAttenuation(delta, ISO_FREQS, true);
      var broadband = Math.max(0, perBand[4]); // [4] = 1 kHz
      if (debugTerrain && broadband > 0) {
        console.log('[noise-worker] Terrain obstruction: protrusion=' + bestProtrusion.toFixed(1) +
          'm, delta=' + delta.toFixed(3) + 'm, IL@1kHz=' + broadband.toFixed(1) + 'dB');
      }
      return broadband;
    }

    /* ── Grid geometry ── */
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

    /* ── Pre-compute and Gaussian-smooth terrain IL grids ──
     *
     * Issue 1 fix (rectangular clip): terrain IL is computed for EVERY grid
     * cell and stored as an explicit 0 where DEM data is absent. The main
     * loop then uses a simple table lookup — no path can skip rendering a
     * cell due to missing terrain data.
     *
     * Issue 2 fix (radial spikes): a separable Gaussian kernel (radius 2,
     * σ = 1.0 grid cells) is applied to the raw terrain IL grid for each
     * source before the main propagation loop. This smooths the abrupt
     * 0↔IL transitions at DEM cell boundaries near the source while
     * preserving the large-scale acoustic shadow shapes.
     *
     * Only the terrain IL contribution is smoothed — the base propagation
     * levels (distance attenuation, barriers) are computed exactly per cell.
     */
    var terrainSmoothed = null; // terrainSmoothed[si] = Float32Array(rows * cols), 0-based

    if (terrainEnabled && demCache && demCache.length > 0) {
      // Build separable Gaussian kernel: radius=2, σ=1.0, kernel size=5
      var _KR = 2, _SIGMA = 1.0, _KS = 5;
      var _kernel = new Float32Array(_KS);
      var _ksum = 0;
      for (var _ki = 0; _ki < _KS; _ki++) {
        var _kx = _ki - _KR;
        _kernel[_ki] = Math.exp(-(_kx * _kx) / (2 * _SIGMA * _SIGMA));
        _ksum += _kernel[_ki];
      }
      for (var _ki2 = 0; _ki2 < _KS; _ki2++) _kernel[_ki2] /= _ksum;

      terrainSmoothed = [];

      for (var _psi = 0; _psi < srcData.length; _psi++) {
        var _psrc = srcData[_psi];
        var _psrcLL = { lat: _psrc.lat, lng: _psrc.lng };

        // Step 1: raw terrain IL for every grid cell (0 where no data or no obstruction)
        var _ilRaw = new Float32Array(rows * cols);
        for (var _pr = 0; _pr < rows; _pr++) {
          var _plat = bounds.south + (_pr + 0.5) * dLat;
          for (var _pc = 0; _pc < cols; _pc++) {
            var _plng = bounds.west + (_pc + 0.5) * dLng;
            var _ppt = { lat: _plat, lng: _plng };
            _ilRaw[_pr * cols + _pc] = terrainILBroadband(_psrcLL, _psrc.heightM, _ppt, recvHeight);
          }
        }

        // Step 2: separable Gaussian smooth — horizontal pass into temp
        var _temp = new Float32Array(rows * cols);
        for (var _hr = 0; _hr < rows; _hr++) {
          for (var _hc = 0; _hc < cols; _hc++) {
            var _hval = 0;
            for (var _hki = 0; _hki < _KS; _hki++) {
              var _hcc = Math.max(0, Math.min(cols - 1, _hc + _hki - _KR));
              _hval += _ilRaw[_hr * cols + _hcc] * _kernel[_hki];
            }
            _temp[_hr * cols + _hc] = _hval;
          }
        }

        // Step 3: vertical pass from temp into smoothed output
        var _ilSmooth = new Float32Array(rows * cols);
        for (var _vr = 0; _vr < rows; _vr++) {
          for (var _vc = 0; _vc < cols; _vc++) {
            var _vval = 0;
            for (var _vki = 0; _vki < _KS; _vki++) {
              var _vrr = Math.max(0, Math.min(rows - 1, _vr + _vki - _KR));
              _vval += _temp[_vrr * cols + _vc] * _kernel[_vki];
            }
            _ilSmooth[_vr * cols + _vc] = _vval;
          }
        }

        terrainSmoothed.push(_ilSmooth);
      }
    }

    /* ── Main propagation loop ── */
    var grid = [];
    var lastProgress = 0;

    for (var r = 0; r < rows; r++) {
      var lat = bounds.south + (r + 0.5) * dLat;
      for (var c = 0; c < cols; c++) {
        var lng = bounds.west + (c + 0.5) * dLng;
        var pt = { lat: lat, lng: lng };

        var insideBuilding = false;
        for (var bi = 0; bi < buildings.length; bi++) {
          if (buildings[bi].isBarrier) continue;
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

          // Building / structural barrier IL — applied for all periods including simple Lmax
          var barrierDelta = 0, endDeltaLeft = 0, endDeltaRight = 0;
          if (buildings.length > 0) {
            var barrier = getDominantBarrier(srcLL, pt, src.heightM, recvHeight, buildings);
            if (barrier) {
              barrierDelta = barrier.pathLengthDiff;
              endDeltaLeft = barrier.endDeltaLeft || 0;
              endDeltaRight = barrier.endDeltaRight || 0;
            }
          }

          var buildingIL_broadband = 0;
          if (barrierDelta > 0 || endDeltaLeft > 0 || endDeltaRight > 0) {
            var Abar_bb = calcBarrierWithEndDiffraction(barrierDelta, endDeltaLeft, endDeltaRight, [1000]);
            buildingIL_broadband = Math.min(Abar_bb[0], 20);
          }

          // Smoothed terrain IL from pre-computed grid — applied for all periods including simple Lmax
          var terrIL = terrainSmoothed ? (terrainSmoothed[si][r * cols + c] || 0) : 0;

          var lp;
          if (isLmaxSimple) {
            // Lmax simple: 1/r² propagation + barrier + terrain; no A_gr or A_atm
            var effectiveIL_simple = Math.max(buildingIL_broadband, terrIL);
            lp = attenuatePoint(src.combinedLw, dist) - effectiveIL_simple;
          } else if (period === 'lmax' && src.spectrum) {
            // Lmax ISO: full ISO 9613-2 with optional groundFactor override
            var isoParamsLmax = {
              receiverHeight: recvHeight,
              groundFactor: (lmaxMethod === 'iso9613_g0') ? 0 : (isoParams.groundFactor || 0.5),
              temperature: isoParams.temperature || 10,
              humidity: isoParams.humidity || 70
            };
            lp = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
              barrierDelta, recvHeight, isoParamsLmax, endDeltaLeft, endDeltaRight);
            if (terrIL > buildingIL_broadband && isFinite(lp)) {
              lp -= (terrIL - buildingIL_broadband);
            }
          } else if (period === 'lmax') {
            // Lmax ISO but no spectrum: simple propagation + any computed barriers/terrain
            var effectiveIL_lmax = Math.max(buildingIL_broadband, terrIL);
            lp = attenuatePoint(src.combinedLw, dist) - effectiveIL_lmax;
          } else if (method === 'iso9613' && src.spectrum) {
            // ISO: compute propagation level, then apply terrain excess over building IL
            lp = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
              barrierDelta, recvHeight, isoParams, endDeltaLeft, endDeltaRight);
            // Apply smoothed terrain IL where it exceeds the already-applied building IL
            if (terrIL > buildingIL_broadband && isFinite(lp)) {
              lp -= (terrIL - buildingIL_broadband);
            }
          } else {
            // Simple: max of building IL and terrain IL
            var effectiveIL = Math.max(buildingIL_broadband, terrIL);
            lp = attenuatePoint(src.combinedLw, dist) - effectiveIL;
          }

          if (isFinite(lp)) contributions.push(lp);
        }

        grid.push(contributions.length > 0 ? energySum(contributions) : NaN);
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
