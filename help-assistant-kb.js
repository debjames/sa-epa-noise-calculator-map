/* ══════════════════════════════════════════════════════════════════════
   Help Assistant — knowledge base
   Rule-based only. No API calls. No LLM.
   Selectors use:
     - native IDs where stable (e.g. #drawBarrierBtn)
     - [data-help="…"] attributes added to index.html for elements
       that lack stable IDs

   CANONICAL TERMS (use these in all three help surfaces)
   ─────────────────────────────────────────────────────
   LHS sidebar:          "Planning & modelling"
   RHS sidebar:          "Criteria & compliance"
   Toolbar dropdowns:    "Tools menu", "Mapping menu", "Modelling menu",
                         "Propagation panel"
   RHS cards:            "Receivers & criteria", "VIC assessment parameters",
                         "NSW assessment parameters", "Noise sources",
                         "Predicted noise levels"
   Penalty card:         "Characteristic penalties" (SA) /
                         "Characteristic adjustments" (VIC) /
                         "Modifying factor corrections" (NSW)
                         → refer collectively as "penalty / corrections card"
   Objects panel:        "Objects" (floating panel, objectsToggleBtn)

   CANONICAL STANDARD REFERENCES
   ─────────────────────────────
   ISO 9613-2           — the propagation standard (no year in user-facing text)
   ISO 9613-2 §7.5      — with clause (use § not "section")
   ISO 9613-1           — atmospheric absorption standard
   ISO/TR 17534-3       — software conformance test report (no year in user-facing text)
   EPA Publication 1826.5 — VIC (full form in formal text; "EPA Pub 1826.5" acceptable in HA/QR)
   NSW NPI              — Noise Policy for Industry (NSW EPA, 2017)
   SA Noise Policy      — Environment Protection (Commercial and Industrial Noise) Policy 2023
   CoRTN                — UK Calculation of Road Traffic Noise, with Australian +2.5 dB adjustment
   ══════════════════════════════════════════════════════════════════════ */
