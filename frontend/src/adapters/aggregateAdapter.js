/**
 * Aggregate Data Adapter - Centralized data transformation for charts
 *
 * This adapter provides:
 * - Schema validation (dev-only warnings)
 * - Period normalization and sorting
 * - Common transformation patterns for time-series charts
 * - Type-safe field access
 *
 * RULE: "Charts must only consume adapter output"
 *
 * Usage:
 * ```jsx
 * import { transformTimeSeries, sortByPeriod } from '../adapters/aggregateAdapter';
 *
 * const { data, loading, error } = useAbortableQuery(async (signal) => {
 *   const response = await getAggregate(params, { signal });
 *   return transformTimeSeries(response.data.data, 'quarter');
 * }, [filterKey]);
 * ```
 */

import {
  getPeriod,
  getPeriodGrain,
  hasValidPeriod,
  getAggField,
  AggField,
  isSaleType,
  API_CONTRACT_VERSION,
} from '../schemas/apiContract';

// =============================================================================
// SCHEMA VALIDATION (DEV-ONLY)
// =============================================================================

const isDev = process.env.NODE_ENV === 'development';

// Known API contract versions - add new versions here as they're released
const KNOWN_VERSIONS = ['v1', 'v2'];

/**
 * Version gate assertion - warns if API returns unknown/missing version.
 * Prevents "silent shape drift" by catching contract mismatches early.
 *
 * @param {Object} response - API response object
 * @param {string} endpoint - Endpoint name for error context
 */
export const assertKnownVersion = (response, endpoint = 'unknown') => {
  if (!isDev) return; // Only run in development

  const version = response?.meta?.apiContractVersion || response?.meta?.schemaVersion;

  if (!version) {
    console.warn(
      `[API Version Gate] Missing apiContractVersion at ${endpoint}. ` +
      `Expected one of: ${KNOWN_VERSIONS.join(', ')}. ` +
      `Sample row keys: ${response?.data?.[0] ? Object.keys(response.data[0]).join(', ') : 'no data'}`
    );
    return;
  }

  if (!KNOWN_VERSIONS.includes(version)) {
    console.warn(
      `[API Version Gate] Unknown version "${version}" at ${endpoint}. ` +
      `Known versions: ${KNOWN_VERSIONS.join(', ')}. ` +
      `This may indicate schema drift - update KNOWN_VERSIONS if intentional. ` +
      `Sample row keys: ${response?.data?.[0] ? Object.keys(response.data[0]).join(', ') : 'no data'}`
    );
  }
};

/**
 * Validate that a row has required fields.
 * In dev mode, logs warnings for missing fields.
 *
 * @param {Object} row - Data row to validate
 * @param {string[]} requiredFields - Array of required field names
 * @param {string} context - Context string for error messages
 * @returns {boolean} True if valid
 */
export const validateRow = (row, requiredFields, context = 'row') => {
  if (!row) {
    if (isDev) console.warn(`[${context}] Null or undefined row`);
    return false;
  }

  const missing = requiredFields.filter((field) => {
    const value = getAggField(row, field);
    return value === undefined || value === null;
  });

  if (missing.length > 0 && isDev) {
    console.warn(`[${context}] Missing fields: ${missing.join(', ')}`, row);
  }

  return missing.length === 0;
};

/**
 * Validate API response structure.
 * In dev mode, logs warnings for invalid structure and checks version.
 *
 * @param {Object} response - API response
 * @param {string} context - Context string for error messages (also used as endpoint name for version gate)
 * @returns {boolean} True if valid
 */
export const validateResponse = (response, context = 'API') => {
  if (!response) {
    if (isDev) console.warn(`[${context}] Null response`);
    return false;
  }

  if (!Array.isArray(response.data)) {
    if (isDev) console.warn(`[${context}] Invalid response structure - expected data array`, response);
    return false;
  }

  // Version gate: Check API contract version
  assertKnownVersion(response, context);

  return true;
};

// =============================================================================
// PERIOD SORTING
// =============================================================================

/**
 * Compare two period values for sorting.
 * Handles year (number), quarter (YYYY-QN), and month (YYYY-MM) formats.
 *
 * @param {string|number} a - First period
 * @param {string|number} b - Second period
 * @returns {number} Comparison result (-1, 0, 1)
 */
export const comparePeriods = (a, b) => {
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;

  // Handle numeric years
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  // Convert to strings for comparison
  const strA = String(a);
  const strB = String(b);

  // Quarter format: "2024-Q4" → compare year first, then quarter
  const quarterMatch = /^(\d{4})-Q(\d)$/;
  const matchA = strA.match(quarterMatch);
  const matchB = strB.match(quarterMatch);

  if (matchA && matchB) {
    const yearDiff = parseInt(matchA[1]) - parseInt(matchB[1]);
    if (yearDiff !== 0) return yearDiff;
    return parseInt(matchA[2]) - parseInt(matchB[2]);
  }

  // Month format: "2024-12" → natural string comparison works
  // Year format: "2024" → natural string comparison works
  return strA.localeCompare(strB);
};

