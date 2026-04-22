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
 *
 * Notes on data:
 *   - Both zips contain GDA2020 + GDA94 variants of the same features.
 *     Only the GDA2020 file is used (suffix "GDA2020" in filename).
 *   - The overlay GeoJSON is very large (>512 MB uncompressed).
 *     It is stream-parsed with JSONStream to stay within Node.js limits.
 */

import { execSync }                                         from 'child_process';
import { createReadStream, createWriteStream,
         existsSync, mkdirSync, readFileSync,
         readdirSync, rmSync, statSync,
         writeFileSync }                                    from 'fs';
import { join, resolve, basename }                         from 'path';
import { tmpdir }                                          from 'os';
import { Readable }                                        from 'stream';
import { pipeline as streamPipeline }                      from 'stream/promises';
import { fileURLToPath }                                   from 'url';
import AdmZip                                              from 'adm-zip';
import mapshaper                                           from 'mapshaper';
import JSONStream                                          from 'JSONStream';

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

const MIN_ZONE_FEATURES = 4_000;   // statewide SA zones are ~5,300 in the GDA2020 file
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
  await streamPipeline(Readable.fromWeb(resp.body), createWriteStream(destPath));
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
  return String(str).trim().replace(/\w\S*/g, function(word) {
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/**
 * Find all .geojson/.json files in a directory, returning only GDA2020
 * variants when both GDA2020 and GDA94 exist (same features, two projections).
 */
function findGeoJSONFiles(dir) {
  const all = [];
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
        all.push(full);
      }
    }
  }
  walk(dir);

  // Prefer GDA2020 over GDA94 when both exist in the same directory
  const gda2020 = all.filter(f => /GDA2020/i.test(basename(f)));
  const hasGDA2020 = gda2020.length > 0;
  if (hasGDA2020) {
    const nonGDA = all.filter(f => !/GDA94|GDA2020/i.test(basename(f)));
    log('GDA2020 preferred — using: ' + [...gda2020, ...nonGDA].map(f => basename(f)).join(', '));
    return [...gda2020, ...nonGDA];
  }
  return all;
}

// ─────────────────────────────────────────────────────────────────────────────
// Streaming JSON feature parser (handles files of any size via JSONStream)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Stream-parse a GeoJSON FeatureCollection and call onFeature(feature) for
 * each feature. Returns a Promise that resolves when the stream ends.
 */
function streamFeatures(filePath, onFeature) {
  return new Promise(function(resolve, reject) {
    const readStream = createReadStream(filePath);
    const parser     = JSONStream.parse('features.*');

    readStream.on('error', reject);
    parser.on('error', reject);
    parser.on('end',   resolve);
    parser.on('data',  onFeature);

    readStream.pipe(parser);
  });
}

/**
 * Collect per-field distinct values from a GeoJSON file via streaming.
 * Returns { count, fieldValues: { key: Set<string> } }
 */
async function streamCollectStats(filePath) {
  const fieldValues = {};
  let count = 0;

  await streamFeatures(filePath, function(feature) {
    count++;
    const props = feature.properties || {};
    for (const k of Object.keys(props)) {
      if (!fieldValues[k]) fieldValues[k] = new Set();
      if (props[k] !== null && props[k] !== undefined) {
        fieldValues[k].add(String(props[k]));
      }
    }
  });

  return { count, fieldValues };
}

/**
 * Stream-filter a GeoJSON file, writing only matched features to outputPath.
 * filterFn(feature) → boolean, mapFn(feature) → feature
 * Returns { count, matchedNames: Set }
 */
