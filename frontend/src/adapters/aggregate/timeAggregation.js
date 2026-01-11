/**
 * Client-Side Time Series Aggregation
 *
 * Rolls up monthly data to quarter/year granularity for instant UI updates.
 * This enables toggling between Month/Quarter/Year views without API calls.
 *
 * IMPORTANT - Data Integrity:
 * - ONLY for metrics that can be summed (counts, totals)
 * - CANNOT be used for medians or statistical measures (those require raw data)
 * - Results MUST match server-side aggregation exactly
 *
 * Supports two data shapes:
 * 1. Legacy shape: { period, newSaleCount, resaleCount, newSaleValue, resaleValue, totalCount, totalValue }
 * 2. Multi-dim shape: { period, count, totalValue, totalSqft, region?, bedroom? }
 *
 * Usage:
 * ```jsx
 * const aggregatedData = useMemo(() => {
 *   return aggregateTimeSeriesByGrain(monthlyData, timeGrouping);
 * }, [monthlyData, timeGrouping]);
 * ```
 */

import { sortByPeriod } from './sorting';

/**
 * Convert a month period to quarter period.
 * @param {string} monthPeriod - Month in "YYYY-MM" format
 * @returns {string} Quarter in "YYYY-Q#" format
 */
export function monthToQuarter(monthPeriod) {
  if (!monthPeriod || typeof monthPeriod !== 'string') return monthPeriod;

  const match = monthPeriod.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthPeriod;

  const year = match[1];
  const month = parseInt(match[2], 10);
  const quarter = Math.ceil(month / 3);

  return `${year}-Q${quarter}`;
}

/**
 * Convert a month period to year period.
 * @param {string} monthPeriod - Month in "YYYY-MM" format
 * @returns {string} Year in "YYYY" format
 */
export function monthToYear(monthPeriod) {
  if (!monthPeriod || typeof monthPeriod !== 'string') return monthPeriod;

  const match = monthPeriod.match(/^(\d{4})-\d{2}$/);
  if (!match) return monthPeriod;

  return match[1];
}

/**
 * Detect which data shape we're working with based on field names.
 * @param {Object} sampleRow - A sample row from the data
 * @returns {'legacy' | 'multidim'} The detected shape type
 */
function detectDataShape(sampleRow) {
  // Multi-dim shape has 'count' field (without sale type prefix)
  if ('count' in sampleRow && !('totalCount' in sampleRow)) {
    return 'multidim';
  }
  return 'legacy';
}

/**
 * Aggregate monthly time series data to quarter or year granularity.
 *
 * This function sums up counts and values, matching server-side aggregation.
 * It should only be used for additive metrics (count, total_value).
 *
 * Handles both legacy shape (newSaleCount, resaleCount) and multi-dim shape (count, totalValue).
 *
 * @param {Array} monthlyData - Array of monthly data
 *   Legacy shape: { period, periodGrain, newSaleCount, resaleCount, newSaleValue, resaleValue, totalCount, totalValue }
 *   Multi-dim shape: { period, count, totalValue, totalSqft, region?, bedroom? }
 * @param {string} targetGrain - Target granularity: 'month' | 'quarter' | 'year'
 * @returns {Array} Aggregated data at target grain, sorted by period
 */
export function aggregateTimeSeriesByGrain(monthlyData, targetGrain) {
  // Validate input
  if (!Array.isArray(monthlyData) || monthlyData.length === 0) {
    return [];
  }

  // If target is month (most granular), just sort and return
  // (data may need sorting after client-side filtering)
  if (targetGrain === 'month') {
    return sortByPeriod([...monthlyData]);
  }

  // Detect data shape from first row
  const shape = detectDataShape(monthlyData[0]);

  // Determine period conversion function
  const convertPeriod = targetGrain === 'quarter' ? monthToQuarter : monthToYear;

  // Group and aggregate
  const grouped = {};

  for (const row of monthlyData) {
    const sourcePeriod = row.period ?? row.month;
    if (!sourcePeriod) continue;

    const targetPeriod = convertPeriod(sourcePeriod);

    if (!grouped[targetPeriod]) {
      if (shape === 'multidim') {
        // Multi-dim shape: count, totalValue, totalSqft
        grouped[targetPeriod] = {
          period: targetPeriod,
          periodGrain: targetGrain,
          count: 0,
          totalValue: 0,
          totalSqft: 0,
        };
      } else {
        // Legacy shape: newSaleCount, resaleCount, etc.
        grouped[targetPeriod] = {
          period: targetPeriod,
          periodGrain: targetGrain,
          newSaleCount: 0,
          resaleCount: 0,
          newSaleValue: 0,
          resaleValue: 0,
          totalCount: 0,
          totalValue: 0,
        };
      }
    }

    if (shape === 'multidim') {
      // Sum multi-dim metrics
      grouped[targetPeriod].count += row.count ?? 0;
      grouped[targetPeriod].totalValue += row.totalValue ?? 0;
      grouped[targetPeriod].totalSqft += row.totalSqft ?? 0;
    } else {
      // Sum legacy metrics (matches server-side SUM() aggregation)
      grouped[targetPeriod].newSaleCount += row.newSaleCount ?? 0;
      grouped[targetPeriod].resaleCount += row.resaleCount ?? 0;
      grouped[targetPeriod].newSaleValue += row.newSaleValue ?? 0;
      grouped[targetPeriod].resaleValue += row.resaleValue ?? 0;
      grouped[targetPeriod].totalCount += row.totalCount ?? 0;
      grouped[targetPeriod].totalValue += row.totalValue ?? 0;
    }
  }

  // Post-process: compute derived metrics for multi-dim shape
  const result = Object.values(grouped);

  if (shape === 'multidim') {
    for (const row of result) {
      // Compute avgPsf = totalValue / totalSqft (weighted average)
      // This is mathematically correct because we summed both numerator and denominator
      row.avgPsf = row.totalSqft > 0 ? row.totalValue / row.totalSqft : null;
    }
  }

  // Sort by period
  return sortByPeriod(result);
}