/**
 * Sort data array by period in ascending order.
 *
 * @param {Array} data - Array of objects with period field
 * @returns {Array} Sorted array (new array, does not mutate input)
 */
export const sortByPeriod = (data) => {
  if (!Array.isArray(data)) return [];

  return [...data].sort((a, b) => {
    const periodA = getPeriod(a);
    const periodB = getPeriod(b);
    return comparePeriods(periodA, periodB);
  });
};

// =============================================================================
// TIME SERIES TRANSFORMATIONS
// =============================================================================

/**
 * Transform raw aggregate data into time series format with sale type breakdown.
 *
 * This is the standard transformation for charts like TimeTrendChart.
 *
 * @param {Array} rawData - Raw data from /api/aggregate
 * @param {string} expectedGrain - Expected time grain ('year', 'quarter', 'month')
 * @returns {Array} Transformed and sorted data with structure:
 *   { period, newSaleCount, resaleCount, newSaleValue, resaleValue, totalCount, totalValue }
 */
export const transformTimeSeries = (rawData, expectedGrain = null) => {
  if (!Array.isArray(rawData)) {
    if (isDev) console.warn('[transformTimeSeries] Invalid input - expected array', rawData);
    return [];
  }

  const groupedByTime = {};

  rawData.forEach((row) => {
    const period = getPeriod(row, expectedGrain);

    // Skip rows with missing period
    if (period === null) {
      if (isDev) console.warn('[transformTimeSeries] Skipping row with null period:', row);
      return;
    }

    // Initialize group if new
    if (!groupedByTime[period]) {
      groupedByTime[period] = {
        period,
        periodGrain: getPeriodGrain(row) || expectedGrain,
        newSaleCount: 0,
        resaleCount: 0,
        newSaleValue: 0,
        resaleValue: 0,
        totalCount: 0,
        totalValue: 0,
      };
    }

    // Extract metrics using schema helpers
    const saleType = getAggField(row, AggField.SALE_TYPE);
    const count = getAggField(row, AggField.COUNT) || 0;
    const totalValue = getAggField(row, AggField.TOTAL_VALUE) || 0;

    // Accumulate by sale type
    if (isSaleType.newSale(saleType)) {
      groupedByTime[period].newSaleCount += count;
      groupedByTime[period].newSaleValue += totalValue;
    } else {
      groupedByTime[period].resaleCount += count;
      groupedByTime[period].resaleValue += totalValue;
    }
    groupedByTime[period].totalCount += count;
    groupedByTime[period].totalValue += totalValue;
  });

  // Convert to sorted array
  return sortByPeriod(Object.values(groupedByTime));
};

/**
 * Transform raw aggregate data into time series with region breakdown.
 *
 * Used for charts like MedianPsfTrendChart that break down by CCR/RCR/OCR.
 *
 * @param {Array} rawData - Raw data from /api/aggregate
 * @param {string} expectedGrain - Expected time grain
 * @returns {Array} Transformed data with structure:
 *   { period, ccrMedianPsf, rcrMedianPsf, ocrMedianPsf, ccrCount, rcrCount, ocrCount }
 */
export const transformTimeSeriesByRegion = (rawData, expectedGrain = null) => {
  if (!Array.isArray(rawData)) return [];

  const groupedByTime = {};

  rawData.forEach((row) => {
    const period = getPeriod(row, expectedGrain);
    if (period === null) return;

    const region = getAggField(row, AggField.REGION);
    const medianPsf = getAggField(row, AggField.MEDIAN_PSF) || 0;
    const count = getAggField(row, AggField.COUNT) || 0;

    if (!groupedByTime[period]) {
      groupedByTime[period] = {
        period,
        periodGrain: getPeriodGrain(row) || expectedGrain,
        ccrMedianPsf: null,
        rcrMedianPsf: null,
        ocrMedianPsf: null,
        ccrCount: 0,
        rcrCount: 0,
        ocrCount: 0,
      };
    }

    // Normalize region to lowercase for consistent matching
    const regionLower = (region || '').toLowerCase();

    if (regionLower === 'ccr') {
      groupedByTime[period].ccrMedianPsf = medianPsf;
      groupedByTime[period].ccrCount = count;
    } else if (regionLower === 'rcr') {
      groupedByTime[period].rcrMedianPsf = medianPsf;
      groupedByTime[period].rcrCount = count;
    } else if (regionLower === 'ocr') {
      groupedByTime[period].ocrMedianPsf = medianPsf;
      groupedByTime[period].ocrCount = count;
    }
  });

  return sortByPeriod(Object.values(groupedByTime));
};

