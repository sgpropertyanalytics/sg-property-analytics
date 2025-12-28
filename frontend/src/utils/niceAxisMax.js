/**
 * Nice Axis Max Utilities
 *
 * Compute "nice" axis max values for dashboard charts.
 * Returns human-readable boundaries (multiples of 1, 2, 2.5, 5, 10 per magnitude).
 *
 * See: ui-layout-validator INV-11 (Nice Axis Ticks)
 */

/**
 * Compute nice max for any numeric value.
 * Returns the next "nice" boundary above the input.
 *
 * Nice boundaries: 1, 2, 2.5, 5, 10 (per magnitude)
 * Examples: 2147 → 2500, 847 → 1000, 3200 → 5000
 *
 * @param {number} dataMax - The maximum data value
 * @returns {number} A nice rounded max value
 */
export function niceMax(dataMax) {
  if (!dataMax || dataMax <= 0) return 10;

  const magnitude = Math.pow(10, Math.floor(Math.log10(dataMax)));
  const normalized = dataMax / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 2.5) return 2.5 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * Compute nice max for currency values in millions.
 * Aligns to $0.5M / $1M / $2M / $2.5M / $5M / $10M boundaries.
 *
 * @param {number} dataMaxMillion - The maximum price in millions
 * @returns {number} A nice rounded max in millions
 */
export function niceMaxMillion(dataMaxMillion) {
  if (!dataMaxMillion || dataMaxMillion <= 0) return 1;

  // For values under 1M, use $0.5M increments
  if (dataMaxMillion < 1) {
    return Math.ceil(dataMaxMillion * 2) / 2;
  }

  return niceMax(dataMaxMillion);
}

/**
 * Compute nice min for PSF values.
 * Rounds down to nearest 100.
 *
 * @param {number} dataMin - The minimum PSF value
 * @returns {number} A nice rounded min value
 */
export function nicePsfMin(dataMin) {
  if (!dataMin || dataMin <= 0) return 0;
  return Math.floor(dataMin / 100) * 100;
}

/**
 * Compute nice max for PSF values.
 * Uses standard niceMax logic.
 *
 * @param {number} dataMax - The maximum PSF value
 * @returns {number} A nice rounded max value
 */
export function nicePsfMax(dataMax) {
  return niceMax(dataMax);
}

/**
 * Compute nice step size for a given max and tick count.
 *
 * @param {number} max - The axis max value
 * @param {number} tickCount - Desired number of ticks (default 5)
 * @returns {number} A nice step size
 */
export function niceStep(max, tickCount = 5) {
  if (!max || max <= 0) return 1;
  const rawStep = max / (tickCount - 1);
  return niceMax(rawStep);
}
