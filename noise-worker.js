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
var getDominantReflection = SharedCalc.getDominantReflection;
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
    var reflectionsEnabled = !!opts.reflectionsEnabled;
    var groundZones = opts.groundZones || []; // [{g, vertices:[[lat,lng],...]}]

    /* ── Ground zone geometry helpers (mirror of index.html) ── */
    function _wkPointInPoly(lat, lng, verts) {
      var inside = false, n = verts.length;
      for (var i = 0, j = n - 1; i < n; j = i++) {
        var yi = verts[i][0], xi = verts[i][1];
        var yj = verts[j][0], xj = verts[j][1];
        if ((yi > lat) !== (yj > lat) &&
            lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    function _wkSegCrossTs(lat0, lng0, lat1, lng1, verts) {
      var ts = [], n = verts.length;
      var dx = lat1 - lat0, dy = lng1 - lng0;
      for (var i = 0, j = n - 1; i < n; j = i++) {
        var ax = verts[j][0], ay = verts[j][1];
        var bx = verts[i][0], by = verts[i][1];
        var ex = bx - ax, ey = by - ay;
        var denom = dx * ey - dy * ex;
        if (Math.abs(denom) < 1e-15) continue;
        var t = ((ax - lat0) * ey - (ay - lng0) * ex) / denom;
        var s = ((ax - lat0) * dy - (ay - lng0) * dx) / denom;
        if (t > 1e-10 && t < 1 - 1e-10 && s >= 0 && s <= 1) ts.push(t);
      }
      ts.sort(function(a, b) { return a - b; });
      return ts;
    }
    function _wkWeightedG(lat0, lng0, lat1, lng1, t0, t1, defaultG) {
      if (!groundZones.length || t1 <= t0) return defaultG;
      var allTs = [t0, t1];
      for (var zi = 0; zi < groundZones.length; zi++) {
        var cts = _wkSegCrossTs(lat0, lng0, lat1, lng1, groundZones[zi].vertices);
        for (var ci = 0; ci < cts.length; ci++) {
          var ct = cts[ci];
          if (ct > t0 && ct < t1) allTs.push(ct);
        }
      }
      allTs.sort(function(a, b) { return a - b; });
      var totalLen = 0, wG = 0;
      for (var k = 0; k < allTs.length - 1; k++) {
        var ta = allTs[k], tb = allTs[k + 1];
        if (tb <= ta) continue;
        var segLen = tb - ta;
        var midT = (ta + tb) / 2;
        var mLat = lat0 + midT * (lat1 - lat0);
        var mLng = lng0 + midT * (lng1 - lng0);
        var g = defaultG;
        for (var z = 0; z < groundZones.length; z++) {
          if (_wkPointInPoly(mLat, mLng, groundZones[z].vertices)) { g = groundZones[z].g; break; }
        }
        totalLen += segLen; wG += segLen * g;
      }
      return totalLen > 0 ? wG / totalLen : defaultG;
    }
    function _wkPathG(srcLat, srcLng, recLat, recLng, srcH, recH, distM) {
      if (!groundZones.length) return isoParams.groundFactor || 0.5;
      var dp = distM, dG = isoParams.groundFactor || 0.5;
      var t_sEnd   = Math.max(0, Math.min(1, Math.min(30 * srcH, dp / 2) / dp));
      var t_rStart = Math.max(0, Math.min(1, Math.max(dp - 30 * recH, dp / 2) / dp));
      return {
        Gs: _wkWeightedG(srcLat, srcLng, recLat, recLng, 0,        t_sEnd,   dG),
        Gm: _wkWeightedG(srcLat, srcLng, recLat, recLng, t_sEnd,   t_rStart, dG),
        Gr: _wkWeightedG(srcLat, srcLng, recLat, recLng, t_rStart, 1,        dG)
      };
    }

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

    var validSources = sources.filter(function(s) {
      return s.lat !== null && s.lng !== null && s.equipment && s.equipment.length > 0;
    });

    if (validSources.length === 0) {
      var _defRows = Math.ceil((bounds.north - bounds.south) / dLat);
      var _defCols = Math.ceil((bounds.east - bounds.west) / dLng);
      self.postMessage({ type: 'complete', grid: [], rows: _defRows, cols: _defCols });
      return;
    }

    // Snap grid origin so source positions fall exactly on grid nodes.
    // For a single source this is exact; for multiple sources we snap to the
    // centroid to minimise the maximum offset to any individual source.
    var _refLat = 0, _refLng = 0;
    validSources.forEach(function(s) { _refLat += s.lat; _refLng += s.lng; });
    _refLat /= validSources.length;
    _refLng /= validSources.length;

    // startLat: largest value ≤ bounds.south such that _refLat is an exact
    // integer multiple of dLat away from startLat.
    var _nSouth = Math.ceil((_refLat - bounds.south) / dLat);
    var startLat = _refLat - _nSouth * dLat;
    if (startLat > bounds.south) startLat -= dLat; // floating-point safety

    var _nWest = Math.ceil((_refLng - bounds.west) / dLng);
    var startLng = _refLng - _nWest * dLng;
    if (startLng > bounds.west) startLng -= dLng; // floating-point safety

    // Rows/cols must cover the full map bounds from the snapped origin.
    var rows = Math.ceil((bounds.north - startLat) / dLat) + 1;
    var cols = Math.ceil((bounds.east - startLng) / dLng) + 1;

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
          var _plat = startLat + _pr * dLat;
          for (var _pc = 0; _pc < cols; _pc++) {
            var _plng = startLng + _pc * dLng;
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
      var lat = startLat + r * dLat;
      for (var c = 0; c < cols; c++) {
        var lng = startLng + c * dLng;
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
          var _barrierW = null;
          if (buildings.length > 0) {
            _barrierW = getDominantBarrier(srcLL, pt, src.heightM, recvHeight, buildings);
            if (_barrierW) {
              barrierDelta  = _barrierW.pathLengthDiff;
              endDeltaLeft  = _barrierW.endDeltaLeft  || 0;
              endDeltaRight = _barrierW.endDeltaRight || 0;
            }
          }

          var buildingIL_broadband = 0;
          if (_barrierW) {
            var _bBaseW  = _barrierW.baseHeightM        || 0;
            var _bGapW   = _barrierW.gapPathLengthDiff  || 0;
            var _bInGapW = !!_barrierW.rayInGap;
            if (_bInGapW && _bBaseW > 0) {
              // Ray passes through gap — gap IL only
              if (_bGapW > 0) {
                var gapArrW = calcBarrierWithEndDiffraction(_bGapW, 0, 0, [1000]);
                buildingIL_broadband = Math.min(gapArrW[0], 20);
              }
            } else if (barrierDelta > 0 || endDeltaLeft > 0 || endDeltaRight > 0) {
              var topArrW = calcBarrierWithEndDiffraction(barrierDelta, endDeltaLeft, endDeltaRight, [1000]);
              var topILW  = topArrW[0];
              if (_bBaseW > 0 && _bGapW > 0) {
                // Floating barrier: energy-combine over-top and gap paths
                var gapArrW2 = calcBarrierWithEndDiffraction(_bGapW, 0, 0, [1000]);
                var combined = -10 * Math.log10(Math.pow(10, -topILW / 10) + Math.pow(10, -gapArrW2[0] / 10));
                buildingIL_broadband = Math.max(0, combined);
              } else {
                buildingIL_broadband = Math.min(topILW, 20);
              }
            }
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
            var _bBaseWL = _barrierW ? (_barrierW.baseHeightM || 0) : 0;
            var _bGapWL  = _barrierW ? (_barrierW.gapPathLengthDiff || 0) : 0;
            if (_bBaseWL > 0 && _bGapWL > 0 && !(_barrierW && _barrierW.rayInGap)) {
              var lp_tL = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, isoParamsLmax, endDeltaLeft, endDeltaRight);
              var lp_gL = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                _bGapWL, recvHeight, isoParamsLmax, 0, 0);
              lp = (!isFinite(lp_tL)) ? lp_gL : (!isFinite(lp_gL)) ? lp_tL
                 : 10 * Math.log10(Math.pow(10, lp_tL / 10) + Math.pow(10, lp_gL / 10));
            } else {
              lp = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, isoParamsLmax, endDeltaLeft, endDeltaRight);
            }
            if (terrIL > buildingIL_broadband && isFinite(lp)) {
              lp -= (terrIL - buildingIL_broadband);
            }
          } else if (period === 'lmax') {
            // Lmax ISO but no spectrum: simple propagation + any computed barriers/terrain
            var effectiveIL_lmax = Math.max(buildingIL_broadband, terrIL);
            lp = attenuatePoint(src.combinedLw, dist) - effectiveIL_lmax;
          } else if (method === 'iso9613' && src.spectrum) {
            // ISO: compute propagation level, then apply terrain excess over building IL
            // Compute per-region ground G from custom zones for this src→gridpoint path
            var _pathGW = _wkPathG(src.lat, src.lng, lat, lng, src.heightM, recvHeight, dist);
            var isoParamsSrc = (_pathGW === (isoParams.groundFactor || 0.5))
              ? isoParams
              : { receiverHeight: recvHeight, groundFactor: _pathGW,
                  temperature: isoParams.temperature, humidity: isoParams.humidity };
            var _bBaseWI = _barrierW ? (_barrierW.baseHeightM || 0) : 0;
            var _bGapWI  = _barrierW ? (_barrierW.gapPathLengthDiff || 0) : 0;
            if (_bBaseWI > 0 && _bGapWI > 0 && !(_barrierW && _barrierW.rayInGap)) {
              var lp_tI = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, isoParamsSrc, endDeltaLeft, endDeltaRight);
              var lp_gI = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                _bGapWI, recvHeight, isoParamsSrc, 0, 0);
              lp = (!isFinite(lp_tI)) ? lp_gI : (!isFinite(lp_gI)) ? lp_tI
                 : 10 * Math.log10(Math.pow(10, lp_tI / 10) + Math.pow(10, lp_gI / 10));
            } else {
              lp = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, isoParamsSrc, endDeltaLeft, endDeltaRight);
            }
            // Apply smoothed terrain IL where it exceeds the already-applied building IL
            if (terrIL > buildingIL_broadband && isFinite(lp)) {
              lp -= (terrIL - buildingIL_broadband);
            }
          } else {
            // Simple: max of building IL and terrain IL
            var effectiveIL = Math.max(buildingIL_broadband, terrIL);
            lp = attenuatePoint(src.combinedLw, dist) - effectiveIL;
          }

          // Facade reflection §7.5: energy-add dominant reflected contribution
          if (reflectionsEnabled && isFinite(lp) && buildings.length > 0) {
            var refl_w = getDominantReflection(srcLL, pt, src.heightM, recvHeight, buildings);
            if (refl_w) {
              var lpRefl_w;
              var rd = refl_w.reflectedDistM;
              if (isLmaxSimple || (period === 'lmax' && !src.spectrum)) {
                // Simple/no-spectrum Lmax: pure 1/r² at reflected distance
                lpRefl_w = attenuatePoint(src.combinedLw, rd);
              } else if (period === 'lmax' && src.spectrum) {
                // ISO Lmax with spectrum: no A_gr, no barrier
                var isoRLmax = {
                  receiverHeight: recvHeight,
                  groundFactor: 0,
                  temperature: isoParams.temperature || 10,
                  humidity: isoParams.humidity || 70
                };
                lpRefl_w = calcISOatPoint(src.spectrum, src.heightM, rd, src.spectrumAdj,
                  0, recvHeight, isoRLmax, 0, 0);
              } else if (method === 'iso9613' && src.spectrum) {
                // ISO Leq: same params as direct but no barrier, no terrain
                lpRefl_w = calcISOatPoint(src.spectrum, src.heightM, rd, src.spectrumAdj,
                  0, recvHeight, isoParams, 0, 0);
              } else {
                // Simple Leq: 1/r² at reflected distance
                lpRefl_w = attenuatePoint(src.combinedLw, rd);
              }
              if (isFinite(lpRefl_w)) {
                lp = 10 * Math.log10(Math.pow(10, lp / 10) + Math.pow(10, lpRefl_w / 10));
              }
            }
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
      dLng: dLng,
      startLat: startLat,
      startLng: startLng
    });
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