// =============================================================================
// COMPRESSION SERIES TRANSFORMATION
// =============================================================================

/**
 * Transform raw aggregate data into compression/spread analysis format.
 *
 * Used by PriceCompressionChart to analyze price spreads between regions.
 *
 * @param {Array} rawData - Raw data from /api/aggregate with region breakdown
 * @param {string} expectedGrain - Expected time grain
 * @returns {Array} Transformed data with structure:
 *   { period, ccr, rcr, ocr, ccrRcrSpread, rcrOcrSpread, combinedSpread, ccrRcrChange, rcrOcrChange, counts }
 */
export const transformCompressionSeries = (rawData, expectedGrain = null) => {
  if (!Array.isArray(rawData)) {
    if (isDev) console.warn('[transformCompressionSeries] Invalid input', rawData);
    return [];
  }

  // Group by time period
  const grouped = {};

  rawData.forEach((row) => {
    const period = getPeriod(row, expectedGrain);
    if (period === null) return;

    if (!grouped[period]) {
      grouped[period] = {
        period,
        periodGrain: getPeriodGrain(row) || expectedGrain,
        CCR: null,
        RCR: null,
        OCR: null,
        counts: {},
      };
    }

    const region = getAggField(row, AggField.REGION);
    const regionUpper = (region || '').toUpperCase();
    const medianPsf = getAggField(row, AggField.MEDIAN_PSF);
    const count = getAggField(row, AggField.COUNT) || 0;

    if (regionUpper) {
      grouped[period][regionUpper] = medianPsf;
      grouped[period].counts[regionUpper] = count;
    }
  });

  // Sort chronologically
  const sorted = sortByPeriod(Object.values(grouped));

  // Calculate spreads and changes
  return sorted.map((values, idx) => {
    const ccrRcrSpread = values.CCR && values.RCR ? Math.round(values.CCR - values.RCR) : null;
    const rcrOcrSpread = values.RCR && values.OCR ? Math.round(values.RCR - values.OCR) : null;
    const combinedSpread = (ccrRcrSpread || 0) + (rcrOcrSpread || 0);

    // Calculate period-over-period change
    let ccrRcrChange = 0;
    let rcrOcrChange = 0;

    if (idx > 0) {
      const prev = sorted[idx - 1];
      const prevCcrRcr = prev.CCR && prev.RCR ? prev.CCR - prev.RCR : null;
      const prevRcrOcr = prev.RCR && prev.OCR ? prev.RCR - prev.OCR : null;

      if (ccrRcrSpread !== null && prevCcrRcr !== null) {
        ccrRcrChange = Math.round(ccrRcrSpread - prevCcrRcr);
      }
      if (rcrOcrSpread !== null && prevRcrOcr !== null) {
        rcrOcrChange = Math.round(rcrOcrSpread - prevRcrOcr);
      }
    }

    return {
      period: values.period,
      periodGrain: values.periodGrain,
      ccr: values.CCR,
      rcr: values.RCR,
      ocr: values.OCR,
      ccrRcrSpread,
      rcrOcrSpread,
      combinedSpread,
      ccrRcrChange,
      rcrOcrChange,
      counts: values.counts,
    };
  });
};

/**
 * Calculate Compression Score (0-100) from compression series data.
 * 100 = spreads at historical minimum (tight)
 * 0 = spreads at historical maximum (wide)
 *
 * @param {Array} data - Output from transformCompressionSeries
 * @returns {{ score: number, label: string }}
 */
export const calculateCompressionScore = (data) => {
  if (!Array.isArray(data) || data.length < 2) {
    return { score: 50, label: 'moderate' };
  }

  const spreads = data.map(d => d.combinedSpread).filter(v => v != null && v > 0);
  if (spreads.length < 2) return { score: 50, label: 'moderate' };

  const current = spreads[spreads.length - 1];
  const minSpread = Math.min(...spreads);
  const maxSpread = Math.max(...spreads);

  if (maxSpread === minSpread) return { score: 50, label: 'moderate' };

  // Score: 100 = at min (tight), 0 = at max (wide)
  const score = Math.round(100 - ((current - minSpread) / (maxSpread - minSpread)) * 100);
  const clampedScore = Math.max(0, Math.min(100, score));

  let label = 'moderate';
  if (clampedScore >= 70) label = 'tight';
  else if (clampedScore <= 30) label = 'wide';

  return { score: clampedScore, label };
};

/**
 * Calculate average spreads from compression series data.
 *
 * @param {Array} data - Output from transformCompressionSeries
 * @returns {{ ccrRcr: number|null, rcrOcr: number|null }}
 */
