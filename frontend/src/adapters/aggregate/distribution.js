/**
 * Distribution / Histogram Transformations
 *
 * Handles histogram data from /api/dashboard?panels=price_histogram.
 * - formatPrice: Price formatting utility
 * - transformDistributionSeries: Histogram data normalization
 * - findBinIndex: Price-to-bin lookup
 */

import { isDev } from './validation';

/**
 * Format price values for display (e.g., $1.2M, $800K)
 *
 * @param {number} value - Price value
 * @returns {string} Formatted price string
 */
export const formatPrice = (value) => {
  if (value == null) return '-';
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  return `$${(value / 1000).toFixed(0)}K`;
};

/**
 * Format price range for KPI cards
 *
 * Bloomberg-style: Single currency symbol, unit suffix at end only.
 *
 * @param {number} low - Lower bound
 * @param {number} high - Upper bound
 * @param {Object} options - Formatting options
 * @param {boolean} options.compact - Use 1 decimal (tight spaces) vs 2 decimals (default)
 * @returns {string} Range string
 *
 * Examples:
 *   formatPriceRange(1220000, 2270000)                  → "$1.22–2.27M"
 *   formatPriceRange(1220000, 2270000, { compact: true }) → "$1.2–2.3M"
 */
export const formatPriceRange = (low, high, { compact = false } = {}) => {
  if (low == null || high == null) return '-';

  const decimals = compact ? 1 : 2;

  // Both in millions
  if (low >= 1000000 && high >= 1000000) {
    return `$${(low / 1000000).toFixed(decimals)}–${(high / 1000000).toFixed(decimals)}M`;
  }
  // Both in thousands (no decimals needed)
  if (low < 1000000 && high < 1000000) {
    return `$${(low / 1000).toFixed(0)}–${(high / 1000).toFixed(0)}K`;
  }
  // Mixed (low in K, high in M)
  return `$${(low / 1000).toFixed(0)}K–${(high / 1000000).toFixed(decimals)}M`;
};

/**
 * Transform raw histogram data from /api/dashboard?panels=price_histogram
 *
 * Handles both legacy (array) and new (object) formats.
 * Returns normalized structure for chart consumption.
 *
 * @param {Object|Array} rawHistogram - Raw price_histogram from API
 * @returns {Object} Transformed data:
 *   {
 *     bins: [{ start, end, label, count }],
 *     stats: { median, p25, p75, iqr },
 *     tail: { pct, count },
 *     totalCount: number
 *   }
 */
export const transformDistributionSeries = (rawHistogram) => {
  // Handle null/undefined input
  if (!rawHistogram) {
    if (isDev) console.warn('[transformDistributionSeries] Null input');
    return { bins: [], stats: {}, tail: {}, totalCount: 0 };
  }

  let binsArray = [];
  let stats = {};
  let tail = {};

  // Normalize API response format
  if (Array.isArray(rawHistogram)) {
    // Legacy format: price_histogram is array of bins directly
    binsArray = rawHistogram;
  } else if (typeof rawHistogram === 'object') {
    // New format: price_histogram has bins, stats, tail
    binsArray = rawHistogram.bins || [];
    stats = rawHistogram.stats || {};
    tail = rawHistogram.tail || {};
  }

  // Transform bins to chart-ready format with proper numeric coercion
  const bins = binsArray.map((bin) => {
    const start = Number(bin.bin_start) || 0;
    const end = Number(bin.bin_end) || 0;
    const count = Number(bin.count) || 0;

    return {
      start,
      end,
      label: formatPriceRange(start, end, { compact: true }),
      count,
    };
  });

  // Calculate total count from bins
  const totalCount = bins.reduce((sum, bin) => sum + bin.count, 0);

  // Validate and log if bins are empty but input wasn't
  if (bins.length === 0 && binsArray.length > 0 && isDev) {
    console.warn('[transformDistributionSeries] Bins parsed to empty array', {
      inputLength: binsArray.length,
      sample: binsArray[0],
    });
  }

  return {
    bins,
    stats,
    tail,
    totalCount,
  };
};

/**
 * Find which bin index a price value falls into.
 *
 * Uses standard histogram convention:
 * - All bins except last: [start, end) - inclusive start, exclusive end
 * - Last bin: [start, end] - inclusive both ends
 *
 * This prevents edge prices from "jumping bins" at boundaries.
 *
 * @param {Array} bins - Array of bin objects with start/end
 * @param {number} price - Price value to find
 * @returns {number} Bin index, or -1 if not found
 */
export const findBinIndex = (bins, price) => {
  if (!price || !Array.isArray(bins) || bins.length === 0) return -1;

  const lastIndex = bins.length - 1;

  for (let i = 0; i < bins.length; i++) {
    const bin = bins[i];
    const isLastBin = i === lastIndex;

    // [start, end) for all bins except last; [start, end] for last bin
    if (isLastBin) {
      if (price >= bin.start && price <= bin.end) return i;
    } else {
      if (price >= bin.start && price < bin.end) return i;
    }
  }

  // If price is beyond the last bin, return the last index
  if (price > bins[lastIndex].end) {
    return lastIndex;
  }

  // If price is below the first bin, return first index
  if (price < bins[0].start) {
    return 0;
  }

  return -1;
};
