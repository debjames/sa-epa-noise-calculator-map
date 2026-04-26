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
export const energySumA             = SC.energySumA;
export const sourceCombinedLw       = SC.sourceCombinedLw;
export const sourceContribution     = SC.sourceContribution;
export const totalAtReceiver        = SC.totalAtReceiver;
export const calcBarrierAttenuation = SC.calcBarrierAttenuation;
export const calcBarrierWithEndDiffraction = SC.calcBarrierWithEndDiffraction;
export const calcISOatPoint         = SC.calcISOatPoint;
export const calcISOatPointDetailed = SC.calcISOatPointDetailed;
export const calcAgrPerBand         = SC.calcAgrPerBand;
export const calcAgrBarrier         = SC.calcAgrBarrier;
export const calcAlphaAtm           = SC.calcAlphaAtm;
export const OCT_FREQ               = SC.OCT_FREQ;
// CONCAWE (Report 4/81)
export const CONCAWE_K3_COEFFS      = SC.CONCAWE_K3_COEFFS;
export const CONCAWE_GAMMA_TABLE    = SC.CONCAWE_GAMMA_TABLE;
export const CONCAWE_K4_TABLE       = SC.CONCAWE_K4_TABLE;
export const calcConcaweAtPoint      = SC.calcConcaweAtPoint;
export const calcConcaweAtPointDetailed = SC.calcConcaweAtPointDetailed;
export const calcConcaweK3          = SC.calcConcaweK3;
export const calcConcaweK5          = SC.calcConcaweK5;
export const lookupGamma            = SC.lookupGamma;
export const calcConcaweK4          = SC.calcConcaweK4;
export const getPasquillClass       = SC.getPasquillClass;
export const pasquillToGroup        = SC.pasquillToGroup;
export const getConcaweMetCategory  = SC.getConcaweMetCategory;
export const calcConcaweK4FromMet   = SC.calcConcaweK4FromMet;
export const A_WEIGHTS_BANDS        = SC.A_WEIGHTS_BANDS;
