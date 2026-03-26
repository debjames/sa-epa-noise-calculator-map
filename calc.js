/**
 * calc.js — ES module re-exports from shared-calc.js.
 * In browser: SharedCalc is loaded via <script src="shared-calc.js"> before this module.
 * In vitest: we load and evaluate shared-calc.js via vm.runInThisContext (CSP-safe, no eval/new Function).
 *
 * NOTE: This file uses top-level await and must be loaded as an ES module
 * (e.g. <script type="module"> or import in vitest).
 * Do not load via a classic <script> tag.
 */

let SC;
if (typeof SharedCalc !== 'undefined') {
  SC = SharedCalc;
} else {
  // vitest / Node environment — load shared-calc.js without eval or new Function
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

export const attenuatePoint         = SC.attenuatePoint;
export const energySum              = SC.energySum;
export const sourceCombinedLw       = SC.sourceCombinedLw;
export const sourceContribution     = SC.sourceContribution;
export const totalAtReceiver        = SC.totalAtReceiver;
export const calcBarrierAttenuation = SC.calcBarrierAttenuation;
export const calcBarrierWithEndDiffraction = SC.calcBarrierWithEndDiffraction;
export const calcISOatPoint         = SC.calcISOatPoint;
