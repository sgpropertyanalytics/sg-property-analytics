import React from 'react';
import { ErrorState } from "./ErrorState";
import { ChartSkeleton } from "./ChartSkeleton";
import { useDebugMode } from '../../context/DebugContext';
import EmptyState from '../primitives/EmptyState';
import Skeleton from '../primitives/Skeleton';

/**
 * Get user-friendly error message from an error object.
 *
 * P0-2: Error normalization is the ONLY UI error source.
 * api/client.js normalizeError() attaches error.userMessage for all API errors.
 * This function returns that message or a generic fallback - never raw Axios strings.
 *
 * @param {Error} error - Error object (typically from API call)
 * @returns {string} User-friendly error message
 */
export const getQueryErrorMessage = (error) => {
  return error?.userMessage || 'Something went wrong. Please try again.';
};

/**
 * Format params object for display, filtering out sensitive keys
 */
const formatDebugParams = (params) => {
  if (!params) return 'none';
  const SENSITIVE_KEYS = ['token', 'auth', 'password', 'secret', 'key', 'jwt'];
  const entries = Object.entries(params)
    .filter(([k, v]) => {
      if (v === undefined || v === null || v === '') return false;
      if (SENSITIVE_KEYS.some(sk => k.toLowerCase().includes(sk))) return false;
      return true;
    });
  if (entries.length === 0) return 'none';
  return entries.map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ');
};

/**
 * DebugEmptyState - Shows debug info when chart is empty in debug mode
 */
const DebugEmptyState = ({ debugInfo }) => {
  const { endpoint, params, recordCount, warnings, requestId } = debugInfo || {};

  const copyDebugInfo = () => {
    navigator.clipboard.writeText(JSON.stringify({
      endpoint,
      params,
      recordCount,
      warnings,
      requestId,
      timestamp: new Date().toISOString(),
    }, null, 2));
  };

  return (
    <div className="p-3">
      <div className="text-sm text-brand-blue mb-2">No data for selected filters.</div>
      <div className="text-xs font-mono bg-black/85 text-green-400 rounded-lg border border-green-500/50 p-2">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-green-300">Debug Info</span>
          <button
            onClick={copyDebugInfo}
            className="px-1.5 py-0.5 text-[10px] bg-green-800/50 hover:bg-green-700/50 rounded border border-green-500/30"
            title="Copy debug info as JSON"
          >
            Copy
          </button>
        </div>
        <div className="space-y-1">
          <div className="flex gap-2">
            <span className="text-green-600">endpoint:</span>
            <span className="text-white">{endpoint || '-'}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-green-600">params:</span>
            <span className="text-white break-all">{formatDebugParams(params)}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-green-600">records:</span>
            <span className="text-yellow-400">{recordCount !== null && recordCount !== undefined ? recordCount : '-'} ⚠️</span>
          </div>
          {warnings && warnings.length > 0 && (
            <div className="mt-1 p-1 bg-yellow-900/50 rounded border border-yellow-500/30">
              <div className="text-yellow-400 font-bold text-[10px]">Warnings:</div>
              {warnings.map((w, i) => (
                <div key={i} className="text-yellow-300 text-[10px]">{w}</div>
              ))}
            </div>
          )}
          {requestId && (
            <div className="text-[10px] text-green-600 pt-1 border-t border-green-500/20">
              req: {requestId.slice(0, 20)}...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * QueryState - Handles loading, error, and empty states for data queries
 *
 * @param {boolean} loading - Whether data is loading
 * @param {Error|string} error - Error object or message
 * @param {function} onRetry - Callback for retry button
 * @param {boolean} empty - Whether data is empty
 * @param {string} skeleton - Skeleton type: 'bar', 'line', 'pie', 'grid', 'table', 'map', 'default'
 * @param {number} height - Height for skeleton (default 300)
 * @param {Object} debugInfo - Optional debug info { endpoint, params, recordCount, warnings, requestId }
 * @param {React.ReactNode} children - Content to render when loaded
 */
export const QueryState = React.memo(function QueryState({ loading, error, onRetry, empty, skeleton, height = 300, debugInfo, children }) {
  const { debugMode } = useDebugMode();

  if (loading) {
    if (skeleton) {
      return <ChartSkeleton type={skeleton} height={height} />;
    }
    return (
      <div className="p-3">
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }
  if (error) return <ErrorState message={getQueryErrorMessage(error)} onRetry={onRetry} />;
  if (empty) {
    // Show debug info when in debug mode and debugInfo is provided
    if (debugMode && debugInfo) {
      return <DebugEmptyState debugInfo={debugInfo} />;
    }
    return (
      <div className="p-3">
        <EmptyState title="No data for selected filters." className="items-start text-left" />
      </div>
    );
  }
  return children;
});
