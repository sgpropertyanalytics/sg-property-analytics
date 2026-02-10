/**
 * useAppQuery - TanStack Query wrapper with progressive boot gating
 *
 * Phase 2 of filter system simplification.
 *
 * This hook wraps @tanstack/react-query's useQuery with:
 * 1. Progressive boot gating - publicReady for most charts, authenticatedReady for authenticated access
 * 2. Timing instrumentation - dev-only chart timing tracking
 * 3. Status compatibility - maps TanStack status to existing ChartFrame status
 *
 * PROGRESSIVE BOOT GATES (P0 Fix):
 * - requiresAccess: false (default) → gates on publicReady (auth + filters)
 * - requiresAccess: true → gates on authenticatedReady (publicReady + access-thread resolution)
 *
 * IMPORTANT: Auth-gated charts that require access MUST be wrapped in <RequireAccess>.
 * The requiresAccess flag only gates on access-thread resolution, not auth itself.
 *
 * MIGRATION GUIDE:
 * Replace useGatedAbortableQuery with useAppQuery using the same arguments.
 * The return value is compatible with existing ChartFrame component.
 *
 * BEFORE:
 * ```jsx
 * const { data, status, error, refetch } = useGatedAbortableQuery(
 *   async (signal) => getAggregate(params, { signal }),
 *   [debouncedFilterKey, timeGrouping],
 *   { chartName: 'MyChart', keepPreviousData: true }
 * );
 * ```
 *
 * AFTER:
 * ```jsx
 * const { data, status, error, refetch } = useAppQuery(
 *   async (signal) => getAggregate(params, { signal }),
 *   [debouncedFilterKey, timeGrouping],
 *   { chartName: 'MyChart', keepPreviousData: true }
 * );
 * ```
 *
 * KEY DIFFERENCES FROM useGatedAbortableQuery:
 * - Uses TanStack Query for caching, deduplication, and stale-while-revalidate
 * - Query key is auto-generated from deps (no manual filterKey needed)
 * - Better DevTools support for debugging cache state
 *
 * IMPORTANT - DEBOUNCING:
 * staleTime is NOT a debounce mechanism. It controls cache freshness (how long
 * cached data is considered valid before a background refetch).
 *
 * Charts should STILL pass debouncedFilterKey in deps to prevent rapid-fire
 * API calls during active filter adjustments (e.g., slider dragging).
 * Example: [debouncedFilterKey, timeGrouping, saleType]
 *
 * @param {Function} queryFn - Async function that receives AbortSignal and returns data
 * @param {Array} deps - Dependencies that become part of the query key
 * @param {Object} options - Configuration options:
 *   - chartName: string - Name for timing tracking (dev-only)
 *   - enabled: boolean - ANDed with boot gate
 *   - requiresAccess: boolean - Wait for access-thread resolution (default: false)
 *   - requiresSubscription: boolean - Deprecated alias for requiresAccess
 *   - keepPreviousData: boolean - Show old data while fetching (uses placeholderData)
 *   - initialData: any - Initial data before first fetch
 *   - staleTime: number - Override default staleTime (30s) - controls cache freshness
 *   - onSuccess: function - DEPRECATED compatibility layer (prefer useEffect)
 *   - onError: function - DEPRECATED compatibility layer (prefer useEffect)
 * @returns {Object} Query state with status compatible with ChartFrame
 */

import { useQuery as useTanStackQuery } from '@tanstack/react-query';
import { useRef, useCallback, useEffect } from 'react';
import { useAppReadyOptional } from '../context/AppReadyContext';
import { useChartTiming } from './useChartTiming';
import { QueryStatus, deriveQueryStatus, hasRealData } from '../lib/queryClient';

const isDev = import.meta.env.DEV;

