import { useAbortableQuery } from './useAbortableQuery';
import { useAppReadyOptional } from '../context/AppReadyContext';

/**
 * useGatedAbortableQuery - Abortable query that waits for app boot to complete
 *
 * This hook wraps useAbortableQuery and automatically gates fetching on appReady.
 * Charts should use this instead of useAbortableQuery directly to prevent:
 * - Fetching before auth is initialized
 * - Fetching before subscription status is known
 * - Fetching before filters are hydrated from storage
 *
 * The hook returns an additional `isBootPending` flag that ChartFrame uses to
 * show a skeleton instead of "No data" during the boot phase.
 *
 * Usage:
 * ```jsx
 * const { data, loading, error, isBootPending } = useGatedAbortableQuery(
 *   async (signal) => {
 *     const params = buildApiParams({ ... });
 *     return getAggregate(params, { signal });
 *   },
 *   [debouncedFilterKey, timeGrouping],
 *   { initialData: [], keepPreviousData: true }
 * );
 *
 * // In ChartFrame:
 * if (isBootPending) return <Skeleton />;
 * ```
 *
 * @param {Function} queryFn - Async function that receives AbortSignal and returns data
 * @param {Array} deps - Dependencies that trigger refetch
 * @param {Object} options - Same options as useAbortableQuery (enabled will be ANDed with appReady)
 * @returns {Object} { data, loading, error, isFetching, refetch, isBootPending }
 */
export function useGatedAbortableQuery(queryFn, deps = [], options = {}) {
  // Use optional hook to gracefully handle being outside AppReadyProvider (public pages)
  const appReadyContext = useAppReadyOptional();
  const appReady = appReadyContext?.appReady ?? true;

  // Combine user's enabled option with appReady
  const userEnabled = options.enabled ?? true;
  const effectiveEnabled = userEnabled && appReady;

  const result = useAbortableQuery(queryFn, deps, {
    ...options,
    enabled: effectiveEnabled,
    // Enable token refresh retry by default for authenticated queries
    // Can be explicitly disabled via options.retryOnTokenRefresh = false
    retryOnTokenRefresh: options.retryOnTokenRefresh ?? true,
  });

  // isBootPending is true when we're waiting for boot to complete
  // This tells ChartFrame to show skeleton instead of "No data"
  const isBootPending = !appReady;

  return {
    ...result,
    isBootPending,
  };
}

export default useGatedAbortableQuery;
