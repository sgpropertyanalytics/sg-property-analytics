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
 * Aggregate monthly time series data to quarter or year granularity.
 *
 * This function sums up counts and values, matching server-side aggregation.
 * It should only be used for additive metrics (count, total_value).
 *
 * @param {Array} monthlyData - Array of monthly data from transformTimeSeries
 *   Expected shape: { period, periodGrain, newSaleCount, resaleCount,
 *                     newSaleValue, resaleValue, totalCount, totalValue }
 * @param {string} targetGrain - Target granularity: 'month' | 'quarter' | 'year'
 * @returns {Array} Aggregated data at target grain, sorted by period
 */
export function aggregateTimeSeriesByGrain(monthlyData, targetGrain) {
  // Validate input
  if (!Array.isArray(monthlyData) || monthlyData.length === 0) {
    return [];
  }

  // If target is month (most granular), return as-is
  if (targetGrain === 'month') {
    return monthlyData;
  }

  // Determine period conversion function
  const convertPeriod = targetGrain === 'quarter' ? monthToQuarter : monthToYear;

  // Group and aggregate
  const grouped = {};

  for (const row of monthlyData) {
    const sourcePeriod = row.period;
    if (!sourcePeriod) continue;

    const targetPeriod = convertPeriod(sourcePeriod);

    if (!grouped[targetPeriod]) {
      grouped[targetPeriod] = {
        period: targetPeriod,
        periodGrain: targetGrain,
        // Initialize all summable metrics to 0
        newSaleCount: 0,
        resaleCount: 0,
        newSaleValue: 0,
        resaleValue: 0,
        totalCount: 0,
        totalValue: 0,
      };
    }

    // Sum up all metrics (matches server-side SUM() aggregation)
    grouped[targetPeriod].newSaleCount += row.newSaleCount || 0;
    grouped[targetPeriod].resaleCount += row.resaleCount || 0;
    grouped[targetPeriod].newSaleValue += row.newSaleValue || 0;
    grouped[targetPeriod].resaleValue += row.resaleValue || 0;
    grouped[targetPeriod].totalCount += row.totalCount || 0;
    grouped[targetPeriod].totalValue += row.totalValue || 0;
  }

  // Convert to sorted array using existing period sorting
  return sortByPeriod(Object.values(grouped));
}
