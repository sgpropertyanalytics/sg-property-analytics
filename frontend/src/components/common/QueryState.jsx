import React from 'react';
import { ErrorState } from "./ErrorState";
import { ChartSkeleton } from "./ChartSkeleton";

/**
 * QueryState - Handles loading, error, and empty states for data queries
 *
 * @param {boolean} loading - Whether data is loading
 * @param {Error|string} error - Error object or message
 * @param {function} onRetry - Callback for retry button
 * @param {boolean} empty - Whether data is empty
 * @param {string} skeleton - Skeleton type: 'bar', 'line', 'pie', 'grid', 'table', 'map', 'default'
 * @param {number} height - Height for skeleton (default 300)
 * @param {React.ReactNode} children - Content to render when loaded
 */
export const QueryState = React.memo(function QueryState({ loading, error, onRetry, empty, skeleton, height = 300, children }) {
  if (loading) {
    if (skeleton) {
      return <ChartSkeleton type={skeleton} height={height} />;
    }
    return <div className="p-3 text-sm text-[#547792]">Loading…</div>;
  }
  if (error) return <ErrorState message={error?.message || String(error)} onRetry={onRetry} />;
  if (empty) return <div className="p-3 text-sm text-[#547792]">No data for selected filters.</div>;
  return children;
});
