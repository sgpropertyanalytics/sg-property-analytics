import { useQuery, QueryStatus } from './useQuery';
import { useAppReadyOptional } from '../context/AppReadyContext';

/**
 * useGatedAbortableQuery - Query that waits for app boot to complete
 *
 * This hook wraps useQuery and gates fetching on appReady.
 * Charts should use this to prevent fetching before:
 * - Auth is initialized
 * - Subscription status is known
 * - Filters are hydrated from storage
 *
 * PR1 CHANGES:
 * - Now uses useQuery with explicit status enum
 * - `isBootPending` = !appReady (for ChartFrame skeleton)
 * - Query returns `status` for status-based rendering
 *
 * Usage:
 * ```jsx
 * const { data, status, isBootPending } = useGatedAbortableQuery(
 *   async (signal) => getAggregate(params, { signal }),
 *   [debouncedFilterKey, timeGrouping],
 *   { keepPreviousData: true }
 * );
 *
 * <ChartFrame status={status} isBootPending={isBootPending}>
 *   <MyChart data={data} />
 * </ChartFrame>
 * ```
 *
 * @param {Function} queryFn - Async function that receives AbortSignal and returns data
 * @param {Array} deps - Dependencies that trigger refetch
 * @param {Object} options - Same options as useQuery (enabled will be ANDed with appReady)
 * @returns {Object} Query state with isBootPending flag
 */
export function useGatedAbortableQuery(queryFn, deps = [], options = {}) {
  const appReadyContext = useAppReadyOptional();
  const appReady = appReadyContext?.appReady ?? true;

  // Gate enabled on appReady
  const userEnabled = options.enabled ?? true;
  const effectiveEnabled = userEnabled && appReady;

  // Only enable token refresh retry when appReady
  const shouldRetryOnTokenRefresh = appReady && (options.retryOnTokenRefresh ?? true);

  // Include appReady in deps to force re-trigger when boot completes
  const queryDeps = [...deps, appReady];

  const result = useQuery(queryFn, queryDeps, {
    ...options,
    enabled: effectiveEnabled,
    retryOnTokenRefresh: shouldRetryOnTokenRefresh,
  });

  // isBootPending = !appReady (for ChartFrame to show skeleton during boot)
  const isBootPending = !appReady;

  return {
    ...result,
    isBootPending,
  };
}

// Re-export QueryStatus
export { QueryStatus };

export default useGatedAbortableQuery;
