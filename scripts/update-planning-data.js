#!/usr/bin/env node
/**
 * scripts/update-planning-data.js
 *
 * Downloads SA Planning & Design Code data and produces:
 *   MODE=discover  → data/_discovery.json (inspect before building)
 *   MODE=build     → data/zones/sa-zones.pmtiles
 *                    data/overlays/noise-air-emissions.geojson
 *                    data/overlays/aircraft-noise.geojson
 *                    data/metadata.json
 *
 * Local Windows usage: DISCOVER mode only (tippecanoe not available on Windows).
 * BUILD mode runs in the GitHub Action on Ubuntu.
 *
 * Env vars:
 *   MODE           'discover' | 'build'  (default: 'discover')
 *   SKIP_DOWNLOAD  '1' to re-use previously downloaded zips in /tmp
 */

import { execSync }                                              from 'child_process';
import { createWriteStream, existsSync, mkdirSync,
         readFileSync, readdirSync, rmSync,
         statSync, writeFileSync }                              from 'fs';
import { join, resolve }                                        from 'path';
import { tmpdir }                                               from 'os';
import { Readable }                                             from 'stream';
import { pipeline }                                             from 'stream/promises';
import { fileURLToPath }                                        from 'url';
import AdmZip                                                   from 'adm-zip';
import mapshaper                                                from 'mapshaper';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const MODE          = (process.env.MODE || 'discover').toLowerCase();
const SKIP_DOWNLOAD = process.env.SKIP_DOWNLOAD === '1';

const ZONES_URL    = 'https://www.dptiapps.com.au/dataportal/PDCodeZones_geojson.zip';
const OVERLAYS_URL = 'https://www.dptiapps.com.au/dataportal/PDCodeOverlays_geojson.zip';

const REPO_ROOT    = resolve(__dirname, '..');
const DATA_DIR     = join(REPO_ROOT, 'data');
const ZONES_DIR    = join(DATA_DIR, 'zones');
const OVERLAYS_DIR = join(DATA_DIR, 'overlays');
const TMP_DIR      = join(tmpdir(), 'planning-data-' + process.pid);

const MIN_ZONE_FEATURES = 20_000;
const MAX_PMTILES_MB    = 95;

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function log(msg)  { console.log('[planning-data] ' + msg); }
function warn(msg) { console.warn('[planning-data] WARN: ' + msg); }

function die(msg) {
  console.error('[planning-data] FATAL: ' + msg);
  process.exit(1);
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function downloadFile(url, destPath) {
  if (SKIP_DOWNLOAD && existsSync(destPath)) {
    log('Skipping download (SKIP_DOWNLOAD=1): ' + destPath);
    return;
  }
  log('Downloading ' + url);
  const resp = await fetch(url);
  if (!resp.ok) die('Download failed ' + resp.status + ' ' + resp.statusText + ' for ' + url);
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(destPath));
  log('Saved → ' + destPath);
}

function extractZip(zipPath, destDir) {
  log('Extracting ' + zipPath + ' → ' + destDir);
  ensureDir(destDir);
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);
}

