import { useState, useCallback, useEffect, useId } from 'react';
import { useDebugMode } from '../context/DebugContext';

/**
 * useDebugOverlay - Captures and displays API call diagnostics
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
    status: 'idle', // idle | loading | success | error
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

  // Capture error
  const captureError = useCallback((error) => {
    setDebugInfo(prev => {
      const info = {
        ...prev,
        status: 'error',
        error: error?.message || String(error),
        timestamp: Date.now(),
      };
      registerDebugInfo(id, info);
      return info;
    });
  }, [id, registerDebugInfo]);

  // DebugOverlay component (renders only in debug mode)
  const DebugOverlay = useCallback(() => {
    if (!debugMode) return null;

    const { endpoint, params, recordCount, warnings, requestId, elapsedMs, status, error } = debugInfo;

    // Status indicator
    const statusColors = {
      idle: 'bg-gray-400',
      loading: 'bg-yellow-400 animate-pulse',
      success: 'bg-green-400',
      error: 'bg-red-400',
    };

    // Format params for display
    const formatParams = (p) => {
      if (!p) return 'none';
      return Object.entries(p)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
        .join(', ') || 'none';
    };

    return (
      <div className="absolute top-1 right-1 z-50 max-w-xs text-xs font-mono bg-black/85 text-green-400 rounded-lg shadow-lg border border-green-500/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-2 py-1 bg-green-900/50 border-b border-green-500/30">
          <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
          <span className="font-bold text-green-300">{componentName}</span>
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

          {/* Error */}
          {error && (
            <div className="mt-1 p-1 bg-red-900/50 rounded border border-red-500/30">
              <div className="text-red-400 break-all">{error}</div>
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
  }, [debugMode, debugInfo, componentName]);

  return {
    captureRequest,
    captureResponse,
    captureError,
    debugInfo,
    DebugOverlay,
    debugMode,
  };
}

export default useDebugOverlay;
