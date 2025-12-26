import React from 'react';

/**
 * DEPRECATED: UnitSizeVsPriceChart removed for URA compliance.
 *
 * This chart previously displayed individual transaction points (price + size),
 * which violates URA data usage rules prohibiting raw data redistribution.
 *
 * The platform now provides aggregated market insights instead:
 * - Price Distribution histogram (shows market range)
 * - Size breakdowns by bedroom type (aggregated)
 * - Price bands and percentiles
 *
 * Individual transaction scatter plots are no longer available.
 */
export function UnitSizeVsPriceChart({ height = 350 }) {
  // Match the card height calculation from the original component
  const cardHeight = height + 190;

  return (
    <div
      className="bg-white rounded-lg border border-[#94B4C1]/50 overflow-hidden flex flex-col items-center justify-center"
      style={{ height: cardHeight }}
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
          Visualization Deprecated
        </h3>
        <p className="text-sm text-[#547792] mb-4">
          Individual transaction scatter plots have been replaced with aggregated
          market insights for compliance reasons.
        </p>
        <p className="text-xs text-[#94B4C1]">
          Use the Price Distribution histogram to understand market pricing patterns.
        </p>
      </div>
    </div>
  );
}

export default UnitSizeVsPriceChart;
