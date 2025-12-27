/**
 * Beads Chart Transformations
 *
 * Handles beads chart data from /api/dashboard?panels=beads_chart.
 * - transformBeadsChartSeries: Main transformation function
 *
 * This adapter transforms the raw API response into Chart.js bubble chart format.
 * The chart displays volume-weighted median prices by bedroom type across regions.
 *
 * Visualization:
 * - X-axis: Price in millions SGD
 * - Y-axis: Region (CCR, RCR, OCR) as categories
 * - Bubble size: Transaction volume
 * - Bubble color: Bedroom type (1BR-5BR+)
 */

import { isDev } from './validation';

/**
 * Color palette for bedroom types.
 * Progression from sand (1BR) to navy (5BR+) per CLAUDE.md styling guide.
 */
const BEDROOM_COLORS = {
  1: 'rgba(234, 224, 207, 0.85)', // Sand #EAE0CF
  2: 'rgba(148, 180, 193, 0.85)', // Sky #94B4C1
  3: 'rgba(84, 119, 146, 0.85)', // Blue #547792
  4: 'rgba(58, 91, 118, 0.85)', // Blend between blue and navy
  5: 'rgba(33, 52, 72, 0.85)', // Navy #213448
};

/**
 * Bedroom labels for display.
 */
const BEDROOM_LABELS = {
  1: '1BR',
  2: '2BR',
  3: '3BR',
  4: '4BR',
  5: '5BR+',
};

/**
 * Region to Y-axis position mapping.
 * CCR at top (0), OCR at bottom (2).
 */
const REGION_TO_Y = {
  CCR: 0,
  RCR: 1,
  OCR: 2,
};

/**
 * Calculate bubble radius based on transaction count.
 * Scales volume to a reasonable bubble size range (8-35px).
 *
 * @param {number} count - Transaction count
 * @param {number} maxCount - Maximum count in dataset
 * @param {number} minCount - Minimum count in dataset
 * @returns {number} Bubble radius in pixels
 */
const scaleBubbleRadius = (count, maxCount, minCount) => {
  const MIN_RADIUS = 8;
  const MAX_RADIUS = 35;

  if (maxCount === minCount) return (MIN_RADIUS + MAX_RADIUS) / 2;

  const normalized = (count - minCount) / (maxCount - minCount);
  return MIN_RADIUS + normalized * (MAX_RADIUS - MIN_RADIUS);
};

/**
 * Transform raw beads chart data from /api/dashboard?panels=beads_chart
 *
 * Converts API response into Chart.js bubble chart format with datasets
 * grouped by bedroom type.
 *
 * @param {Array} rawData - Raw beads_chart array from API:
 *   [{ region, bedroom, volumeWeightedMedian, transactionCount, totalValue }, ...]
 * @returns {Object} Transformed data:
 *   {
 *     datasets: [
 *       {
 *         label: '2BR',
 *         data: [{ x: priceInMillions, y: regionIndex, r: bubbleRadius, _raw: {...} }],
 *         backgroundColor: color,
 *         borderColor: borderColor,
 *         borderWidth: 1
 *       },
 *       ...
 *     ],
 *     stats: {
 *       priceRange: { min, max },
 *       volumeRange: { min, max },
 *       totalTransactions: number
 *     }
 *   }
 */
export const transformBeadsChartSeries = (rawData) => {
  // Handle null/undefined/empty input
  if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
    if (isDev) console.warn('[transformBeadsChartSeries] Empty or invalid input');
    return {
      datasets: [],
      stats: {
        priceRange: { min: 0, max: 0 },
        volumeRange: { min: 0, max: 0 },
        totalTransactions: 0,
      },
    };
  }

  // Calculate volume range for bubble scaling
  const volumes = rawData.map((d) => d.transactionCount || 0);
  const maxVolume = Math.max(...volumes, 1);
  const minVolume = Math.min(...volumes, 1);

  // Calculate price range for axis scaling
  const prices = rawData.map((d) => d.volumeWeightedMedian || 0);
  const maxPrice = Math.max(...prices, 0);
  const minPrice = Math.min(...prices, 0);

  // Group data by bedroom type
  const byBedroom = {};
  rawData.forEach((item) => {
    const br = item.bedroom;
    if (!byBedroom[br]) byBedroom[br] = [];

    byBedroom[br].push({
      // Chart.js bubble point structure
      x: item.volumeWeightedMedian / 1000000, // Convert to millions
      y: REGION_TO_Y[item.region] ?? 2, // Default to OCR position if unknown
      r: scaleBubbleRadius(item.transactionCount, maxVolume, minVolume),
      // Keep raw data for tooltips
      _raw: {
        region: item.region,
        bedroom: item.bedroom,
        volumeWeightedMedian: item.volumeWeightedMedian,
        transactionCount: item.transactionCount,
        totalValue: item.totalValue,
      },
    });
  });

  // Build datasets array sorted by bedroom number
  const bedroomKeys = Object.keys(byBedroom)
    .map(Number)
    .sort((a, b) => a - b);

  const datasets = bedroomKeys.map((br) => ({
    label: BEDROOM_LABELS[br] || `${br}BR`,
    data: byBedroom[br],
    backgroundColor: BEDROOM_COLORS[br] || BEDROOM_COLORS[5],
    borderColor: 'rgba(33, 52, 72, 0.6)', // Navy border
    borderWidth: 1.5,
    hoverBackgroundColor: BEDROOM_COLORS[br]
      ? BEDROOM_COLORS[br].replace('0.85', '1')
      : BEDROOM_COLORS[5].replace('0.85', '1'),
    hoverBorderWidth: 2,
  }));

  // Calculate total transactions
  const totalTransactions = rawData.reduce((sum, d) => sum + (d.transactionCount || 0), 0);

  return {
    datasets,
    stats: {
      priceRange: { min: minPrice, max: maxPrice },
      volumeRange: { min: minVolume, max: maxVolume },
      totalTransactions,
    },
  };
};

/**
 * Filter datasets to show only specified bedroom types.
 *
 * @param {Object} transformedData - Output from transformBeadsChartSeries
 * @param {Array<number>} bedroomsToShow - Array of bedroom numbers to show (e.g., [2, 3, 4])
 * @returns {Object} Filtered data with same structure
 */
export const filterBedroomDatasets = (transformedData, bedroomsToShow) => {
  if (!transformedData || !transformedData.datasets) {
    return transformedData;
  }

  const bedroomLabels = bedroomsToShow.map((br) => BEDROOM_LABELS[br] || `${br}BR`);

  return {
    ...transformedData,
    datasets: transformedData.datasets.filter((ds) => bedroomLabels.includes(ds.label)),
  };
};
