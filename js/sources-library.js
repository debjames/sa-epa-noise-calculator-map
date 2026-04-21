/* ============================================================================
 * js/sources-library.js
 *
 * Google Sheets-backed reference source library for the Resonate noise tool.
 * Falls back to data/sources-fallback.json when the sheet is unreachable.
 * Uses stale-while-revalidate caching in localStorage.
 *
 * Exposes:
 *   window.SourceLibrary = {
 *     DATA_TYPE_APPLICABILITY,   // data_type → [panelContext, ...]
 *     applicableSourceTypes(panelContext),
 *     loadSourceLibrary(),       // Promise<rows[]> — fetches Sheet, caches result
 *     getCachedLibrary(),        // rows[] — returns cached or fallback synchronously
 *     getLibraryForSourceType(panelContext),         // rows[] filtered
 *     getGroupedLibraryForSourceType(panelContext),  // {category: rows[]} grouped
 *     submitNewSource(fields),   // Promise<{ok,message}> — POST to Apps Script
 *     status,  lastError         // 'idle'|'loading'|'live'|'fallback'|'error'
 *   };
 * ========================================================================== */
(function () {
  'use strict';

  var CSV_URL       = 'https://docs.google.com/spreadsheets/d/1GW8J6YDlXD77nzBgDPbn8-RTHduoKW2jftYuIK_54c0/gviz/tq?tqx=out:csv&sheet=Sources';
  var WRITE_URL     = 'https://script.google.com/macros/s/AKfycbyxbCdzGeQMHn6G-jEkp2HrTYqa0V_CS3KC5811e6nb2RIa6CvUpbxsu-8PPKVIJlxH/exec';
  var CACHE_KEY     = 'sourceLibraryCache_v2';
  var CACHE_TTL_MS  = 60 * 60 * 1000; // 1 hour
  var FETCH_TIMEOUT = 8000;
  var FALLBACK_URL  = 'data/sources-fallback.json';

  // Maps a Sheet "Data type" value to the source panel context keys used by
  // getLibraryForSourceType / getGroupedLibraryForSourceType.
  var DATA_TYPE_APPLICABILITY = {
    'Lp, dB(Z)':              ['building_interior'],
    'Lw, dB(Z)':              ['point', 'area'],
    'Lw/m, dB(Z)/m':         ['line'],
    'Lw/m\u00b2, dB(Z)/m\u00b2': [],
    'Transmission Loss':       ['building_facade'],
    'Insertion Loss':          []
  };

  var _cachedRows = null;   // in-memory cache; null until first load
  var _fallbackRows = null; // populated once from fallback.json

  var lib = {
    DATA_TYPE_APPLICABILITY: DATA_TYPE_APPLICABILITY,
    status: 'idle',
    lastError: null,
    applicableSourceTypes:        applicableSourceTypes,
    loadSourceLibrary:            loadSourceLibrary,
    getCachedLibrary:             getCachedLibrary,
    getLibraryForSourceType:      getLibraryForSourceType,
    getGroupedLibraryForSourceType: getGroupedLibraryForSourceType,
    submitNewSource:              submitNewSource
  };
  window.SourceLibrary = lib;

  // ── CSV parser ─────────────────────────────────────────────────────────────
  // GViz CSV wraps every value in double-quotes.  This simple tokeniser handles
  // quoted fields (including escaped "" inside them) and bare fields.
  function parseCSV(text) {
    var lines = [];
    var rows = [];
    // Normalise line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    var i = 0, len = text.length;
    var row = [];
    var field = '';
    var inQuote = false;

    while (i < len) {
      var ch = text[i];
      if (inQuote) {
        if (ch === '"') {
          if (i + 1 < len && text[i + 1] === '"') { field += '"'; i += 2; }
          else { inQuote = false; i++; }
        } else { field += ch; i++; }
      } else {
        if (ch === '"') { inQuote = true; i++; }
        else if (ch === ',') { row.push(field); field = ''; i++; }
        else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
        else { field += ch; i++; }
      }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function csvToObjects(text) {
    var rows = parseCSV(text);
    if (rows.length < 2) return [];
    var headers = rows[0].map(function (h) { return h.trim(); });
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      if (!rows[r].join('').trim()) continue;
      var obj = {};
      headers.forEach(function (h, idx) { obj[h] = (rows[r][idx] || '').trim(); });
      out.push(obj);
    }
    return out;
  }

  // ── Row normalisation ──────────────────────────────────────────────────────
  function num(v) {
    var f = parseFloat(v);
    return isFinite(f) ? f : null;
  }

  function normaliseRow(raw) {
    return {
      name:               raw['Name']             || '',
      description:        raw['Description']      || '',
      review:             raw['Review']            || '',
      data_type:          raw['Data type']         || '',
      category:           raw['Category']          || '',
      source_citation:    raw['Source Citation']   || '',
      source_description: raw['Source Description']|| '',
      hz_63:   num(raw['63 Hz']),
      hz_125:  num(raw['125 Hz']),
      hz_250:  num(raw['250 Hz']),
      hz_500:  num(raw['500 Hz']),
      hz_1000: num(raw['1000 Hz']),
      hz_2000: num(raw['2000 Hz']),
      hz_4000: num(raw['4000 Hz']),
      hz_8000: num(raw['8000 Hz']),
      lp_dba:  num(raw['dB(A)'])
    };
  }

  // ── localStorage cache ─────────────────────────────────────────────────────
  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      return obj && Array.isArray(obj.rows) ? obj : null;
    } catch (e) { return null; }
  }

  function writeCache(rows) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rows: rows }));
    } catch (e) {
      console.warn('[SourceLibrary] localStorage write failed:', e.message);
    }
  }

  function cacheIsStale(cached) {
    return !cached || (Date.now() - (cached.ts || 0)) > CACHE_TTL_MS;
  }

  // ── Fallback JSON ──────────────────────────────────────────────────────────
  function loadFallback() {
    if (_fallbackRows) return Promise.resolve(_fallbackRows);
    return fetch(FALLBACK_URL).then(function (res) {
      if (!res.ok) throw new Error('fallback fetch ' + res.status);
      return res.json();
    }).then(function (json) {
      _fallbackRows = Array.isArray(json.rows) ? json.rows : [];
      return _fallbackRows;
    }).catch(function () {
      _fallbackRows = [];
      return _fallbackRows;
    });
  }

  // ── Sheet fetch ────────────────────────────────────────────────────────────
  function fetchSheet() {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, FETCH_TIMEOUT);
    return fetch(CSV_URL, { signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        clearTimeout(timer);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = csvToObjects(text).map(normaliseRow).filter(function (r) { return r.name; });
        if (rows.length === 0) throw new Error('Sheet returned no rows');
        return rows;
      })
      .catch(function (err) {
        clearTimeout(timer);
        throw err;
      });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Returns applicable data_type strings for a given panelContext. */
  function applicableSourceTypes(panelContext) {
    return Object.keys(DATA_TYPE_APPLICABILITY).filter(function (dt) {
      return DATA_TYPE_APPLICABILITY[dt].indexOf(panelContext) !== -1;
    });
  }

  /**
   * Loads (or revalidates) the source library.
   * Stale-while-revalidate: resolves immediately with cached data if fresh;
   * if stale, resolves with cached data but revalidates in the background;
   * if no cache, waits for the sheet fetch (falls back to JSON on error).
   * Returns Promise<rows[]>.
   */
  function loadSourceLibrary() {
    var cached = readCache();

    if (!cacheIsStale(cached)) {
      // Fresh cache — use it, no background fetch
      _cachedRows = cached.rows;
      lib.status = 'live';
      return Promise.resolve(_cachedRows);
    }

    if (cached) {
      // Stale cache — serve it immediately, revalidate in background
      _cachedRows = cached.rows;
      lib.status = 'live';
      _revalidate();
      return Promise.resolve(_cachedRows);
    }

    // No cache — must fetch now, fall back to JSON on failure
    lib.status = 'loading';
    return fetchSheet().then(function (rows) {
      _cachedRows = rows;
      writeCache(rows);
      lib.status = 'live';
      lib.lastError = null;
      console.info('[SourceLibrary] Loaded ' + rows.length + ' entries from Sheet.');
      return rows;
    }).catch(function (err) {
      lib.lastError = err;
      lib.status = 'fallback';
      console.warn('[SourceLibrary] Sheet fetch failed; using fallback.', err.message);
      return loadFallback().then(function (rows) {
        _cachedRows = rows;
        return rows;
      });
    });
  }

  function _revalidate() {
    fetchSheet().then(function (rows) {
      _cachedRows = rows;
      writeCache(rows);
      lib.status = 'live';
      lib.lastError = null;
      console.info('[SourceLibrary] Revalidated ' + rows.length + ' entries from Sheet.');
    }).catch(function (err) {
      lib.lastError = err;
      console.warn('[SourceLibrary] Background revalidation failed.', err.message);
    });
  }

  /**
   * Returns current in-memory rows synchronously (may be null before first
   * loadSourceLibrary() resolves).  Callers should await loadSourceLibrary()
   * before relying on this.
   */
  function getCachedLibrary() {
    return _cachedRows || (_fallbackRows || []);
  }

  /** Returns flat rows[] applicable to panelContext. */
  function getLibraryForSourceType(panelContext) {
    var applicable = applicableSourceTypes(panelContext);
    return getCachedLibrary().filter(function (r) {
      return applicable.indexOf(r.data_type) !== -1;
    });
  }

  /** Returns {category: rows[]} grouped object applicable to panelContext. */
  function getGroupedLibraryForSourceType(panelContext) {
    var rows = getLibraryForSourceType(panelContext);
    var grouped = {};
    rows.forEach(function (r) {
      var cat = r.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(r);
    });
    return grouped;
  }

  /**
   * Submits a new source entry to the Apps Script endpoint.
   * fields: { name, description, data_type, category, hz_63..hz_8000,
   *           lp_dba, source_citation, source_description, added_by }
   * Returns Promise<{ok: boolean, message: string}>.
   */
  function submitNewSource(fields) {
    // Build form-encoded body — avoids CORS preflight (no custom Content-Type)
    var parts = [];
    Object.keys(fields).forEach(function (k) {
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(fields[k] == null ? '' : fields[k]));
    });
    var body = parts.join('&');

    return fetch(WRITE_URL, { method: 'POST', body: body })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (json && json.status === 'ok') {
          // Invalidate cache so next load picks up the new row
          try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
          return { ok: true, message: json.message || 'Submitted successfully.' };
        }
        throw new Error(json && json.message ? json.message : 'Unexpected response');
      })
      .catch(function (err) {
        return { ok: false, message: err.message || 'Submission failed.' };
      });
  }

  // Kick off a silent background load on page ready so the cache is warm
  // before any panel opens.  Does not block page load.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { loadSourceLibrary(); });
    } else {
      loadSourceLibrary();
    }
  }

})();
