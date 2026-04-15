CoRTN Road Noise Map + Generic Receivers — Phase 5
══════════════════════════════════════════════════════

══════════════════════════════════════════════════════
CONTEXT
══════════════════════════════════════════════════════

CoRTN road traffic noise is fully implemented for
receiver-point calculations (Phases 1–4), but CoRTN
roads do NOT participate in the noise map grid, and
the only receiver points available are R1–R4 (which
are tied to criteria assessment).

This prompt adds TWO features:

A) A "CoRTN Road Noise Map" dropdown under the
   Modelling panel — prediction-only contour map
   (no compliance view), same UI pattern as the
   existing Noise Map but simpler.

B) Generic CoRTN receivers — unlimited blue marker
   points placed on the map. Each shows predicted
   LA10/LAeq from CoRTN roads in a results table.
   Each receiver can optionally pull criteria from
   R1–R4 via a dropdown.

The existing noise map uses ISO 9613-2 exclusively
(noise-worker.js). CoRTN is a completely different
empirical model — its own distance correction
(Chart 7), ground absorption (Chart 8), angle-of-
view (Chart 10), barrier diffraction (Charts 9/9a),
and outputs broadband LA10/LAeq rather than per-band
levels. These must stay separate.

Reference: references/calculations.md §CoRTN

══════════════════════════════════════════════════════
STEP 1 — Add CoRTN Noise Map UI to Modelling panel
══════════════════════════════════════════════════════

