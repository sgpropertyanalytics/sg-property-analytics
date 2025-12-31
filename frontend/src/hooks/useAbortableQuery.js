import { useState, useEffect, useCallback, useRef } from 'react';
import { useStaleRequestGuard } from './useStaleRequestGuard';

/**
 * Check if an error is a network/timeout error that should be retried.
 * Does NOT retry: abort errors, 4xx client errors, or non-network errors.
 * Note: 401s are handled separately via auth:token-expired flow.
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

  // Don't retry on 4xx client errors (401s handled via token refresh flow)
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
 *     retryOnTokenRefresh: true, // Auto-retry on auth:token-refreshed event (after 401)
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
    retryOnTokenRefresh = false, // When true, automatically retry on auth:token-refreshed event
  } = options;

  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  // Track if we're fetching in background (for keepPreviousData mode)
  const [isFetching, setIsFetching] = useState(false);

  const { startRequest, isStale, getSignal } = useStaleRequestGuard();
  const mountedRef = useRef(true);

  // Stable refs to avoid useCallback churn
  const hasDataRef = useRef(false); // Track if we've received data (avoids data in deps)
  const retriedFor401Ref = useRef(null); // Track which 401 error we've retried (prevents infinite loops)
  const prevEnabledRef = useRef(enabled); // Track enabled state for transition detection

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
    // Use ref to avoid data/initialData in useCallback deps (causes churn)
    if (keepPreviousData && hasDataRef.current) {
      setIsFetching(true); // Background fetch indicator
      // Don't set loading=true - keep showing previous data
    } else {
      setLoading(true);
    }
    setError(null);
    // Clear 401 retry guard on new query attempt
    retriedFor401Ref.current = null;

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
        hasDataRef.current = true; // Mark that we have data (for keepPreviousData)
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
  // Note: data/initialData removed from deps - using hasDataRef instead to avoid churn
  }, [queryFn, enabled, startRequest, getSignal, isStale, onSuccess, onError, retries, keepPreviousData]);

  // Execute query when dependencies change
  useEffect(() => {
    executeQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled]);

  // P0 INVARIANT: When enabled transitions false → true, ensure clean slate
  // This guarantees queries re-execute when boot completes (not stuck in cached state)
  useEffect(() => {
    const wasDisabled = prevEnabledRef.current === false;
    const isNowEnabled = enabled === true;

    if (wasDisabled && isNowEnabled) {
      // Reset hasDataRef to ensure loading state shows (not isFetching)
      // for the first fetch after re-enable. This prevents
      // keepPreviousData from showing stale data from before disable.
      hasDataRef.current = false;
      if (process.env.NODE_ENV === 'development') {
        console.log('[useAbortableQuery] enabled transitioned false → true, reset hasDataRef');
      }
    }

    prevEnabledRef.current = enabled;
  }, [enabled]);

  // Stable refs for token refresh handler (avoids effect churn)
  const errorRef = useRef(error);
  errorRef.current = error;
  const executeQueryRef = useRef(executeQuery);
  executeQueryRef.current = executeQuery;

  // Listen for token refresh events and retry failed requests
  // This handles the case where a 401 caused a failure, then AuthContext refreshed the token
  useEffect(() => {
    if (!retryOnTokenRefresh) return;

    const handleTokenRefreshed = () => {
      const currentError = errorRef.current;

      // P0 SAFETY: Only retry on STRUCTURED 401 (no string matching)
      const is401 = currentError?.response?.status === 401;
      if (!is401) return;

      // P0 SAFETY: Retry once per 401 - prevent infinite loops
      // If we've already retried for this exact error object, skip
      if (retriedFor401Ref.current === currentError) {
        console.log('[useAbortableQuery] Already retried for this 401, skipping');
        return;
      }

      console.log('[useAbortableQuery] Token refreshed, retrying failed 401 request');
      retriedFor401Ref.current = currentError; // Mark as retried
      executeQueryRef.current();
    };

    window.addEventListener('auth:token-refreshed', handleTokenRefreshed);

    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefreshed);
    };
  }, [retryOnTokenRefresh]); // Stable deps - refs handle the rest

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
