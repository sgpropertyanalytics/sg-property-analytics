import { useState, useEffect, useCallback, useRef } from 'react';
import { useStaleRequestGuard } from './useStaleRequestGuard';

/**
 * Check if an error is a network/timeout error that should be retried.
 * Does NOT retry: abort errors, 4xx client errors, or non-network errors.
 */
const isRetryableError = (err) => {
  // Never retry abort errors - they're intentional
  if (err?.name === 'CanceledError' || err?.name === 'AbortError') {
    return false;
  }

  // Retry on network errors (no response from server)
  if (err?.code === 'ECONNABORTED' || err?.code === 'ERR_NETWORK') {
    return true;
  }

  // Retry on timeout
  if (err?.message?.includes('timeout')) {
    return true;
  }

  // Retry on 5xx server errors
  if (err?.response?.status >= 500) {
    return true;
  }

  // Don't retry on 4xx client errors
  if (err?.response?.status >= 400 && err?.response?.status < 500) {
    return false;
  }

  // Default: retry network-like errors
  return !err?.response;
};

/**
 * useAbortableQuery - Safe async data fetching with abort and stale protection
 *
 * This hook enforces the institutional-grade async pattern:
 * - Automatic AbortController cancellation on filter changes
 * - Stale request detection (requestId tracking)
 * - CanceledError/AbortError never treated as real errors
 * - No state updates after unmount
 * - Loading/error/data state management
 * - Automatic retry on network failures (cold start resilience)
 *
 * RULE: "No component may call fetch or axios directly.
 *        All async data loading must go through useAbortableQuery or useStaleRequestGuard."
 *
 * Usage:
 * ```jsx
 * // Simple usage with dependency-based refetch
 * const { data, loading, error, refetch } = useAbortableQuery(
 *   async (signal) => {
 *     const response = await apiClient.get('/api/data', { signal, params });
 *     return response.data;
 *   },
 *   [filterKey, localDrillLevel]  // Dependencies that trigger refetch
 * );
 *
 * // With options
 * const { data, loading, error, isFetching } = useAbortableQuery(
 *   fetchFunction,
 *   dependencies,
 *   {
 *     enabled: someCondition,  // Skip fetch if false
 *     initialData: [],         // Initial data before first fetch
 *     onSuccess: (data) => {}, // Callback on success
 *     onError: (err) => {},    // Callback on error (excludes abort)
 *     retries: 1,              // Number of retries on network failure (default: 1)
 *     keepPreviousData: true,  // Keep showing previous data while fetching (no loading flash)
 *   }
 * );
 * ```
 *
 * @param {Function} queryFn - Async function that receives AbortSignal and returns data
 * @param {Array} deps - Dependencies that trigger refetch (like useEffect deps)
 * @param {Object} options - Optional configuration
 * @returns {Object} { data, loading, error, isFetching, refetch }
 */
export function useAbortableQuery(queryFn, deps = [], options = {}) {
  const {
    enabled = true,
    initialData = null,
    onSuccess,
    onError,
    retries = 1, // Default: 1 retry for cold start resilience
    keepPreviousData = false, // When true, keep showing previous data while fetching (no loading flash)
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  // Track if we're fetching in background (for keepPreviousData mode)
  const [isFetching, setIsFetching] = useState(false);

  const { startRequest, isStale, getSignal } = useStaleRequestGuard();
  const mountedRef = useRef(true);

  // Track mounted state to prevent updates after unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const executeQuery = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const requestId = startRequest();
    const signal = getSignal();

    // keepPreviousData: Only show loading state if we have no data yet
    // This prevents loading flash when filters change - chart stays visible
    const hasExistingData = data !== null && data !== initialData;
    if (keepPreviousData && hasExistingData) {
      setIsFetching(true); // Background fetch indicator
      // Don't set loading=true - keep showing previous data
    } else {
      setLoading(true);
    }
    setError(null);

    // Retry loop for network failures (cold start resilience)
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Small delay before retry (not on first attempt)
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }

        // Check if aborted during delay
        if (signal?.aborted) {
          return;
        }

        const result = await queryFn(signal);

        // Guard 1: Check if request is stale (newer request started)
        if (isStale(requestId)) return;

        // Guard 2: Check if component is still mounted
        if (!mountedRef.current) return;

        setData(result);
        setLoading(false);
        setIsFetching(false);

        if (onSuccess) {
          onSuccess(result);
        }
        return; // Success - exit retry loop
      } catch (err) {
        lastError = err;

        // CRITICAL: Never treat abort/cancel as a real error
        // This prevents "Failed to load" flash when switching tabs rapidly
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          return;
        }

        // Guard: Check stale after error too
        if (isStale(requestId)) return;
        if (!mountedRef.current) return;

        // If this is a retryable error and we have retries left, continue
        if (isRetryableError(err) && attempt < retries) {
          console.warn(`[useAbortableQuery] Retry ${attempt + 1}/${retries} after network error:`, err.message);
          continue;
        }

        // No more retries - set error state
        break;
      }
    }

    // All retries exhausted or non-retryable error
    if (lastError && !isStale(requestId) && mountedRef.current) {
      setError(lastError);
      setLoading(false);
      setIsFetching(false);

      if (onError) {
        onError(lastError);
      }
    }
  }, [queryFn, enabled, startRequest, getSignal, isStale, onSuccess, onError, retries, keepPreviousData, data, initialData]);

  // Execute query when dependencies change
  useEffect(() => {
    executeQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  return {
    data,
    loading,
    error,
    isFetching, // True when fetching in background (keepPreviousData mode)
    refetch: executeQuery,
  };
}

/**
 * isAbortError - Check if an error is an abort/cancel error
 *
 * Use this in catch blocks when manually handling fetch:
 * ```jsx
 * catch (err) {
 *   if (isAbortError(err)) return;  // Ignore abort
 *   setError(err);
 * }
 * ```
 */
export function isAbortError(err) {
  return err?.name === 'CanceledError' || err?.name === 'AbortError';
}

export default useAbortableQuery;