In index.html, immediately AFTER the closing </div>
of the existing noise map block (after the
#noiseMapGridWarning span, around line 2188–2189),
and BEFORE the closing </div> of mp-modelling's
mp-body, insert a new CoRTN noise map section.

The HTML mirrors the existing noise map structure
but is prediction-only (no compliance view):

```html
<!-- CoRTN Road Noise Map -->
<button class="mp-btn" id="cortnMapBtn"
  title="Compute CoRTN road traffic noise contour map">
  <svg width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="2"
    style="vertical-align:-2px;flex-shrink:0;">
    <path d="M4 19h3l4-7 3 4 4-8h3"/>
  </svg>
  CoRTN road noise map
</button>
<div id="cortnMapControls"
  style="display:none;flex-direction:column;gap:3px;">

  <!-- Period pills: Day | Night only -->
  <div style="display:flex;gap:2px;padding:2px 4px;">
    <button class="mp-btn active"
      data-cortn-period="day"
      style="flex:1;padding:3px 2px;font-size:11px;
             justify-content:center;">Day</button>
    <button class="mp-btn"
      data-cortn-period="night"
      style="flex:1;padding:3px 2px;font-size:11px;
             justify-content:center;">Night</button>
  </div>

  <!-- Metric toggle: LAeq | LA10 -->
  <div style="display:flex;gap:2px;padding:2px 4px;">
    <button class="mp-btn active"
      data-cortn-metric="laeq"
      style="flex:1;padding:3px 2px;font-size:11px;
             justify-content:center;">
      L<sub>Aeq</sub>
    </button>
    <button class="mp-btn"
      data-cortn-metric="la10"
      style="flex:1;padding:3px 2px;font-size:11px;
             justify-content:center;">
      L<sub>A10</sub>
    </button>
  </div>

  <!-- Height -->
  <div class="mp-sub-row">
    <span>Height:</span>
    <input type="number" id="cortnMapHeight"
      value="1.5" min="0.1" max="50" step="0.5"
      style="width:44px;"
      title="Receiver height for CoRTN grid (m)">
    <span>m</span>
  </div>

  <!-- Grid -->
  <div class="mp-sub-row">
    <span>Grid:</span>
    <select id="cortnMapGridSel" style="flex:1;"
      title="Grid spacing for CoRTN noise map">
      <option value="auto">Auto</option>
      <option value="5">5 m</option>
      <option value="10">10 m</option>
      <option value="20">20 m</option>
      <option value="50">50 m</option>
      <option value="100">100 m</option>
    </select>
    <span id="cortnMapGridLabel"
      style="font-size:9px;"></span>
  </div>

  <!-- Range -->
  <div class="mp-sub-row">
    <span>Range:</span>
    <input type="number" id="cortnLegendMin"
      value="35" min="0" max="119" step="1"
      style="width:40px;"
      title="Legend minimum dB">
    <span>&#8211;</span>
    <input type="number" id="cortnLegendMax"
      value="75" min="1" max="120" step="1"
      style="width:40px;"
      title="Legend maximum dB">
    <span>dB</span>
  </div>

  <!-- Interval -->
  <div class="mp-sub-row">
    <span>Interval:</span>
    <input type="number" id="cortnLegendInterval"
      value="5" min="1" max="20" step="1"
      style="width:40px;"
      title="Contour interval dB">
    <span>dB</span>
  </div>

  <span id="cortnLegendError"
    style="color:#f87171;font-size:10px;display:none;
           padding:0 8px;"></span>
</div>
<span id="cortnMapGridWarning"
  style="display:none;font-size:10px;padding:2px 8px;
         white-space:normal;line-height:1.4;"></span>
```

Notes:
- Prediction only — NO compliance/Δ view on the
  noise map (criteria comparison happens at receiver
  points instead, see Step 5)
- No 1m/2m grid options (CoRTN is broadband — fine
  grids add compute time without precision gain)
- Default range 35–75 dB (road noise typically higher
  than industrial)
- Day/Night only (CoRTN has no evening period)
- No LAmax (CoRTN doesn't compute Lmax)

══════════════════════════════════════════════════════
STEP 2 — Add state variables
══════════════════════════════════════════════════════

Near the existing noise map state variables (around
line 29782–29826), add:

```javascript
/* ── CoRTN Road Noise Map state ── */
var _cortnMapOn = false;
var _cortnMapPeriod = 'day';       // 'day' | 'night'
var _cortnMapMetric = 'laeq';     // 'laeq' | 'la10'
var _cortnMapHeight = 1.5;
var _cortnMapGridSize = 'auto';
var _cortnWorker = null;
var _cortnCanvasLayer = null;
var _cortnContourLayer = null;
var _cortnLegend = null;
var _lastCortnData = null;
var _cortnRecomputeTimer = null;

var _cortnLegendMin = 35;
var _cortnLegendMax = 75;
var _cortnLegendInterval = 5;

/* ── Generic CoRTN Receivers ── */
var cortnReceivers = [];
// Each entry: {
//   id: 'cr_1', 'cr_2', ...
//   name: 'CR1', 'CR2', ... (editable)
//   lat: number,
//   lng: number,
//   criteriaLink: null | 'r1' | 'r2' | 'r3' | 'r4',
//   results: {
//     day:   { la10: null, laeq: null },
//     night: { la10: null, laeq: null }
//   }
// }
var _cortnRecvIdCtr = 0;
var _cortnRecvMarkers = {};   // id → L.marker
var _cortnRecvLayer = null;   // L.layerGroup
```

══════════════════════════════════════════════════════
STEP 3 — Create the CoRTN grid worker
══════════════════════════════════════════════════════

Create a new file `cortn-worker.js` in the project
root (alongside noise-worker.js).

**Input message:**

```javascript
{
  bounds: {north, south, east, west},
  gridResolutionM: number,
  receiverHeight: number,
  period: 'day' | 'night',
  roads: [
    {
      id, vertices,
      aadt, speed_kmh, gradient_pct,
      cv_pct_day, cv_pct_night,
      distFromKerb_m, roadHeight_m,
      surfaceCorrection, surfaceType,
      carriageway, trafficSplit, laneOffset_m,
      periodConfig, aadtPctDay, aadtPctNight,
      dayHours, nightHours,
      austAdjDay, austAdjNight,
      threeSourceHeight,
      groundAbsorption, meanPropHeight_m,
      reflectionAngle_deg,  // always 0 for grid
      barrier: {enabled, height_m, baseRL_m,
                distToBarrier_m}
    },
    ...
  ]
}
```

**Worker algorithm:**

A) Set up the grid exactly like noise-worker.js:
   - Compute rows/cols from bounds and gridResolutionM
   - Same lat/lng stepping logic
   - Snap origin to centroid of all road vertices

B) For each grid cell (r, c):
   1. Compute the cell's lat/lng position
   2. For each road in roads[]:
      a. Compute perpendicular distance from cell to
         road polyline — port _cortnDistanceToPolyline
         into the worker (ENU flat-earth projection)
      b. Compute angle of view from cell to road —
         port _cortnAngleOfViewFromReceiver
      c. Create a temporary road-like object with
         overrides:
         - distFromKerb_m = perpDist - 3.5
           (calcCortnFreeField adds 3.5 internally;
           clamp to min 0.5 so d_horiz >= 4.0 m)
         - angleOfView_deg = computed angle
         - receiverHeight_m = message.receiverHeight
         - reflectionAngle_deg = 0
      d. Call the CoRTN calculation chain:
         - If road.carriageway === 'dual': compute
           near + far lanes, energy-sum
         - If road.threeSourceHeight: compute 4
           sub-sources per lane, energy-sum
         - Otherwise: single calcCortnFreeField call
      e. Extract la10 and laeq from result
   3. Energy-sum contributions from ALL roads:
      la10_total = 10*log10(Σ 10^(la10_i/10))
      laeq_total = 10*log10(Σ 10^(laeq_i/10))
   4. Store both in output grids

