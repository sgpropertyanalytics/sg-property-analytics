/**
 * Z-Score Oscillator Transformations
 *
 * Normalizes spread data to standard deviations (Z-scores) for
 * cross-spread visual comparison. Used by MarketValueOscillator chart.
 *
 * Why Z-Score over Dollar Deviation:
 * - $200 drop in CCR spread = normal noise
 * - $200 drop in RCR spread = major event
 * - Z-scores normalize by volatility, making both lines comparable
 */

import { transformCompressionSeries } from './compression';
import { isDev } from './validation';

/**
 * Calculate mean and standard deviation for an array of numbers.
 *
 * @param {Array<number>} arr - Array of numbers
 * @returns {{ mean: number, stdDev: number }}
 */
const calculateStats = (arr) => {
  if (!arr || arr.length === 0) {
    return { mean: 0, stdDev: 1 }; // Avoid division by zero
  }

  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;

  const variance = arr.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / arr.length;
  const stdDev = Math.sqrt(variance);

  // Avoid division by zero - if stdDev is 0, use 1
  return { mean, stdDev: stdDev || 1 };
};

/**
 * Calculate Z-score statistics from compression data.
 * Used to compute baseline (historical) mean and stdDev.
 *
 * @param {Array} data - Output from transformCompressionSeries
 * @returns {{ ccrRcr: { mean: number, stdDev: number }, rcrOcr: { mean: number, stdDev: number } }}
 */
export const calculateZScoreStats = (data) => {
  if (!Array.isArray(data) || data.length < 2) {
    return {
      ccrRcr: { mean: 400, stdDev: 200 }, // Fallback defaults
      rcrOcr: { mean: 200, stdDev: 100 },
    };
  }

  const ccrRcrSpreads = data.map(d => d.ccrRcrSpread).filter(v => v !== null && v !== undefined);
  const rcrOcrSpreads = data.map(d => d.rcrOcrSpread).filter(v => v !== null && v !== undefined);

  return {
    ccrRcr: calculateStats(ccrRcrSpreads),
    rcrOcr: calculateStats(rcrOcrSpreads),
  };
};

/**
 * Transform raw aggregate data into Z-score oscillator format.
 *
 * @param {Array} rawData - Raw data from /api/aggregate with region breakdown
 * @param {string} expectedGrain - Expected time grain (month, quarter, year)
 * @param {Object} baselineStats - Optional pre-computed baseline stats (for stable normalization)
 * @returns {Array} Transformed data with structure:
 *   { period, zCcrRcr, zRcrOcr, ccrRcrSpread, rcrOcrSpread, counts }
 */
export const transformOscillatorSeries = (rawData, expectedGrain = null, baselineStats = null) => {
  if (!Array.isArray(rawData)) {
    if (isDev) console.warn('[transformOscillatorSeries] Invalid input', rawData);
    return [];
  }

  // First, get compression data (spreads)
  const compressionData = transformCompressionSeries(rawData, expectedGrain);

  if (compressionData.length === 0) {
    return [];
  }

  // Use provided baseline stats or compute from the data
  const stats = baselineStats || calculateZScoreStats(compressionData);

  // Transform to Z-scores
  return compressionData.map(d => ({
    period: d.period,
    periodGrain: d.periodGrain,
    // Z-scores
    zCcrRcr: d.ccrRcrSpread !== null
      ? (d.ccrRcrSpread - stats.ccrRcr.mean) / stats.ccrRcr.stdDev
      : null,
    zRcrOcr: d.rcrOcrSpread !== null
      ? (d.rcrOcrSpread - stats.rcrOcr.mean) / stats.rcrOcr.stdDev
      : null,
    // Raw values for tooltip translation
    ccrRcrSpread: d.ccrRcrSpread,
    rcrOcrSpread: d.rcrOcrSpread,
    // Region PSF values for context
    ccr: d.ccr,
    rcr: d.rcr,
    ocr: d.ocr,
    // Transaction counts for confidence
    counts: d.counts,
  }));
};

/**
 * Get human-readable label for a Z-score value.
 *
 * @param {number} z - Z-score value
 * @returns {string} Label (e.g., "Undervalued", "Fair Value", "Overvalued")
 */
export const getZScoreLabel = (z) => {
  if (z === null || z === undefined || isNaN(z)) return 'N/A';

  if (z > 2.0) return 'Extremely Overvalued';
  if (z > 1.0) return 'Overvalued';
  if (z > 0.5) return 'Above Average';
  if (z > -0.5) return 'Fair Value';
  if (z > -1.0) return 'Below Average';
  if (z > -2.0) return 'Undervalued';
  return 'Extremely Undervalued';
};

/**
 * Get short label for a Z-score (for KPI cards).
 *
 * @param {number} z - Z-score value
 * @returns {string} Short label
 */
export const getZScoreShortLabel = (z) => {
  if (z === null || z === undefined || isNaN(z)) return 'N/A';

  if (z > 1.0) return 'High';
  if (z > -1.0) return 'Normal';
  return 'Low';
};

/**
 * Get signal color for a Z-score.
 *
 * @param {number} z - Z-score value
 * @returns {string} Tailwind color class (text-*)
 */
export const getZScoreColor = (z) => {
  if (z === null || z === undefined || isNaN(z)) return 'text-[#547792]';

  if (z > 1.0) return 'text-red-600';
  if (z < -1.0) return 'text-emerald-600';
  return 'text-[#213448]';
};
