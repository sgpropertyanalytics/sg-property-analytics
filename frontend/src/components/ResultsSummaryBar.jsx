import React from 'react';

/**
 * ResultsSummaryBar - Sticky summary bar showing result counts with jump links
 *
 * Used in ValueParityPanel to show:
 * - New Launches count
 * - Resale Transactions count
 * - Quick navigation links to each section
 */
export function ResultsSummaryBar({
  hotProjectsCount = 0,
  totalTransactions = 0,
  onJumpToNewLaunches,
  onJumpToResale,
}) {
  return (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#94B4C1]/50 shadow-sm">
      <div className="px-4 py-2.5 flex items-center justify-between">
        {/* Left: Quick stats */}
        <div className="flex items-center gap-4 text-sm">
          <button
            onClick={onJumpToNewLaunches}
            className="flex items-center gap-1.5 hover:text-[#213448] transition-colors group"
          >
            <span className="text-base">🏗️</span>
            <span className="text-[#547792] group-hover:text-[#213448]">New Launches</span>
            <span className="font-semibold text-[#213448]">{hotProjectsCount}</span>
          </button>

          <div className="border-l border-[#94B4C1]/50 h-4" />

          <button
            onClick={onJumpToResale}
            className="flex items-center gap-1.5 hover:text-[#213448] transition-colors group"
          >
            <span className="text-base">🏠</span>
            <span className="text-[#547792] group-hover:text-[#213448]">Resale</span>
            <span className="font-semibold text-[#213448]">{totalTransactions.toLocaleString()}</span>
          </button>
        </div>

        {/* Right: Format indicator (optional) */}
        <div className="hidden sm:block text-xs text-[#94B4C1]">
          Results
        </div>
      </div>
    </div>
  );
}

export default ResultsSummaryBar;
