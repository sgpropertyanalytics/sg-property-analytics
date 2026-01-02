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
 * Default/fallback baseline statistics for Z-score calculation.
 *
 * These conservative estimates are used temporarily until real historical
 * baseline data loads from the API. Values are based on approximate historical
 * averages for Singapore property market segment spreads:
 *
 * - CCR-RCR spread: ~$400 PSF mean, ~$200 stdDev (higher volatility in prime segments)
 * - RCR-OCR spread: ~$200 PSF mean, ~$100 stdDev (more stable suburban spread)
 *
 * These defaults ensure the oscillator chart renders immediately without waiting
 * for baseline fetch, showing reasonable Z-score values that will be recalculated
 * once real baseline data arrives.
 *
 * @type {{ ccrRcr: { mean: number, stdDev: number }, rcrOcr: { mean: number, stdDev: number } }}
 */
export const DEFAULT_BASELINE_STATS = {
  ccrRcr: { mean: 400, stdDev: 200 },
  rcrOcr: { mean: 200, stdDev: 100 },
};

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
    return DEFAULT_BASELINE_STATS;
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
 * DESIGN: Grain-agnostic - delegates to transformCompressionSeries which trusts data's own grain.
 *
 * @param {Array} rawData - Raw data from /api/aggregate with region breakdown
 * @param {Object} baselineStats - Optional pre-computed baseline stats (for stable normalization)
 * @returns {Array} Transformed data with structure:
 *   { period, periodGrain, zCcrRcr, zRcrOcr, ccrRcrSpread, rcrOcrSpread, counts }
 */
export const transformOscillatorSeries = (rawData, baselineStats = null) => {
  if (!Array.isArray(rawData)) {
    if (isDev) console.warn('[transformOscillatorSeries] Invalid input', rawData);
    return [];
  }

  // First, get compression data (spreads) - grain-agnostic
  const compressionData = transformCompressionSeries(rawData);

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
 * Thresholds aligned with chart zones:
 * - ±2σ: Extreme (red/green zones)
 * - ±1σ to ±2σ: Elevated/watch (amber/yellow)
 * - ±1σ: Normal (grey zone)
 *
 * @param {number} z - Z-score value
 * @returns {string} Label (e.g., "Undervalued", "Fair Value", "Overvalued")
 */
export const getZScoreLabel = (z) => {
  if (z === null || z === undefined || isNaN(z)) return 'N/A';

  if (z > 2.0) return 'Extreme Disparity';
  if (z > 1.0) return 'Elevated Premium';
  if (z > -1.0) return 'Normal Range';
  if (z > -2.0) return 'Compressed Premium';
  return 'Extreme Compression';
};

/**
 * Get short label for a Z-score (for KPI cards).
 * Only flags extreme values (beyond ±2σ).
 *
 * @param {number} z - Z-score value
 * @returns {string} Short label
 */
export const getZScoreShortLabel = (z) => {
  if (z === null || z === undefined || isNaN(z)) return 'N/A';

  if (z > 2.0) return 'Extreme High';
  if (z > 1.0) return 'Elevated';
  if (z > -1.0) return 'Normal';
  if (z > -2.0) return 'Low';
  return 'Extreme Low';
};

/**
 * Get signal color for a Z-score.
 * Green for negative (compressed/undervalued), red for positive (elevated/overvalued).
 *
 * @param {number} z - Z-score value
 * @returns {string} Tailwind color class (text-*)
 */
export const getZScoreColor = (z) => {
  if (z === null || z === undefined || isNaN(z)) return 'text-[#547792]';

  if (z > 2.0) return 'text-red-600';         // Extreme overvaluation
  if (z > 1.0) return 'text-amber-600';       // Elevated, watch closely
  if (z > -1.0) return 'text-[#213448]';      // Normal range
  if (z > -2.0) return 'text-emerald-500';    // Compressed premium (green = good for buyers)
  return 'text-emerald-600';                  // Extreme compression (darker green)
};

/**
 * Calculate rolling average for an array of values.
 *
 * @param {Array<number|null>} values - Array of values (can contain nulls)
 * @param {number} window - Rolling window size (default 12)
 * @returns {Array<number|null>} Rolling averages (null for insufficient data)
 */
export const calculateRollingAverage = (values, window = 12) => {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  return values.map((_, idx) => {
    // Need at least 'window' data points to calculate
    if (idx < window - 1) return null;

    // Get the window of values
    const windowValues = values
      .slice(idx - window + 1, idx + 1)
      .filter(v => v !== null && v !== undefined && !isNaN(v));

    // Need at least half the window to be valid
    if (windowValues.length < window / 2) return null;

    const sum = windowValues.reduce((a, b) => a + b, 0);
    return sum / windowValues.length;
  });
};
