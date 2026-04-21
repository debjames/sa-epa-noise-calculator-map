// js/sources-config.js
// Resonate Noise Source Library — data layer config
// Temporary Google Sheets backend; migrate to Supabase later.

export const SOURCES_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1GW8J6YDlXD77nzBgDPbn8-RTHduoKW2jftYuIK_54c0/gviz/tq?tqx=out:csv&sheet=Sources';

export const SOURCES_WRITE_URL =
  'https://script.google.com/macros/s/AKfycbyxbCdzGeQMHn6G-jEkp2HrTYqa0V_CS3KC5811e6nb2RIa6CvUpbxsu-8PPKVIJlxH/exec';

// Cache TTL for library reads (ms). 1 hour default.
export const SOURCES_CACHE_TTL_MS = 60 * 60 * 1000;
