/**
 * geometry.js — ES module re-exports from shared-calc.js.
 * In browser: SharedCalc is loaded via <script src="shared-calc.js"> before this module.
 * In vitest: we dynamically import and eval shared-calc.js to populate the namespace.
 *
 * NOTE: This file uses top-level await and must be loaded as an ES module
 * (e.g. <script type="module"> or import in vitest).
 * Do not load via a classic <script> tag.
 */

let SC;
if (typeof SharedCalc !== 'undefined') {
  SC = SharedCalc;
} else {
  const fs = await import('fs');
  const path = await import('path');
  const url = await import('url');
  const __dirname = path.default.dirname(url.fileURLToPath(import.meta.url));
  const code = fs.default.readFileSync(path.default.join(__dirname, 'shared-calc.js'), 'utf8');
  const fn = new Function(code + '\nreturn SharedCalc;');
  SC = fn();
}

export const segmentsIntersect    = SC.segmentsIntersect;
export const getBuildingEdges     = SC.getBuildingEdges;
export const flatDistM            = SC.flatDistM;
export const pointInPolygonLatLng  = SC.pointInPolygonLatLng;
export const getIntersectingEdges = SC.getIntersectingEdges;
export const getDominantBarrier   = SC.getDominantBarrier;
