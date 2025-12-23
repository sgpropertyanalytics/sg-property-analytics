import React from 'react';

/**
 * ResultsSummaryBar - Summary bar showing budget-based results
 *
 * Used in ValueParityPanel to show:
 * - Budget-based message
 * - New Launches count
 * - Resale Transactions count
 * - Quick navigation links to each section
 */
export function ResultsSummaryBar({
  budget = 0,
  hotProjectsCount = 0,
  youngResaleCount = 0,
  resaleMarketCount = 0,
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
    <div className="bg-gradient-to-r from-[#213448] to-[#547792] rounded-lg p-4 text-white">
      {/* Budget message */}
      <p className="text-sm mb-3 text-white/90">
        Based on your target price of <span className="font-semibold text-white">{formatBudget(budget)}</span>, here are the upcoming and existing properties you can buy:
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-6">
        {/* New Launches */}
        <button
          onClick={onJumpToNewLaunches}
          className="flex items-center gap-2 hover:bg-white/10 rounded-lg px-3 py-2 -mx-3 transition-colors"
        >
          <span className="text-2xl">🏗️</span>
          <div className="text-left">
            <div className="text-xs text-white/70">New Launches</div>
            <div className="text-xl font-bold">{hotProjectsCount}</div>
          </div>
        </button>

        <div className="border-l border-white/30 h-10" />

        {/* Resale */}
        <button
          onClick={onJumpToResale}
          className="flex items-center gap-2 hover:bg-white/10 rounded-lg px-3 py-2 -mx-3 transition-colors"
        >
          <span className="text-2xl">🏠</span>
          <div className="text-left">
            <div className="text-xs text-white/70">Resale</div>
            <div className="text-xl font-bold">{youngResaleCount.toLocaleString()}</div>
            <div className="text-[10px] text-white/60">
              and {resaleMarketCount.toLocaleString()} benchmarked transactions
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

export default ResultsSummaryBar;
