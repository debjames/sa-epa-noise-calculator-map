/**
 * calc.js — ES module re-exports from shared-calc.js.
 * In browser: SharedCalc is loaded via <script src="shared-calc.js"> before this module.
 * In vitest: we dynamically import and eval shared-calc.js to populate the namespace.
 */

let SC;
if (typeof SharedCalc !== 'undefined') {
  SC = SharedCalc;
} else {
  // vitest / Node environment — load shared-calc.js by evaluating it
  const fs = await import('fs');
  const path = await import('path');
  const url = await import('url');
  const __dirname = path.default.dirname(url.fileURLToPath(import.meta.url));
  const code = fs.default.readFileSync(path.default.join(__dirname, 'shared-calc.js'), 'utf8');
  const fn = new Function(code + '\nreturn SharedCalc;');
  SC = fn();
}

export const attenuatePoint         = SC.attenuatePoint;
export const energySum              = SC.energySum;
export const sourceCombinedLw       = SC.sourceCombinedLw;
export const sourceContribution     = SC.sourceContribution;
export const totalAtReceiver        = SC.totalAtReceiver;
export const calcBarrierAttenuation = SC.calcBarrierAttenuation;
