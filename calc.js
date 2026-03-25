/**
 * calc.js — Pure acoustic calculation functions
 * Formula: Lp = Lw - (20·log10(r) + 8)
 * Assumes hemispherical propagation (ground-level / rooftop plant)
 *
 * These functions contain no DOM or UI references.
 * Replace the equivalent logic in index.html with calls to these exports.
 */

/**
 * Attenuation from a point source at distance r.
 * @param {number} Lw - Sound power level (dB)
 * @param {number} r  - Distance from source to receiver (m)
 * @returns {number}  - Sound pressure level at receiver (dB)
 */
export function attenuatePoint(Lw, r) {
  if (r <= 0) r = 0.1; // clamp to avoid log(0)
  return Lw - (20 * Math.log10(r) + 8);
}

/**
 * Energy-sum an array of sound pressure levels.
 * @param {number[]} levels - Array of dB values
 * @returns {number}        - Combined level (dB)
 */
export function energySum(levels) {
  if (!levels || levels.length === 0) return -Infinity;
  return 10 * Math.log10(
    levels.reduce((sum, L) => sum + Math.pow(10, L / 10), 0)
  );
}

/**
 * Combined sound power level for one source's equipment list.
 * @param {Array<{Lw: number, quantity: number}>} equipment
 * @returns {number} - Combined Lw for the source (dB)
 */
export function sourceCombinedLw(equipment) {
  if (!equipment || equipment.length === 0) return -Infinity;
  const activeLevels = equipment
    .filter(item => item.quantity > 0)
    .map(item => item.Lw + 10 * Math.log10(item.quantity));
  if (activeLevels.length === 0) return -Infinity;
  return energySum(activeLevels);
}

/**
 * Sound pressure level at a receiver from a single source.
 * @param {{ equipment: Array<{Lw: number, quantity: number}> }} source
 * @param {number} distance - metres
 * @returns {number} - Lp at receiver from this source (dB)
 */
export function sourceContribution(source, distance) {
  const Lw = sourceCombinedLw(source.equipment);
  if (!isFinite(Lw)) return -Infinity;
  return attenuatePoint(Lw, distance);
}

/**
 * ISO 9613-2 Section 8 barrier attenuation.
 * @param {number} delta - Path length difference in metres (from getDominantBarrier)
 * @param {number[]} frequencies - Octave band centre frequencies [63..8000]
 * @returns {number[]} Attenuation per band [dB], capped at 20 dB
 */
export function calcBarrierAttenuation(delta, frequencies) {
  if (delta <= 0) return frequencies.map(() => 0);
  return frequencies.map(f => {
    const lambda = 340 / f; // wavelength at 20°C
    const Kmet = 1;          // meteorological correction (1.0 = no wind)
    const raw = 10 * Math.log10(3 + (20 * Kmet * delta) / lambda);
    return Math.max(0, Math.min(raw, 20)); // cap at 20 dB per ISO
  });
}

/**
 * Total sound pressure level at a receiver from all sources.
 * @param {Array<{ equipment: Array<{Lw: number, quantity: number}> }>} sources
 * @param {number[]} distances - distance from each source to this receiver (m)
 * @returns {number} - Combined Lp at receiver (dB)
 */
export function totalAtReceiver(sources, distances) {
  const contributions = sources.map((src, i) =>
    sourceContribution(src, distances[i])
  );
  const finite = contributions.filter(isFinite);
  if (finite.length === 0) return -Infinity;
  return energySum(finite);
}
