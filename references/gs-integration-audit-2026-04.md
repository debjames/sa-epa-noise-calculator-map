# Google Sheets Library Integration Audit — April 2026

**Purpose:** Determine the current state of the Google Sheets library integration relative to Supabase, identify the spectrum format the GS path uses, and establish whether the dB(Z) mismatch identified in `spectrum-format-audit-2026-04.md` is still active via the live path.

**Status:** READ-ONLY — no source code or reference files modified.

**Date:** 2026-04-26

---

## Summary

The codebase is in **STATE E** — Google Sheets is the sole active library backend. Supabase read/write was disabled on 2026-04-22; the relevant scripts are commented out in `index.html`. The GS path (`js/sources-library.js`, `window.SourceLibrary`) auto-loads on every page, serves all source-library dropdowns, and accepts new submissions via an Apps Script endpoint.

The GS path stores spectra as **dB(Z) per band**, confirmed both by explicit `'Lw, dB(Z)'` / `'Lp, dB(Z)'` values in the sheet's `Data type` column (mapped in `DATA_TYPE_APPLICABILITY`) and by the admin form label "Octave-band spectrum (dB, unweighted)". No A-weighting conversion is applied when mapping GS rows into library objects.

**This means the dB(Z) format mismatch identified in the previous audit (`spectrum-format-audit-2026-04.md`) is live and affects every user today.** The fix target is no longer `library-loader.js` (which is dead code) — it is `rebuildSourceLibraries()`, `rebuildLineSourceGrouped()`, and `rebuildAreaSourceGrouped()` in `index.html`, and potentially the GS fallback file `data/sources-fallback.json`.

---

## Library code path inventory (STEP 1)

| File | Purpose | Status | Call site |
|------|---------|--------|-----------|
| `js/sources-library.js` | GS CSV fetcher; exposes `window.SourceLibrary` | **Active — sole read path** | Auto-loads via `DOMContentLoaded` listener; called explicitly by `_sourceLibBoot()` in `index.html` (~line 10547) |
| `js/sources-config.js` | Config stub with ES-module `export const` for GS URLs | **Dormant / dead** — uses `export const`, incompatible with the app's no-build vanilla-JS context; URLs are duplicated verbatim inside `sources-library.js` | Not imported anywhere in `index.html` |
| `data/sources-fallback.json` | GS snapshot generated 2026-04-22; used when sheet fetch fails | **Active — fallback path** | Fetched by `sources-library.js` `loadFallback()` on network failure |
| `library-loader.js` | Supabase read path; exposes `window.ResonateLib` | **Dead — commented out** | `index.html` lines 2163–2167 wrap all three Supabase scripts in an HTML comment block dated 2026-04-22 |
| `supabase-admin.js` | Supabase write / admin panel (magic-link auth + CRUD) | **Dead — commented out** | Same comment block as above |
| `supabase-config.js` / `supabase-config.example.js` | Supabase project URL and key | **Dead — commented out** | Same comment block |

### Key API calls in active path

- **Read:** `fetch('https://docs.google.com/spreadsheets/d/1GW8J6YDlXD77.../gviz/tq?tqx=out:csv&sheet=Sources')` — GViz CSV export, 8-second timeout, 1-hour localStorage cache (key `sourceLibraryCache_v2`).
- **Write (submit new source):** `fetch('https://script.google.com/macros/s/AKfycb.../exec', { method: 'POST', ... })` — Google Apps Script endpoint.

---

## Active path (STEP 2)

When a user opens a source library picker, the call chain is:

```
User opens dropdown
  → dropdown renders from SOURCE_LIBRARY_GROUPED (point) /
    LINE_SOURCE_LIBRARY_GROUPED (line) /
    AREA_SOURCE_LIBRARY_GROUPED (area)
      → each populated by rebuildSourceLibraries() / rebuildLineSourceGrouped() /
         rebuildAreaSourceGrouped()
           → each calls window.SourceLibrary.getGroupedLibraryForSourceType(panelContext)
             → returns rows from _cachedRows (in-memory)
               → _cachedRows populated by loadSourceLibrary()
                 → fetches GS CSV from GVIZ URL → normaliseRow() → rows[]
                 → fallback: fetch('data/sources-fallback.json')
```

There is **no feature flag** and **no conditional** that selects between Supabase and GS. The Supabase path is entirely absent from the runtime (scripts are not loaded). `window.ResonateLib` is undefined at runtime.

**No environment-dependent switching** — the same GS URL is hardcoded unconditionally in `js/sources-library.js` line 23.

---

## GS state classification (STEP 3)

**STATE E — Live and Supabase deprecated.**

Evidence:

1. **Scripts commented out (index.html lines 2163–2167):**
   ```html
   <!-- ─── SUPABASE (disabled 2026-04-22) ──────────────────────────────────────
   <script src="supabase-config.js?v=1" …></script>
   <script src="library-loader.js?v=1"></script>
   <script src="supabase-admin.js?v=1"></script>
   ──────────────────────────────────────────────────────────────────────────── -->
   <!-- Google Sheets source reference library (sole active source) -->
   <script src="js/sources-library.js?v=4"></script>
   ```

2. **Inline comments in `index.html`:**
   - Line 9223: `// ─── SUPABASE (disabled 2026-04-22) ─ hardcoded point source data below is ─── // immediately overwritten by rebuildSourceLibraries() which pulls from Google Sheets (SourceLibrary).`
   - Line 10437: `// ─── CONSTRUCTION_LIBRARY (Google Sheets only — 2026-04-22) ──────────────────`
   - Line 10470: `// ─── SUPABASE (disabled 2026-04-22) — hardcoded area source data removed ─────`
   - Line 10541: `// ─── SUPABASE (disabled 2026-04-22) ─────────────────────────────────────────`

3. **`rebuildSourceLibraries()` and all analogous rebuild functions** read exclusively from `window.SourceLibrary` — no Supabase branch.

4. **`sources-library.js`** auto-loads via `DOMContentLoaded` listener (line 318–324) — runs unconditionally on every page load.

5. **Only one remote branch exists:** `remotes/origin/main`. No GS feature branch — the integration is fully merged.

6. **`js/sources-config.js`** has the comment: _"Temporary Google Sheets backend; migrate to Supabase later"_ — indicates GS was intended as temporary but is now the live backend. The migration direction written in the comment (GS → Supabase) is the opposite of what actually happened (Supabase was disabled in favour of GS).

---

## GS spectrum format (STEP 4)

**GS stores dB(Z) per band.**

Three independent pieces of evidence:

### 4a. DATA_TYPE_APPLICABILITY labels in `sources-library.js` (lines 33–38)

```javascript
var DATA_TYPE_APPLICABILITY = {
  'Lp, dB(Z)':              ['building_interior'],
  'Lw, dB(Z)':              ['point', 'area'],
  'Lw/m, dB(Z)/m':         ['line'],
  …
};
```

The sheet's `Data type` column explicitly contains the string `'Lw, dB(Z)'` for point and area sources, and `'Lw/m, dB(Z)/m'` for line sources. These are the values the filter machinery uses to route rows to the correct source picker. The "(Z)" suffix is part of the actual sheet column values.

### 4b. Admin form label in `supabase-admin.js` (line 443)

```javascript
var bandHeader = el('div', …, [
  currentKind === 'construction'
    ? 'Octave-band Rw (dB)'
    : 'Octave-band spectrum (dB, unweighted)'   // ← explicit label
]);
```

The admin form that was used to populate the Supabase database (which presumably also populates or mirrors the GS sheet) explicitly labels octave bands as "dB, unweighted". This is consistent with dB(Z) storage.

### 4c. `normaliseRow()` in `sources-library.js` — no A-weighting applied

```javascript
function normaliseRow(raw) {
  return {
    hz_63:   num(raw['63 Hz']),     // raw sheet value — no A-weight added
    hz_125:  num(raw['125 Hz']),
    …
    lp_dba:  num(raw['dB(A)'])      // broadband dB(A) stored in a separate column
  };
}
```

The broadband A-weighted level (`lp_dba`) comes from a dedicated `dB(A)` column in the sheet (equivalent to what `library-loader.js` computed via `overallLwA`). The per-band `hz_*` values are mapped directly with no conversion.

### 4d. Downstream mapping — `spectrum` vs `spectrum_unweighted`

In `rebuildSourceLibraries()` (point sources, `index.html` line 9437):
```javascript
spectrum: [row.hz_63, row.hz_125, row.hz_250, row.hz_500,
           row.hz_1000, row.hz_2000, row.hz_4000, row.hz_8000],
```
Raw dB(Z) values stored directly in `spectrum`. This field feeds `pin.spectrum[period]`, which the engine (`calcISOatPoint`) expects to be dB(A) — same mismatch as the Supabase path.

In `rebuildLineSourceGrouped()` and `rebuildAreaSourceGrouped()` (line 10407, 10483):
```javascript
spectrum_unweighted: {
  63: row.hz_63, 125: row.hz_125, …
}
```
These use the field name `spectrum_unweighted` — explicitly named as unweighted. Whether the line/area calculation path applies A-weighting at use is outside the scope of this audit; see Open Questions.

### 4e. `data/sources-fallback.json` — same format

The fallback snapshot (`_generated: "2026-04-22", _source: "Google Sheets snapshot"`) uses identical `hz_*` column names mapped by the same `normaliseRow`. No unit conversion in the snapshot. The dB(Z) format issue applies to fallback-served data equally.

---

## Supabase production status (STEP 5)

