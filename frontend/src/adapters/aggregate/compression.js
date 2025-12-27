/**
 * Compression Series Transformations
 *
 * Analyzes price spreads between regions (CCR/RCR/OCR).
 * Used by PriceCompressionChart for market compression analysis.
 */

import {
  getPeriod,
  getPeriodGrain,
  getAggField,
  AggField,
} from '../../schemas/apiContract';
import { sortByPeriod } from './sorting';
import { isDev } from './validation';

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
 * IMPORTANT: min/max should be calculated from FULL HISTORICAL data (baseline),
 * not from the filtered view. This ensures scores are comparable across time filters.
 *
 * @param {Array} data - Output from transformCompressionSeries (filtered view)
 * @param {Object} historicalBaseline - Optional { min, max } from full historical data
 * @returns {{ score: number, label: string, current: number, min: number, max: number }}
 */
export const calculateCompressionScore = (data, historicalBaseline = null) => {
  if (!Array.isArray(data) || data.length < 2) {
    return { score: 50, label: 'moderate', current: null, min: null, max: null };
  }

  const spreads = data.map(d => d.combinedSpread).filter(v => v != null && v > 0);
  if (spreads.length < 2) return { score: 50, label: 'moderate', current: null, min: null, max: null };

  // Current spread from filtered data (latest period)
  const current = spreads[spreads.length - 1];

  // Use historical baseline if provided, otherwise fall back to filtered data
  // WARNING: Using filtered data for min/max makes scores relative to themselves
  const minSpread = historicalBaseline?.min ?? Math.min(...spreads);
  const maxSpread = historicalBaseline?.max ?? Math.max(...spreads);

  if (maxSpread === minSpread) return { score: 50, label: 'moderate', current, min: minSpread, max: maxSpread };

  // Score: 100 = at min (tight), 0 = at max (wide)
  const score = Math.round(100 - ((current - minSpread) / (maxSpread - minSpread)) * 100);
  const clampedScore = Math.max(0, Math.min(100, score));

  let label = 'moderate';
  if (clampedScore >= 70) label = 'tight';
  else if (clampedScore <= 30) label = 'wide';

  return { score: clampedScore, label, current, min: minSpread, max: maxSpread };
};

/**
 * Calculate historical baseline (min/max) from full dataset.
 * This should be called once with unfiltered data and cached.
 *
 * @param {Array} data - Output from transformCompressionSeries (FULL historical data)
 * @returns {{ min: number, max: number }}
 */
export const calculateHistoricalBaseline = (data) => {
  if (!Array.isArray(data) || data.length < 2) {
    return { min: 0, max: 1000 }; // Fallback defaults
  }

  const spreads = data.map(d => d.combinedSpread).filter(v => v != null && v > 0);
  if (spreads.length < 2) return { min: 0, max: 1000 };

  return {
    min: Math.min(...spreads),
    max: Math.max(...spreads),
  };
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
