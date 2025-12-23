import React from 'react';

/**
 * ResultsSummaryBar - Compact summary bar showing budget-based results
 *
 * Used in ValueParityPanel to show:
 * - Budget-based message with range
 * - New Launches count
 * - Young Resale count
 * - Resale Market count
 */
export function ResultsSummaryBar({
  budget = 0,
  loading = false,
  hotProjectsCount = 0,
  youngResaleCount = 0,
  resaleMarketCount = 0,
  onJumpToNewLaunches,
  onJumpToYoungResale,
  onJumpToResaleMarket,
}) {
  // Format budget for display
  const formatBudget = (value) => {
    if (value >= 1000000) {
      const millions = value / 1000000;
      return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2)}M`;
    }
    return `$${(value / 1000).toFixed(0)}K`;
  };

  // Loading spinner component
  const LoadingSpinner = () => (
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      <span className="text-xs text-white/70">...</span>
    </div>
  );

  return (
    <div className="bg-gradient-to-r from-[#213448] to-[#547792] rounded-lg px-4 py-3 text-white">
      {/* Budget message */}
      <p className="text-sm mb-2 text-white/90">
        Based on your target price of <span className="font-semibold text-white">{formatBudget(budget)}</span> <span className="text-white/70">(+/- $100K)</span>, here are the properties you can buy:
      </p>

      {/* Stats row - compact */}
      <div className="flex items-center flex-wrap gap-3">
        {/* New Launches */}
        <button
          onClick={onJumpToNewLaunches}
          disabled={loading}
          className="flex items-center gap-1.5 hover:bg-white/10 rounded px-2 py-1 -mx-2 transition-colors disabled:opacity-70"
        >
          <span className="text-lg">🏗️</span>
          <span className="text-xs text-white/70">New Launches</span>
          {loading ? <LoadingSpinner /> : <span className="text-base font-bold">{hotProjectsCount}</span>}
        </button>

        <div className="border-l border-white/30 h-5" />

        {/* Young Resale */}
        <button
          onClick={onJumpToYoungResale}
          disabled={loading}
          className="flex items-center gap-1.5 hover:bg-white/10 rounded px-2 py-1 -mx-2 transition-colors disabled:opacity-70"
        >
          <span className="text-lg">🏠</span>
          <span className="text-xs text-white/70">Young Resale</span>
          {loading ? <LoadingSpinner /> : <span className="text-base font-bold">{youngResaleCount.toLocaleString()}</span>}
        </button>

        <div className="border-l border-white/30 h-5" />

        {/* Resale Market */}
        <button
          onClick={onJumpToResaleMarket}
          disabled={loading}
          className="flex items-center gap-1.5 hover:bg-white/10 rounded px-2 py-1 -mx-2 transition-colors disabled:opacity-70"
        >
          <span className="text-lg">🏘️</span>
          <span className="text-xs text-white/70">Resale Market</span>
          {loading ? <LoadingSpinner /> : <span className="text-base font-bold">{resaleMarketCount.toLocaleString()}</span>}
        </button>
      </div>
    </div>
  );
}

export default ResultsSummaryBar;
