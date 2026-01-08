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
export const transformGrowthDumbbellSeries = (rawData, options = {}) => {
  // Handle null/undefined input
  if (!rawData) {
    if (isDev) console.warn('[transformGrowthDumbbellSeries] Null input');
    return { chartData: [], startQuarter: '', endQuarter: '' };
  }

  // Backend-provided normalized format (data/meta envelope)
  if (!Array.isArray(rawData)) {
    const data = rawData.data || [];
    const meta = rawData.meta || {};

    const chartData = data.map((row) => ({
      district: row.district || '',
      startQuarter: row.startQuarter || meta.startQuarter || '',
      endQuarter: row.endQuarter || meta.endQuarter || '',
      startPsf: row.startPsf ?? 0,
      endPsf: row.endPsf ?? 0,
      growthPercent: row.growthPercent ?? 0,
    }));

    const result = {
      chartData,
      startQuarter: meta.startQuarter || '',
      endQuarter: meta.endQuarter || '',
    };

    if (meta.excludedDistricts) {
      result.excludedDistricts = meta.excludedDistricts;
    }

    return result;
  }

  const filterDistricts = Array.isArray(options.districts) && options.districts.length > 0
    ? new Set(options.districts)
    : null;

  const rows = rawData
    .filter((row) => row && row.district && row.quarter)
    .filter((row) => !filterDistricts || filterDistricts.has(row.district))
    .map((row) => ({
      district: row.district,
      quarter: row.quarter,
      psf: row.medianPsf ?? row.avgPsf ?? null,
    }))
    .filter((row) => row.psf != null && row.psf > 0);

  if (rows.length === 0) {
    return { chartData: [], startQuarter: '', endQuarter: '' };
  }

  const quarterKey = (quarter) => {
    const match = /^(\d{4})-Q([1-4])$/.exec(quarter || '');
    if (!match) return null;
    return { year: Number(match[1]), quarter: Number(match[2]) };
  };

  const uniqueQuarters = Array.from(new Set(rows.map((row) => row.quarter)))
    .map((quarter) => ({ quarter, key: quarterKey(quarter) }))
    .filter((entry) => entry.key)
    .sort((a, b) => (a.key.year - b.key.year) || (a.key.quarter - b.key.quarter))
    .map((entry) => entry.quarter);

  if (uniqueQuarters.length < 6) {
    return { chartData: [], startQuarter: '', endQuarter: '' };
  }

  const earliestQuarters = uniqueQuarters.slice(0, 3);
  const latestQuarters = uniqueQuarters.slice(-3);

  const startQuarter = `${earliestQuarters[0]} – ${earliestQuarters[2]}`;
  const endQuarter = `${latestQuarters[0]} – ${latestQuarters[2]}`;

  const districts = Array.from(new Set(rows.map((row) => row.district)));
  const excludedDistricts = [];

  const chartData = districts.flatMap((district) => {
    const districtRows = rows.filter((row) => row.district === district);
    const valuesByQuarter = new Map();

    districtRows.forEach((row) => {
      const existing = valuesByQuarter.get(row.quarter) || [];
      existing.push(row.psf);
      valuesByQuarter.set(row.quarter, existing);
    });

    const averageQuarterValue = (quarter) => {
      const values = valuesByQuarter.get(quarter) || [];
      if (values.length === 0) return null;
      const total = values.reduce((sum, value) => sum + value, 0);
      return total / values.length;
    };

    const earliestValues = earliestQuarters
      .map(averageQuarterValue)
      .filter((value) => value != null);
    const latestValues = latestQuarters
      .map(averageQuarterValue)
      .filter((value) => value != null);

    if (earliestValues.length === 0 || latestValues.length === 0) {
      excludedDistricts.push({
        district,
        reason: earliestValues.length === 0 ? 'missing baseline' : 'missing comparison',
      });
      return [];
    }

    const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const startPsf = average(earliestValues);
    const endPsf = average(latestValues);
    const growthPercent = startPsf ? ((endPsf - startPsf) / startPsf) * 100 : 0;

    return [{
      district,
      startQuarter,
      endQuarter,
      startPsf,
      endPsf,
      growthPercent,
    }];
  });

  const result = { chartData, startQuarter, endQuarter };
  if (excludedDistricts.length > 0) {
    result.excludedDistricts = excludedDistricts;
  }

  return result;
};
