/**
 * Chart-Specific Transformations
 *
 * Transformations for specific chart types:
 * - transformNewVsResaleSeries: New vs Resale premium analysis
 * - transformGrowthDumbbellSeries: District growth comparison
 */

import {
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
 * Transform /api/district-growth response into chart format.
 *
 * This is a pure adapter - all business logic (quarter selection, growth calculation)
 * is handled by the backend. This function only normalizes the response shape.
 *
 * @param {Object} rawData - Raw response from /api/district-growth
 * @returns {Object} Normalized data for GrowthDumbbellChart
 */
export const transformGrowthDumbbellSeries = (rawData) => {
  // Handle null/undefined input
  if (!rawData) {
    if (isDev) console.warn('[transformGrowthDumbbellSeries] Null input');
    return { chartData: [], startQuarter: '', endQuarter: '', excludedDistricts: [] };
  }

  // Extract data and meta from response
  const data = rawData.data || [];
  const meta = rawData.meta || {};

  // Normalize each row (ensure consistent shape)
  const chartData = data.map((row) => ({
    district: row.district || '',
    startQuarter: row.startQuarter || meta.startQuarter || '',
    endQuarter: row.endQuarter || meta.endQuarter || '',
    startPsf: row.startPsf ?? 0,
    endPsf: row.endPsf ?? 0,
    growthPercent: row.growthPercent ?? 0,
  }));

  return {
    chartData,
    startQuarter: meta.startQuarter || '',
    endQuarter: meta.endQuarter || '',
    excludedDistricts: meta.excludedDistricts || [],
  };
};