function toTitleCase(str) {
  if (!str) return '';
  return str.replace(/\w\S*/g, function(word) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/** Recursively find .geojson / .json files in dir */
function findGeoJSONFiles(dir) {
  const results = [];
  function walk(d) {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    for (const entry of entries) {
      const full = join(d, entry);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        walk(full);
      } else if (/\.(geojson|json)$/i.test(entry)) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function parseGeoJSONFile(filePath) {
  try {
    const raw  = readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);
    if (json.type === 'FeatureCollection') return json.features || [];
    if (Array.isArray(json)) return json;
    return [];
  } catch (e) {
    warn('Failed to parse ' + filePath + ': ' + e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Download both zips
// ─────────────────────────────────────────────────────────────────────────────

async function downloadData() {
  ensureDir(TMP_DIR);
  const zonesZip    = join(TMP_DIR, 'zones.zip');
  const overlaysZip = join(TMP_DIR, 'overlays.zip');

  try {
    await Promise.all([
      downloadFile(ZONES_URL,    zonesZip),
      downloadFile(OVERLAYS_URL, overlaysZip),
    ]);
  } catch (e) {
    die('Download step failed: ' + e.message);
  }

  const zonesDir    = join(TMP_DIR, 'zones');
  const overlaysDir = join(TMP_DIR, 'overlays');
  extractZip(zonesZip,    zonesDir);
  extractZip(overlaysZip, overlaysDir);
  return { zonesDir, overlaysDir };
}

// ─────────────────────────────────────────────────────────────────────────────
// Collect per-field distinct values from a list of features
// ─────────────────────────────────────────────────────────────────────────────

function collectFieldStats(features) {
  const keys = new Set();
  features.forEach(function(f) {
    Object.keys(f.properties || {}).forEach(function(k) { keys.add(k); });
  });
  const fieldValues = {};
  keys.forEach(function(k) { fieldValues[k] = new Set(); });
  features.forEach(function(f) {
    const props = f.properties || {};
    keys.forEach(function(k) {
      if (props[k] !== undefined && props[k] !== null) {
        fieldValues[k].add(String(props[k]));
      }
    });
  });
  return fieldValues;
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOVER mode
// ─────────────────────────────────────────────────────────────────────────────

async function runDiscover(zonesDir, overlaysDir) {
  log('=== DISCOVER MODE ===');

  const discovery = { generated_utc: new Date().toISOString(), zones: {}, overlays: {} };

  // ── Zones ──────────────────────────────────────────────────────────────────
  const zonesFiles    = findGeoJSONFiles(zonesDir);
  log('Zone GeoJSON files: ' + zonesFiles.length);
  let allZoneFeatures = [];
  for (const f of zonesFiles) allZoneFeatures = allZoneFeatures.concat(parseGeoJSONFile(f));

  const zoneFieldValues = collectFieldStats(allZoneFeatures);
  const zoneKeys        = Object.keys(zoneFieldValues);

  discovery.zones = {
    total_features:  allZoneFeatures.length,
    property_keys:   zoneKeys,
    field_value_counts: {},
    values_per_field:   {},
  };
  zoneKeys.forEach(function(k) {
    discovery.zones.field_value_counts[k] = zoneFieldValues[k].size;
    discovery.zones.values_per_field[k]   = Array.from(zoneFieldValues[k]).sort();
    log('  [zones] ' + k + ': ' + zoneFieldValues[k].size + ' distinct values');
  });

  // ── Overlays ───────────────────────────────────────────────────────────────
  const overlaysFiles    = findGeoJSONFiles(overlaysDir);
  log('Overlay GeoJSON files: ' + overlaysFiles.length);
  let allOverlayFeatures = [];
  for (const f of overlaysFiles) allOverlayFeatures = allOverlayFeatures.concat(parseGeoJSONFile(f));

  const overlayFieldValues = collectFieldStats(allOverlayFeatures);
  const overlayKeys        = Object.keys(overlayFieldValues);

  discovery.overlays = {
    total_features: allOverlayFeatures.length,
    property_keys:  overlayKeys,
    field_value_counts: {},
    values_per_field:   {},
  };
  overlayKeys.forEach(function(k) {
    discovery.overlays.field_value_counts[k] = overlayFieldValues[k].size;
    discovery.overlays.values_per_field[k]   = Array.from(overlayFieldValues[k]).sort();
    log('  [overlays] ' + k + ': ' + overlayFieldValues[k].size + ' distinct values — ' +
        JSON.stringify(Array.from(overlayFieldValues[k]).slice(0, 30)));
  });

  // Write discovery output
  ensureDir(DATA_DIR);
  const outPath = join(DATA_DIR, '_discovery.json');
  writeFileSync(outPath, JSON.stringify(discovery, null, 2), 'utf8');
  log('Discovery written → ' + outPath);
  log('=== DISCOVER COMPLETE — review _discovery.json before running BUILD ===');
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD mode
// ─────────────────────────────────────────────────────────────────────────────

async function runBuild(zonesDir, overlaysDir) {
  log('=== BUILD MODE ===');

  // ── Read _discovery.json to get field names ────────────────────────────────
  const discoveryPath = join(DATA_DIR, '_discovery.json');
  if (!existsSync(discoveryPath)) {
    die('_discovery.json not found — run MODE=discover first, review the output, then run MODE=build');
  }
  const disc = JSON.parse(readFileSync(discoveryPath, 'utf8'));

  // Overlay name field: largest distinct-value count is likely the category/name field
  const oDFC = disc.overlays?.field_value_counts || {};
  const overlayNameField = Object.keys(oDFC).sort(function(a, b) {
    return (oDFC[b] || 0) - (oDFC[a] || 0);
  }).find(function(k) { return (oDFC[k] || 0) >= 2; }) || 'name';

  // ANEF contour field: look for a field whose name or values suggest contour levels
  const oVPF = disc.overlays?.values_per_field || {};
  const anefContourField = Object.keys(oVPF).find(function(k) {
    const lk = k.toLowerCase();
    return lk.includes('anef') || lk.includes('anr') || lk.includes('contour') ||
           lk.includes('exposure') || lk.includes('level');
  }) || null;

  // Zone name field: prefer known names, then most-distinct
  const zDFC = disc.zones?.field_value_counts || {};
  const preferredZoneFields = ['zone_name', 'ZONE_NAME', 'name', 'NAME', 'zone', 'ZONE', 'label', 'LABEL'];
  const zoneNameField = preferredZoneFields.find(function(k) { return k in zDFC; }) ||
    Object.keys(zDFC).sort(function(a, b) { return (zDFC[b]||0) - (zDFC[a]||0); })[0] || 'name';

  const zVPF = disc.zones?.values_per_field || {};
  const subzoneNameField = Object.keys(zDFC).find(function(k) {
    return k !== zoneNameField && (zDFC[k] || 0) >= 2;
  }) || null;

  log('Using overlay name field: ' + overlayNameField);
  log('Using ANEF contour field: ' + (anefContourField || '(none detected)'));
  log('Using zone name field:    ' + zoneNameField);
  log('Using subzone name field: ' + (subzoneNameField || '(none)'));

  // ── Load all features ─────────────────────────────────────────────────────
  const overlaysFiles     = findGeoJSONFiles(overlaysDir);
  let allOverlayFeatures  = [];
  for (const f of overlaysFiles) allOverlayFeatures = allOverlayFeatures.concat(parseGeoJSONFile(f));
  log('Total overlay features: ' + allOverlayFeatures.length);

  // Filter: Noise & Air Emissions (case-insensitive substring)
  const noiseFeatures = allOverlayFeatures.filter(function(feat) {
    const val = String((feat.properties || {})[overlayNameField] || '').toLowerCase();
    return val.includes('noise and air') || val.includes('noise & air');
  });
  const noiseNames = [...new Set(noiseFeatures.map(function(f) {
    return (f.properties || {})[overlayNameField];
  }))];
  log('Noise & Air Emissions: ' + noiseFeatures.length + ' features, layer names: ' + JSON.stringify(noiseNames));
  if (noiseNames.length === 0) die('Noise & Air Emissions filter matched zero features');
  if (noiseNames.length > 1)  die('Noise & Air Emissions matched multiple layer names: ' + JSON.stringify(noiseNames));

  // Filter: Aircraft Noise (case-insensitive "aircraft noise" substring)
  const aircraftFeatures = allOverlayFeatures.filter(function(feat) {
    const val = String((feat.properties || {})[overlayNameField] || '').toLowerCase();
    return val.includes('aircraft noise');
  });
  const aircraftNames = [...new Set(aircraftFeatures.map(function(f) {
    return (f.properties || {})[overlayNameField];
  }))];
  log('Aircraft Noise: ' + aircraftFeatures.length + ' features, layer names: ' + JSON.stringify(aircraftNames));
  if (aircraftNames.length === 0) die('Aircraft Noise filter matched zero features');
  if (aircraftNames.length > 1)  die('Aircraft Noise matched multiple layer names: ' + JSON.stringify(aircraftNames));

  // Build output GeoJSONs
  function makeFC(features, extraProps) {
    return {
      type: 'FeatureCollection',
      features: features.map(function(feat) {
        const props = feat.properties || {};
        const out   = { overlay_name: props[overlayNameField] || '' };
        Object.keys(extraProps || {}).forEach(function(dest) {
          const src = extraProps[dest];
          if (src && props[src] !== undefined) out[dest] = props[src];
        });
        return { type: 'Feature', geometry: feat.geometry, properties: out };
      }),
    };
  }

  const noiseFC    = makeFC(noiseFeatures, {});
  const aircraftFC = makeFC(aircraftFeatures, anefContourField ? { anef_contour: anefContourField } : {});

  ensureDir(OVERLAYS_DIR);
  const noiseTmpPath    = join(TMP_DIR, 'noise-raw.geojson');
  const aircraftTmpPath = join(TMP_DIR, 'aircraft-raw.geojson');
  writeFileSync(noiseTmpPath,    JSON.stringify(noiseFC),    'utf8');
  writeFileSync(aircraftTmpPath, JSON.stringify(aircraftFC), 'utf8');

  const noiseOutPath    = join(OVERLAYS_DIR, 'noise-air-emissions.geojson');
  const aircraftOutPath = join(OVERLAYS_DIR, 'aircraft-noise.geojson');

  await simplifyWithMapshaper(noiseTmpPath,    noiseOutPath);
  await simplifyWithMapshaper(aircraftTmpPath, aircraftOutPath);
  log('Noise GeoJSON → ' + noiseOutPath);
  log('Aircraft GeoJSON → ' + aircraftOutPath);

  // ── Zones → PMTiles ────────────────────────────────────────────────────────
  const zonesFiles = findGeoJSONFiles(zonesDir);
  let allZoneFeatures = [];
  for (const f of zonesFiles) allZoneFeatures = allZoneFeatures.concat(parseGeoJSONFile(f));
  log('Total zone features: ' + allZoneFeatures.length);

  if (allZoneFeatures.length < MIN_ZONE_FEATURES) {
    die('Zone count ' + allZoneFeatures.length + ' < minimum ' + MIN_ZONE_FEATURES);
  }

  const zonesFC = {
    type: 'FeatureCollection',
    features: allZoneFeatures.map(function(feat) {
      const props   = feat.properties || {};
      const outProps = { zone_name: toTitleCase(String(props[zoneNameField] || '')) };
      if (subzoneNameField && props[subzoneNameField]) {
        outProps.subzone_name = toTitleCase(String(props[subzoneNameField]));
      }
      return { type: 'Feature', geometry: feat.geometry, properties: outProps };
    }),
  };

  ensureDir(ZONES_DIR);
  const zonesTmpPath = join(TMP_DIR, 'zones-processed.geojson');
  const pmtilesPath  = join(ZONES_DIR, 'sa-zones.pmtiles');
  writeFileSync(zonesTmpPath, JSON.stringify(zonesFC), 'utf8');
  log('zones-processed.geojson written (' + allZoneFeatures.length + ' features)');

  const tippecanoeCmd = [
    'tippecanoe',
    '--output=' + pmtilesPath,
    '--layer=zones',
    '--minimum-zoom=8',
    '--maximum-zoom=14',
    '--no-feature-limit',
    '--no-tile-size-limit',
    '--detect-shared-borders',
    '--simplification=10',
    '--force',
    zonesTmpPath,
  ].join(' ');

  log('Running tippecanoe...');
  try {
    execSync(tippecanoeCmd, { stdio: 'inherit' });
  } catch (e) {
    die('tippecanoe failed: ' + e.message);
  }

  const pmtilesMB = statSync(pmtilesPath).size / (1024 * 1024);
  log('sa-zones.pmtiles: ' + pmtilesMB.toFixed(1) + ' MB');
  if (pmtilesMB > MAX_PMTILES_MB) {
    die('sa-zones.pmtiles (' + pmtilesMB.toFixed(1) + ' MB) exceeds ' + MAX_PMTILES_MB + ' MB limit');
  }

  // ── metadata.json ──────────────────────────────────────────────────────────
  const distinctZoneCount = new Set(zonesFC.features.map(function(f) { return f.properties.zone_name; })).size;
  const metadata = {
    fetched_utc:               new Date().toISOString(),
    source_zones_url:          ZONES_URL,
    source_overlays_url:       OVERLAYS_URL,
    zone_feature_count:        allZoneFeatures.length,
    distinct_zone_names_count: distinctZoneCount,
    noise_feature_count:       noiseFeatures.length,
    aircraft_feature_count:    aircraftFeatures.length,
    pmtiles_mb:                parseFloat(pmtilesMB.toFixed(2)),
    overlay_name_field:        overlayNameField,
    anef_contour_field:        anefContourField,
    zone_name_field:           zoneNameField,
    subzone_name_field:        subzoneNameField,
    noise_layer_names:         noiseNames,
    aircraft_layer_names:      aircraftNames,
  };
  writeFileSync(join(DATA_DIR, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8');
  log('metadata.json written');
  log('=== BUILD COMPLETE ===');
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapshaper simplification
// ─────────────────────────────────────────────────────────────────────────────

function simplifyWithMapshaper(inputPath, outputPath) {
  return new Promise(function(resolve, reject) {
    const cmd = '-i ' + JSON.stringify(inputPath) + ' -simplify visvalingam weighted 10% ' +
                '-o ' + JSON.stringify(outputPath) + ' format=geojson';
    mapshaper.runCommands(cmd, function(err) {
      if (err) return reject(new Error('mapshaper failed: ' + err.message));
      resolve();
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

log('Starting — MODE=' + MODE);

const { zonesDir, overlaysDir } = await downloadData();

try {
  if (MODE === 'discover') {
    await runDiscover(zonesDir, overlaysDir);
  } else if (MODE === 'build') {
    await runBuild(zonesDir, overlaysDir);
  } else {
    die('Unknown MODE="' + MODE + '" — use "discover" or "build"');
  }
} finally {
  try { rmSync(TMP_DIR, { recursive: true, force: true }); } catch {}
}