function streamFilterFeatures(filePath, nameField, filterFn, mapFn, outputPath) {
  return new Promise(function(resolve, reject) {
    const matchedNames = new Set();
    let count    = 0;
    let started  = false;

    const outStream = createWriteStream(outputPath, { encoding: 'utf8' });
    outStream.write('{"type":"FeatureCollection","features":[');

    const readStream = createReadStream(filePath);
    const parser     = JSONStream.parse('features.*');

    readStream.on('error', reject);
    parser.on('error', reject);

    parser.on('data', function(feature) {
      if (!filterFn(feature)) return;
      const val = (feature.properties || {})[nameField];
      if (val) matchedNames.add(String(val));
      const mapped = mapFn(feature);
      if (started) outStream.write(',');
      outStream.write(JSON.stringify(mapped));
      started = true;
      count++;
    });

    parser.on('end', function() {
      outStream.write(']}');
      outStream.end(function() {
        resolve({ count, matchedNames });
      });
    });

    readStream.pipe(parser);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Download both zips
// ─────────────────────────────────────────────────────────────────────────────

async function downloadData() {
  ensureDir(TMP_DIR);
  const zonesZip    = join(TMP_DIR, 'zones.zip');
  const overlaysZip = join(TMP_DIR, 'overlays.zip');

  await Promise.all([
    downloadFile(ZONES_URL,    zonesZip),
    downloadFile(OVERLAYS_URL, overlaysZip),
  ]).catch(function(e) { die('Download failed: ' + e.message); });

  const zonesDir    = join(TMP_DIR, 'zones');
  const overlaysDir = join(TMP_DIR, 'overlays');
  extractZip(zonesZip,    zonesDir);
  extractZip(overlaysZip, overlaysDir);
  return { zonesDir, overlaysDir };
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOVER mode
// ─────────────────────────────────────────────────────────────────────────────

async function runDiscover(zonesDir, overlaysDir) {
  log('=== DISCOVER MODE ===');

  const discovery = { generated_utc: new Date().toISOString(), zones: {}, overlays: {} };

  // ── Zones ──────────────────────────────────────────────────────────────────
  const zonesFiles = findGeoJSONFiles(zonesDir);
  log('Zone GeoJSON files (GDA2020 only): ' + zonesFiles.length);

  let zoneCount = 0;
  const zoneFieldValues = {};

  for (const f of zonesFiles) {
    log('Parsing zones: ' + basename(f));
    const { count, fieldValues } = await streamCollectStats(f);
    zoneCount += count;
    for (const [k, vs] of Object.entries(fieldValues)) {
      if (!zoneFieldValues[k]) zoneFieldValues[k] = new Set();
      vs.forEach(function(v) { zoneFieldValues[k].add(v); });
    }
  }

  const zoneKeys = Object.keys(zoneFieldValues);
  discovery.zones = {
    total_features:    zoneCount,
    property_keys:     zoneKeys,
    field_value_counts: {},
    values_per_field:   {},
  };
  zoneKeys.forEach(function(k) {
    discovery.zones.field_value_counts[k] = zoneFieldValues[k].size;
    discovery.zones.values_per_field[k]   = Array.from(zoneFieldValues[k]).sort();
    log('  [zones] ' + k + ': ' + zoneFieldValues[k].size + ' distinct values');
  });

  // ── Overlays ───────────────────────────────────────────────────────────────
  const overlayFiles = findGeoJSONFiles(overlaysDir);
  log('Overlay GeoJSON files (GDA2020 only): ' + overlayFiles.length);

  let overlayCount = 0;
  const overlayFieldValues = {};

  for (const f of overlayFiles) {
    log('Parsing overlays (streaming): ' + basename(f));
    const { count, fieldValues } = await streamCollectStats(f);
    overlayCount += count;
    for (const [k, vs] of Object.entries(fieldValues)) {
      if (!overlayFieldValues[k]) overlayFieldValues[k] = new Set();
      vs.forEach(function(v) { overlayFieldValues[k].add(v); });
    }
    log('  → ' + count + ' features in ' + basename(f));
  }

  const overlayKeys = Object.keys(overlayFieldValues);
  discovery.overlays = {
    total_features:    overlayCount,
    property_keys:     overlayKeys,
    field_value_counts: {},
    values_per_field:   {},
  };
  overlayKeys.forEach(function(k) {
    discovery.overlays.field_value_counts[k] = overlayFieldValues[k].size;
    discovery.overlays.values_per_field[k]   = Array.from(overlayFieldValues[k]).sort();
    log('  [overlays] ' + k + ': ' + overlayFieldValues[k].size + ' distinct values — ' +
        JSON.stringify(Array.from(overlayFieldValues[k]).slice(0, 30)));
  });

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

  const discoveryPath = join(DATA_DIR, '_discovery.json');
  if (!existsSync(discoveryPath)) {
    die('_discovery.json not found — run MODE=discover first');
  }
  const disc = JSON.parse(readFileSync(discoveryPath, 'utf8'));

  // ── Detect field names ────────────────────────────────────────────────────
  const oDFC = disc.overlays?.field_value_counts || {};
  const overlayNameField = Object.keys(oDFC)
    .sort(function(a, b) { return (oDFC[b] || 0) - (oDFC[a] || 0); })
    .find(function(k) { return (oDFC[k] || 0) >= 2; }) || 'name';

  const oVPF = disc.overlays?.values_per_field || {};
  const anefContourField = Object.keys(oVPF).find(function(k) {
    const lk = k.toLowerCase();
    return lk.includes('anef') || lk.includes('anr') || lk.includes('contour') ||
           lk.includes('exposure') || lk.includes('level');
  }) || null;

  const zDFC = disc.zones?.field_value_counts || {};
  const preferredZoneFields = ['name', 'zone_name', 'ZONE_NAME', 'NAME', 'zone', 'ZONE', 'label'];
  const zoneNameField = preferredZoneFields.find(function(k) { return k in zDFC; }) ||
    Object.keys(zDFC).sort(function(a, b) { return (zDFC[b]||0) - (zDFC[a]||0); })[0] || 'name';

  const subzoneNameField = Object.keys(zDFC).find(function(k) {
    return k !== zoneNameField && (zDFC[k] || 0) >= 2 && k !== 'id' &&
           !['legalstartdate','legalenddate','systemstartdate','systemenddate',
             'status','shape_Length','shape_Area'].includes(k);
  }) || null;

  log('Overlay name field:   ' + overlayNameField);
  log('ANEF contour field:   ' + (anefContourField || '(none detected)'));
  log('Zone name field:      ' + zoneNameField);
  log('Subzone name field:   ' + (subzoneNameField || '(none)'));

  // ── Stream-filter overlays ────────────────────────────────────────────────
  ensureDir(OVERLAYS_DIR);
  const overlayFiles = findGeoJSONFiles(overlaysDir);

  // We stream-filter into separate temp files, then simplify with mapshaper
  const noiseTmpPath    = join(TMP_DIR, 'noise-raw.geojson');
  const aircraftTmpPath = join(TMP_DIR, 'aircraft-raw.geojson');

  let noiseCount = 0, aircraftCount = 0;
  const noiseNames    = new Set();
  const aircraftNames = new Set();

  for (const f of overlayFiles) {
    log('Filtering overlays (streaming): ' + basename(f));

    const noiseResult = await streamFilterFeatures(
      f,
      overlayNameField,
      function(feat) {
        const val = String((feat.properties || {})[overlayNameField] || '').toLowerCase();
        return val.includes('noise and air') || val.includes('noise & air');
      },
      function(feat) {
        const props = feat.properties || {};
        return { type: 'Feature', geometry: feat.geometry,
                 properties: { overlay_name: props[overlayNameField] || '' } };
      },
      noiseTmpPath
    );

    const aircraftResult = await streamFilterFeatures(
      f,
      overlayNameField,
      function(feat) {
        const val = String((feat.properties || {})[overlayNameField] || '').toLowerCase();
        return val.includes('aircraft noise');
      },
      function(feat) {
        const props  = feat.properties || {};
        const outProps = { overlay_name: props[overlayNameField] || '' };
        if (anefContourField && props[anefContourField] !== undefined) {
          outProps.anef_contour = props[anefContourField];
        }
        return { type: 'Feature', geometry: feat.geometry, properties: outProps };
      },
      aircraftTmpPath
    );

    noiseCount    += noiseResult.count;
    aircraftCount += aircraftResult.count;
    noiseResult.matchedNames.forEach(function(v) { noiseNames.add(v); });
    aircraftResult.matchedNames.forEach(function(v) { aircraftNames.add(v); });
  }

  log('Noise & Air Emissions: ' + noiseCount + ' features — layer names: ' + JSON.stringify([...noiseNames]));
  log('Aircraft Noise:        ' + aircraftCount + ' features — layer names: ' + JSON.stringify([...aircraftNames]));

  if (noiseCount === 0)    die('Noise & Air Emissions filter matched zero features');
  if (aircraftCount === 0) die('Aircraft Noise filter matched zero features');
  if (noiseNames.size > 1) die('Noise & Air Emissions matched multiple layer names: ' + JSON.stringify([...noiseNames]));
  if (aircraftNames.size > 1) die('Aircraft Noise matched multiple layer names: ' + JSON.stringify([...aircraftNames]));

  const noiseOutPath    = join(OVERLAYS_DIR, 'noise-air-emissions.geojson');
  const aircraftOutPath = join(OVERLAYS_DIR, 'aircraft-noise.geojson');

  await simplifyWithMapshaper(noiseTmpPath,    noiseOutPath);
  await simplifyWithMapshaper(aircraftTmpPath, aircraftOutPath);
  log('Noise GeoJSON    → ' + noiseOutPath);
  log('Aircraft GeoJSON → ' + aircraftOutPath);

  // ── Zones → PMTiles ────────────────────────────────────────────────────────
  ensureDir(ZONES_DIR);
  const zonesFiles = findGeoJSONFiles(zonesDir);

  // Load zones normally (GDA2020 only, ~5,400 features — well within memory)
  let allZoneFeatures = [];
  for (const f of zonesFiles) {
    log('Loading zones: ' + basename(f));
    const { count, fieldValues } = await streamCollectStats(f);
    log('  → ' + count + ' zone features');
  }

  // Re-read to build the output FeatureCollection (small enough for readFileSync)
  for (const f of zonesFiles) {
    await streamFeatures(f, function(feat) {
      allZoneFeatures.push(feat);
    });
  }

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
    noise_feature_count:       noiseCount,
    aircraft_feature_count:    aircraftCount,
    pmtiles_mb:                parseFloat(pmtilesMB.toFixed(2)),
    overlay_name_field:        overlayNameField,
    anef_contour_field:        anefContourField,
    zone_name_field:           zoneNameField,
    subzone_name_field:        subzoneNameField,
    noise_layer_names:         [...noiseNames],
    aircraft_layer_names:      [...aircraftNames],
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
    const cmd = '-i ' + JSON.stringify(inputPath) +
                ' -simplify visvalingam weighted 10%' +
                ' -o ' + JSON.stringify(outputPath) + ' format=geojson';
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
