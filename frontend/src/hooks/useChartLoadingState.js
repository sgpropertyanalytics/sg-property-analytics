import { useMemo } from 'react';
import { usePowerBIFilters } from '../context/PowerBIFilter';

/**
 * useChartLoadingState - Derives chart loading states from query and filter state
 *
 * Combines isFetching from useAbortableQuery with filter change detection
 * to provide a unified "isUpdating" signal for the retain-and-blur pattern.
 *
 * Key insight: The context exposes both filterKey (instant) and debouncedFilterKey
 * (200ms delayed). When they differ, filters are "in flight" - we show the overlay
 * immediately, well before the API call triggers.
 *
 * Usage:
 * ```jsx
 * const { data, loading, error, isFetching, refetch } = useAbortableQuery(...);
 * const { isUpdating, isFiltering } = useChartLoadingState({ loading, isFetching });
 *
 * return (
 *   <ChartFrame
 *     loading={loading}
 *     isFetching={isFetching}
 *     isFiltering={isFiltering}
 *     ...
 *   >
 *     <Chart data={data} />
 *   </ChartFrame>
 * );
 * ```
 *
 * @param {Object} options
 * @param {boolean} options.loading - Loading state from useAbortableQuery
 * @param {boolean} options.isFetching - Fetching state from useAbortableQuery
 * @returns {Object} { isInitialLoading, isUpdating, isFiltering }
 */
export function useChartLoadingState({ loading = false, isFetching = false }) {
  const { filterKey, debouncedFilterKey } = usePowerBIFilters();

  return useMemo(() => {
    // Filter is "in flight" when filterKey changed but debounce hasn't fired yet
    // This triggers within one React render cycle (~16ms), well under 50ms target
    const isFiltering = filterKey !== debouncedFilterKey;

    return {
      // True only on very first load (no data yet)
      isInitialLoading: loading && !isFetching,

      // True when filters changed OR background fetch is in progress
      // This is the signal for blur/overlay
      isUpdating: isFetching || isFiltering,

      // True immediately when filter changes (before debounce)
      isFiltering,
    };
  }, [loading, isFetching, filterKey, debouncedFilterKey]);
}

export default useChartLoadingState;
