import React from 'react';

/**
 * DEPRECATED: TransactionDataTable removed for URA compliance.
 *
 * This component previously displayed raw transaction data which violates
 * URA data usage rules. Use AggregateInsightsPanel instead for market insights.
 *
 * The platform now provides:
 * - Aggregated market metrics (medians, percentiles)
 * - Distribution analysis (histograms, price bands)
 * - Trend indicators
 *
 * Individual transaction records are no longer exposed.
 */
export function TransactionDataTable({ height = 400 }) {
  return (
    <div
      className="bg-card rounded-lg border border-[#94B4C1]/50 flex items-center justify-center"
      style={{ height }}
    >
      <div className="p-6 text-center max-w-md">
        <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
          <svg
            className="w-6 h-6 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[#213448] mb-2">
          Component Deprecated
        </h3>
        <p className="text-sm text-[#547792] mb-4">
          Transaction-level data has been replaced with aggregated market insights
          for compliance reasons.
        </p>
        <p className="text-xs text-[#94B4C1]">
          Use the Market Insights panel to view aggregated metrics and distributions.
        </p>
      </div>
    </div>
  );
}

export default TransactionDataTable;
