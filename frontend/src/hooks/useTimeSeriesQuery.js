/**
 * useTimeSeriesQuery - Time series data fetching with client-side grain aggregation
 *
 * Wraps useAppQuery to enable instant toggling between Month/Quarter/Year views
 * without triggering new API calls. Data is always fetched at month grain (most
 * granular) and aggregated client-side.
 *
 * IMPORTANT: Only use for charts with summable metrics (counts, totals).
 * Charts using medians/percentiles should use useAppQuery directly.
 *
 * Usage:
 * ```jsx
 * const { data, status, error, refetch } = useTimeSeriesQuery({
 *   queryFn: (signal) => fetchData(signal),
 *   deps: [debouncedFilterKey, saleType],
 *   transform: transformTimeSeries,
 *   chartName: 'TimeTrendChart',
 * });
 * // data is automatically aggregated to current timeGrouping
 * ```
 */

import { useMemo } from 'react';
import { useAppQuery } from './useAppQuery';
import { useZustandFilters } from '../stores';
import { aggregateTimeSeriesByGrain } from '../adapters';

/**
 * @param {Object} options
 * @param {Function} options.queryFn - Async fn (signal) => data. MUST fetch month-grain data.
 * @param {Array} options.deps - Query dependencies (exclude timeGrouping - handled internally)
 * @param {Function} options.transform - Adapter function to transform raw API response
 * @param {string} options.chartName - Chart name for timing/debugging
 * @param {Object} options.queryOptions - Additional useAppQuery options
 */
export function useTimeSeriesQuery({ queryFn, deps = [], transform, chartName, ...queryOptions }) {
  const { timeGrouping } = useZustandFilters();

  // Fetch monthly data - timeGrouping excluded from deps (no refetch on toggle)
  const queryResult = useAppQuery(
    queryFn,
    deps,
    { chartName, initialData: null, keepPreviousData: true, ...queryOptions }
  );

  // Client-side aggregation: month → quarter/year based on current timeGrouping
  const aggregatedData = useMemo(() => {
    const rawData = queryResult.data ?? [];
    if (!rawData.length) return [];
    return aggregateTimeSeriesByGrain(rawData, timeGrouping);
  }, [queryResult.data, timeGrouping]);

  return {
    ...queryResult,
    data: aggregatedData,
    // Expose raw monthly data for charts that need both
    rawMonthlyData: queryResult.data,
  };
}

export default useTimeSeriesQuery;
