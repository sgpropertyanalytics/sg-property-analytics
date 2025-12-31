import { useRef, useEffect } from 'react';
import { useAbortableQuery } from './useAbortableQuery';
import { useAppReadyOptional } from '../context/AppReadyContext';

/**
 * useGatedAbortableQuery - Abortable query that waits for app boot to complete
 *
 * This hook wraps useAbortableQuery and automatically gates fetching on appReady.
 * Charts should use this instead of useAbortableQuery directly to prevent:
 * - Fetching before auth is initialized
 * - Fetching before subscription status is known (tier resolved)
 * - Fetching before filters are hydrated from storage
 *
 * P0 INVARIANTS (MANDATORY):
 * 1. enabled MUST depend on appReady (which includes tokenReady && tierResolved)
 * 2. Hook MUST NOT cache "aborted" as terminal state (handled by useAbortableQuery)
 * 3. Query MUST re-run when enabled transitions false → true
 * 4. Abort is "ignore", NOT block - allow subsequent runs
 * 5. enabled derived from STABLE readiness state (appReady)
 * 6. Query deps include boot-gating dependencies to force re-trigger
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

  // INVARIANT 1: enabled depends on appReady (which includes tokenReady && tierResolved)
  const userEnabled = options.enabled ?? true;
  const effectiveEnabled = userEnabled && appReady;

  // Track previous enabled state for transition detection (INVARIANT 3)
  const prevEnabledRef = useRef(effectiveEnabled);

  // P0 SAFETY: Only enable token refresh retry when appReady=true
  // During boot, auth isn't ready so retrying 401s makes no sense
  const shouldRetryOnTokenRefresh = appReady && (options.retryOnTokenRefresh ?? true);

  // INVARIANT 6: Include appReady in deps to force re-trigger when boot completes
  // This ensures queries execute when enabled transitions false → true
  const queryDeps = [...deps, appReady];

  const result = useAbortableQuery(queryFn, queryDeps, {
    ...options,
    enabled: effectiveEnabled,
    // Enable token refresh retry only when app is ready and user didn't disable it
    retryOnTokenRefresh: shouldRetryOnTokenRefresh,
  });

  // INVARIANT 3: Log when enabled transitions false → true (debug aid)
  useEffect(() => {
    const wasDisabled = prevEnabledRef.current === false;
    const isNowEnabled = effectiveEnabled === true;

    if (wasDisabled && isNowEnabled) {
      // Transition detected: false → true
      // Query will automatically execute due to deps change
      if (process.env.NODE_ENV === 'development') {
        console.log('[useGatedAbortableQuery] enabled transitioned false → true, query will execute');
      }
    }

    prevEnabledRef.current = effectiveEnabled;
  }, [effectiveEnabled]);

  // isBootPending is true when we're waiting for boot to complete
  // This tells ChartFrame to show skeleton instead of "No data"
  const isBootPending = !appReady;

  return {
    ...result,
    isBootPending,
  };
}

export default useGatedAbortableQuery;