window.HELP_ASSISTANT_KB = {
  version: 1,

  suggestions: [
    'How do I add a noise source?',
    'How do I add a receiver?',
    'How do I add a CoRTN road source?',
    'How do I set SA/VIC/NSW criteria?',
    'How do I use Scenarios?',
    'How do I add a custom source?',
    'How do I open the 3D viewer?',
    'How do I export a report?'
  ],

  topics: [

    /* ── 1. Add point source ─────────────────────────────────────────── */
    {
      id: 'add-point-source',
      patterns: [
        'add source', 'add noise source', 'place source', 'new source',
        'add point source', 'point source', 'how do i add a source',
        'place noise source', 'create source'
      ],
      title: 'Add a point noise source',
      answer: 'Open the Tools menu and click "Point source", then click on the map to place it. Click the pin to enter sound power levels for each operating period.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#mapMode-addSource', label: '1. Click "Point source" to activate placement mode', scrollIntoView: true },
        { type: 'tip', label: '2. Click on the map where the source is located, then click the pin to enter octave-band sound power levels.' }
      ],
      related: ['add-line-source', 'add-area-source', 'enter-source-levels']
    },

    /* ── 2. Add line source ──────────────────────────────────────────── */
    {
      id: 'add-line-source',
      patterns: [
        'line source', 'add line source', 'draw line source',
        'rail source', 'conveyor', 'pipeline source', 'lw per metre'
      ],
      title: 'Add a line source (rail / conveyor / pipeline)',
      answer: 'Open the Tools menu and click "Line source" to draw a polyline for rail, conveyor, pipeline, or any source expressed as Lw′ per metre. For road traffic noise, use the Road (CoRTN) tool instead.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#drawLineSourceBtn', label: '1. Click "Line source" to start drawing', scrollIntoView: true },
        { type: 'tip', label: '2. Click on the map to add vertices. Double-click or press Enter to finish. Click the line to enter Lw′/m levels.' }
      ],
      related: ['add-road-source', 'add-point-source', 'enter-source-levels']
    },

    /* ── 3. Add area source ──────────────────────────────────────────── */
    {
      id: 'add-area-source',
      patterns: [
        'area source', 'add area source', 'draw area', 'polygon source',
        'car park', 'outdoor dining', 'diffuse source', 'industrial area'
      ],
      title: 'Add an area source',
      answer: 'Open the Tools menu and click "Area source" to draw a polygon representing a distributed source such as a car park or outdoor activity area.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#drawAreaSourceBtn', label: '1. Click "Area source" to start drawing a polygon', scrollIntoView: true },
        { type: 'tip', label: '2. Click the map to draw the polygon boundary. Double-click or press Enter to close it, then click the polygon to enter source levels.' }
      ],
      related: ['add-point-source', 'add-line-source', 'enter-source-levels']
    },

    /* ── 4. Add building source ──────────────────────────────────────── */
    {
      id: 'add-building-source',
      patterns: [
        'building source', 'add building source', 'facade noise', 'roof noise',
        'building facade', 'mechanical plant building', 'draw building source'
      ],
      title: 'Add a building source',
      answer: 'Open the Tools menu and click "Building source" to draw a building polygon whose facade and/or roof radiates noise. Enter interior sound pressure level and construction details.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#drawBuildingSourceBtn', label: '1. Click "Building source" to draw the building footprint', scrollIntoView: true },
        { type: 'tip', label: '2. Draw the footprint on the map. Click the resulting polygon to set the interior noise level and wall/roof construction.' }
      ],
      related: ['add-point-source', 'draw-building', 'enter-source-levels']
    },

    /* ── 5. Add receiver ─────────────────────────────────────────────── */
    {
      id: 'add-receiver',
      patterns: [
        'add receiver', 'place receiver', 'receiver location', 'add receptor',
        'new receiver', 'place r1', 'add r2', 'receiver 1', 'receiver 2',
        'receiver 3', 'receiver 4', 'sensitive receptor'
      ],
      title: 'Add a receiver',
      answer: 'Open the Tools menu and click a Receiver button (1–4) to activate placement mode, then click on the map where the receiver is. Up to 4 receivers can be placed.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#mapMode-r1', label: '1. Click "Receiver 1" (or 2–4) to activate placement mode', scrollIntoView: true },
        { type: 'tip', label: '2. Click on the map where the receiver is located. Drag the pin to fine-tune its position.' }
      ],
      related: ['set-criteria-sa', 'set-criteria-vic', 'predicted-levels']
    },

    /* ── 6. Draw barrier ─────────────────────────────────────────────── */
    {
      id: 'draw-barrier',
      patterns: [
        'draw barrier', 'add barrier', 'noise barrier', 'barrier',
        'fence', 'wall', 'bund', 'earth berm', 'acoustic barrier',
        'noise wall', 'how do i draw a barrier'
      ],
      title: 'Draw a noise barrier',
      answer: 'Open the Tools menu and click "Barrier" to draw a barrier polyline. Click to add vertices; double-click or press Enter to finish. Then click the barrier to set its height and base elevation.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#drawBarrierBtn', label: '1. Click "Barrier" to start drawing', scrollIntoView: true },
        { type: 'tip', label: '2. Click the map to draw the barrier polyline. Double-click or press Enter to finish. Click the barrier to set height and base elevation.' }
      ],
      related: ['draw-building', 'enable-terrain', 'propagation-method']
    },

    /* ── 7. Draw building ────────────────────────────────────────────── */
    {
      id: 'draw-building',
      patterns: [
        'draw building', 'new building', 'add building', 'custom building',
        'building polygon', 'draw structure', 'building footprint'
      ],
      title: 'Draw a custom building for screening',
      answer: 'Open the Tools menu and click "New building" to draw a building polygon that will provide noise screening and diffraction for propagation paths.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#drawBuildingBtn', label: '1. Click "New building" to draw the footprint', scrollIntoView: true },
        { type: 'tip', label: '2. Click the map to draw the polygon. Double-click to finish. Click the building to set its height.' }
      ],
      related: ['draw-barrier', 'enable-buildings', 'propagation-method']
    },

    /* ── 8. Ground absorption ────────────────────────────────────────── */
    {
      id: 'ground-absorption',
      patterns: [
        'ground absorption', 'ground factor', 'ground zone', 'g value',
        'draw ground', 'ground attenuation', 'hard ground', 'soft ground',
        'absorption zone'
      ],
      title: 'Draw a ground absorption zone',
      answer: 'Open the Tools menu and click "Ground absorption" to draw a polygon that overrides the default ground factor G for propagation paths passing through it. G=0 is hard ground; G=1 is soft ground.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#drawGroundZoneBtn', label: '1. Click "Ground absorption" to draw the zone', scrollIntoView: true },
        { type: 'tip', label: '2. Draw the polygon on the map. Click it to set the G value (0 = hard, 1 = soft). Requires ISO 9613-2 propagation method.' }
      ],
      related: ['propagation-method', 'enable-terrain', 'draw-barrier']
    },

    /* ── 9. Enable terrain ───────────────────────────────────────────── */
    {
      id: 'enable-terrain',
      patterns: [
        'terrain', 'enable terrain', 'terrain screening', 'elevation',
        'dem', 'lidar', 'topography', 'hillside', 'slope', 'contour'
      ],
      title: 'Enable terrain screening',
      answer: 'Open the Tools menu and click "Terrain" to enable terrain-based screening. The tool queries 5m LiDAR (with SRTM fallback) to model height-of-land screening along each propagation path.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#terrainToggleBtn', label: '1. Click "Terrain" to enable (may slow calculation)', scrollIntoView: true },
        { type: 'tip', label: '2. Re-calculate results after enabling. Terrain contours can also be shown via the "Contours" button.' }
      ],
      related: ['propagation-method', 'draw-barrier', 'enable-buildings']
    },

    /* ── 10. Enable buildings (OSM) ──────────────────────────────────── */
    {
      id: 'enable-buildings',
      patterns: [
        'buildings', 'osm buildings', 'enable buildings', 'show buildings',
        'building layer', 'openstreetmap buildings', 'building footprints'
      ],
      title: 'Enable OSM building footprints',
      answer: 'Open the Tools menu and click "Buildings" to load OpenStreetMap building footprints. These are used for noise screening and, when Reflections are enabled, for ISO 9613-2 facade reflections.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#buildingsToggleBtn', label: '1. Click "Buildings" to load OSM footprints', scrollIntoView: true },
        { type: 'tip', label: '2. Buildings within the map view will be fetched and drawn. Enable "Reflections" to include facade reflection calculations.' }
      ],
      related: ['enable-reflections', 'draw-building', 'enable-terrain']
    },

    /* ── 11. Enable reflections ──────────────────────────────────────── */
    {
      id: 'enable-reflections',
      patterns: [
        'reflections', 'enable reflections', 'facade reflection',
        'image source', 'first order reflection', 'reflected noise'
      ],
      title: 'Enable reflections',
      answer: 'Open the Tools menu and click "Reflections" to apply ISO 9613-2 §7.5 image-source facade reflections. Buildings must be enabled first.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#reflectionsBtn', label: '1. Click "Reflections" to enable ISO 9613-2 §7.5 reflections', scrollIntoView: true },
        { type: 'tip', label: '2. Enable Buildings first. Reflections are applied to receiver predictions and the noise map.' }
      ],
      related: ['enable-buildings', 'propagation-method', 'noise-contour-map']
    },

    /* ── 12. Measure distance ────────────────────────────────────────── */
    {
      id: 'measure-distance',
      patterns: [
        'measure distance', 'ruler', 'distance tool', 'measure', 'how far',
        'distance measurement', 'measure length'
      ],
      title: 'Measure distance on the map',
      answer: 'Open the Tools menu and click "Ruler" to activate the distance tool. Click two points on the map to measure the straight-line distance between them.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#rulerBtn', label: '1. Click "Ruler" to activate distance measurement', scrollIntoView: true },
        { type: 'tip', label: '2. Click the first point, then a second point on the map. The distance label will appear — click it to remove it.' }
      ],
      related: ['add-point-source', 'add-receiver', 'draw-barrier']
    },

    /* ── 13. Street View ─────────────────────────────────────────────── */
    {
      id: 'street-view',
      patterns: [
        'street view', 'google street view', 'site conditions', 'view site',
        'existing conditions', 'site photos', 'street level view', 'open street view',
        'streetview', 'site context', 'site familiarisation', 'site familiarization'
      ],
      title: 'Open Street View for a source or receiver',
      answer: 'Click the <strong>Street View</strong> button (person icon) on any source, receiver, or custom building edit panel to open Google Maps Street View at that location in a new tab. You can also right-click anywhere on the map and choose <strong>Street View here</strong>. Street View imagery is © Google and is for site familiarisation only — it does not affect calculations.',
      actions: [
        { type: 'highlight', selector: '#helpFloatPanel', label: 'See the "Site context" section in Quick Reference for full details', scrollIntoView: true }
      ],
      related: ['add-point-source', 'add-receiver', 'measure-distance']
    },

    /* ── 14. Site plan overlay ───────────────────────────────────────── */
    {
      id: 'site-plan-overlay',
      patterns: [
        'site plan', 'overlay', 'site plan overlay', 'upload image',
        'image overlay', 'pdf overlay', 'site drawing', 'georeferenced plan'
      ],
      title: 'Upload a site plan overlay',
      answer: 'Open the Tools menu and click "Site plan overlay" to upload a site plan image or PDF. The tool auto-detects the address from the PDF and positions it on the map.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#sitePlanOverlayBtn', label: '1. Click "Site plan overlay" to upload a plan', scrollIntoView: true },
        { type: 'tip', label: '2. Select a PNG, JPG, or PDF. Drag the corners to position it on the map. Adjust opacity as needed.' }
      ],
      related: ['upload-proposal', 'measure-distance', 'add-point-source']
    },

    /* ── 14. Set SA criteria ─────────────────────────────────────────── */
    {
      id: 'set-criteria-sa',
      patterns: [
        'sa criteria', 'south australia criteria', 'sa noise policy',
        'set criteria sa', 'sa receiver type', 'inl', 'industrial noise level',
        'sa assessment', 'south australian'
      ],
      title: 'Set SA receiver type and criteria',
      answer: 'The Receivers & criteria card is in the Criteria & compliance panel on the right side of the map. SA criteria derive from the EPA Noise Policy based on the land use zone auto-detected at the receiver location.',
      actions: [
        { type: 'open-panel', selector: '#drawer-toggle', label: 'Open Criteria & compliance panel (▶ tab, right edge)' },
        { type: 'highlight', selector: '[data-help="receivers-criteria-card"]', label: '1. Receivers & criteria card — zone and criteria for each receiver', scrollIntoView: true },
        { type: 'tip', label: '2. The zone is auto-detected from SAPPA. The receiver type (Residential, Commercial, etc.) can be adjusted. Criteria update automatically.' }
      ],
      related: ['add-receiver', 'set-criteria-vic', 'set-criteria-nsw']
    },

    /* ── 15. Set VIC criteria ────────────────────────────────────────── */
    {
      id: 'set-criteria-vic',
      patterns: [
        'vic criteria', 'victoria criteria', 'vic epa', 'publication 1826',
        'pub 1826', 'interface factor', 'vic assessment', 'victorian',
        'set criteria vic', 'melb', 'melbourne'
      ],
      title: 'Set VIC assessment parameters',
      answer: 'The VIC assessment parameters card is in the Criteria & compliance panel on the right (visible when receivers are in Victoria). Set the area type and Influencing Factor (IF) to derive the noise criterion per EPA Publication 1826.5.',
      actions: [
        { type: 'open-panel', selector: '#drawer-toggle', label: 'Open Criteria & compliance panel (▶ tab, right edge)' },
        { type: 'highlight', selector: '[data-help="vic-assessment-card"]', label: '1. VIC assessment parameters — area type, IF, and detected zones', scrollIntoView: true },
        { type: 'tip', label: '2. Select Major urban or Rural. The Interface Factor and criterion are calculated from EPA Publication 1826.5.' }
      ],
      related: ['add-receiver', 'set-criteria-sa', 'set-criteria-nsw']
    },

    /* ── 16. Set NSW criteria ────────────────────────────────────────── */
    {
      id: 'set-criteria-nsw',
      patterns: [
        'nsw criteria', 'new south wales criteria', 'nsw epa', 'npi',
        'rbl', 'rating background level', 'nsw assessment', 'sydney',
        'set criteria nsw', 'new south wales'
      ],
      title: 'Set NSW assessment parameters',
      answer: 'The NSW assessment parameters card is in the Criteria & compliance panel on the right (visible when receivers are in NSW). Set the noise amenity area and Rating Background Level (RBL) to derive criteria per the NSW NPI.',
      actions: [
        { type: 'open-panel', selector: '#drawer-toggle', label: 'Open Criteria & compliance panel (▶ tab, right edge)' },
        { type: 'highlight', selector: '[data-help="nsw-assessment-card"]', label: '1. NSW assessment parameters — amenity area and RBL', scrollIntoView: true },
        { type: 'tip', label: '2. Enter the Rating Background Level (RBL). Criteria for amenity, intrusiveness, and sleep disturbance are calculated automatically.' }
      ],
      related: ['add-receiver', 'set-criteria-sa', 'set-criteria-vic']
    },

    /* ── 17. Propagation method ──────────────────────────────────────── */
    {
      id: 'propagation-method',
      patterns: [
        'propagation method', 'propagation', 'iso 9613', 'simple method',
        'atmospheric absorption', 'ground attenuation', 'concawe',
        'change method', 'switch method', 'propagation panel'
      ],
      title: 'Change the propagation method',
      answer: 'The Propagation panel lets you choose between Simple (geometric spreading only), ISO 9613-2 (full octave-band with atmospheric and ground attenuation), or CONCAWE (octave-band with meteorological corrections). Set temperature, humidity, and global ground factor G here.',
      actions: [
        { type: 'open-panel', selector: '#mp-propmethod .mp-hdr', label: 'Open Propagation panel' },
        { type: 'highlight', selector: '#propMethodGroup', label: '1. Select Simple, ISO 9613-2, or CONCAWE', scrollIntoView: true },
        { type: 'tip', label: '2. ISO 9613-2 uses octave-band calculations. Enable Ground absorption zones and Terrain for full ISO modelling.' }
      ],
      related: ['ground-absorption', 'enable-terrain', 'enable-reflections']
    },

    /* ── 18. Enter source levels ─────────────────────────────────────── */
    {
      id: 'enter-source-levels',
      patterns: [
        'source levels', 'sound power', 'enter levels', 'noise levels',
        'octave band', 'lw', 'sound power level', 'source data',
        'enter noise', 'input levels', 'day night levels'
      ],
      title: 'Enter noise source levels',
      answer: 'Click a placed source pin on the map to open its detail popup and enter sound power levels. The Noise sources card in the Criteria & compliance panel also lists all sources.',
      actions: [
        { type: 'open-panel', selector: '#drawer-toggle', label: 'Open Criteria & compliance panel (▶ tab, right edge)' },
        { type: 'highlight', selector: '#sourcePanel', label: '1. Noise sources card — lists all placed sources', scrollIntoView: true },
        { type: 'tip', label: '2. Click a source pin on the map to open its detail and enter Day/Evening/Night sound power levels or operational data.' }
      ],
      related: ['add-point-source', 'add-line-source', 'predicted-levels']
    },

    /* ── 19. Predicted levels ────────────────────────────────────────── */
    {
      id: 'predicted-levels',
      patterns: [
        'predicted levels', 'see results', 'noise results', 'compliance',
        'predicted noise', 'assessment results', 'leq results',
        'show results', 'calculated level'
      ],
      title: 'View predicted noise levels',
      answer: 'The Predicted noise levels card is in the Criteria & compliance panel on the right side of the map. It shows modelled noise at each receiver for Day, Evening, and Night, compared against the applicable criteria.',
      actions: [
        { type: 'open-panel', selector: '#drawer-toggle', label: 'Open Criteria & compliance panel (▶ tab, right edge)' },
        { type: 'highlight', selector: '#predNoiseSection', label: '1. Predicted noise levels — compliance for each receiver and period', scrollIntoView: true },
        { type: 'tip', label: '2. Green = compliant, red = exceeds criterion. Results update automatically when sources or receivers change.' }
      ],
      related: ['enter-source-levels', 'noise-contour-map', 'generate-report']
    },

    /* ── 20. Noise contour map ───────────────────────────────────────── */
    {
      id: 'noise-contour-map',
      patterns: [
        'noise map', 'contour map', 'noise contour', 'show map',
        'noise grid', 'colour map', 'heatmap', 'show noise map',
        'how do i see the noise contour map'
      ],
      title: 'Show the noise contour map',
      answer: 'Open the Modelling menu and click "Noise map" to compute and display a noise contour grid. Select the period (Day/Eve/Night/LAmax) and adjust grid resolution as needed.',
      actions: [
        { type: 'open-panel', selector: '#mp-modelling .mp-hdr', label: 'Open Modelling menu' },
        { type: 'highlight', selector: '#noiseMapBtn', label: '1. Click "Noise map" to compute the contour grid', scrollIntoView: true },
        { type: 'tip', label: '2. Select the period and click Calculate. Adjust the legend range and grid spacing in the controls that appear below.' }
      ],
      related: ['propagation-method', 'enable-terrain', 'enable-buildings']
    },

    /* ── 21. Save assessment ─────────────────────────────────────────── */
    {
      id: 'save-assessment',
      patterns: [
        'save assessment', 'export json', 'save json', 'save file',
        'how do i save', 'download assessment', 'save project'
      ],
      title: 'Save an assessment',
      answer: 'Click the "Save" button to export the current assessment as a JSON file. This captures all sources, receivers, barriers, criteria, and results.',
      actions: [
        { type: 'highlight', selector: '#exportJsonBtn', label: '1. Click "Save" to export the assessment JSON', scrollIntoView: true },
        { type: 'tip', label: '2. The file is named from the project name field. Keep it for re-loading the assessment later.' }
      ],
      related: ['load-assessment', 'project-details', 'generate-report']
    },

    /* ── 22. Load assessment ─────────────────────────────────────────── */
    {
      id: 'load-assessment',
      patterns: [
        'open assessment', 'import json', 'load file', 'reopen',
        'how do i open', 'load assessment', 'load project', 'recent'
      ],
      title: 'Open a saved assessment',
      answer: 'Click the "Open" button to load a previously saved assessment JSON file. Use the dropdown arrow next to Open to pick from recently opened assessments.',
      actions: [
        { type: 'highlight', selector: '#importJsonBtn', label: '1. Click "Open" to load an assessment JSON', scrollIntoView: true },
        { type: 'tip', label: '2. Click the ▾ arrow next to Open to see recently opened assessments for quick access.' }
      ],
      related: ['save-assessment', 'project-details', 'generate-report']
    },

    /* ── 23. Export JPG ──────────────────────────────────────────────── */
    {
      id: 'export-jpg',
      patterns: [
        'export jpg', 'save jpg', 'save image', 'map image', 'jpeg',
        'export map', 'save map image', 'print map', 'map screenshot'
      ],
      title: 'Export the map as a JPEG',
      answer: 'Click the camera icon (Save JPG) in the toolbar to export the current map view as a high-resolution JPEG at 3× resolution, suitable for inclusion in reports.',
      actions: [
        { type: 'highlight', selector: '#saveJpgPanelBtn', label: '1. Click the camera icon to export the map as JPEG', scrollIntoView: true },
        { type: 'tip', label: '2. The image is exported at 3× resolution. Legend and scale bar are included in the export.' }
      ],
      related: ['noise-contour-map', 'generate-report', 'toggle-results-drawer']
    },

    /* ── 24. Generate report ─────────────────────────────────────────── */
    {
      id: 'generate-report',
      patterns: [
        'generate report', 'word report', 'docx', 'export report',
        'how do i export a report', 'create report', 'word document'
      ],
      title: 'Generate a Word report',
      answer: 'Click "Generate Report" to produce a .docx report containing source data, propagation results, and compliance summary. The button appears once assessment criteria have been set.',
      actions: [
        { type: 'highlight', selector: '#generateReportBtn', label: '1. Click "Generate Report" to create a .docx', scrollIntoView: true },
        { type: 'tip', label: '2. Ensure project number, project name, and all source/receiver data are filled in before generating.' }
      ],
      related: ['save-assessment', 'export-jpg', 'project-details']
    },

    /* ── 25. Quick reference ─────────────────────────────────────────── */
    {
      id: 'quick-reference',
      patterns: [
        'quick reference', 'help guide', 'reference guide', 'keyboard shortcuts',
        'hotkeys', 'cheat sheet', 'existing help', 'question mark'
      ],
      title: 'Open the Quick Reference guide',
      answer: 'Click the ? button in the toolbar to open the Quick Reference panel. It lists all keyboard shortcuts and a summary of features available in the tool.',
      actions: [
        { type: 'highlight', selector: '#helpToggleBtn', label: '1. Click the ? button to open the Quick Reference', scrollIntoView: true }
      ],
      related: ['propagation-method', 'save-assessment', 'noise-contour-map']
    },

    /* ── 26. Toggle results drawer ───────────────────────────────────── */
    {
      id: 'toggle-results-drawer',
      patterns: [
        'hide panel', 'show panel', 'toggle results', 'open results panel',
        'expand panel', 'collapse panel', 'results drawer',
        'show compliance', 'hide criteria', 'toggle drawer'
      ],
      title: 'Show or hide the results panel',
      answer: 'Click the arrow tab on the right edge of the map to open or close the Criteria & compliance panel. Closing the panel gives more map space.',
      actions: [
        { type: 'highlight', selector: '#drawer-toggle', label: '1. Click the ◀ / ▶ tab to toggle the results panel', scrollIntoView: true },
        { type: 'tip', label: '2. The results panel holds all criteria, compliance, predicted levels and recommended treatments.' }
      ],
      related: ['predicted-levels', 'set-criteria-sa', 'export-jpg']
    },

    /* ── 27. Show / hide objects ─────────────────────────────────────── */
    {
      id: 'show-hide-objects',
      patterns: [
        'show hide objects', 'hide objects', 'show objects', 'toggle objects',
        'hide sources', 'hide receivers', 'hide markers', 'show markers'
      ],
      title: 'Show or hide all objects on the map',
      answer: 'Open the Tools menu and click "Show / hide objects" to toggle visibility of all sources, receivers, barriers, buildings, and ground zones on the map.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#pinsToggleBtn', label: '1. Click "Show / hide objects" to toggle visibility', scrollIntoView: true }
      ],
      related: ['add-point-source', 'add-receiver', 'noise-contour-map']
    },

    /* ── 28. Clear all ───────────────────────────────────────────────── */
    {
      id: 'clear-all',
      patterns: [
        'clear all', 'delete all', 'remove all', 'start over', 'reset map',
        'clear map', 'start fresh', 'delete sources'
      ],
      title: 'Clear all objects from the map',
      answer: 'Open the Tools menu and click "Clear All" to remove all sources, receivers, barriers, buildings, and ground zones. This cannot be undone — save your assessment first.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#mapClearBtn', label: '1. Click "Clear All" — save first as this is irreversible', scrollIntoView: true }
      ],
      related: ['save-assessment', 'load-assessment', 'show-hide-objects']
    },

    /* ── 29. Project details ─────────────────────────────────────────── */
    {
      id: 'project-details',
      patterns: [
        'project number', 'project name', 'project details', 'job number',
        'enter project', 'project reference', 'project info'
      ],
      title: 'Enter project details',
      answer: 'The Project # and Project name fields are at the top of the page. These populate the report header and the saved file name.',
      actions: [
        { type: 'highlight', selector: '#projectNumberInput', label: '1. Project # field — enter the job number', scrollIntoView: true },
        { type: 'highlight', selector: '#projectNameInput', label: '2. Project name field — enter the project description' }
      ],
      related: ['save-assessment', 'generate-report', 'upload-proposal']
    },

    /* ── 30. Upload proposal ─────────────────────────────────────────── */
    {
      id: 'upload-proposal',
      patterns: [
        'upload proposal', 'proposal pdf', 'auto fill', 'autofill',
        'project pdf', 'resonate proposal', 'upload pdf', 'import proposal'
      ],
      title: 'Upload a Resonate proposal to auto-fill details',
      answer: 'Click "Upload proposal" to select a Resonate proposal PDF. The tool automatically reads the project number and name from the PDF and fills in the fields.',
      actions: [
        { type: 'highlight', selector: '#uploadProposalBtn', label: '1. Click "Upload proposal" to auto-fill project details', scrollIntoView: true }
      ],
      related: ['project-details', 'save-assessment', 'site-plan-overlay']
    }

    /* ── 31. Add road (CoRTN) source ────────────────────────────────── */
    ,{
      id: 'add-road-source',
      patterns: [
        'road source', 'road noise', 'cortn', 'road traffic', 'draw road',
        'add road', 'traffic noise', 'vehicle noise', 'road traffic noise',
        'cortn road', 'highway noise'
      ],
      title: 'Add a road traffic noise source (CoRTN)',
      answer: 'Open the Tools menu and click "Road (CoRTN)" to draw a road polyline using the UK CoRTN method with Australian adjustments. Enter traffic flow, speed, %HV, gradient, and surface type. SA DIT speed data is auto-fetched where available.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#drawCortnRoadBtn', label: '1. Click "Road (CoRTN)" to draw a road traffic source (W)', scrollIntoView: true },
        { type: 'tip', label: '2. Draw the road polyline on the map. Click it to enter traffic flow, speed, %HV, gradient, and surface. SA speed data is auto-fetched.' }
      ],
      related: ['add-line-source', 'noise-contour-map', 'enter-source-levels']
    },

    /* ── 32. 3D Scene Viewer ─────────────────────────────────────────── */
    {
      id: 'view-3d',
      patterns: [
        '3d view', '3d scene', 'scene viewer', '3d viewer', 'three d',
        'three dimensional', '3d', 'view in 3d', 'open 3d', '3d model'
      ],
      title: 'Open the 3D Scene Viewer',
      answer: 'Click "3D View" in the Tools menu (or press V) to open the 3D scene viewer. It renders terrain, buildings, barriers, sources, and receivers — useful for verifying heights and line-of-sight screening geometry.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#threeDViewBtn', label: '1. Click "3D View" (or press V) to open the viewer', scrollIntoView: true },
        { type: 'tip', label: '2. Controls: vertical exaggeration (+/−), wireframe (W), labels (L), grid (G), axes (A), reset camera (R), close (Esc).' }
      ],
      related: ['enable-terrain', 'draw-barrier', 'draw-building']
    },

    /* ── 33. GIS export ──────────────────────────────────────────────── */
    {
      id: 'gis-export',
      patterns: [
        'gis export', 'geojson', 'kml', 'csv export', 'export gis',
        'export geojson', 'export kml', 'spatial export', 'gis data',
        'export data', 'download data'
      ],
      title: 'Export GIS data (GeoJSON / KML / CSV)',
      answer: 'Click the "GIS Export" button in the toolbar to export all objects and predicted noise levels as GeoJSON, KML, or CSV — suitable for importing into GIS applications.',
      actions: [
        { type: 'highlight', selector: '#gisExportHeaderBtn', label: '1. Click "GIS Export" in the toolbar to open export options', scrollIntoView: true },
        { type: 'tip', label: '2. Choose GeoJSON, KML, or CSV. Predicted noise levels for each receiver and period are included in the export.' }
      ],
      related: ['save-assessment', 'generate-report', 'export-jpg']
    },

    /* ── 34. Select state ────────────────────────────────────────────── */
    {
      id: 'select-state',
      patterns: [
        'select state', 'change state', 'set state', 'which state',
        'sa vic nsw', 'switch state', 'state badge', 'criteria state',
        'south australia', 'victoria', 'new south wales', 'state selection'
      ],
      title: 'Select SA / VIC / NSW assessment state',
      answer: 'The state badge in the page header shows the current state (SA, VIC, or NSW). It is auto-detected from the receiver location — drag a receiver onto the map first and the state updates automatically. Override it by clicking the badge.',
      actions: [
        { type: 'highlight', selector: '#stateBadge', label: '1. State badge — shows current state, click to override', scrollIntoView: true },
        { type: 'tip', label: '2. Place a receiver on the map — the state is auto-detected from the planning zone. SA drives the EPA Noise Policy; VIC uses EPA Pub 1826.5; NSW uses the NPI.' }
      ],
      related: ['set-criteria-sa', 'set-criteria-vic', 'set-criteria-nsw']
    },

    /* ── 35. Show planning zones ─────────────────────────────────────── */
    {
      id: 'show-zones',
      patterns: [
        'show zones', 'planning zones', 'zone overlay', 'zone layer',
        'zone colours', 'zoning map', 'land use zone', 'planning zone',
        'zone display', 'toggle zones', 'mbs 010', 'overlay zones'
      ],
      title: 'Show planning zone overlay',
      answer: 'Open the Mapping menu and click "Show zones" (or press Z) to display planning zones on the map. For SA, the MBS 010 screening overlay is also available. VIC Major Urban Area boundaries can be toggled via the Mapping menu.',
      actions: [
        { type: 'open-panel', selector: '#mp-mapping .mp-hdr', label: 'Open Mapping menu' },
        { type: 'highlight', selector: '#zoneToggleBtn', label: '1. Click "Show zones" (Z) to display planning zones', scrollIntoView: true },
        { type: 'tip', label: '2. Zone colours indicate land use. Zones are also used to auto-detect criteria at receiver locations — place a receiver to see the detected zone.' }
      ],
      related: ['set-criteria-sa', 'set-criteria-vic', 'add-receiver']
    },

    /* ── 36. Noise character penalties ──────────────────────────────── */
    {
      id: 'character-penalties',
      patterns: [
        'character penalty', 'tonal', 'impulsive', 'low frequency',
        'intermittent penalty', 'modulating', 'noise character',
        'penalty', 'characteristic penalty', 'tonal penalty',
        'character correction', 'modifying factor'
      ],
      title: 'Apply noise character penalties',
      answer: 'Open the Criteria & compliance panel and find the penalty card (titled "Characteristic penalties" for SA, "Characteristic adjustments" for VIC, or "Modifying factor corrections" for NSW). Enter a dB adjustment per receiver and period — the penalised level is used for compliance comparison.',
      actions: [
        { type: 'open-panel', selector: '#drawer-toggle', label: 'Open Criteria & compliance panel (▶ tab, right edge)' },
        { type: 'highlight', selector: '#charPenaltySection', label: '1. Penalty / corrections card — enter dB adjustment per receiver and period', scrollIntoView: true },
        { type: 'tip', label: '2. SA: tonal / impulsive / LF / intermittent / modulating per SA Noise Policy clause 13(3). VIC: tonal / impulsive / intermittent per EPA Publication 1826.5. NSW: tonal / LF / intermittent per NSW NPI Fact Sheet C (max 10 dB combined).' }
      ],
      related: ['set-criteria-sa', 'set-criteria-vic', 'set-criteria-nsw']
    },

    /* ── 37. Address search ──────────────────────────────────────────── */
    {
      id: 'address-search',
      patterns: [
        'search address', 'find address', 'search location', 'go to address',
        'address search', 'geocode', 'navigate to', 'find site',
        'search bar', 'find location', 'centre map'
      ],
      title: 'Search for an address',
      answer: 'Type an address or location in the search bar at the top of the map and press Enter (or press S to focus it). The map will pan and zoom to the result. You can also click the map directly to centre on a location.',
      actions: [
        { type: 'highlight', selector: '#mapSearchInput', label: '1. Type an address here and press Enter (or press S to focus)', scrollIntoView: true },
        { type: 'tip', label: '2. After searching, place your sources and receivers on the map. The state is auto-detected once a receiver is placed.' }
      ],
      related: ['add-receiver', 'add-point-source', 'select-state']
    }

    /* ── 38. Run ISO/TR 17534-3 validation ──────────────────────────── */
    ,{
      id: 'run-validation',
      patterns: [
        'run validation', 'iso validation', 'validation tests', 'conformance',
        'iso tr 17534', '17534', 'ground attenuation test', 'validate propagation',
        'check calculation', 'test accuracy'
      ],
      title: 'Run ISO/TR 17534-3 propagation validation',
      answer: 'Open the Propagation panel and click "Run validation" to execute the ISO/TR 17534-3 ground-attenuation test cases T01–T03. Results confirm the tool\'s ISO 9613-2 implementation is within specification.',
      actions: [
        { type: 'open-panel', selector: '#mp-propmethod .mp-hdr', label: 'Open Propagation panel' },
        { type: 'highlight', selector: '#isoValidateBtn', label: '1. Click "Run validation" to run ISO/TR 17534-3 test cases', scrollIntoView: true },
        { type: 'tip', label: '2. Results appear below the button. Green = pass. Requires ISO 9613-2 propagation method to be active.' }
      ],
      related: ['propagation-method', 'ground-absorption', 'enable-terrain']
    },

    /* ── 39. Move geometry ───────────────────────────────────────────── */
    {
      id: 'move-geometry',
      patterns: [
        'move barrier', 'move building', 'move source', 'move object',
        'drag barrier', 'reposition', 'move tool', 'move mode',
        'drag object', 'relocate source', 'move geometry'
      ],
      title: 'Move objects on the map',
      answer: 'Open the Tools menu and click "Move" to enter move mode. Then drag any barrier, building, or source to reposition it. Click "Move" again to exit. Receivers can always be dragged directly without activating Move mode.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#moveGeomBtn', label: '1. Click "Move" to enter move mode, then drag any object', scrollIntoView: true },
        { type: 'tip', label: '2. Click "Move" again or press Escape to exit move mode. Receivers can be dragged at any time without activating Move mode.' }
      ],
      related: ['draw-barrier', 'draw-building', 'add-point-source']
    },

    /* ── 40. Import GIS file ─────────────────────────────────────────── */
    {
      id: 'import-gis',
      patterns: [
        'import gis', 'import geojson', 'import kml', 'import csv',
        'load gis', 'gis import', 'import file', 'load geojson',
        'load objects', 'import objects', 'import data'
      ],
      title: 'Import GIS data (GeoJSON / KML / CSV)',
      answer: 'Open the Tools menu and click "Import GIS file…" to load existing GIS data onto the map. Supported formats include GeoJSON, KML, and CSV. Imported objects are added to the current assessment.',
      actions: [
        { type: 'open-panel', selector: '#mp-tools .mp-hdr', label: 'Open Tools menu' },
        { type: 'highlight', selector: '#gisImportBtn', label: '1. Click "Import GIS file…" to load GeoJSON, KML, or CSV', scrollIntoView: true },
        { type: 'tip', label: '2. Imported objects appear on the map and in the Objects panel. You can then edit their properties as normal.' }
      ],
      related: ['gis-export', 'site-plan-overlay', 'save-assessment']
    },

    /* ── 41. Save PDF ────────────────────────────────────────────────── */
    {
      id: 'save-pdf',
      patterns: [
        'save pdf', 'export pdf', 'pdf export', 'criteria pdf',
        'appendix pdf', 'a4 pdf', 'print pdf', 'pdf report',
        'criteria appendix', 'pdf criteria'
      ],
      title: 'Save a criteria appendix PDF',
      answer: 'Click "Save PDF" in the toolbar to export an A4 criteria appendix PDF. This is a concise formatted document showing criteria derivation and compliance results — suitable as a report appendix.',
      actions: [
        { type: 'highlight', selector: '#savePdfBtn', label: '1. Click "Save PDF" to export an A4 criteria appendix', scrollIntoView: true },
        { type: 'tip', label: '2. The PDF includes criteria derivation, predicted levels, and compliance outcomes. For a full .docx report, use "Generate Report" instead.' }
      ],
      related: ['generate-report', 'export-jpg', 'gis-export']
    },

    /* ── 42. Suggested noise sources ────────────────────────────────── */
    {
      id: 'suggested-sources',
      patterns: [
        'suggested sources', 'suggest sources', 'source suggestions',
        'pdf site plan', 'auto suggest', 'suggest noise sources',
        'sources from pdf', 'detect sources', 'find sources automatically'
      ],
      title: 'Get suggested noise sources from a site plan PDF',
      answer: 'Click the lightbulb icon in the toolbar to open the Suggested noise sources panel. After uploading a site plan PDF via Site plan overlay, the tool automatically scans it for plant equipment and suggests noise sources to add.',
      actions: [
        { type: 'highlight', selector: '#suggestToggleBtn', label: '1. Click the lightbulb icon to open Suggested noise sources', scrollIntoView: true },
        { type: 'tip', label: '2. Upload a site plan PDF first via Tools → Site plan overlay. Suggested sources appear here — click to place them on the map.' }
      ],
      related: ['site-plan-overlay', 'add-point-source', 'enter-source-levels']
    },

    /* ── 43. Scenarios ───────────────────────────────────────────────── */
    {
      id: 'scenarios',
      patterns: [
        'scenario', 'scenarios', 'save scenario', 'compare scenario',
        'compare results', 'snapshot', 'named snapshot', 'scenario comparison',
        'restore scenario', 'scenario table'
      ],
      title: 'Scenarios — save and compare assessment states',
      answer: 'The Scenarios button (top toolbar, next to Open) lets you save named snapshots of the full assessment state and compare predicted Lp across scenarios in a table. Scenarios are saved inside the assessment JSON.',
      actions: [
        { type: 'highlight', selector: '#scenariosBtn', label: '1. Click Scenarios to open the panel', scrollIntoView: true },
        { type: 'tip', label: '2. Click "Save current state as scenario…", enter a name. Repeat after making changes to save another scenario.' },
        { type: 'tip', label: '3. With 2 or more scenarios, a comparison table shows receiver Lp by period. Select a baseline scenario to see differences.' }
      ],
      related: ['save-assessment', 'generate-report']
    },

    /* ── 44. Custom source library ───────────────────────────────────── */
    {
      id: 'custom-sources',
      patterns: [
        'custom source', 'custom sources', 'add custom source', 'create source',
        'source library', 'my source', 'own source', 'user source',
        'export library', 'import library', 'custom lw', 'custom spectrum',
        'reusable source', 'library entry'
      ],
      title: 'Custom source library',
      answer: 'The Custom sources panel (Planning & modelling) lets you define reusable library entries with name, Lw, and octave-band spectrum in dB(Z). Custom sources appear in all source dropdowns and are saved in the assessment JSON.',
      actions: [
        { type: 'highlight', selector: '#mp-customsrc .mp-hdr', label: '1. Find "Custom sources" in the Planning & modelling panel and click to expand', scrollIntoView: true },
        { type: 'highlight', selector: '#customSrcBody .mp-sub-row .mp-btn', label: '2. Click "+ Add custom source…" to open the wizard' },
        { type: 'tip', label: '3. Choose the source type (Lw — point, Lw/m — line, Lp — building interior), enter the name, broadband level, and per-band spectrum.' }
      ],
      related: ['add-point-source', 'suggested-sources', 'enter-source-levels']
    }

  ] /* end topics */

}; /* end HELP_ASSISTANT_KB */
