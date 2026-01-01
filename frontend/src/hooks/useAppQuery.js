/**
 * useAppQuery - TanStack Query wrapper with app boot gating
 *
 * Phase 2 of filter system simplification.
 *
 * This hook wraps @tanstack/react-query's useQuery with:
 * 1. Boot gating - waits for app to be ready (auth + subscription + filters)
 * 2. Timing instrumentation - dev-only chart timing tracking
 * 3. Status compatibility - maps TanStack status to existing ChartFrame status
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
 * - staleTime replaces debouncing (cache hits are instant)
 * - Better DevTools support
 *
 * @param {Function} queryFn - Async function that receives AbortSignal and returns data
 * @param {Array} deps - Dependencies that become part of the query key
 * @param {Object} options - Configuration options:
 *   - chartName: string - Name for timing tracking (dev-only)
 *   - enabled: boolean - ANDed with appReady
 *   - keepPreviousData: boolean - Show old data while fetching
 *   - initialData: any - Initial data before first fetch
 *   - staleTime: number - Override default staleTime (30s)
 * @returns {Object} Query state with status compatible with ChartFrame
 */

import { useQuery as useTanStackQuery } from '@tanstack/react-query';
import { useMemo, useRef, useCallback, useEffect } from 'react';
import { useAppReadyOptional } from '../context/AppReadyContext';
import { useChartTiming } from './useChartTiming';
import { QueryStatus, deriveQueryStatus, hasRealData } from '../lib/queryClient';

const isDev = import.meta.env.DEV;

export function useAppQuery(queryFn, deps = [], options = {}) {
  const appReadyContext = useAppReadyOptional();
  const appReady = appReadyContext?.appReady ?? true;

  // Extract our custom options
  const {
    chartName,
    enabled: userEnabled = true,
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

  // Gate enabled on appReady
  const effectiveEnabled = userEnabled && appReady;

  // Stable query key from deps
  // Include appReady to force refetch when boot completes
  const queryKey = useMemo(() => ['appQuery', ...deps, appReady], [deps, appReady]);

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

  // isBootPending = !appReady (for ChartFrame to show skeleton during boot)
  const isBootPending = !appReady;

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