export const calculateAverageSpreads = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    return { ccrRcr: null, rcrOcr: null };
  }

  const ccrRcrSpreads = data.map(d => d.ccrRcrSpread).filter(v => v != null);
  const rcrOcrSpreads = data.map(d => d.rcrOcrSpread).filter(v => v != null);

  const avgCcrRcr = ccrRcrSpreads.length > 0
    ? Math.round(ccrRcrSpreads.reduce((a, b) => a + b, 0) / ccrRcrSpreads.length)
    : null;

  const avgRcrOcr = rcrOcrSpreads.length > 0
    ? Math.round(rcrOcrSpreads.reduce((a, b) => a + b, 0) / rcrOcrSpreads.length)
    : null;

  return { ccrRcr: avgCcrRcr, rcrOcr: avgRcrOcr };
};

/**
 * Detect market signal anomalies (inversions) from compression data.
 * - CCR Discount: When CCR < RCR (negative spread) - opportunity signal
 * - OCR Overheated: When OCR > RCR (negative spread) - risk signal
 *
 * @param {Array} data - Output from transformCompressionSeries
 * @returns {{ ccrDiscount: boolean, ocrOverheated: boolean }}
 */
export const detectMarketSignals = (data) => {
  if (!Array.isArray(data) || data.length === 0) {
    return { ccrDiscount: false, ocrOverheated: false };
  }

  const latest = data[data.length - 1];
  return {
    ccrDiscount: latest.ccrRcrSpread !== null && latest.ccrRcrSpread < 0,
    ocrOverheated: latest.rcrOcrSpread !== null && latest.rcrOcrSpread < 0,
  };
};

/**
 * Detect historical inversion zones for chart background annotations.
 *
 * @param {Array} data - Output from transformCompressionSeries
 * @returns {{ ccrDiscountZones: Array, ocrOverheatedZones: Array }}
 */
export const detectInversionZones = (data) => {
  if (!Array.isArray(data)) {
    return { ccrDiscountZones: [], ocrOverheatedZones: [] };
  }

  const ccrDiscountZones = [];
  const ocrOverheatedZones = [];

  let ccrStart = null;
  let ocrStart = null;

  data.forEach((d, idx) => {
    // CCR < RCR detection
    if (d.ccrRcrSpread !== null && d.ccrRcrSpread < 0) {
      if (ccrStart === null) ccrStart = idx;
    } else {
      if (ccrStart !== null) {
        ccrDiscountZones.push({ start: ccrStart, end: idx - 1 });
        ccrStart = null;
      }
    }

    // OCR > RCR detection
    if (d.rcrOcrSpread !== null && d.rcrOcrSpread < 0) {
      if (ocrStart === null) ocrStart = idx;
    } else {
      if (ocrStart !== null) {
        ocrOverheatedZones.push({ start: ocrStart, end: idx - 1 });
        ocrStart = null;
      }
    }
  });

  // Close any open zones at the end
  if (ccrStart !== null) {
    ccrDiscountZones.push({ start: ccrStart, end: data.length - 1 });
  }
  if (ocrStart !== null) {
    ocrOverheatedZones.push({ start: ocrStart, end: data.length - 1 });
  }

  return { ccrDiscountZones, ocrOverheatedZones };
};

// =============================================================================
// OBSERVABILITY HELPERS
// =============================================================================

/**
 * Log debug information about a data fetch.
 * Only logs in development mode.
 *
 * @param {string} chartName - Name of the chart
 * @param {Object} options - Debug options
 */
export const logFetchDebug = (chartName, { endpoint, timeGrain, response, rowCount }) => {
  if (!isDev) return;

  console.group(`[${chartName}] Data Fetch`);
  console.log('Endpoint:', endpoint);
  console.log('Time Grain:', timeGrain);
  if (response?.meta) {
    console.log('API Contract Version:', response.meta.apiContractVersion || 'v1');
  }
  console.log('Row Count:', rowCount);
  if (rowCount > 0 && response?.data?.[0]) {
    console.log('First Row Keys:', Object.keys(response.data[0]));
  }
  console.groupEnd();
};

/**
 * Log transform error with context.
 *
 * @param {string} chartName - Name of the chart
 * @param {string} step - Transform step that failed
 * @param {Error} error - The error
 * @param {Object} context - Additional context
 */
export const logTransformError = (chartName, step, error, context = {}) => {
  console.error(`[${chartName}] Transform failed at: ${step}`, {
    error: error.message,
    ...context,
  });
};

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Version gate
  assertKnownVersion,
  // Validation
  validateRow,
  validateResponse,
  // Sorting
  comparePeriods,
  sortByPeriod,
  // Transformations
  transformTimeSeries,
  transformTimeSeriesByRegion,
  transformCompressionSeries,
  // Compression analysis
  calculateCompressionScore,
  calculateAverageSpreads,
  detectMarketSignals,
  detectInversionZones,
  // Observability
  logFetchDebug,
  logTransformError,
};
