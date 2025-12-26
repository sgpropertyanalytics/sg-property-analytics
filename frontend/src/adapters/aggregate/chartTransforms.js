/**
 * Chart-Specific Transformations
 *
 * Transformations for specific chart types:
 * - transformNewVsResaleSeries: New vs Resale premium analysis
 * - transformGrowthDumbbellSeries: District growth comparison
 */

import { getAggField, AggField } from '../../schemas/apiContract';
import { isDev } from './validation';

/**
 * Transform raw new vs resale data from /api/new-vs-resale endpoint.
 *
 * This endpoint returns pre-processed data from the backend.
 * Adapter normalizes structure and provides defaults for missing fields.
 *
 * @param {Object} rawData - Raw response data { chartData, summary }
 * @returns {Object} Normalized data:
 *   {
 *     chartData: [{ period, newLaunchPrice, resalePrice, newLaunchCount, resaleCount, premiumPct }],
 *     summary: { currentPremium, avgPremium10Y, premiumTrend },
 *     hasData: boolean
 *   }
 */
export const transformNewVsResaleSeries = (rawData) => {
  // Handle null/undefined input
  if (!rawData) {
    if (isDev) console.warn('[transformNewVsResaleSeries] Null input');
    return { chartData: [], summary: {}, hasData: false };
  }

  // Extract and normalize chartData
  const chartData = Array.isArray(rawData.chartData)
    ? rawData.chartData.map((row) => ({
        period: row.period || null,
        newLaunchPrice: row.newLaunchPrice ?? null,
        resalePrice: row.resalePrice ?? null,
        newLaunchCount: Number(row.newLaunchCount) || 0,
        resaleCount: Number(row.resaleCount) || 0,
        premiumPct: row.premiumPct ?? null,
      }))
    : [];

  // Extract and normalize summary with defaults
  const rawSummary = rawData.summary || {};
  const summary = {
    currentPremium: rawSummary.currentPremium ?? null,
    avgPremium10Y: rawSummary.avgPremium10Y ?? null,
    premiumTrend: rawSummary.premiumTrend || null,
  };

  return {
    chartData,
    summary,
    hasData: chartData.length > 0,
  };
};

/**
 * Transform raw aggregate data into growth dumbbell chart format.
 *
 * Groups data by district, calculates first/last quarter PSF values,
 * and computes growth percentage for each district.
 *
 * @param {Array} rawData - Raw data from /api/aggregate with quarter,district grouping
 * @param {Object} options - Configuration options
 * @param {Array} options.districts - List of valid district codes (e.g., ['D01', 'D02', ...])
 * @returns {Object} Transformed data:
 *   {
 *     chartData: [{ district, startPsf, endPsf, startQuarter, endQuarter, growthPercent }],
 *     startQuarter: string,  // Global earliest quarter
 *     endQuarter: string     // Global latest quarter
 *   }
 */
export const transformGrowthDumbbellSeries = (rawData, options = {}) => {
  const { districts = [] } = options;

  // Handle null/undefined input
  if (!Array.isArray(rawData)) {
    if (isDev) console.warn('[transformGrowthDumbbellSeries] Invalid input', rawData);
    return { chartData: [], startQuarter: '', endQuarter: '' };
  }

  if (rawData.length === 0) {
    return { chartData: [], startQuarter: '', endQuarter: '' };
  }

  // Initialize district groupings
  const districtData = {};
  districts.forEach(d => {
    districtData[d] = [];
  });

  // Group data by district
  rawData.forEach(row => {
    // Support both snake_case (v1) and camelCase (v2) for district
    const district = row.district;
    const quarter = row.quarter;
    const medianPsf = getAggField(row, AggField.MEDIAN_PSF) || getAggField(row, AggField.AVG_PSF) || 0;

    // Only include if district is in our list (or if no list provided)
    if (districts.length === 0 || districtData[district] !== undefined) {
      if (!districtData[district]) {
        districtData[district] = [];
      }
      districtData[district].push({
        quarter,
        medianPsf,
      });
    }
  });

  // Calculate start, end, growth for each district
  const chartData = [];
  let globalStartQuarter = '';
  let globalEndQuarter = '';

  Object.entries(districtData).forEach(([district, data]) => {
    if (data.length === 0) return;

    // Sort by quarter chronologically
    data.sort((a, b) => (a.quarter || '').localeCompare(b.quarter || ''));

    // Get first and last valid PSF (need at least 2 data points)
    const validData = data.filter(d => d.medianPsf > 0);
    if (validData.length < 2) return;

    const first = validData[0];
    const last = validData[validData.length - 1];
    const growthPercent = ((last.medianPsf - first.medianPsf) / first.medianPsf) * 100;

    // Track global quarters
    if (!globalStartQuarter || first.quarter < globalStartQuarter) {
      globalStartQuarter = first.quarter;
    }
    if (!globalEndQuarter || last.quarter > globalEndQuarter) {
      globalEndQuarter = last.quarter;
    }

    chartData.push({
      district,
      startPsf: first.medianPsf,
      endPsf: last.medianPsf,
      startQuarter: first.quarter,
      endQuarter: last.quarter,
      growthPercent,
    });
  });

  return {
    chartData,
    startQuarter: globalStartQuarter,
    endQuarter: globalEndQuarter,
  };
};
