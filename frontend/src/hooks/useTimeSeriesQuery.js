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
 * // Basic usage (existing pattern)
 * const { data, status, error, refetch } = useTimeSeriesQuery({
 *   queryFn: (signal) => fetchData(signal),
 *   deps: [timeframe, saleType],
 *   chartName: 'TimeTrendChart',
 * });
 *
 * // With client-side dimension filtering (NEW - instant bedroom/region toggle)
 * const { data, status } = useTimeSeriesQuery({
 *   queryFn: (signal) => getAggregate({
 *     group_by: 'month,region,bedroom',  // Fetch all dimensions
 *     metrics: 'count,total_value,total_sqft',
 *   }, { signal }),
 *   deps: ['time-trend', timeframe, saleType],  // bedroom/segment NOT in deps
 *   filterDimensions: true,  // Enable client-side filtering
 *   chartName: 'TimeTrendChart',
 * });
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
 * @param {boolean} options.filterDimensions - Enable client-side bedroom/region filtering (default: false)
 * @param {Object} options.queryOptions - Additional useAppQuery options
 */
export function useTimeSeriesQuery({
  queryFn,
  deps = [],
  transform,
  chartName,
  filterDimensions = false,
  ...queryOptions
}) {
  const { timeGrouping, bedroomTypes, segments } = useZustandFilters();

  // Check if user selected 5BR (not in prefetch slice, requires server fallback)
  const has5BR = filterDimensions && bedroomTypes?.includes(5);

  // Fetch monthly data - timeGrouping excluded from deps (no refetch on toggle)
  // When filterDimensions=true, bedroom/segment also excluded (filtered client-side)
  const queryResult = useAppQuery(
    queryFn,
    deps,
    { chartName, initialData: null, keepPreviousData: true, ...queryOptions }
  );

  // Client-side filtering + aggregation (deterministic order)
  const aggregatedData = useMemo(() => {
    let data = queryResult.data ?? [];
    if (!data.length) return [];

    // Apply client-side dimension filtering when enabled
    // IMPORTANT: Only filter when filterDimensions=true AND we have multi-dim data
    if (filterDimensions && !has5BR) {
      // Filter by bedroom if selections exist
      if (bedroomTypes?.length) {
        data = data.filter(row => {
          // Handle both 'bedroom' and 'bedroomCount' field names
          const rowBedroom = row.bedroom ?? row.bedroomCount;
          return rowBedroom != null && bedroomTypes.includes(rowBedroom);
        });
      }

      // Filter by region/segment if selections exist
      if (segments?.length) {
        data = data.filter(row => {
          const rowRegion = (row.region ?? '').toUpperCase();
          return segments.some(seg => seg.toUpperCase() === rowRegion);
        });
      }
    }

    // Aggregate by time grain - handles sorting internally
    return aggregateTimeSeriesByGrain(data, timeGrouping);
  }, [queryResult.data, timeGrouping, filterDimensions, bedroomTypes, segments, has5BR]);

  return {
    ...queryResult,
    data: aggregatedData,
    // Expose raw monthly data for charts that need both
    rawMonthlyData: queryResult.data,
    // Expose whether we're using client-side filtering (useful for debugging)
    isClientFiltered: filterDimensions && !has5BR,
  };
}

export default useTimeSeriesQuery;