C) Post progress messages every ~5% of rows

D) Post completion:
```javascript
{
  type: 'complete',
  gridLaeq: [...],   // flat array, row-major
  gridLa10: [...],   // flat array, row-major
  rows, cols,
  bounds, dLat, dLng, startLat, startLng
}
```

**CRITICAL — Porting CoRTN formulas into the worker:**

The worker runs in a separate thread and cannot call
functions from index.html. Port these functions:

1. calcCortnFreeField(road, period, overrides)
   — full correction chain (Steps B through N)
2. calcCortnRoadPeriod(road, period)
   — dual carriageway + 3-source-height wrapper
3. _cortnCalculateBarrier(road, recv_h)
   — Charts 9/9a polynomial barrier diffraction
4. _cortnDistanceToPolyline(lat, lng, verts)
   — perpendicular distance via ENU projection
5. _cortnAngleOfViewFromReceiver(lat, lng, verts)
   — angle subtended by road from receiver

**Recommended approach:** Create `shared-cortn.js`
that both index.html and cortn-worker.js use.
In index.html: <script src="shared-cortn.js">
In worker: importScripts('shared-cortn.js')
Refactor existing CoRTN functions out of index.html
into shared-cortn.js.

Alternative (simpler): Copy functions directly into
cortn-worker.js. Duplicates code but avoids refactor.

Either way: formulas MUST be identical — do not
simplify or approximate any correction step.

**Barrier handling for grid cells:**

The CoRTN barrier model uses fixed geometry (source →
barrier → receiver in a straight line). For grid
cells, barrier parameters from the road object are
used as-is — not spatially varying per cell. This is
a simplification acceptable for screening. Add a
comment noting this.

══════════════════════════════════════════════════════
STEP 4 — Wire up noise map computation + rendering
══════════════════════════════════════════════════════

Add computeCortnMap() modelled on computeNoiseMap()
but simpler (no terrain DEM, no assessment cases,
no compliance view):

```javascript
function computeCortnMap() {
  if (!_cortnMapOn) return;
  if (cortnRoads.length === 0) return;

  var validRoads = cortnRoads.filter(function(r) {
    return r.aadt > 0 && isFinite(r.aadt);
  });
  if (validRoads.length === 0) return;

  // Grid resolution (same auto logic as ISO map)
  var gridRes;
  if (_cortnMapGridSize === 'auto') {
    var z = map.getZoom();
    gridRes = z >= 18 ? 5 : z >= 16 ? 10
            : z >= 14 ? 25 : 50;
  } else {
    gridRes = parseInt(_cortnMapGridSize, 10);
  }

  // Kill existing worker
  if (_cortnWorker) {
    _cortnWorker.terminate();
    _cortnWorker = null;
  }

  // Serialise roads (strip UI-only fields)
  var workerRoads = validRoads.map(function(r) {
    return {
      id: r.id, vertices: r.vertices,
      aadt: r.aadt, speed_kmh: r.speed_kmh,
      gradient_pct: r.gradient_pct,
      cv_pct_day: r.cv_pct_day,
      cv_pct_night: r.cv_pct_night,
      distFromKerb_m: r.distFromKerb_m,
      roadHeight_m: r.roadHeight_m,
      surfaceCorrection: r.surfaceCorrection,
      surfaceType: r.surfaceType,
      carriageway: r.carriageway,
      trafficSplit: r.trafficSplit,
      laneOffset_m: r.laneOffset_m,
      periodConfig: r.periodConfig,
      aadtPctDay: r.aadtPctDay,
      aadtPctNight: r.aadtPctNight,
      dayHours: r.dayHours,
      nightHours: r.nightHours,
      austAdjDay: r.austAdjDay,
      austAdjNight: r.austAdjNight,
      threeSourceHeight: r.threeSourceHeight,
      groundAbsorption: r.groundAbsorption,
      meanPropHeight_m: r.meanPropHeight_m,
      reflectionAngle_deg: 0,
      barrier: r.barrier
        ? { enabled: r.barrier.enabled,
            height_m: r.barrier.height_m,
            baseRL_m: r.barrier.baseRL_m,
            distToBarrier_m: r.barrier.distToBarrier_m }
        : { enabled: false }
    };
  });

  var bounds = map.getBounds();
  var btn = document.getElementById('cortnMapBtn');
  btn.textContent = 'Computing… 0%';

  _cortnWorker = new Worker('cortn-worker.js');
  _cortnWorker.onmessage = function(e) {
    var msg = e.data;
    if (msg.type === 'progress') {
      btn.textContent = 'Computing… ' + msg.percent + '%';
    } else if (msg.type === 'complete') {
      _lastCortnData = msg;
      renderCortnCanvas(_lastCortnData);
      showCortnLegend();
      // Restore button HTML
      btn.innerHTML = '...'; // restore SVG + text
    } else if (msg.type === 'error') {
      console.error('CoRTN worker error:', msg.message);
      btn.innerHTML = '...'; // restore
    }
  };

  _cortnWorker.postMessage({
    bounds: {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest()
    },
    gridResolutionM: gridRes,
    receiverHeight: _cortnMapHeight,
    period: _cortnMapPeriod,
    roads: workerRoads
  });
}
```