**Supabase is completely dead — not called anywhere in the runtime.**

- `library-loader.js`, `supabase-admin.js`, and `supabase-config.js` are inside an HTML comment block and are not loaded by the browser.
- `window.ResonateLib` is never defined. The boot function `_resonateLibBoot()` that called `ResonateLib.load()` is commented out (line 10542).
- The `rebuildAllLibraries()` function (exposed on `window` for use by the admin panel's `refreshLibrariesFromSupabase()`) is defined but `refreshLibrariesFromSupabase()` itself is never called because `supabase-admin.js` is not loaded.
- No network calls to any `*.supabase.co` host are made by the running application.

**Consequence for the dB(Z) bug:** The previous audit identified `library-loader.js mapPointSourceRow` as the fix target. That fix is now **irrelevant** because `library-loader.js` is not loaded. The live bug is in the GS mapping functions inside `index.html`.

---

## Decision matrix

| IF state is... | THEN the next fix prompt should... | AND the dB(Z) Supabase bug urgency is... |
|---|---|---|
| **STATE A** (GS not started) | Design GS schema to use dB(A) per band. No code fix needed. Add column convention to data-entry guidance. | LOW — only `library-loader.js` (Supabase) is active. Fix `mapPointSourceRow` in `library-loader.js`. |
| **STATE B** (GS on branch only) | Ensure GS branch applies A-weighting in its row-mapping function before merging. No urgent fix to main. | MEDIUM — Supabase is still serving live predictions. Fix `mapPointSourceRow` in `library-loader.js`. |
| **STATE C** (GS merged, dormant) | Fix the GS mapping function in preparation for activating it. Also fix `library-loader.js` since Supabase is still live. | HIGH — Supabase is live. Fix `mapPointSourceRow` in `library-loader.js` immediately. |
| **STATE D** (both live) | Fix both `library-loader.js mapPointSourceRow` AND the GS mapping in `rebuildSourceLibraries` / `rebuildLineSourceGrouped` / `rebuildAreaSourceGrouped`. | HIGH — both paths are producing wrong predictions. |
| **STATE E** (GS sole backend — **confirmed**) | **Fix `rebuildSourceLibraries()` and analogous functions in `index.html`.** Add `+ A_WEIGHTS[i]` when constructing each `spectrum: [row.hz_63, …]` array. Apply equivalent conversion for line and area source `spectrum_unweighted` mapping (or convert at assignment time). Fix `data/sources-fallback.json` values, or convert at load time. The `library-loader.js mapPointSourceRow` fix identified in the previous audit is irrelevant — skip it. | NONE — Supabase is dead. No live path touches `library-loader.js`. |

**Actual state: STATE E.** Use the STATE E row.

---

## Open questions

1. **Line and area source `spectrum_unweighted` at calculation time** — this audit confirmed that line/area sources store dB(Z) in a field named `spectrum_unweighted`. Whether the calculation code that consumes this field applies A-weighting before passing values to the engine is outside this audit's scope. A third spectrum-format audit specific to line and area source propagation paths is needed before fixing those paths.

2. **`data/sources-fallback.json` unit content** — the fallback JSON was generated as a GS snapshot on 2026-04-22. Its `hz_*` values will have whatever unit the sheet stores (confirmed dB(Z) by this audit). The fix can either: (a) apply A-weighting in `normaliseRow()` so both live and fallback rows are converted at parse time, or (b) regenerate the fallback JSON after the fix lands. Option (a) is simpler and covers both paths in a single change.

3. **`js/sources-config.js` — can it be deleted?** — it uses `export const` syntax and is not loaded by `index.html`. It appears to be a leftover design artefact. It can safely be deleted or confirmed as a development-only reference file. No action needed for the spectrum fix.

4. **`supabase-admin.js` write path with GS as backend** — the admin write panel still writes to Supabase (PostgREST REST calls), but the read path now pulls from GS. If these are different data stores, writes via the admin panel no longer affect what users see. This is a data-source consistency issue separate from the spectrum format question; needs confirmation.

5. **GS column headers — visual inspection** — the `Data type` column values `'Lw, dB(Z)'` etc. are confirmed by code, but the actual sheet was not fetched (per audit scope). Manually opening the sheet to confirm column headers match code expectations would provide additional assurance before the fix lands.

---

*Audit conducted: 2026-04-26. Evidence: `js/sources-library.js` (DATA_TYPE_APPLICABILITY, normaliseRow, fetchSheet), `index.html` (HTML comment block 2163–2167, rebuildSourceLibraries line 9427–9457, rebuildLineSourceGrouped line 10398–10417, rebuildAreaSourceGrouped line 10474–10493, comments at 9223/10437/10470/10541), `supabase-admin.js` (admin form band label line 443), `data/sources-fallback.json` (_generated/_source fields), `js/sources-config.js` (migration comment). No source code modified.*
