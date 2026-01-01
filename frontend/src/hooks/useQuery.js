import { useState, useEffect, useRef, useMemo } from 'react';
import { useStaleRequestGuard } from './useStaleRequestGuard';

/**
 * Query Status Enum - The Gap Killer
 */
export const QueryStatus = {
  IDLE: 'idle',
  PENDING: 'pending',
  LOADING: 'loading',
  REFRESHING: 'refreshing',
  SUCCESS: 'success',
  ERROR: 'error',
};

/**
 * Check if data is "real" (not just initialData: [] or {})
 * Used for status derivation - empty arrays/objects should show LOADING, not REFRESHING
 * This prevents "Updating..." with "0 periods" state
 */
const hasRealData = (data) => {
  if (data == null) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (typeof data === 'object') {
    // Only check keys for plain objects; treat class instances as "has data"
    const isPlainObject = data.constructor === Object;
    return isPlainObject ? Object.keys(data).length > 0 : true;
  }
  return true;
};

/**
 * useQuery - Canonical data fetching hook with explicit state machine
 *
 * PR1 FIX: Introduces PENDING state derived SYNCHRONOUSLY during render.
 * PR2 FIX: Retry logic consolidated into API client interceptor (client.js).
 *
 * INVARIANT: First render after enabled flips true or depsKey changes = pending
 *
 * @param {Function} queryFn - Async function that receives AbortSignal and returns data
 * @param {Array} deps - Dependencies that trigger refetch (primitives recommended)
 * @param {Object} options - Configuration options
 * @returns {Object} Query state and helpers
 */
