/* ============================================================================
 * js/zone-categories.js
 *
 * This map governs the visual colour of the PlanSA Zones display layer only.
 * SA criteria derivation uses SAPPA API at each receiver — not this map.
 * Any zone name in the PMTiles that isn't in this map renders magenta
 * (obvious "please add me" signal during QA).
 *
 * POPULATING: run MODE=discover Action, read data/_discovery.json for every
 * distinct zone name, add exact title-cased entries here, then run MODE=build.
 *
 * Exposes window.ZoneCategories = { ZONE_CATEGORY_MAP, CATEGORY_COLOURS,
 *   CATEGORY_LABELS, categoriseZone }
 * ========================================================================== */
(function () {
  'use strict';

  /**
   * Exact zone name → category mapping.
   * Keys must be EXACTLY as they appear in the PMTiles (title-cased by the
   * build script). Values must be one of the CATEGORY_COLOURS keys below.
   *
   * NOTE: this map is intentionally EMPTY before the first discover run.
   * Populate after running the GitHub Action in discover mode and reviewing
   * data/_discovery.json for every distinct zone name.
   */
  var ZONE_CATEGORY_MAP = {
    // ── Residential ──────────────────────────────────────────────────────────
    // (add entries from _discovery.json after first discover run)

    // ── Commercial ───────────────────────────────────────────────────────────

    // ── Mixed use ────────────────────────────────────────────────────────────

    // ── Industrial ───────────────────────────────────────────────────────────

    // ── Rural ────────────────────────────────────────────────────────────────

    // ── Open space ───────────────────────────────────────────────────────────

    // ── Infrastructure ───────────────────────────────────────────────────────
  };

  var CATEGORY_COLOURS = {
    residential:    '#fff4c2',   // pale yellow
    commercial:     '#d4c5f0',   // pale purple
    mixed_use:      '#c5d8f0',   // pale blue
    industrial:     '#c8c8c8',   // grey
    rural:          '#c8e6c9',   // pale green
    open_space:     '#a5d6a7',   // medium green
    infrastructure: '#bdbdbd',   // mid-grey
    unknown:        '#ff00ff',   // MAGENTA — zone is missing from ZONE_CATEGORY_MAP
  };

  var CATEGORY_LABELS = {
    residential:    'Residential',
    commercial:     'Commercial',
    mixed_use:      'Mixed use',
    industrial:     'Industrial',
    rural:          'Rural',
    open_space:     'Open space',
    infrastructure: 'Infrastructure',
    unknown:        'Uncategorised (tool error \u2014 please report)',
  };

  /**
   * Normalise a zone name for map lookup:
   *   - trim whitespace
   *   - collapse internal runs of spaces to one space
   *   - title-case (mirrors what the build script applies)
   */
  function normalise(zoneName) {
    if (!zoneName) return '';
    return String(zoneName)
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\w\S*/g, function(w) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      });
  }

  /**
   * Returns { category, colour, label, knownCategory, zoneName }
   */
  function categoriseZone(zoneName) {
    var norm = normalise(zoneName);
    var cat  = ZONE_CATEGORY_MAP[norm] || null;

    if (!cat) {
      if (norm) {
        console.warn('[ZoneCategories] Unknown zone name — add to ZONE_CATEGORY_MAP: "' + norm + '"');
      }
      return {
        category:      'unknown',
        colour:        CATEGORY_COLOURS.unknown,
        label:         CATEGORY_LABELS.unknown,
        knownCategory: false,
        zoneName:      norm,
      };
    }

    return {
      category:      cat,
      colour:        CATEGORY_COLOURS[cat] || CATEGORY_COLOURS.unknown,
      label:         CATEGORY_LABELS[cat]  || cat,
      knownCategory: true,
      zoneName:      norm,
    };
  }

  window.ZoneCategories = {
    ZONE_CATEGORY_MAP: ZONE_CATEGORY_MAP,
    CATEGORY_COLOURS:  CATEGORY_COLOURS,
    CATEGORY_LABELS:   CATEGORY_LABELS,
    categoriseZone:    categoriseZone,
  };
}());