**Rendering functions** (mirror existing noise map):

renderCortnCanvas(data):
  - Select grid based on _cortnMapMetric:
    data.gridLaeq or data.gridLa10
  - Same getNoiseColour() colour scale
  - Use _cortnLegendMin/_cortnLegendMax for range
  - Create image overlay on _cortnCanvasLayer
  - Call generateCortnContourLines(data)

generateCortnContourLines(data):
  - Same marching-squares algorithm
  - Use _cortnLegendMin/Max/Interval for thresholds

showCortnLegend():
  - L.control at 'bottomright'
  - Title: "CoRTN LAeq dB(A)" or "CoRTN LA10 dB(A)"

removeCortnMap():
  - Remove _cortnCanvasLayer, _cortnContourLayer,
    _cortnLegend from map

**Metric toggle:** When user switches LAeq ↔ LA10,
do NOT recompute — just re-render from _lastCortnData
using the other grid array. Instant toggle.

══════════════════════════════════════════════════════
STEP 5 — Generic CoRTN receivers: map markers
══════════════════════════════════════════════════════

Add a new map interaction mode for placing CoRTN
receivers. These are independent of R1–R4.

**A. Placement button**

Add a new button in the Mapping toolbar section
(where the existing receiver buttons R1–R4 live),
visually separated from R1–R4:

```html
<!-- After the R4 button, add a divider + CoRTN
     receiver button -->
<div style="border-top:1px solid rgba(255,255,255,0.1);
            margin:3px 0;"></div>
<button class="mp-btn" id="addCortnRecvBtn"
  title="Place CoRTN prediction receiver">
  <div style="width:12px;height:12px;border-radius:50%;
    background:#3b82f6;display:inline-block;
    vertical-align:-1px;margin-right:3px;
    box-shadow:0 1px 2px rgba(0,0,0,0.3);"></div>
  CoRTN receiver
</button>
```

**B. Click handler**

When addCortnRecvBtn is active and the user clicks
the map:
1. Create a new receiver object:
   ```javascript
   {
     id: 'cr_' + (++_cortnRecvIdCtr),
     name: 'CR' + _cortnRecvIdCtr,
     lat: latlng.lat,
     lng: latlng.lng,
     criteriaLink: null,  // null|'r1'|'r2'|'r3'|'r4'
     results: {
       day:   { la10: null, laeq: null },
       night: { la10: null, laeq: null }
     }
   }
   ```
2. Push to cortnReceivers[]
3. Create map marker (see C below)
4. Compute predictions for this receiver (see Step 6)
5. Update the results table (see Step 7)

**C. Marker styling — blue solid circles**

Use L.divIcon matching the existing receiver pattern
but with a SOLID blue fill (not white with coloured
border like R1–R4):

```javascript
function makeCortnRecvIcon(label) {
  var D = 14;
  return L.divIcon({
    className: '',
    html: '<div style="' +
      'width:' + D + 'px;height:' + D + 'px;' +
      'border-radius:50%;' +
      'background:#3b82f6;' +     // solid blue fill
      'border:2px solid #1d4ed8;' + // darker blue border
      'box-shadow:0 1px 3px rgba(0,0,0,0.4);' +
      'display:flex;align-items:center;' +
      'justify-content:center;' +
      'font-size:8px;font-weight:700;' +
      'font-family:sans-serif;color:#fff;' +
      'line-height:1;pointer-events:none;' +
      '">' + (label || '') + '</div>',
    iconSize: [D, D],
    iconAnchor: [D / 2, D / 2],
    popupAnchor: [0, -(D / 2 + 4)]
  });
}
```

The label inside the dot can be empty (clean dot) or
a short number if it helps identification. Either way
is fine — if empty, the dots are clean solid blue
circles that are visually distinct from the white-
with-coloured-border R1–R4 markers.