export function useAppQuery(queryFn, deps = [], options = {}) {
  // Get progressive boot gates with safe defaults for components outside provider
  const { publicReady, authenticatedReady, proReady } = useAppReadyOptional()
    ?? { publicReady: true, authenticatedReady: true, proReady: true };

  // Extract our custom options
  const {
    chartName,
    enabled: userEnabled = true,
    requiresAccess = false, // Preferred flag
    requiresSubscription = false, // Deprecated alias
    keepPreviousData = false,
    initialData,
    staleTime,
    onSuccess,
    onError,
    ...restOptions
  } = options;

  // Use chart timing if chartName provided (dev-only, no-ops in prod)
  const timing = useChartTiming(chartName || '');
  const hasTimingEnabled = isDev && chartName;

  // BOOT GATE SELECTION (P0 Fix):
  // - requiresAccess: false (default) → gates on publicReady (auth + filters)
  // - requiresAccess: true → gates on authenticatedReady (publicReady + access-thread resolution)
  // NOTE: Auth-gated charts that require access MUST be wrapped in <RequireAccess>
  const shouldRequireAccess = requiresAccess || requiresSubscription;
  const accessReadyGate = authenticatedReady ?? proReady ?? true;
  const bootReady = shouldRequireAccess ? accessReadyGate : publicReady;
  const effectiveEnabled = userEnabled && bootReady;

  // Query key from deps
  // TanStack Query uses hashQueryKey() for structural comparison, so we don't
  // need custom serialization. Just construct the key directly.
  // Note: appReady is NOT included in queryKey - enabled handles boot gating.
  const queryKey = ['appQuery', ...deps];

  // Stable ref for queryFn (avoid recreating query on every render)
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  // Track timing (dev-only)
  const depsKeyRef = useRef(JSON.stringify(deps));
  depsKeyRef.current = JSON.stringify(deps);

  // Wrapped queryFn that integrates with TanStack Query
  const wrappedQueryFn = useCallback(async ({ signal }) => {
    // Record fetch start for timing
    if (hasTimingEnabled) {
      timing.recordFetchStart(depsKeyRef.current);
    }

    try {
      const result = await queryFnRef.current(signal);

      // Record state update for timing
      if (hasTimingEnabled) {
        timing.recordStateUpdate();
      }

      return result;
    } catch (error) {
      // Record timing even on error
      if (hasTimingEnabled) {
        timing.recordStateUpdate();
      }
      throw error;
    }
  }, [hasTimingEnabled, timing]);

  // TanStack Query call
  const queryResult = useTanStackQuery({
    queryKey,
    queryFn: wrappedQueryFn,
    enabled: effectiveEnabled,
    // Map keepPreviousData to TanStack v5's placeholderData
    placeholderData: keepPreviousData ? (prev) => prev : undefined,
    // Initial data
    initialData,
    // Custom staleTime or use default from queryClient
    staleTime,
    // Don't retry 401s here - handled by axios interceptor
    retry: (failureCount, error) => {
      // Don't retry on 401 (auth errors)
      if (error?.response?.status === 401) return false;
      // Otherwise retry once
      return failureCount < 1;
    },
    ...restOptions,
  });

  // Call success/error callbacks (TanStack v5 removed these, so we add them back)
  const prevDataRef = useRef(undefined);
  const prevErrorRef = useRef(undefined);

  useEffect(() => {
    if (queryResult.isSuccess && queryResult.data !== prevDataRef.current) {
      prevDataRef.current = queryResult.data;
      if (onSuccess) {
        onSuccess(queryResult.data);
      }
    }
  }, [queryResult.isSuccess, queryResult.data, onSuccess]);

  useEffect(() => {
    if (queryResult.isError && queryResult.error !== prevErrorRef.current) {
      prevErrorRef.current = queryResult.error;
      if (onError) {
        onError(queryResult.error);
      }
    }
  }, [queryResult.isError, queryResult.error, onError]);

  // Derive our status for ChartFrame compatibility
  const dataHasContent = hasRealData(queryResult.data);
  const status = deriveQueryStatus(queryResult, effectiveEnabled, dataHasContent);

  // isBootPending = !bootReady (for ChartFrame to show skeleton during boot)
  const isBootPending = !bootReady;

  // Return value compatible with useGatedAbortableQuery
  return {
    // Core values
    status,
    data: queryResult.data ?? initialData ?? null,
    error: queryResult.error,
    refetch: queryResult.refetch,

    // Derived booleans (match useGatedAbortableQuery interface)
    loading: status === QueryStatus.LOADING,
    isFetching: queryResult.isFetching,
    isRefetching: status === QueryStatus.REFRESHING,
    isPending: status === QueryStatus.PENDING,
    isIdle: status === QueryStatus.IDLE,
    isSuccess: status === QueryStatus.SUCCESS,
    isError: status === QueryStatus.ERROR,
    hasData: dataHasContent,

    // Boot status
    isBootPending,

    // Timing (dev-only)
    timing: hasTimingEnabled ? timing : null,

    // TanStack-specific (useful for debugging)
    _tanstack: queryResult,
  };
}

// Re-export QueryStatus for convenience
export { QueryStatus };

export default useAppQuery;