export function useQuery(queryFn, deps = [], options = {}) {
  const {
    enabled = true,
    initialData = null,
    onSuccess,
    onError,
    keepPreviousData = false,
    retryOnTokenRefresh = false,
  } = options;

  // Internal state
  const [internalState, setInternalState] = useState({
    data: initialData,
    error: null,
    inFlight: false,
  });

  const { startRequest, isStale, getSignal, abort } = useStaleRequestGuard();
  const mountedRef = useRef(true);

  // === REFS FOR SYNCHRONOUS PENDING DERIVATION ===
  const hasStartedRef = useRef(false);
  const lastKeyRef = useRef(null);
  const prevEnabledRef = useRef(enabled);
  // Signature-based guard for 401 retry (error objects can be recreated by interceptors)
  const retried401SigRef = useRef(null);
  // Belt-and-suspenders: track active requestId for setState guards
  const activeRequestIdRef = useRef(null);

  // Stable ref for callbacks (avoid effect deps churn)
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Generate stable key from deps
  const depsKey = useMemo(() => JSON.stringify(deps), [deps]);

  // === PURE BOOLEAN (no mutation during render) ===
  const isNewKey = lastKeyRef.current !== depsKey;

  // === STATUS DERIVATION (SYNCHRONOUS - THE GAP KILLER) ===
  const status = useMemo(() => {
    if (!enabled) {
      return QueryStatus.IDLE;
    }

    // Enabled but new key OR haven't started = pending
    if (isNewKey || !hasStartedRef.current) {
      return QueryStatus.PENDING;
    }

    if (internalState.inFlight) {
      // FIX: Empty arrays/objects = "no real data" = show LOADING (skeleton), not REFRESHING (blur)
      // This prevents "Updating..." with "0 periods" when initialData: [] was used
      if (hasRealData(internalState.data)) {
        return QueryStatus.REFRESHING;
      }
      return QueryStatus.LOADING;
    }

    if (internalState.error) {
      return QueryStatus.ERROR;
    }

    return QueryStatus.SUCCESS;
  }, [enabled, isNewKey, internalState.inFlight, internalState.data, internalState.error]);

  // Track mounted state and abort on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abort();
    };
  }, [abort]);

  // === SINGLE COMBINED EFFECT with proper guards ===
  useEffect(() => {
    const keyChanged = lastKeyRef.current !== depsKey;
    const enabledBecameTrue = !prevEnabledRef.current && enabled;

    // Update refs for next comparison
    lastKeyRef.current = depsKey;
    prevEnabledRef.current = enabled;

    // If disabled, just reset and return
    if (!enabled) {
      hasStartedRef.current = false;
      return;
    }

    // Only reset + execute when key actually changed or enabled flipped false→true
    if (!keyChanged && !enabledBecameTrue) {
      return;
    }

    // Reset started flag (will be set true below)
    hasStartedRef.current = false;

    // === Execute query inline ===
    // PR2: Retry logic moved to API client interceptor (client.js)
    const runQuery = async () => {
      hasStartedRef.current = true;

      const requestId = startRequest();
      activeRequestIdRef.current = requestId; // Track active request
      const signal = getSignal();

      // Set in-flight state
      setInternalState(prev => ({
        data: keepPreviousData ? prev.data : null,
        error: null,
        inFlight: true,
      }));

      retried401SigRef.current = null;

      try {
        if (signal?.aborted) return;

        const result = await queryFnRef.current(signal);

        if (isStale(requestId)) return;
        if (!mountedRef.current) return;

        setInternalState({
          data: result,
          error: null,
          inFlight: false,
        });

        if (onSuccessRef.current) {
          onSuccessRef.current(result);
        }
      } catch (err) {
        // Handle abort errors - CRITICAL: must reset inFlight to prevent stuck 'refreshing' state
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          // If stale, a newer request is handling state - safe to skip
          if (isStale(requestId)) return;
          // If unmounted, don't update state (would cause React warning)
          if (!mountedRef.current) return;
          // Reset inFlight on abort, keep previous data intact
          // Belt-and-suspenders: compare inside setState in case isStale() is buggy
          setInternalState(prev =>
            activeRequestIdRef.current !== requestId ? prev : { ...prev, inFlight: false }
          );
          return;
        }

        if (isStale(requestId)) return;
        if (!mountedRef.current) return;

        // Belt-and-suspenders: compare inside setState for error case too
        setInternalState(prev =>
          activeRequestIdRef.current !== requestId
            ? prev
            : {
                data: keepPreviousData ? prev.data : null,
                error: err,
                inFlight: false,
              }
        );

        if (onErrorRef.current) {
          onErrorRef.current(err);
        }
      }
    };

    runQuery();
  }, [depsKey, enabled, startRequest, getSignal, isStale, keepPreviousData]);

  // Manual refetch function
  // PR2: Retry logic moved to API client interceptor (client.js)
  const refetch = () => {
    if (!enabled) return;

    hasStartedRef.current = true;

    const runQuery = async () => {
      const requestId = startRequest();
      activeRequestIdRef.current = requestId; // Track active request
      const signal = getSignal();

      setInternalState(prev => ({
        data: keepPreviousData ? prev.data : null,
        error: null,
        inFlight: true,
      }));

      retried401SigRef.current = null;

      try {
        if (signal?.aborted) return;

        const result = await queryFnRef.current(signal);

        if (isStale(requestId)) return;
        if (!mountedRef.current) return;

        setInternalState({
          data: result,
          error: null,
          inFlight: false,
        });

        if (onSuccessRef.current) {
          onSuccessRef.current(result);
        }
      } catch (err) {
        // Handle abort errors - CRITICAL: must reset inFlight to prevent stuck 'refreshing' state
        if (err.name === 'CanceledError' || err.name === 'AbortError') {
          // If stale, a newer request is handling state - safe to skip
          if (isStale(requestId)) return;
          // If unmounted, don't update state (would cause React warning)
          if (!mountedRef.current) return;
          // Reset inFlight on abort, keep previous data intact
          // Belt-and-suspenders: compare inside setState in case isStale() is buggy
          setInternalState(prev =>
            activeRequestIdRef.current !== requestId ? prev : { ...prev, inFlight: false }
          );
          return;
        }

        if (isStale(requestId)) return;
        if (!mountedRef.current) return;

        // Belt-and-suspenders: compare inside setState for error case too
        setInternalState(prev =>
          activeRequestIdRef.current !== requestId
            ? prev
            : {
                data: keepPreviousData ? prev.data : null,
                error: err,
                inFlight: false,
              }
        );

        if (onErrorRef.current) {
          onErrorRef.current(err);
        }
      }
    };

    runQuery();
  };

  // Token refresh retry (same as useAbortableQuery)
  const errorRef = useRef(internalState.error);
  errorRef.current = internalState.error;

  useEffect(() => {
    if (!retryOnTokenRefresh) return;

    const handleTokenRefreshed = () => {
      const currentError = errorRef.current;
      const is401 = currentError?.response?.status === 401;
      if (!is401) return;

      // Use signature instead of object identity (error objects can be recreated by interceptors)
      const sig = `${currentError?.response?.status}:${currentError?.config?.url}`;
      if (retried401SigRef.current === sig) {
        return;
      }

      retried401SigRef.current = sig;
      refetch();
    };

    window.addEventListener('auth:token-refreshed', handleTokenRefreshed);
    return () => {
      window.removeEventListener('auth:token-refreshed', handleTokenRefreshed);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryOnTokenRefresh]);

  // === RETURN VALUE ===
  return {
    status,
    data: internalState.data,
    error: internalState.error,
    refetch,

    // Derived booleans (STRICT semantics)
    loading: status === QueryStatus.LOADING,
    isFetching: status === QueryStatus.LOADING || status === QueryStatus.REFRESHING,
    isRefetching: status === QueryStatus.REFRESHING,
    isPending: status === QueryStatus.PENDING,
    isIdle: status === QueryStatus.IDLE,
    isSuccess: status === QueryStatus.SUCCESS,
    isError: status === QueryStatus.ERROR,
    hasData: internalState.data != null,
  };
}

/**
 * isAbortError - Check if an error is an abort/cancel error
 */
export function isAbortError(err) {
  return err?.name === 'CanceledError' || err?.name === 'AbortError';
}

export default useQuery;