**D. Marker behaviour**

Each marker must be:
- **Draggable** — on drag end, update lat/lng,
  recompute predictions, update table
- **Has popup** — show name (editable), lat/lng,
  delete button
- **Click** — opens popup
- Stored in _cortnRecvMarkers[id] = L.marker
- All markers added to _cortnRecvLayer (L.layerGroup
  added to map on init)

**E. Delete receiver**

From the popup, a "Delete" button removes:
- The marker from the map and _cortnRecvMarkers
- The entry from cortnReceivers[]
- The row from the results table
- Triggers table re-render

══════════════════════════════════════════════════════
STEP 6 — Compute predictions at generic receivers
══════════════════════════════════════════════════════

For each generic CoRTN receiver, compute predicted
levels from all CoRTN roads. This runs on the MAIN
THREAD (not the worker) — same approach as the
existing calcCortnRoadAtReceiver for R1–R4.

```javascript
function calcCortnAtGenericReceiver(recv) {
  // For each period (day, night):
  ['day', 'night'].forEach(function(period) {
    var la10_sum = 0;
    var laeq_sum = 0;
    var hasContribution = false;

    cortnRoads.forEach(function(road) {
      if (!road.aadt || road.aadt <= 0) return;

      // Compute perpendicular distance
      var perpDist = _cortnDistanceToPolyline(
        recv.lat, recv.lng, road.vertices);
      // Compute angle of view
      var angle = _cortnAngleOfViewFromReceiver(
        recv.lat, recv.lng, road.vertices);

      // Clone road with receiver-specific overrides
      var clone = Object.assign({}, road);
      clone.distFromKerb_m = Math.max(0.5,
        perpDist - 3.5);
      clone.angleOfView_deg = angle;
      clone.receiverHeight_m = _cortnMapHeight;
      clone.reflectionAngle_deg = 0;

      var result = calcCortnRoadPeriod(clone, period);
      if (result.la10 != null) {
        la10_sum += Math.pow(10, result.la10 / 10);
        hasContribution = true;
      }
      if (result.laeq != null) {
        laeq_sum += Math.pow(10, result.laeq / 10);
      }
    });

    recv.results[period] = {
      la10: hasContribution
        ? 10 * Math.log10(la10_sum) : null,
      laeq: hasContribution
        ? 10 * Math.log10(laeq_sum) : null
    };
  });
}
```

Call this function:
- When a receiver is first placed
- When a receiver is dragged to a new position
- When any CoRTN road is added/edited/deleted
  (recalculate ALL generic receivers)
- When receiver height changes

After calculation, update the results table (Step 7).

══════════════════════════════════════════════════════
STEP 7 — CoRTN predicted levels results table
══════════════════════════════════════════════════════

Add a new results section in the right-hand panel,
near the existing "Predicted noise levels" card.
This is a SEPARATE card specifically for CoRTN
receiver predictions.

**A. HTML — new card**

Insert a new card after the existing predicted noise
levels card (around line 3164):

```html
<div class="card span2" id="cortnPredCard"
  style="display:none;">
  <h3 style="display:flex;align-items:center;gap:6px;">
    <div style="width:10px;height:10px;
      border-radius:50%;background:#3b82f6;
      flex-shrink:0;"></div>
    CoRTN predicted levels
  </h3>
  <div class="table-scroll" id="cortnPredTableWrap">
    <!-- Tables rendered dynamically -->
  </div>
</div>
```

Show #cortnPredCard when cortnReceivers.length > 0.

**B. Table structure**

Render TWO tables (Day and Night), each with columns:

```
| Receiver | LAeq | LA10 | Criterion | Δ  |
```

- **Receiver column:** Shows receiver name (e.g.
  "CR1") — make it an editable text field or
  clickable-to-rename (same pattern as receiver names
  in the existing panel)
- **LAeq column:** Predicted LAeq from all roads,
  rounded to nearest integer
- **LA10 column:** Predicted LA10 from all roads,
  rounded to nearest integer
- **Criterion column:** If criteriaLink is set (e.g.
  'r1'), look up the criteria for that linked receiver
  and show it. If null, show "—" (no criteria)
- **Δ column:** If criterion is set, show
  LAeq − criterion. Colour green if ≤ 0 (compliant),
  red if > 0 (exceedance). If no criterion, show "—"

Each row also has a small dropdown to link criteria:

```html
<select class="cortn-recv-criteria-sel"
  data-recv-id="cr_1"
  style="font-size:10px;width:55px;
    background:#374151;color:#f3f4f6;
    border:1px solid #4b5563;border-radius:3px;">
  <option value="">None</option>
  <option value="r1">R1</option>
  <option value="r2">R2</option>
  <option value="r3">R3</option>
  <option value="r4">R4</option>
</select>
```

