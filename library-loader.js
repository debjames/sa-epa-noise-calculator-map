/* ============================================================================
 * library-loader.js
 *
 * Fetches the Resonate noise source + construction libraries from Supabase
 * on page load and hot-swaps them into the running app. If Supabase is
 * unreachable (no config, network error, timeout), the app stays on the
 * hard-coded offline snapshot declared directly in index.html.
 *
 * Exposes:
 *   window.ResonateLib = {
 *     load(),                 // kick off the load; returns a Promise<boolean>
 *     isFromSupabase,         // true once a successful swap has happened
 *     lastError,              // null or Error from the most recent attempt
 *     status                  // 'idle' | 'loading' | 'live' | 'offline' | 'error'
 *   };
 *
 * Depends on:
 *   window.SUPABASE_CONFIG (from supabase-config.js)
 *   window.rebuildAllLibraries() (defined in index.html after library refactor)
 *   window.SOURCE_LIBRARY_GROUPED / LINE_SOURCE_LIBRARY / AREA_SOURCE_LIBRARY /
 *     CONSTRUCTION_LIBRARY  (window globals, mutated in place)
 * ========================================================================== */
(function () {
  'use strict';

  var FETCH_TIMEOUT_MS = 4000;

  // A-weighting at the 8 standard octave bands [63, 125, 250, 500, 1000, 2000, 4000, 8000 Hz]
  var A_WEIGHTS = [-26.2, -16.1, -8.6, -3.2, 0.0, 1.2, 1.0, -1.1];

  var state = {
    load: load,
    isFromSupabase: false,
    lastError: null,
    status: 'idle'
  };
  window.ResonateLib = state;

  /** Compute overall Lw in dB(A) from 8 unweighted octave-band values. */
  function overallLwA(bands) {
    var sum = 0;
    var any = false;
    for (var i = 0; i < 8; i++) {
      var v = bands[i];
      if (v === null || v === undefined || !isFinite(v)) continue;
      sum += Math.pow(10, (v + A_WEIGHTS[i]) / 10);
      any = true;
    }
    if (!any) return null;
    return Math.round(10 * Math.log10(sum) * 10) / 10;
  }

  function rowBands(row) {
    return [row.hz_63, row.hz_125, row.hz_250, row.hz_500, row.hz_1000, row.hz_2000, row.hz_4000, row.hz_8000];
  }

  function rowBandsObject(row) {
    return {
      63:   row.hz_63,
      125:  row.hz_125,
      250:  row.hz_250,
      500:  row.hz_500,
      1000: row.hz_1000,
      2000: row.hz_2000,
      4000: row.hz_4000,
      8000: row.hz_8000
    };
  }

  function groupKeyFor(row, categoryNameMap) {
    if (row.display_group && row.display_group.trim()) return row.display_group;
    var catName = categoryNameMap[row.category_id] || 'Uncategorised';
    // Pretty-print category: 'human-voice' -> 'Human voice'
    return catName.replace(/[-_]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  /** Map a reference_noise_sources row where source_kind='point' to the app's point-source shape. */
  function mapPointSourceRow(row) {
    var bands = rowBands(row);
    return {
      name:    row.name,
      lw:      overallLwA(bands),
      spectrum: bands,
      height:  (row.height_m !== null && row.height_m !== undefined) ? row.height_m : 1.5
    };
  }

  /** Map a reference_noise_sources row where source_kind='line'. */
  function mapLineSourceRow(row, categoryNameMap) {
    var bands = rowBands(row);
    return {
      name:               row.name,
      category:           row.display_group || categoryNameMap[row.category_id] || 'Other',
      spectrum_unweighted: rowBandsObject(row),
      lw_m_dba:           overallLwA(bands),
      height_m:           (row.height_m !== null && row.height_m !== undefined) ? row.height_m : 0.5
    };
  }

  /** Map a reference_noise_sources row where source_kind='area'. */
  function mapAreaSourceRow(row, categoryNameMap) {
    var bands = rowBands(row);
    return {
      name:               row.name,
      category:           row.display_group || categoryNameMap[row.category_id] || 'Other',
      spectrum_unweighted: rowBandsObject(row),
      lw_m2_dba:          overallLwA(bands),
      height_m:           (row.height_m !== null && row.height_m !== undefined) ? row.height_m : 1.0
    };
  }

  /** Map a reference_noise_sources row where source_kind='building'.
   *  These store interior Lp spectra (sound pressure level inside the
   *  building), NOT Lw. The A-weighted summation math is identical, so
   *  overallLwA() is reused to compute the broadband dB(A) value. */
  function mapBuildingLpRow(row, categoryNameMap) {
    var bands = rowBands(row);
    return {
      name:     row.name,
      category: row.display_group || categoryNameMap[row.category_id] || 'Other',
      lp_dba:   overallLwA(bands),
      spectrum: rowBandsObject(row)
    };
  }

  function mapConstructionRow(row) {
    return {
      name:     row.name,
      rw:       Number(row.rw),
      octaveR:  (typeof row.octave_r === 'string') ? JSON.parse(row.octave_r) : row.octave_r
    };
  }

  /** Convert a flat array of point-source records into the GROUPED object. */
  function buildPointGrouped(rows, categoryNameMap) {
    var grouped = {};
    rows.forEach(function (row) {
      var key = groupKeyFor(row, categoryNameMap);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(mapPointSourceRow(row));
    });
    return grouped;
  }

  /** Fetch with timeout + apikey headers. */
  function supabaseFetch(url, cfg) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, {
      method: 'GET',
      headers: {
        'apikey':        cfg.publishable,
        'Authorization': 'Bearer ' + cfg.publishable,
        'Accept':        'application/json'
      },
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) {
        return res.text().then(function (t) { throw new Error('HTTP ' + res.status + ' ' + url + ' — ' + t.slice(0, 200)); });
      }
      return res.json();
    }).catch(function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  /** Kick off load. Returns Promise<boolean> — true on live swap, false on fallback. */
  function load() {
    state.status = 'loading';
    state.lastError = null;

    var cfg = window.SUPABASE_CONFIG;
    if (!cfg || !cfg.url || !cfg.publishable ||
        /YOUR[-_]?PROJECT/i.test(cfg.url) ||
        /YOUR[-_]?KEY/i.test(cfg.publishable)) {
      console.info('[ResonateLib] No Supabase config found — using offline snapshot.');
      state.status = 'offline';
      return Promise.resolve(false);
    }

    var base = cfg.url.replace(/\/+$/, '') + '/rest/v1';
    var sourcesUrl = base + '/reference_noise_sources?select=*';
    var catsUrl    = base + '/reference_noise_source_categories?select=id,name';
    var constrUrl  = base + '/reference_constructions?select=*';

    // allSettled so a missing reference_constructions table (pre-migration)
    // doesn't kill the whole load — we can still hot-swap point/line/area.
    return Promise.allSettled([
      supabaseFetch(sourcesUrl, cfg),
      supabaseFetch(catsUrl,    cfg),
      supabaseFetch(constrUrl,  cfg)
    ]).then(function (results) {
      var sourcesRes   = results[0];
      var catsRes      = results[1];
      var constrRes    = results[2];

      // Sources is the mandatory one — if it failed, bail out.
      if (sourcesRes.status !== 'fulfilled') {
        throw sourcesRes.reason || new Error('reference_noise_sources fetch failed');
      }
      var sources      = sourcesRes.value || [];
      var categories   = (catsRes.status   === 'fulfilled') ? (catsRes.value   || []) : [];
      var constructions= (constrRes.status === 'fulfilled') ? (constrRes.value || []) : [];
      if (constrRes.status !== 'fulfilled') {
        console.info('[ResonateLib] reference_constructions not available — keeping offline CONSTRUCTION_LIBRARY. (' + (constrRes.reason && constrRes.reason.message) + ')');
      }

      // Build id → name map for categories
      var catNameMap = {};
      categories.forEach(function (c) { catNameMap[c.id] = c.name; });

      // Partition sources by kind
      var pointRows    = sources.filter(function (r) { return r.source_kind === 'point';    });
      var lineRows     = sources.filter(function (r) { return r.source_kind === 'line';     });
      var areaRows     = sources.filter(function (r) { return r.source_kind === 'area';     });
      var buildingRows = sources.filter(function (r) { return r.source_kind === 'building'; });

      // Build the app-shape libraries
      var newPointGrouped = buildPointGrouped(pointRows, catNameMap);
      var newLine        = lineRows.map(function (r) { return mapLineSourceRow(r, catNameMap); });
      var newArea        = areaRows.map(function (r) { return mapAreaSourceRow(r, catNameMap); });
      var newBuildingLp  = buildingRows.map(function (r) { return mapBuildingLpRow(r, catNameMap); });

      var newConstructions = { walls: [], roof: [], openings: [] };
      constructions.forEach(function (row) {
        if (newConstructions[row.kind]) newConstructions[row.kind].push(mapConstructionRow(row));
      });

      // Sanity check: if we got zero sources, don't wipe the hard-coded fallback
      var pointCount = 0;
      Object.keys(newPointGrouped).forEach(function (k) { pointCount += newPointGrouped[k].length; });
      if (pointCount === 0 && newLine.length === 0 && newArea.length === 0) {
        throw new Error('Supabase returned empty libraries — keeping offline snapshot.');
      }

      // Hot-swap into window.* used by index.html
      window.SOURCE_LIBRARY_GROUPED = newPointGrouped;
      window.LINE_SOURCE_LIBRARY    = newLine;
      window.AREA_SOURCE_LIBRARY    = newArea;
      if (newBuildingLp.length > 0) {
        window.BUILDING_LP_LIBRARY = newBuildingLp;
      }
      if (newConstructions.walls.length || newConstructions.roof.length || newConstructions.openings.length) {
        window.CONSTRUCTION_LIBRARY = newConstructions;
      }

      // Rebuild all derivative maps and refresh visible dropdowns
      if (typeof window.rebuildAllLibraries === 'function') {
        window.rebuildAllLibraries();
      }

      state.isFromSupabase = true;
      state.status = 'live';
      state.counts = {
        point:    pointCount,
        line:     newLine.length,
        area:     newArea.length,
        building: newBuildingLp.length,
        constructions: newConstructions.walls.length + newConstructions.roof.length + newConstructions.openings.length
      };
      console.info('[ResonateLib] Loaded from Supabase: ' + pointCount + ' point / ' +
                   newLine.length + ' line / ' + newArea.length + ' area / ' +
                   newBuildingLp.length + ' building / ' +
                   state.counts.constructions + ' constructions');
      updateBadge();
      return true;
    }).catch(function (err) {
      console.warn('[ResonateLib] Load failed, staying on offline snapshot:', err && err.message);
      state.lastError = err;
      state.status = 'error';
      updateBadge();
      return false;
    });
  }

  /** Update the status badge in the header, if present. */
  function updateBadge() {
    var el = document.getElementById('resonateLibBadge');
    if (!el) return;
    if (state.status === 'live') {
      var c = state.counts || {};
      var summary = (c.point || 0) + 'P / ' + (c.line || 0) + 'L / ' + (c.area || 0) + 'A / ' + (c.building || 0) + 'B / ' + (c.constructions || 0) + 'C';
      el.textContent = 'Library: Supabase (live) — ' + summary;
      el.style.background = '#dcfce7';
      el.style.color = '#166534';
      el.style.borderColor = '#86efac';
      el.title = 'Loaded ' + (new Date()).toLocaleTimeString() + ' from ' + (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) +
                 '\n\n' + (c.point || 0) + ' point sources (Lw)' +
                 '\n' + (c.line || 0) + ' line sources (Lw/m)' +
                 '\n' + (c.area || 0) + ' area sources (Lw/m²)' +
                 '\n' + (c.building || 0) + ' building Lp presets' +
                 '\n' + (c.constructions || 0) + ' construction Rw records' +
                 '\n\nClick to open library admin.';
    } else if (state.status === 'loading') {
      el.textContent = 'Library: loading…';
      el.style.background = '#fef3c7';
      el.style.color = '#92400e';
      el.style.borderColor = '#fcd34d';
      el.title = 'Fetching from Supabase';
    } else if (state.status === 'error') {
      el.textContent = 'Library: offline (error)';
      el.style.background = '#fee2e2';
      el.style.color = '#991b1b';
      el.style.borderColor = '#fca5a5';
      el.title = state.lastError ? String(state.lastError.message || state.lastError) : 'Fetch failed';
    } else {
      el.textContent = 'Library: offline snapshot';
      el.style.background = '#f3f4f6';
      el.style.color = '#4b5563';
      el.style.borderColor = '#d1d5db';
      el.title = 'Supabase config not present';
    }
  }
  state._updateBadge = updateBadge;
})();
