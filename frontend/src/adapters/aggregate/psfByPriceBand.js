/**
 * PSF by Price Band Transformations
 *
 * Handles grouped floating bar chart data from /api/psf-by-price-band.
 * - transformPsfByPriceBand: Raw API response to structured Map
 * - toPsfByPriceBandChartData: Structured data to Chart.js format
 */

import { assertKnownVersion, isDev, isTest } from './validation';

// Define price band order for consistent display
const PRICE_BAND_ORDER = [
  '$0.5M-1M',
  '$1M-1.5M',
  '$1.5M-2M',
  '$2M-2.5M',
  '$2.5M-3M',
  '$3M-3.5M',
  '$3.5M-4M',
  '$4M-5M',
  '$5M+',
];

// Define bedroom order
const BEDROOM_ORDER = ['1BR', '2BR', '3BR', '4BR', '5BR+'];

/**
 * Transform raw PSF by price band data for the grouped floating bar chart.
 *
 * The backend returns data grouped by price band and bedroom type.
 * This adapter:
 * - Validates response structure and API version
 * - Groups data by price band for Chart.js consumption
 * - Handles suppressed cells (K-anonymity)
 *
 * @param {Object} rawResponse - Raw API response from /api/psf-by-price-band
 * @returns {Object} Transformed data:
 *   {
 *     byPriceBand: Map<priceBand, Map<bedroom, { p25, p50, p75, suppressed }>>,
 *     priceBands: string[],  // Ordered list of price bands
 *     bedrooms: string[],    // Ordered list of bedrooms with data
 *     meta: Object,          // API metadata
 *     hasData: boolean
 *   }
 */
export const transformPsfByPriceBand = (rawResponse) => {
  // Handle null/undefined input
  if (!rawResponse) {
    if (isDev) console.warn('[transformPsfByPriceBand] Null input');
    return { byPriceBand: new Map(), priceBands: [], bedrooms: [], meta: {}, hasData: false };
  }

  // Validate API response structure
  const data = rawResponse.data;
  const meta = rawResponse.meta || {};

  // Version gate check
  if (isDev || isTest) {
    assertKnownVersion(rawResponse, 'psf-by-price-band');
  }

  if (!Array.isArray(data)) {
    if (isDev) console.warn('[transformPsfByPriceBand] Invalid response - data is not an array', rawResponse);
    return { byPriceBand: new Map(), priceBands: [], bedrooms: [], meta, hasData: false };
  }

  // Group data by price band, then by bedroom
  const byPriceBand = new Map();
  const observedPriceBands = new Set();
  const observedBedrooms = new Set();

  data.forEach((row) => {
    // Support both v1 (snake_case) and v2 (camelCase) field names
    const priceBand = row.priceBand || row.price_band;
    const bedroom = row.bedroom;
    const bedroomCount = row.bedroomCount ?? row.bedroom_count;
    const p25 = row.p25;
    const p50 = row.p50;
    const p75 = row.p75;
    const observationCount = row.observationCount ?? row.observation_count ?? 0;
    const suppressed = row.suppressed ?? false;

    if (!priceBand || !bedroom) {
      if (isDev) console.warn('[transformPsfByPriceBand] Skipping row with missing priceBand or bedroom:', row);
      return;
    }

    // Track observed values
    observedPriceBands.add(priceBand);
    observedBedrooms.add(bedroom);

    // Initialize price band map if needed
    if (!byPriceBand.has(priceBand)) {
      byPriceBand.set(priceBand, new Map());
    }

    // Store bedroom data with age and region breakdown
    byPriceBand.get(priceBand).set(bedroom, {
      p25,
      p50,
      p75,
      bedroomCount,
      observationCount,
      suppressed,
      priceBandMin: row.priceBandMin ?? row.price_band_min,
      priceBandMax: row.priceBandMax ?? row.price_band_max,
      // New fields: average property age and region breakdown
      avgAge: row.avgAge ?? row.avg_age ?? null,
      ccrCount: row.ccrCount ?? row.ccr_count ?? 0,
      rcrCount: row.rcrCount ?? row.rcr_count ?? 0,
      ocrCount: row.ocrCount ?? row.ocr_count ?? 0,
    });
  });

  // Sort price bands and bedrooms according to defined order
  const priceBands = PRICE_BAND_ORDER.filter((pb) => observedPriceBands.has(pb));
  const bedrooms = BEDROOM_ORDER.filter((br) => observedBedrooms.has(br));

  return {
    byPriceBand,
    priceBands,
    bedrooms,
    meta,
    hasData: data.length > 0,
  };
};

/**
 * Convert transformed PSF by price band data to Chart.js dataset format.
 *
 * Creates floating bar datasets where each bar represents P25-P75 range,
 * with P50 marked separately.
 *
 * @param {Object} transformedData - Output from transformPsfByPriceBand
 * @param {Object} bedroomColors - Map of bedroom type to { bg, border } colors
 * @returns {Object} Chart.js compatible data:
 *   {
 *     labels: string[],  // Price band labels for x-axis
 *     datasets: Array<ChartJS dataset>,  // Floating bar datasets
 *   }
 */
export const toPsfByPriceBandChartData = (transformedData, bedroomColors = {}) => {
  if (!transformedData?.hasData) {
    return { labels: [], datasets: [] };
  }

  const { byPriceBand, priceBands, bedrooms } = transformedData;

  // Create one dataset per bedroom type
  const datasets = bedrooms.map((bedroom) => {
    const colors = bedroomColors[bedroom] || {
      bg: 'rgba(128, 128, 128, 0.7)',
      border: 'rgba(128, 128, 128, 1)',
    };

    // Build data array: one entry per price band
    // For floating bars, data is [low, high] for each bar
    const data = priceBands.map((priceBand) => {
      const bedroomData = byPriceBand.get(priceBand)?.get(bedroom);

      if (!bedroomData || bedroomData.suppressed || bedroomData.p25 == null || bedroomData.p75 == null) {
        // Suppressed or missing - return null
        return null;
      }

      // Return [p25, p75] for floating bar
      return [bedroomData.p25, bedroomData.p75];
    });

    // Build median markers for P50 (separate dataset or annotation)
    const p50Values = priceBands.map((priceBand) => {
      const bedroomData = byPriceBand.get(priceBand)?.get(bedroom);
      if (!bedroomData || bedroomData.suppressed || bedroomData.p50 == null) {
        return null;
      }
      return bedroomData.p50;
    });

    return {
      label: bedroom,
      data,
      p50Values, // Custom property for P50 markers
      backgroundColor: colors.bg,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 2,
      barPercentage: 0.8,
      categoryPercentage: 0.9,
    };
  });

  return {
    labels: priceBands,
    datasets,
  };
};