Place this dropdown in the Receiver column (after the
name) or as a 6th column "Criteria from". Either
works — whichever fits better visually.

**C. Rendering function**

```javascript
function renderCortnReceiverTable() {
  var card = document.getElementById('cortnPredCard');
  var wrap = document.getElementById('cortnPredTableWrap');
  if (cortnReceivers.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  var html = '';
  ['day', 'night'].forEach(function(period) {
    var label = period === 'day' ? 'Day' : 'Night';
    html += '<div class="pred-period-lbl">' +
      label + '</div>';
    html += '<table class="pred-table">';
    html += '<thead><tr>' +
      '<th>Receiver</th>' +
      '<th class="num">L<sub>Aeq</sub></th>' +
      '<th class="num">L<sub>A10</sub></th>' +
      '<th>Criteria</th>' +
      '<th class="num">Criterion</th>' +
      '<th class="num">Δ</th>' +
      '</tr></thead><tbody>';

    cortnReceivers.forEach(function(recv) {
      var r = recv.results[period];
      var laeq = r.laeq != null
        ? Math.round(r.laeq) : '—';
      var la10 = r.la10 != null
        ? Math.round(r.la10) : '—';

      // Look up criterion from linked receiver
      var criterion = null;
      var criterionStr = '—';
      var deltaStr = '—';
      var deltaClass = '';
      if (recv.criteriaLink) {
        // Get criterion from the linked R1–R4
        // receiver's criteria result for this period
        criterion = getReceiverCriterion(
          recv.criteriaLink, period);
        if (criterion != null) {
          criterionStr = Math.round(criterion);
          if (r.laeq != null) {
            var delta = Math.round(r.laeq) - criterion;
            deltaStr = (delta > 0 ? '+' : '') + delta;
            deltaClass = delta <= 0
              ? 'cell-ok' : 'cell-bad';
          }
        }
      }

      // Criteria dropdown
      var selHtml = '<select class="cortn-recv-criteria-sel"'
        + ' data-recv-id="' + recv.id + '"'
        + ' style="font-size:10px;width:55px;'
        + 'background:#374151;color:#f3f4f6;'
        + 'border:1px solid #4b5563;'
        + 'border-radius:3px;">'
        + '<option value="">None</option>'
        + '<option value="r1"'
        + (recv.criteriaLink==='r1'?' selected':'')
        + '>R1</option>'
        + '<option value="r2"'
        + (recv.criteriaLink==='r2'?' selected':'')
        + '>R2</option>'
        + '<option value="r3"'
        + (recv.criteriaLink==='r3'?' selected':'')
        + '>R3</option>'
        + '<option value="r4"'
        + (recv.criteriaLink==='r4'?' selected':'')
        + '>R4</option>'
        + '</select>';

      html += '<tr>'
        + '<td>' + recv.name + '</td>'
        + '<td class="num">' + laeq + '</td>'
        + '<td class="num">' + la10 + '</td>'
        + '<td>' + selHtml + '</td>'
        + '<td class="num">' + criterionStr + '</td>'
        + '<td class="num ' + deltaClass + '">'
        + deltaStr + '</td>'
        + '</tr>';
    });

    html += '</tbody></table>';
  });

  wrap.innerHTML = html;

  // Wire up criteria dropdowns after render
  wrap.querySelectorAll('.cortn-recv-criteria-sel')
    .forEach(function(sel) {
      sel.addEventListener('change', function() {
        var id = this.dataset.recvId;
        var recv = cortnReceivers.find(
          function(r) { return r.id === id; });
        if (recv) {
          recv.criteriaLink = this.value || null;
          renderCortnReceiverTable(); // re-render
        }
      });
    });
}
```

**D. getReceiverCriterion() helper**

This function looks up the noise criterion that
applies to a linked R1–R4 receiver for a given
period. It should pull from the same criteria data
that the existing predicted noise levels table uses
— the zone-based criterion for that receiver's
position and the active state (SA/VIC/NSW).

```javascript
function getReceiverCriterion(receiverKey, period) {
  // receiverKey is 'r1', 'r2', 'r3', or 'r4'
  // period is 'day' or 'night'
  // Return the applicable criterion in dB(A),
  // or null if no criterion is available
  //
  // Look this up from the same zone/criteria data
  // that renderResults() uses for R1–R4
}
```

The exact implementation depends on how the existing
criteria lookup works — trace through renderResults()
to find where it gets the criterion value for each
receiver and period, then expose that logic as a
reusable function.

