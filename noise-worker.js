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
importScripts('shared-calc.js?v=4');

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
var calcCmet              = SharedCalc.calcCmet;
var calcConcaweAtPoint    = SharedCalc.calcConcaweAtPoint;
var getDominantReflection = SharedCalc.getDominantReflection;
var getReflectionRho      = SharedCalc.getReflectionRho;
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
    var concaweMetCategory = opts.concaweMetCategory || 4;
    var cmetEnabled = !!(opts.cmetEnabled);
    var cmetC0      = isFinite(opts.cmetC0) ? opts.cmetC0 : 2.0;
    console.log('[WORKER] Started: method=' + method + ', concaweMetCategory=' + concaweMetCategory + ', sources=' + sources.length + ', hasSpectrum=' + (sources[0] ? !!sources[0].spectrum : 'N/A'));
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
      // Per-region mode: groundFactor is already a {Gs,Gm,Gr} object — return directly
      if (isoParams.groundFactor && typeof isoParams.groundFactor === 'object') return isoParams.groundFactor;
      if (!groundZones.length) return isoParams.groundFactor ?? 0.5;
      var dp = distM, dG = isoParams.groundFactor ?? 0.5;
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

    /* ── Terrain diffraction IL — Deygout 3-edge method (shared-calc.js) ──
     *
     * findTerrainEdges, deygoutSelectEdges, and terrainILPerBand live in
     * shared-calc.js so both the worker and the single-point receiver path
     * in index.html use a single implementation.  The worker passes its own
     * lookupElev closure so the algorithm is bit-identical to the previous
     * local version.
     */
    function terrainILPerBand(srcLL, srcH, recLL, recH) {
      if (!demCache || demCache.length === 0) return [0, 0, 0, 0, 0, 0, 0, 0];
      var bands = SharedCalc.terrainILPerBand(srcLL, srcH, recLL, recH, lookupElev);
      if (debugTerrain && bands[4] > 0) {
        console.log('[noise-worker] Terrain Deygout IL@1kHz=' + bands[4].toFixed(1) + 'dB');
      }
      return bands;
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
        spectrumAdj: s.spectrumAdj || 0,
        excludeBuildingId: s.excludeBuildingId || null,  // C2 fix: preserve self-screening exclusion
        wallNormal: s.wallNormal || null  // CHUNK 2: {dlat, dlng} outward normal for directivity
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
    // Per-band terrain IL pre-pass: stride-8 Float32Array per source.
    // Index into terrainSmoothed[si]: (r * cols + c) * 8 + bandIdx, where
    // bandIdx 0..7 corresponds to octave bands 63, 125, 250, 500, 1000,
    // 2000, 4000, 8000 Hz. Zero everywhere when terrain is disabled or no
    // DEM data is available.
    var terrainSmoothed = null;

    if (terrainEnabled && demCache && demCache.length > 0) {
      // Build separable Gaussian kernel: radius=2, σ=0.5, kernel size=5
      // Halved from 1.0 (commit 71aaea5) following empirical validation; bilinear
      // DEM interpolation now provides the bulk of spike suppression. See
      // references/smoothing-source-investigation-2026-04.md.
      var _KR = 2, _SIGMA = 0.5, _KS = 5;
      var _kernel = new Float32Array(_KS);
      var _ksum = 0;
      for (var _ki = 0; _ki < _KS; _ki++) {
        var _kx = _ki - _KR;
        _kernel[_ki] = Math.exp(-(_kx * _kx) / (2 * _SIGMA * _SIGMA));
        _ksum += _kernel[_ki];
      }
      for (var _ki2 = 0; _ki2 < _KS; _ki2++) _kernel[_ki2] /= _ksum;

      terrainSmoothed = [];

      // Reusable per-band scratch buffers (one set, reused across sources/bands)
      var _bandRaw = new Float32Array(rows * cols);
      var _bandTemp = new Float32Array(rows * cols);
      var _bandSmooth = new Float32Array(rows * cols);

      for (var _psi = 0; _psi < srcData.length; _psi++) {
        var _psrc = srcData[_psi];
        var _psrcLL = { lat: _psrc.lat, lng: _psrc.lng };

        // Step 1: raw per-band terrain IL for every grid cell. 0 where no
        // obstruction or no DEM data. Packed as stride-8 so the main loop
        // can read an 8-element block per cell with a simple offset.
        var _ilRaw8 = new Float32Array(rows * cols * 8);
        for (var _pr = 0; _pr < rows; _pr++) {
          var _plat = startLat + _pr * dLat;
          for (var _pc = 0; _pc < cols; _pc++) {
            var _plng = startLng + _pc * dLng;
            var _ppt = { lat: _plat, lng: _plng };
            var _bands = terrainILPerBand(_psrcLL, _psrc.heightM, _ppt, recvHeight);
            var _off = (_pr * cols + _pc) * 8;
            for (var _bb = 0; _bb < 8; _bb++) _ilRaw8[_off + _bb] = _bands[_bb];
          }
        }

        // Step 2: Gaussian smooth each octave band independently. The kernel
        // is applied separably (horizontal pass → temp → vertical pass) to
        // the rows*cols slice for each band, then written back into the
        // stride-8 output array.
        var _ilSmooth8 = new Float32Array(rows * cols * 8);
        for (var _sb = 0; _sb < 8; _sb++) {
          // Extract this band from stride-8 raw into the flat scratch buffer.
          for (var _er = 0; _er < rows; _er++) {
            for (var _ec = 0; _ec < cols; _ec++) {
              _bandRaw[_er * cols + _ec] = _ilRaw8[(_er * cols + _ec) * 8 + _sb];
            }
          }
          // Horizontal Gaussian pass → _bandTemp.
          for (var _hr = 0; _hr < rows; _hr++) {
            for (var _hc = 0; _hc < cols; _hc++) {
              var _hval = 0;
              for (var _hki = 0; _hki < _KS; _hki++) {
                var _hcc = Math.max(0, Math.min(cols - 1, _hc + _hki - _KR));
                _hval += _bandRaw[_hr * cols + _hcc] * _kernel[_hki];
              }
              _bandTemp[_hr * cols + _hc] = _hval;
            }
          }
          // Vertical Gaussian pass → _bandSmooth.
          for (var _vr = 0; _vr < rows; _vr++) {
            for (var _vc = 0; _vc < cols; _vc++) {
              var _vval = 0;
              for (var _vki = 0; _vki < _KS; _vki++) {
                var _vrr = Math.max(0, Math.min(rows - 1, _vr + _vki - _KR));
                _vval += _bandTemp[_vrr * cols + _vc] * _kernel[_vki];
              }
              _bandSmooth[_vr * cols + _vc] = _vval;
            }
          }
          // Write the smoothed band back into the stride-8 output.
          for (var _wr = 0; _wr < rows; _wr++) {
            for (var _wc = 0; _wc < cols; _wc++) {
              _ilSmooth8[(_wr * cols + _wc) * 8 + _sb] = _bandSmooth[_wr * cols + _wc];
            }
          }
        }

        terrainSmoothed.push(_ilSmooth8);
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
          if (buildings[bi].buildingSourceId) continue; // building sources are not solid buildings
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

          // CHUNK 2: directivity filter — wall sub-sources only radiate into outward half-space
          if (src.wallNormal) {
            var _wCosLat = Math.cos(src.lat * Math.PI / 180);
            var _wNX = src.wallNormal.dlng * _wCosLat * 111000;
            var _wNY = src.wallNormal.dlat * 111000;
            var _wDX = (pt.lng - src.lng) * _wCosLat * 111000;
            var _wDY = (pt.lat - src.lat) * 111000;
            if (_wNX * _wDX + _wNY * _wDY <= 0) continue; // receiver behind wall — skip
          }

          var srcLL = { lat: src.lat, lng: src.lng };
          var dist = flatDistM(srcLL, pt);
          if (dist < 0.1) dist = 0.1;

          // Building / structural barrier IL — applied for all periods including simple Lmax
          var barrierDelta = 0, endDeltaLeft = 0, endDeltaRight = 0;
          var _barrierW = null;
          // Self-screening exclusion: building source sub-sources skip their own polygon
          var buildingsForSrc = (src.excludeBuildingId)
            ? buildings.filter(function(b) { return b.buildingSourceId !== src.excludeBuildingId; })
            : buildings;
          if (buildingsForSrc.length > 0) {
            _barrierW = getDominantBarrier(srcLL, pt, src.heightM, recvHeight, buildingsForSrc);
            if (_barrierW) {
              barrierDelta  = _barrierW.pathLengthDiff;
              endDeltaLeft  = _barrierW.endDeltaLeft  || 0;
              endDeltaRight = _barrierW.endDeltaRight || 0;
            }
          }
          // ISO 9613-2 §7.4 sub-path ground info — passed to calcISOatPoint
          // so Agr is recomputed along source→barrier and barrier→receiver legs.
          var _barrInfoW = null;
          if (_barrierW && (_barrierW.pathLengthDiff > 0 || _barrierW.gapPathLengthDiff > 0)) {
            var _d1W = (typeof _barrierW.d1 === 'number')
              ? _barrierW.d1
              : flatDistM(srcLL, _barrierW.intersection || pt);
            var _d2W = (typeof _barrierW.d2 === 'number')
              ? _barrierW.d2
              : flatDistM(_barrierW.intersection || srcLL, pt);
            var _hBarW = (_barrierW.baseHeightM || 0) + (_barrierW.barrierHeightM || 0);
            if (terrainEnabled && _barrierW.building) {
              var _wRoofMode = (_barrierW.building.roofMode || 'flat');
              if (_wRoofMode === 'flat') {
                // Flat roof: horizontal at reference-vertex ASL + heights
                var _wRefIdx = (typeof _barrierW.building.referenceVertexIndex === 'number') ? _barrierW.building.referenceVertexIndex : 0;
                var _wRefArr = _barrierW.building.vertexElevations;
                if (_wRefArr && _wRefArr.length > _wRefIdx && _wRefArr[_wRefIdx] !== null && isFinite(_wRefArr[_wRefIdx])) {
                  _hBarW = _wRefArr[_wRefIdx] + (_barrierW.baseHeightM || 0) + (_barrierW.barrierHeightM || 0);
                }
              } else {
                // Draped: interpolate terrain elevation along the crossed edge
                var _elevs = _barrierW.building.vertexElevations;
                var _poly  = _barrierW.building.polygon;
                var _iA    = _barrierW.edgeVertexIdx;
                if (_elevs && _poly && _iA !== undefined && _iA !== null) {
                  var _iB = _barrierW.building.isBarrier ? _iA + 1 : (_iA + 1) % _poly.length;
                  var _eA = _elevs[_iA], _eB = (_iB < _elevs.length) ? _elevs[_iB] : null;
                  if (_eA !== null && _eB !== null && isFinite(_eA) && isFinite(_eB)) {
                    var _vA = _poly[_iA], _vB = _poly[_iB];
                    var _latA = Array.isArray(_vA) ? _vA[0] : _vA.lat;
                    var _lngA = Array.isArray(_vA) ? _vA[1] : _vA.lng;
                    var _latB = Array.isArray(_vB) ? _vB[0] : _vB.lat;
                    var _lngB = Array.isArray(_vB) ? _vB[1] : _vB.lng;
                    var _dLat = _latB - _latA, _dLng = _lngB - _lngA;
                    var _edgeLen2 = _dLat * _dLat + _dLng * _dLng;
                    var _t = 0.5;
                    if (_edgeLen2 > 1e-20 && _barrierW.intersection) {
                      var _ix = _barrierW.intersection;
                      _t = ((_ix.lat - _latA) * _dLat + (_ix.lng - _lngA) * _dLng) / _edgeLen2;
                      _t = Math.max(0, Math.min(1, _t));
                    }
                    var _tElev = _eA * (1 - _t) + _eB * _t;
                    _hBarW = _tElev + (_barrierW.baseHeightM || 0) + (_barrierW.barrierHeightM || 0);
                  }
                }
              }
            }
            _barrInfoW = {
              d1: _d1W,
              d2: _d2W,
              hBar: _hBarW
            };
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

          // Per-band terrain IL from the Deygout pre-pass (stride-8 array).
          // ISO paths pass terrBands through to calcISOatPoint for per-band
          // max(Abar, Aterr) combination. Simple/broadband paths use the
          // 1 kHz band value (index 4) as the representative broadband IL,
          // matching the earlier single-ridge behaviour.
          var terrBands = null;
          var terrIL = 0;
          if (terrainSmoothed) {
            var _tsArr = terrainSmoothed[si];
            var _tsOff = (r * cols + c) * 8;
            terrBands = [
              _tsArr[_tsOff]     || 0,
              _tsArr[_tsOff + 1] || 0,
              _tsArr[_tsOff + 2] || 0,
              _tsArr[_tsOff + 3] || 0,
              _tsArr[_tsOff + 4] || 0,
              _tsArr[_tsOff + 5] || 0,
              _tsArr[_tsOff + 6] || 0,
              _tsArr[_tsOff + 7] || 0
            ];
            terrIL = terrBands[4]; // 1 kHz representative
          }

          var lp;
          if (isLmaxSimple) {
            // Lmax simple: 1/r² propagation + barrier + terrain; no A_gr or A_atm
            var effectiveIL_simple = Math.max(buildingIL_broadband, terrIL);
            lp = attenuatePoint(src.combinedLw, dist) - effectiveIL_simple;
          } else if (period === 'lmax' && src.spectrum) {
            // Lmax ISO: full ISO 9613-2 with optional groundFactor override
            var isoParamsLmax = {
              receiverHeight: recvHeight,
              groundFactor: (lmaxMethod === 'iso9613_g0') ? 0 : (isoParams.groundFactor ?? 0.5),
              temperature: isoParams.temperature || 10,
              humidity: isoParams.humidity || 70
            };
            var _bBaseWL = _barrierW ? (_barrierW.baseHeightM || 0) : 0;
            var _bGapWL  = _barrierW ? (_barrierW.gapPathLengthDiff || 0) : 0;
            if (_bBaseWL > 0 && _bGapWL > 0 && !(_barrierW && _barrierW.rayInGap)) {
              var lp_tL = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, isoParamsLmax, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands);
              var lp_gL = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                _bGapWL, recvHeight, isoParamsLmax, 0, 0, _barrInfoW, terrBands);
              lp = (!isFinite(lp_tL)) ? lp_gL : (!isFinite(lp_gL)) ? lp_tL
                 : 10 * Math.log10(Math.pow(10, lp_tL / 10) + Math.pow(10, lp_gL / 10));
            } else {
              lp = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, isoParamsLmax, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands);
            }
            // Terrain IL is now inside calcISOatPoint — no post-subtract.
          } else if (period === 'lmax') {
            // Lmax ISO but no spectrum: simple propagation + any computed barriers/terrain
            var effectiveIL_lmax = Math.max(buildingIL_broadband, terrIL);
            lp = attenuatePoint(src.combinedLw, dist) - effectiveIL_lmax;
          } else if (method === 'concawe' && src.spectrum) {
            // CONCAWE with spectrum — K3 ground + K4 met + K5 height + barrier/terrain
            if (r === 0 && c === 0) console.log('[WORKER] CONCAWE+spectrum branch, metCat=' + concaweMetCategory + ', src0 hasSpec=' + !!src.spectrum);
            var _pathGWC = _wkPathG(src.lat, src.lng, lat, lng, src.heightM, recvHeight, dist);
            var _gScalarC = (typeof _pathGWC === 'object')
              ? ((_pathGWC.Gs || 0) + (_pathGWC.Gr || 0) + (_pathGWC.Gm || 0)) / 3 : _pathGWC;
            var concParamsW = { receiverHeight: recvHeight, groundFactor: _gScalarC,
                temperature: isoParams.temperature, humidity: isoParams.humidity,
                metCategory: concaweMetCategory };
            var _bBaseWC = _barrierW ? (_barrierW.baseHeightM || 0) : 0;
            var _bGapWC  = _barrierW ? (_barrierW.gapPathLengthDiff || 0) : 0;
            if (_bBaseWC > 0 && _bGapWC > 0 && !(_barrierW && _barrierW.rayInGap)) {
              var lp_tC = calcConcaweAtPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, concParamsW, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands);
              var lp_gC = calcConcaweAtPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                _bGapWC, recvHeight, concParamsW, 0, 0, _barrInfoW, terrBands);
              lp = (!isFinite(lp_tC)) ? lp_gC : (!isFinite(lp_gC)) ? lp_tC
                 : 10 * Math.log10(Math.pow(10, lp_tC / 10) + Math.pow(10, lp_gC / 10));
            } else {
              lp = calcConcaweAtPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, concParamsW, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands);
            }
          } else if (method === 'concawe' && groundZones.length > 0) {
            // CONCAWE without spectrum but with ground zones: flat spectrum
            if (r === 0 && c === 0) console.log('[WORKER] CONCAWE+groundZones branch, metCat=' + concaweMetCategory);
            var flatCW = [];
            for (var fcb = 0; fcb < 8; fcb++) flatCW.push(src.combinedLw - 9.03);
            var _pathGWCS = _wkPathG(src.lat, src.lng, lat, lng, src.heightM, recvHeight, dist);
            var _gScalarCS = (typeof _pathGWCS === 'object')
              ? ((_pathGWCS.Gs || 0) + (_pathGWCS.Gr || 0) + (_pathGWCS.Gm || 0)) / 3 : _pathGWCS;
            var concParamsWS = { receiverHeight: recvHeight, groundFactor: _gScalarCS,
                temperature: isoParams.temperature, humidity: isoParams.humidity,
                metCategory: concaweMetCategory };
            var _bBaseWCS = _barrierW ? (_barrierW.baseHeightM || 0) : 0;
            var _bGapWCS  = _barrierW ? (_barrierW.gapPathLengthDiff || 0) : 0;
            if (_bBaseWCS > 0 && _bGapWCS > 0 && !(_barrierW && _barrierW.rayInGap)) {
              var lp_tCS = calcConcaweAtPoint(flatCW, src.heightM, dist, 0,
                barrierDelta, recvHeight, concParamsWS, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands);
              var lp_gCS = calcConcaweAtPoint(flatCW, src.heightM, dist, 0,
                _bGapWCS, recvHeight, concParamsWS, 0, 0, _barrInfoW, terrBands);
              lp = (!isFinite(lp_tCS)) ? lp_gCS : (!isFinite(lp_gCS)) ? lp_tCS
                 : 10 * Math.log10(Math.pow(10, lp_tCS / 10) + Math.pow(10, lp_gCS / 10));
            } else {
              lp = calcConcaweAtPoint(flatCW, src.heightM, dist, 0,
                barrierDelta, recvHeight, concParamsWS, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands);
            }
          } else if (method === 'concawe') {
            // CONCAWE without spectrum and without ground zones: flat spectrum
            if (r === 0 && c === 0) console.log('[WORKER] CONCAWE catch-all branch, metCat=' + concaweMetCategory);
            var flatCWN = [];
            for (var fcbn = 0; fcbn < 8; fcbn++) flatCWN.push(src.combinedLw - 9.03);
            var concParamsWN = { receiverHeight: recvHeight, groundFactor: isoParams.groundFactor ?? 0.5,
                temperature: isoParams.temperature, humidity: isoParams.humidity,
                metCategory: concaweMetCategory };
            var _bBaseWCN = _barrierW ? (_barrierW.baseHeightM || 0) : 0;
            var _bGapWCN  = _barrierW ? (_barrierW.gapPathLengthDiff || 0) : 0;
            if (_bBaseWCN > 0 && _bGapWCN > 0 && !(_barrierW && _barrierW.rayInGap)) {
              var lp_tCN = calcConcaweAtPoint(flatCWN, src.heightM, dist, 0,
                barrierDelta, recvHeight, concParamsWN, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands);
              var lp_gCN = calcConcaweAtPoint(flatCWN, src.heightM, dist, 0,
                _bGapWCN, recvHeight, concParamsWN, 0, 0, _barrInfoW, terrBands);
              lp = (!isFinite(lp_tCN)) ? lp_gCN : (!isFinite(lp_gCN)) ? lp_tCN
                 : 10 * Math.log10(Math.pow(10, lp_tCN / 10) + Math.pow(10, lp_gCN / 10));
            } else {
              lp = calcConcaweAtPoint(flatCWN, src.heightM, dist, 0,
                barrierDelta, recvHeight, concParamsWN, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands);
            }
          } else if (method === 'iso9613' && src.spectrum) {
            // ISO with spectrum — per-band terrain/barrier screening inside calcISOatPoint.
            // Compute per-region ground G from custom zones for this src→gridpoint path
            var _pathGW = _wkPathG(src.lat, src.lng, lat, lng, src.heightM, recvHeight, dist);
            var isoParamsSrc = (_pathGW === (isoParams.groundFactor ?? 0.5))
              ? isoParams
              : { receiverHeight: recvHeight, groundFactor: _pathGW,
                  temperature: isoParams.temperature, humidity: isoParams.humidity };
            var _wkCmetI = (cmetEnabled && period !== 'lmax') ? calcCmet(cmetC0, src.heightM, recvHeight, dist) : 0;
            var _bBaseWI = _barrierW ? (_barrierW.baseHeightM || 0) : 0;
            var _bGapWI  = _barrierW ? (_barrierW.gapPathLengthDiff || 0) : 0;
            if (_bBaseWI > 0 && _bGapWI > 0 && !(_barrierW && _barrierW.rayInGap)) {
              var lp_tI = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, isoParamsSrc, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands, _wkCmetI);
              var lp_gI = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                _bGapWI, recvHeight, isoParamsSrc, 0, 0, _barrInfoW, terrBands, _wkCmetI);
              lp = (!isFinite(lp_tI)) ? lp_gI : (!isFinite(lp_gI)) ? lp_tI
                 : 10 * Math.log10(Math.pow(10, lp_tI / 10) + Math.pow(10, lp_gI / 10));
            } else {
              lp = calcISOatPoint(src.spectrum, src.heightM, dist, src.spectrumAdj,
                barrierDelta, recvHeight, isoParamsSrc, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands, _wkCmetI);
            }
          } else if (method === 'iso9613' && groundZones.length > 0) {
            // ISO without spectrum but with ground zones: use flat spectrum so G is applied
            var flatWk = [];
            for (var fb = 0; fb < 8; fb++) flatWk.push(src.combinedLw - 9.03);
            var _pathGWS = _wkPathG(src.lat, src.lng, lat, lng, src.heightM, recvHeight, dist);
            var isoParamsFlatWk = { receiverHeight: recvHeight, groundFactor: _pathGWS,
                temperature: isoParams.temperature, humidity: isoParams.humidity };
            var _wkCmetS = (cmetEnabled && period !== 'lmax') ? calcCmet(cmetC0, src.heightM, recvHeight, dist) : 0;
            var _bBaseWS = _barrierW ? (_barrierW.baseHeightM || 0) : 0;
            var _bGapWS  = _barrierW ? (_barrierW.gapPathLengthDiff || 0) : 0;
            if (_bBaseWS > 0 && _bGapWS > 0 && !(_barrierW && _barrierW.rayInGap)) {
              var lp_tS = calcISOatPoint(flatWk, src.heightM, dist, 0,
                barrierDelta, recvHeight, isoParamsFlatWk, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands, _wkCmetS);
              var lp_gS = calcISOatPoint(flatWk, src.heightM, dist, 0,
                _bGapWS, recvHeight, isoParamsFlatWk, 0, 0, _barrInfoW, terrBands, _wkCmetS);
              lp = (!isFinite(lp_tS)) ? lp_gS : (!isFinite(lp_gS)) ? lp_tS
                 : 10 * Math.log10(Math.pow(10, lp_tS / 10) + Math.pow(10, lp_gS / 10));
            } else {
              lp = calcISOatPoint(flatWk, src.heightM, dist, 0,
                barrierDelta, recvHeight, isoParamsFlatWk, endDeltaLeft, endDeltaRight, _barrInfoW, terrBands, _wkCmetS);
            }
          } else {
            // Simple: max of building IL and terrain IL (1 kHz representative)
            var effectiveIL = Math.max(buildingIL_broadband, terrIL);
            lp = attenuatePoint(src.combinedLw, dist) - effectiveIL;
          }

          // Facade reflection §7.5: energy-add dominant reflected contribution
          if (reflectionsEnabled && isFinite(lp) && buildings.length > 0) {
            var refl_w = getDominantReflection(srcLL, pt, src.heightM, recvHeight, buildings);
            if (refl_w) {
              var _reflRho = getReflectionRho(refl_w.building || {});
              if (_reflRho > 0) {
                var lpRefl_w;
                var rd = refl_w.reflectedDistM;
                if (isLmaxSimple || (period === 'lmax' && !src.spectrum)) {
                  lpRefl_w = attenuatePoint(src.combinedLw, rd);
                } else if (period === 'lmax' && src.spectrum) {
                  var isoRLmax = {
                    receiverHeight: recvHeight,
                    groundFactor: 0,
                    temperature: isoParams.temperature || 10,
                    humidity: isoParams.humidity || 70
                  };
                  lpRefl_w = calcISOatPoint(src.spectrum, src.heightM, rd, src.spectrumAdj,
                    0, recvHeight, isoRLmax, 0, 0);
                } else if (method === 'iso9613' && src.spectrum) {
                  var _wkCmetR = cmetEnabled ? calcCmet(cmetC0, src.heightM, recvHeight, rd) : 0;
                  lpRefl_w = calcISOatPoint(src.spectrum, src.heightM, rd, src.spectrumAdj,
                    0, recvHeight, isoParams, 0, 0, null, null, _wkCmetR);
                } else {
                  lpRefl_w = attenuatePoint(src.combinedLw, rd);
                }
                if (isFinite(lpRefl_w)) {
                  lpRefl_w += 10 * Math.log10(_reflRho);
                  lp = 10 * Math.log10(Math.pow(10, lp / 10) + Math.pow(10, lpRefl_w / 10));
                }
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
