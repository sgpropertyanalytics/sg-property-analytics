/**
 * Time Series Transformations
 *
 * Transforms raw aggregate data into time series formats.
 * - transformTimeSeries: Sale type breakdown (New Sale vs Resale)
 * - transformTimeSeriesByRegion: Region breakdown (CCR/RCR/OCR)
 */

import {
  getPeriod,
  getPeriodGrain,
  getAggField,
  AggField,
  isSaleType,
} from '../../schemas/apiContract';
import { sortByPeriod } from './sorting';
import { isDev } from './validation';

/**
 * Transform raw aggregate data into time series format with sale type breakdown.
 *
 * This is the standard transformation for charts like TimeTrendChart.
 *
 * DESIGN: This transform is grain-agnostic. It trusts the data's own periodGrain
 * rather than an expected grain from the UI. This is the correct pattern when
 * using keepPreviousData, where stale data (old grain) may be displayed while
 * fresh data (new grain) loads.
 *
 * @param {Array} rawData - Raw data from /api/aggregate
 * @returns {Array} Transformed and sorted data with structure:
 *   { period, periodGrain, newSaleCount, resaleCount, newSaleValue, resaleValue, totalCount, totalValue }
 */
export const transformTimeSeries = (rawData) => {
  if (!Array.isArray(rawData)) {
    if (isDev) console.warn('[transformTimeSeries] Invalid input - expected array', rawData);
    return [];
  }

  const groupedByTime = {};

  rawData.forEach((row) => {
    const period = getPeriod(row);

    // Skip rows with missing period
    if (period === null) {
      if (isDev) console.warn('[transformTimeSeries] Skipping row with null period:', row);
      return;
    }

    // Initialize group if new
    if (!groupedByTime[period]) {
      groupedByTime[period] = {
        period,
        periodGrain: getPeriodGrain(row),  // Trust data's own grain
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
 * Used for charts that break down by CCR/RCR/OCR region.
 *
 * DESIGN: Grain-agnostic - trusts data's own periodGrain.
 *
 * @param {Array} rawData - Raw data from /api/aggregate
 * @returns {Array} Transformed data with structure:
 *   { period, periodGrain, ccrMedianPsf, rcrMedianPsf, ocrMedianPsf, ccrCount, rcrCount, ocrCount }
 */
export const transformTimeSeriesByRegion = (rawData) => {
  if (!Array.isArray(rawData)) return [];

  const groupedByTime = {};

  rawData.forEach((row) => {
    const period = getPeriod(row);
    if (period === null) return;

    const region = getAggField(row, AggField.REGION);
    const medianPsf = getAggField(row, AggField.MEDIAN_PSF) || 0;
    const count = getAggField(row, AggField.COUNT) || 0;

    if (!groupedByTime[period]) {
      groupedByTime[period] = {
        period,
        periodGrain: getPeriodGrain(row),  // Trust data's own grain
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