══════════════════════════════════════════════════════
STEP 8 — Wire up event handlers
══════════════════════════════════════════════════════

**Noise map handlers:**

1. cortnMapBtn click:
   - Toggle _cortnMapOn
   - Show/hide #cortnMapControls
   - If on: computeCortnMap()
   - If off: removeCortnMap()

2. [data-cortn-period] pill click:
   - Set _cortnMapPeriod
   - Update active class
   - If _cortnMapOn: computeCortnMap()

3. [data-cortn-metric] pill click:
   - Set _cortnMapMetric
   - Update active class
   - If _lastCortnData: re-render (no recompute)
   - Update legend title

4. #cortnMapHeight change:
   - Validate 0.1–50, set _cortnMapHeight
   - Debounced recompute (1000ms)
   - Also recompute all generic receiver predictions

5. #cortnMapGridSel change:
   - Set _cortnMapGridSize
   - Show grid warnings (same pattern)
   - Debounced recompute

6. #cortnLegendMin/Max/Interval change:
   - Validate ranges
   - Re-render from _lastCortnData (no recompute)

7. Map move/zoom:
   - In existing 'moveend' handler, also trigger
     debounced recompute for CoRTN map if _cortnMapOn

8. CoRTN road changes:
   - When a road is added/edited/deleted and
     _cortnMapOn: debounced recompute
   - Also recompute all generic receiver predictions

**Receiver handlers:**

9. addCortnRecvBtn click:
   - Enter placement mode (same pattern as R1–R4
     placement — cursor changes, next map click
     places a receiver)

10. Map click (in CoRTN receiver placement mode):
    - Create receiver object, marker, compute, render

11. Marker drag end:
    - Update receiver lat/lng
    - Recompute predictions for this receiver
    - Update table

12. Popup delete button:
    - Remove receiver from array, marker from map
    - Re-render table

13. Criteria dropdown change:
    - Update recv.criteriaLink
    - Re-render table (criteria column updates)

**Overlap warning:**

When both ISO and CoRTN noise maps are active, show
a subtle amber info note inside #cortnMapControls:
"ℹ ISO noise map is also active — contours may
overlap" (and vice versa).

══════════════════════════════════════════════════════
STEP 9 — Save/load integration
══════════════════════════════════════════════════════

**Save** (around line 17745):

```javascript
// CoRTN noise map settings
data.cortnMapSettings = {
  period: _cortnMapPeriod,
  metric: _cortnMapMetric,
  height: _cortnMapHeight,
  gridSize: _cortnMapGridSize,
  legendMin: _cortnLegendMin,
  legendMax: _cortnLegendMax,
  legendInterval: _cortnLegendInterval
};

// Generic CoRTN receivers
data.cortnReceivers = cortnReceivers.map(function(r) {
  return {
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    criteriaLink: r.criteriaLink
  };
});
```

**Load** (around line 29502):

```javascript
if (data.cortnMapSettings) {
  var s = data.cortnMapSettings;
  _cortnMapPeriod = s.period || 'day';
  _cortnMapMetric = s.metric || 'laeq';
  _cortnMapHeight = s.height || 1.5;
  _cortnMapGridSize = s.gridSize || 'auto';
  _cortnLegendMin = s.legendMin ?? 35;
  _cortnLegendMax = s.legendMax ?? 75;
  _cortnLegendInterval = s.legendInterval ?? 5;
  // Update UI inputs to match
}

if (data.cortnReceivers && data.cortnReceivers.length) {
  _cortnRecvIdCtr = 0;
  data.cortnReceivers.forEach(function(r) {
    var recv = {
      id: r.id,
      name: r.name,
      lat: r.lat,
      lng: r.lng,
      criteriaLink: r.criteriaLink || null,
      results: {
        day: { la10: null, laeq: null },
        night: { la10: null, laeq: null }
      }
    };
    // Track max ID counter
    var num = parseInt(r.id.replace('cr_', ''), 10);
    if (num > _cortnRecvIdCtr) _cortnRecvIdCtr = num;

    cortnReceivers.push(recv);
    // Create map marker
    var marker = L.marker([recv.lat, recv.lng], {
      icon: makeCortnRecvIcon(''),
      draggable: true
    });
    // Wire up drag + popup
    _cortnRecvMarkers[recv.id] = marker;
    _cortnRecvLayer.addLayer(marker);
  });

  // Recompute all predictions
  cortnReceivers.forEach(calcCortnAtGenericReceiver);
  renderCortnReceiverTable();
}
```

The noise map itself is NOT auto-computed on load
(user clicks to generate). Receivers ARE recomputed
on load (lightweight, main-thread calculation).

