/**
 * noise-calc-core.js — Shared ISO 9613-2 acoustic functions.
 * Used by both index.html (via ES module) and noise-worker.js (via importScripts).
 *
 * This file uses plain functions assigned to a namespace object so it works
 * in both contexts without ES module syntax.
 */

/* exported NoiseCalcCore */
/* globals self */
var NoiseCalcCore = (function() {

  // Octave band centre frequencies (Hz)
  var OCT_FREQ = [63, 125, 250, 500, 1000, 2000, 4000, 8000];

  // Default atmospheric absorption coefficients (dB/km) at 10°C, 70% RH
  // from ISO 9613-1 Table 1
  var ALPHA_DEFAULT = [0.1, 0.4, 1.0, 1.9, 3.7, 9.7, 32.8, 117.0];

  /**
   * Calculate frequency-dependent ground attenuation per octave band
   * using ISO 9613-2 Table 3 (detailed method, §7.3.1).
   * Agr = As + Ar + Am (source, receiver, and middle regions)
   * @param {number} hS - source height above ground (m)
   * @param {number} hR - receiver height above ground (m)
   * @param {number} dp - propagation distance (m)
   * @param {number} G  - ground factor (0=hard, 0.5=mixed, 1.0=soft porous)
   * @returns {number[]} Agr per octave band [63..8k Hz]
   */
  function calcAgrPerBand(hS, hR, dp, G) {
    function aPrime(h) {
      return 1.5 + 3.0 * Math.exp(-0.12 * (h - 5) * (h - 5)) * (1 - Math.exp(-dp / 50))
           + 5.7 * Math.exp(-0.09 * h * h) * (1 - Math.exp(-2.8e-6 * dp * dp));
    }
    function bPrime(h) {
      return 1.5 + 8.6 * Math.exp(-0.09 * h * h) * (1 - Math.exp(-dp / 50));
    }
    function cPrime(h) {
      return 1.5 + 14.0 * Math.exp(-0.46 * h * h) * (1 - Math.exp(-dp / 50));
    }
    function dPrime(h) {
      return 1.5 + 5.0 * Math.exp(-0.9 * h * h) * (1 - Math.exp(-dp / 50));
    }

    var As = [
      -1.5,
      -1.5 + G * Math.max(aPrime(hS), 0),
      -1.5 + G * Math.max(bPrime(hS), 0),
      -1.5 + G * Math.max(cPrime(hS), 0),
      -1.5 + G * Math.max(dPrime(hS), 0),
      -1.5 * (1 - G),
      -1.5 * (1 - G),
      -1.5 * (1 - G)
    ];

    var Ar = [
      -1.5,
      -1.5 + G * Math.max(aPrime(hR), 0),
      -1.5 + G * Math.max(bPrime(hR), 0),
      -1.5 + G * Math.max(cPrime(hR), 0),
      -1.5 + G * Math.max(dPrime(hR), 0),
      -1.5 * (1 - G),
      -1.5 * (1 - G),
      -1.5 * (1 - G)
    ];

    // Middle region factor q (ISO 9613-2 §7.3.1)
    var q = (dp <= 30 * (hS + hR)) ? 0 : (1 - 30 * (hS + hR) / dp);

    var Am = [
      -3 * q,
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G),
      -3 * q * (1 - G)
    ];

    var Agr = [];
    for (var i = 0; i < 8; i++) {
      Agr.push(As[i] + Ar[i] + Am[i]);
    }
    return Agr;
  }

  /**
   * Calculate atmospheric absorption coefficients (dB/km) per octave band
   * using ISO 9613-1 for given temperature and humidity.
   * @param {number} tempC - temperature in °C
   * @param {number} humPct - relative humidity in %
   * @returns {number[]} alpha per octave band (dB/km)
   */
  function calcAlphaAtm(tempC, humPct) {
    if (tempC === 10 && humPct === 70) return ALPHA_DEFAULT.slice();
    var T = tempC + 273.15;
    var T0 = 293.15;
    var T01 = 273.16;
    var psat = Math.pow(10, -6.8346 * Math.pow(T01 / T, 1.261) + 4.6151);
    var h = humPct * psat;
    var alpha = [];
    for (var i = 0; i < OCT_FREQ.length; i++) {
      var f = OCT_FREQ[i];
      var frO = (24 + 4.04e4 * h * (0.02 + h) / (0.391 + h));
      var frN = Math.pow(T / T0, -0.5) * (9 + 280 * h * Math.exp(-4.17 * (Math.pow(T / T0, -1 / 3) - 1)));
      var f2 = f * f;
      var a = 8.686 * f2 * (
        1.84e-11 * Math.pow(T / T0, 0.5) +
        Math.pow(T / T0, -2.5) * (
          0.01275 * Math.exp(-2239.1 / T) / (frO + f2 / frO) +
          0.1068 * Math.exp(-3352.0 / T) / (frN + f2 / frN)
        )
      );
      alpha.push(Math.round(a * 100) / 100);
    }
    return alpha;
  }

  /**
   * ISO 9613-2 barrier attenuation per octave band.
   * @param {number} delta - path length difference (m)
   * @param {number[]} frequencies - octave band centre frequencies
   * @returns {number[]} attenuation per band (dB), capped at 20
   */
  function calcBarrierAttenuation(delta, frequencies) {
    if (delta <= 0) return frequencies.map(function() { return 0; });
    return frequencies.map(function(f) {
      var lambda = 340 / f;
      var raw = 10 * Math.log10(3 + (20 * delta) / lambda);
      return Math.max(0, Math.min(raw, 20));
    });
  }

  return {
    OCT_FREQ: OCT_FREQ,
    ALPHA_DEFAULT: ALPHA_DEFAULT,
    calcAgrPerBand: calcAgrPerBand,
    calcAlphaAtm: calcAlphaAtm,
    calcBarrierAttenuation: calcBarrierAttenuation
  };
})();

// Support Node.js require() for testing
if (typeof module !== 'undefined') {
  module.exports = NoiseCalcCore;
}
