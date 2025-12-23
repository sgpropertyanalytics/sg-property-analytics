import React from 'react';

/**
 * ResultsSummaryBar - Compact summary bar showing budget-based results
 *
 * Used in ValueParityPanel to show:
 * - Budget-based message with range
 * - New Launches count
 * - Resale Transactions count
 */
export function ResultsSummaryBar({
  budget = 0,
  hotProjectsCount = 0,
  youngResaleCount = 0,
  onJumpToNewLaunches,
  onJumpToResale,
}) {
  // Format budget for display
  const formatBudget = (value) => {
    if (value >= 1000000) {
      const millions = value / 1000000;
      return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  return (
    <div className="bg-gradient-to-r from-[#213448] to-[#547792] rounded-lg px-4 py-3 text-white">
      {/* Budget message */}
      <p className="text-sm mb-2 text-white/90">
        Based on your target price of <span className="font-semibold text-white">{formatBudget(budget)}</span> <span className="text-white/70">(+/- $100K)</span>, here are the properties you can buy:
      </p>

      {/* Stats row - compact */}
      <div className="flex items-center gap-4">
        {/* New Launches */}
        <button
          onClick={onJumpToNewLaunches}
          className="flex items-center gap-2 hover:bg-white/10 rounded px-2 py-1 -mx-2 transition-colors"
        >
          <span className="text-lg">🏗️</span>
          <span className="text-xs text-white/70">New Launches</span>
          <span className="text-base font-bold">{hotProjectsCount}</span>
        </button>

        <div className="border-l border-white/30 h-5" />

        {/* Resale */}
        <button
          onClick={onJumpToResale}
          className="flex items-center gap-2 hover:bg-white/10 rounded px-2 py-1 -mx-2 transition-colors"
        >
          <span className="text-lg">🏠</span>
          <span className="text-xs text-white/70">Resale</span>
          <span className="text-base font-bold">{youngResaleCount.toLocaleString()}</span>
        </button>
      </div>
    </div>
  );
}

export default ResultsSummaryBar;
