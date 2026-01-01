import { useQuery, QueryStatus } from './useQuery';
import { useAppReadyOptional } from '../context/AppReadyContext';
import { useChartTiming } from './useChartTiming';

const isDev = import.meta.env.DEV;

/**
 * useGatedAbortableQuery - Query that waits for app boot to complete
 *
 * This hook wraps useQuery and gates fetching on appReady.
 * Charts should use this to prevent fetching before:
 * - Auth is initialized
 * - Subscription status is known
 * - Filters are hydrated from storage
 *
 * TIMING INSTRUMENTATION (dev-only):
 * Pass `chartName` in options to enable automatic per-chart timing tracking.
 * Timing data is available via:
 * - /perf dashboard
 * - Debug overlay (Ctrl+Shift+D)
 * - window.__CHART_TIMINGS__.getTimings()
 *
 * Usage:
 * ```jsx
 * const { data, status, isBootPending } = useGatedAbortableQuery(
 *   async (signal) => getAggregate(params, { signal }),
 *   [debouncedFilterKey, timeGrouping],
 *   {
 *     chartName: 'TimeTrendChart',  // ← Enables timing
 *     keepPreviousData: true
 *   }
 * );
 *
 * <ChartFrame status={status} isBootPending={isBootPending}>
 *   <MyChart data={data} />
 * </ChartFrame>
 * ```
 *
 * @param {Function} queryFn - Async function that receives AbortSignal and returns data
 * @param {Array} deps - Dependencies that trigger refetch
 * @param {Object} options - Same options as useQuery plus:
 *   - chartName: string - Name for timing tracking (dev-only)
 *   - enabled: boolean - ANDed with appReady
 * @returns {Object} Query state with isBootPending flag
 */
export function useGatedAbortableQuery(queryFn, deps = [], options = {}) {
  const appReadyContext = useAppReadyOptional();
  const appReady = appReadyContext?.appReady ?? true;

  // Extract chartName for timing (dev-only)
  const { chartName, ...restOptions } = options;

  // Use chart timing if chartName provided (dev-only, no-ops in prod)
  const timing = useChartTiming(chartName || '');
  const hasTimingEnabled = isDev && chartName;

  // Gate enabled on appReady
  const userEnabled = restOptions.enabled ?? true;
  const effectiveEnabled = userEnabled && appReady;

  // Only enable token refresh retry when appReady
  const shouldRetryOnTokenRefresh = appReady && (restOptions.retryOnTokenRefresh ?? true);

  // Include appReady in deps to force re-trigger when boot completes
  const queryDeps = [...deps, appReady];

  // Build enhanced options with timing callbacks
  const enhancedOptions = {
    ...restOptions,
    enabled: effectiveEnabled,
    retryOnTokenRefresh: shouldRetryOnTokenRefresh,
    // Auto-wire timing callbacks when chartName is provided
    onFetchStart: hasTimingEnabled
      ? (depsKey) => {
          timing.recordFetchStart(depsKey);
          restOptions.onFetchStart?.(depsKey);
        }
      : restOptions.onFetchStart,
    onStateUpdate: hasTimingEnabled
      ? () => {
          timing.recordStateUpdate();
          restOptions.onStateUpdate?.();
        }
      : restOptions.onStateUpdate,
  };

  const result = useQuery(queryFn, queryDeps, enhancedOptions);

  // isBootPending = !appReady (for ChartFrame to show skeleton during boot)
  const isBootPending = !appReady;

  return {
    ...result,
    isBootPending,
    // Expose timing for charts that want to record additional events
    timing: hasTimingEnabled ? timing : null,
  };
}

// Re-export QueryStatus
export { QueryStatus };

export default useGatedAbortableQuery;
