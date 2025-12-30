/**
 * Chart-Specific Transformations
 *
 * Transformations for specific chart types:
 * - transformNewVsResaleSeries: New vs Resale premium analysis
 * - transformGrowthDumbbellSeries: District growth comparison
 */

import {
  getAggField,
  AggField,
  getNewVsResaleField,
  NewVsResaleField,
} from '../../schemas/apiContract';
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
  const rawChartData = getNewVsResaleField(rawData, NewVsResaleField.CHART_DATA);
  const chartData = Array.isArray(rawChartData)
    ? rawChartData.map((row) => ({
        period: row.period || null,
        newLaunchPrice: row.newLaunchPrice ?? null,
        resalePrice: row.resalePrice ?? null,
        newLaunchCount: Number(row.newLaunchCount) || 0,
        resaleCount: Number(row.resaleCount) || 0,
        premiumPct: row.premiumPct ?? null,
      }))
    : [];

  // Extract and normalize summary with defaults
  const rawSummary = getNewVsResaleField(rawData, NewVsResaleField.SUMMARY) || {};
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
 * Uses a CONSISTENT time period across all districts for fair comparison:
 * - Finds the global earliest and latest quarters with sufficient data
 * - Compares each district's PSF at those same quarters
 * - Excludes districts missing data for either endpoint
 *
 * @param {Array} rawData - Raw data from /api/aggregate with quarter,district grouping
 * @param {Object} options - Configuration options
 * @param {Array} options.districts - List of valid district codes (e.g., ['D01', 'D02', ...])
 * @returns {Object} Transformed data:
 *   {
 *     chartData: [{ district, startPsf, endPsf, startQuarter, endQuarter, growthPercent }],
 *     startQuarter: string,  // Global earliest quarter (same for all)
 *     endQuarter: string,    // Global latest quarter (same for all)
 *     excludedDistricts: [{ district, reason }]  // Districts excluded due to missing data
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

  // Build a map of district -> quarter -> medianPsf
  const districtQuarterMap = {};
  const allQuarters = new Set();

  rawData.forEach(row => {
    const district = row.district;
    // API v2 uses 'period' as the unified time bucket field (not 'quarter')
    const quarter = getAggField(row, AggField.PERIOD) || row.quarter;
    const medianPsf = getAggField(row, AggField.MEDIAN_PSF) || getAggField(row, AggField.AVG_PSF) || 0;

    // Only include if district is in our list (or if no list provided)
    if (districts.length === 0 || districts.includes(district)) {
      if (!districtQuarterMap[district]) {
        districtQuarterMap[district] = {};
      }
      if (medianPsf > 0) {
        districtQuarterMap[district][quarter] = medianPsf;
        allQuarters.add(quarter);
      }
    }
  });

  // Sort quarters chronologically
  const sortedQuarters = Array.from(allQuarters).sort();

  if (sortedQuarters.length < 2) {
    return { chartData: [], startQuarter: '', endQuarter: '' };
  }

  // Find global start/end quarters that have data for most districts
  // Use the earliest and latest quarters overall
  const globalStartQuarter = sortedQuarters[0];
  const globalEndQuarter = sortedQuarters[sortedQuarters.length - 1];

  // Calculate growth for each district using the SAME time period
  const chartData = [];
  const excludedDistricts = [];

  Object.entries(districtQuarterMap).forEach(([district, quarterData]) => {
    const startPsf = quarterData[globalStartQuarter];
    const endPsf = quarterData[globalEndQuarter];

    // Only include districts that have data for BOTH the global start and end quarters
    if (startPsf && startPsf > 0 && endPsf && endPsf > 0) {
      const growthPercent = ((endPsf - startPsf) / startPsf) * 100;

      chartData.push({
        district,
        startPsf,
        endPsf,
        startQuarter: globalStartQuarter,
        endQuarter: globalEndQuarter,
        growthPercent,
      });
    } else {
      // Track excluded districts with reason
      const missingStart = !startPsf || startPsf <= 0;
      const missingEnd = !endPsf || endPsf <= 0;
      let reason;
      if (missingStart && missingEnd) {
        reason = `No data for ${globalStartQuarter} or ${globalEndQuarter}`;
      } else if (missingStart) {
        reason = `No data for ${globalStartQuarter}`;
      } else {
        reason = `No data for ${globalEndQuarter}`;
      }
      excludedDistricts.push({ district, reason });

      if (isDev) {
        console.warn(`[transformGrowthDumbbellSeries] Excluding ${district}: ${reason}`);
      }
    }
  });

  return {
    chartData,
    startQuarter: globalStartQuarter,
    endQuarter: globalEndQuarter,
    excludedDistricts,
  };
};
