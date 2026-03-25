/**
 * geometry.js — ES module re-exports from shared-calc.js.
 * In browser: SharedCalc is loaded via <script src="shared-calc.js"> before this module.
 * In vitest: we load and evaluate shared-calc.js via vm.runInNewContext (CSP-safe, no eval/new Function).
 *
 * NOTE: This file uses top-level await and must be loaded as an ES module
 * (e.g. <script type="module"> or import in vitest).
 * Do not load via a classic <script> tag.
 */

let SC;
if (typeof SharedCalc !== 'undefined') {
  SC = SharedCalc;
} else {
  const { readFileSync } = await import('fs');
  const { dirname, join } = await import('path');
  const { fileURLToPath } = await import('url');
  const vm = await import('vm');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const code = readFileSync(join(__dirname, 'shared-calc.js'), 'utf8');
  const ctx = {};
  vm.runInNewContext(code, ctx);
  SC = ctx.SharedCalc;
}

export const segmentsIntersect    = SC.segmentsIntersect;
export const getBuildingEdges     = SC.getBuildingEdges;
export const flatDistM            = SC.flatDistM;
export const pointInPolygonLatLng = SC.pointInPolygonLatLng;
export const getIntersectingEdges = SC.getIntersectingEdges;
export const getDominantBarrier   = SC.getDominantBarrier;