══════════════════════════════════════════════════════
STEP 10 — Update skill reference files
══════════════════════════════════════════════════════

After implementation is complete, update:

1. references/changelog.md — Add bullet under
   current month.

2. references/architecture.md — Update:
   - New file: cortn-worker.js (and shared-cortn.js
     if Option A)
   - New data structure: cortnReceivers[]
   - New UI: CoRTN Road Noise Map panel, CoRTN
     receiver button, CoRTN predicted levels card
   - New state variables
   - New data flow: CoRTN grid + receiver predictions

3. references/calculations.md — Add section:
   "CoRTN Grid Computation" documenting:
   - Per-cell distance and angle calculation
   - Barrier simplification (fixed geometry)
   - No terrain screening (flat ground assumption)
   - Reflection exclusion in grid mode
   Add section: "Generic CoRTN Receivers" documenting:
   - Per-receiver distance + angle computation
   - Energy-sum of all road contributions
   - Optional criteria linkage to R1–R4

4. references/uat-tests.md — Add test cases:
   - Single road, day LAeq grid vs receiver point
   - Dual carriageway grid computation
   - 3-source-height grid computation
   - Metric toggle (LAeq ↔ LA10) without recompute
   - Period toggle (Day ↔ Night) with recompute
   - Place generic receiver, verify prediction
   - Drag receiver, verify prediction updates
   - Link criteria from R1, verify Δ column
   - Delete receiver, verify removal
   - Save/load round-trip (map settings + receivers)
   - 10+ receivers without performance issues

5. references/soundplan-comparison.md — Add note:
   "CoRTN grid uses fixed barrier geometry per road
   (not spatially varying). SoundPLAN computes
   barrier insertion loss per grid cell with actual
   barrier geometry. Known simplification."

Only update files relevant to this change.

══════════════════════════════════════════════════════
DO NOT CHANGE
══════════════════════════════════════════════════════

  - Existing ISO 9613-2 noise map — all of:
    noise-worker.js, computeNoiseMap(),
    buildWorkerSources(), renderNoiseCanvas(),
    generateContourLines(), showNoiseLegend(),
    all #noiseMap* UI elements and event handlers
  - Existing CoRTN receiver-point calculations —
    calcCortnFreeField, calcCortnRoadPeriod,
    recalcCortnRoad, calcCortnRoadAtReceiver,
    _cortnCalculateBarrier (must remain working
    exactly as they are; if refactored into
    shared-cortn.js, behaviour must be identical)
  - Existing R1–R4 receiver system — markers,
    placement, criteria lookup, predicted noise
    levels table
  - CoRTN road UI panel (add/edit/delete roads)
  - All other source types (point, line, area,
    building)
  - Save/load of existing fields (cortnRoads[],
    sourcePins[], etc.)
  - Criteria panels (SA, VIC, NSW)

══════════════════════════════════════════════════════
VERIFICATION
══════════════════════════════════════════════════════

Noise map:

1.  CoRTN Road Noise Map button appears in Modelling
    panel, below the existing Noise Map

2.  Clicking shows controls: Day/Night pills,
    LAeq/LA10 toggle, Height, Grid, Range, Interval

3.  With a CoRTN road with valid AADT, clicking
    computes and displays contours

4.  Day ↔ Night toggle triggers recomputation

5.  LAeq ↔ LA10 toggle re-renders instantly (no
    recompute) and updates legend title

6.  Grid resolution changes work (Auto + manual)

7.  Existing ISO noise map still works — no regression

Generic receivers:

8.  "CoRTN receiver" button appears in Mapping toolbar

9.  Clicking the button then clicking the map places
    a blue solid circle marker

10. CoRTN predicted levels card appears in right panel
    with Day and Night tables

11. Table shows Receiver name, LAeq, LA10, Criteria
    dropdown, Criterion, and Δ columns

12. Selecting "R1" in criteria dropdown pulls in R1's
    criterion and shows Δ with green/red colouring

13. Selecting "None" clears criterion and Δ columns

14. Dragging a receiver updates predictions in table

15. Deleting a receiver via popup removes marker and
    table row

16. Place 10+ receivers — no performance issues,
    all show predictions

17. Spot-check: place a generic receiver at the same
    location as R1. The CoRTN predicted LAeq at the
    generic receiver should match the CoRTN LAeq
    shown for R1 in the existing results

Integration:

18. Existing CoRTN R1–R4 calculations still produce
    identical results — no regression

19. Save → load round-trips: CoRTN map settings,
    generic receivers (positions, names, criteria
    links) all restored

20. Both noise maps can be active simultaneously

21. No console errors
