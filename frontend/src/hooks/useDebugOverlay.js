import { useState, useCallback, useId } from 'react';
import { useDebugMode } from '../context/DebugContext';

/**
 * Check if an error is an abort/cancel error (not a real failure)
 */
function isAbortError(err) {
  return err?.name === 'CanceledError' || err?.name === 'AbortError';
}

/**
 * useDebugOverlay - Captures and displays API call diagnostics
 *
 * SECURITY: Only captures safe, non-sensitive data:
 * - endpoint path (no full URL with auth params)
 * - query params (filtered to exclude auth tokens)
 * - record count, warnings, requestId, timing
 *
 * NEVER captures: Authorization headers, JWT, user email, subscription payloads
 *
 * Usage:
 * ```jsx
 * function MyChart() {
 *   const { captureRequest, captureResponse, debugInfo, DebugOverlay } = useDebugOverlay('MyChart');
 *
 *   const { data } = useAbortableQuery(async (signal) => {
 *     const params = { district: 'D09', sale_type: 'resale' };
 *     captureRequest('/api/aggregate', params);
 *
 *     const response = await getAggregate(params, { signal });
 *     captureResponse(response);
 *
 *     return response.data;
 *   }, [filterKey]);
 *
 *   return (
 *     <div className="relative">
 *       <DebugOverlay />
 *       <Chart data={data} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useDebugOverlay(componentName) {
  const id = useId();
  const { debugMode, registerDebugInfo } = useDebugMode();

  const [debugInfo, setDebugInfo] = useState({
    componentName,
    endpoint: null,
    params: null,
    recordCount: null,
    warnings: [],
    requestId: null,
    elapsedMs: null,
    status: 'idle', // idle | loading | success | error | canceled
    error: null,
    timestamp: null,
  });

  // Capture request info before API call
  const captureRequest = useCallback((endpoint, params) => {
    const info = {
      componentName,
      endpoint,
      params,
      recordCount: null,
      warnings: [],
      requestId: null,
      elapsedMs: null,
      status: 'loading',
      error: null,
      timestamp: Date.now(),
    };
    setDebugInfo(info);
    registerDebugInfo(id, info);
  }, [componentName, id, registerDebugInfo]);

  // Capture response info after API call
  const captureResponse = useCallback((response, dataLength = null) => {
    setDebugInfo(prev => {
      // Extract meta from response (apiClient adds response.meta)
      const meta = response?.meta || {};
      // Try to get record count from various sources
      let recordCount = dataLength;
      if (recordCount === null) {
        if (Array.isArray(response?.data)) {
          recordCount = response.data.length;
        } else if (response?.data?._meta?.record_count !== undefined) {
          recordCount = response.data._meta.record_count;
        } else if (meta.record_count !== undefined) {
          recordCount = meta.record_count;
        }
      }

      // Extract warnings
      const warnings = response?.data?._meta?.warnings || meta.warnings || [];

      const info = {
        ...prev,
        recordCount,
        warnings,
        requestId: meta.requestId || response?.headers?.['x-request-id'] || null,
        elapsedMs: meta.elapsedMs || null,
        status: 'success',
        error: null,
        timestamp: Date.now(),
      };
      registerDebugInfo(id, info);
      return info;
    });
  }, [id, registerDebugInfo]);

  // Capture error (handles AbortError specially - not a failure)
  const captureError = useCallback((error) => {
    // AbortError/CanceledError = request was intentionally canceled (not a failure)
    const isCanceled = isAbortError(error);

    setDebugInfo(prev => {
      const info = {
        ...prev,
        status: isCanceled ? 'canceled' : 'error',
        error: isCanceled ? 'Request canceled (filter changed)' : (error?.message || String(error)),
        timestamp: Date.now(),
      };
      registerDebugInfo(id, info);
      return info;
    });
  }, [id, registerDebugInfo]);

  // Copy debug info to clipboard as JSON
  const copyDebugInfo = useCallback(() => {
    const { endpoint, params, recordCount, warnings, requestId, elapsedMs, status, error } = debugInfo;
    const debugJson = {
      component: componentName,
      endpoint,
      params,
      recordCount,
      warnings,
      requestId,
      elapsedMs,
      status,
      error,
      timestamp: new Date(debugInfo.timestamp).toISOString(),
    };
    navigator.clipboard.writeText(JSON.stringify(debugJson, null, 2));
  }, [debugInfo, componentName]);

  // DebugOverlay component (renders only in debug mode)
  const DebugOverlay = useCallback(() => {
    if (!debugMode) return null;

    const { endpoint, params, recordCount, warnings, requestId, elapsedMs, status, error } = debugInfo;

    // Status indicator colors
    const statusColors = {
      idle: 'bg-gray-400',
      loading: 'bg-yellow-400 animate-pulse',
      success: 'bg-green-400',
      error: 'bg-red-400',
      canceled: 'bg-gray-400', // Canceled is neutral, not an error
    };

    // Status labels
    const statusLabels = {
      idle: '',
      loading: '⏳',
      success: '✓',
      error: '✗',
      canceled: '⊘',
    };

    // Format params for display (filter sensitive keys)
    const formatParams = (p) => {
      if (!p) return 'none';
      const SENSITIVE_KEYS = ['token', 'auth', 'password', 'secret', 'key', 'jwt'];
      return Object.entries(p)
        .filter(([k, v]) => {
          if (v === undefined || v === null || v === '') return false;
          // Filter out sensitive params
          if (SENSITIVE_KEYS.some(sk => k.toLowerCase().includes(sk))) return false;
          return true;
        })
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(', ') || 'none';
    };

    return (
      <div className="absolute top-1 right-1 z-50 max-w-xs text-xs font-mono bg-black/85 text-green-400 rounded-lg shadow-lg border border-green-500/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-2 py-1 bg-green-900/50 border-b border-green-500/30">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
            <span className="font-bold text-green-300">{componentName}</span>
            <span className="text-green-500">{statusLabels[status]}</span>
          </div>
          {/* Copy button */}
          <button
            onClick={copyDebugInfo}
            className="px-1.5 py-0.5 text-[10px] bg-green-800/50 hover:bg-green-700/50 rounded border border-green-500/30 transition-colors"
            title="Copy debug info as JSON"
          >
            Copy
          </button>
        </div>

        {/* Body */}
        <div className="p-2 space-y-1">
          {/* Endpoint */}
          <div className="flex gap-2">
            <span className="text-green-600">endpoint:</span>
            <span className="text-white truncate">{endpoint || '-'}</span>
          </div>

          {/* Params */}
          <div className="flex gap-2">
            <span className="text-green-600">params:</span>
            <span className="text-white break-all">{formatParams(params)}</span>
          </div>

          {/* Record count */}
          <div className="flex gap-2">
            <span className="text-green-600">records:</span>
            <span className={recordCount === 0 ? 'text-yellow-400' : 'text-white'}>
              {recordCount !== null ? recordCount : '-'}
              {recordCount === 0 && ' ⚠️'}
            </span>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="mt-1 p-1 bg-yellow-900/50 rounded border border-yellow-500/30">
              <div className="text-yellow-400 font-bold">Warnings:</div>
              {warnings.map((w, i) => (
                <div key={i} className="text-yellow-300 text-[10px]">{w}</div>
              ))}
            </div>
          )}

          {/* Error/Canceled message */}
          {error && status === 'error' && (
            <div className="mt-1 p-1 bg-red-900/50 rounded border border-red-500/30">
              <div className="text-red-400 break-all">{error}</div>
            </div>
          )}
          {status === 'canceled' && (
            <div className="mt-1 p-1 bg-gray-800/50 rounded border border-gray-500/30">
              <div className="text-gray-400 text-[10px]">Request canceled (new filter applied)</div>
            </div>
          )}

          {/* Footer: requestId + timing */}
          <div className="flex justify-between text-[10px] text-green-600 pt-1 border-t border-green-500/20">
            <span>{requestId ? `req: ${requestId.slice(0, 12)}...` : 'req: -'}</span>
            <span>{elapsedMs ? `${elapsedMs}ms` : '-'}</span>
          </div>
        </div>
      </div>
    );
  }, [debugMode, debugInfo, componentName, copyDebugInfo]);

  /**
   * Wrap an async API call with automatic debug capture.
   * Use this for cleaner integration:
   *
   * ```jsx
   * const result = await wrapApiCall('/api/aggregate', params, () =>
   *   getAggregate(params, { signal })
   * );
   * ```
   */
  const wrapApiCall = useCallback(async (endpoint, params, apiCall) => {
    captureRequest(endpoint, params);
    try {
      const response = await apiCall();
      captureResponse(response);
      return response;
    } catch (err) {
      captureError(err);
      throw err;
    }
  }, [captureRequest, captureResponse, captureError]);

  return {
    captureRequest,
    captureResponse,
    captureError,
    wrapApiCall,
    debugInfo,
    DebugOverlay,
    debugMode,
  };
}

export default useDebugOverlay;
