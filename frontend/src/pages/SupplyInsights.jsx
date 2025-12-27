import React, { useState } from 'react';
import { GLSDataTable } from '../components/powerbi/GLSDataTable';
import { UpcomingLaunchesTable } from '../components/powerbi/UpcomingLaunchesTable';
import { SupplyWaterfallChart } from '../components/powerbi/SupplyWaterfallChart';
import { SupplyKpiCards } from '../components/powerbi/SupplyKpiCards';
import { SupplyBreakdownTable } from '../components/powerbi/SupplyBreakdownTable';
import { ErrorBoundary } from '../components/ui';
import { useChartHeight, MOBILE_CAPS } from '../hooks';

/**
 * Supply & Inventory Insights Page
 *
 * Displays supply-side market data:
 * - Supply Accumulator Waterfall Charts (Regional + District)
 * - Government Land Sales (GLS) data table
 * - Upcoming project launches table
 *
 * IMPORTANT: This page uses LOCAL state for filters, NOT usePowerBIFilters().
 * Per CLAUDE.md Card 13, only Market Pulse uses the sidebar filter context.
 */
export function SupplyInsightsContent() {
  const tableHeight = useChartHeight(400, MOBILE_CAPS.tall);
  const chartHeight = useChartHeight(350, MOBILE_CAPS.medium);

  // Local state for waterfall chart controls
  const [launchYear, setLaunchYear] = useState(2026);

  return (
    <div className="h-full overflow-auto">
      <div className="p-3 md:p-4 lg:p-6">
        {/* Header */}
        <div className="mb-4 md:mb-6">
          <h1 className="text-lg md:text-xl lg:text-2xl font-bold text-[#213448]">
            Supply & Inventory Insights
          </h1>
          <p className="text-[#547792] text-sm mt-1">
            Track supply pipeline, government land sales, and upcoming launches
          </p>
        </div>

        {/* Content */}
        <div className="animate-view-enter space-y-4 md:space-y-6">

          {/* ===== KPI Cards (3 equal columns) ===== */}
          <ErrorBoundary name="Supply KPI Cards" compact>
            <SupplyKpiCards
              includeGls={true}
              launchYear={launchYear}
            />
          </ErrorBoundary>

          {/* ===== Controls Row (Single Row) ===== */}
          <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-[#94B4C1]/50 p-3 md:p-4">
            {/* Launch Year */}
            <select
              value={launchYear}
              onChange={(e) => setLaunchYear(parseInt(e.target.value, 10))}
              className="px-2 py-1.5 rounded-lg border border-[#94B4C1]/50 bg-white text-sm text-[#213448] focus:ring-2 focus:ring-[#547792]/20"
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>

          {/* ===== Two-Chart Grid (Always side by side) ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">

            {/* Chart 1: TRUE Waterfall (Supply Accumulator) */}
            <ErrorBoundary name="Supply Accumulator Chart" compact>
              <SupplyWaterfallChart
                view="regional"
                includeGls={true}
                launchYear={launchYear}
                height={chartHeight}
              />
            </ErrorBoundary>

            {/* Chart 2: District Breakdown (always visible, shows all by default) */}
            <ErrorBoundary name="District Supply Chart" compact>
              <SupplyWaterfallChart
                view="district"
                includeGls={true}
                launchYear={launchYear}
                height={chartHeight}
              />
            </ErrorBoundary>
          </div>

          {/* ===== Supply Breakdown Table ===== */}
          <ErrorBoundary name="Supply Breakdown Table" compact>
            <SupplyBreakdownTable
              includeGls={true}
              launchYear={launchYear}
            />
          </ErrorBoundary>

          {/* ===== Divider ===== */}
          <div className="border-t border-[#94B4C1]/30 my-6" />

          {/* ===== Data Tables ===== */}
          <h2 className="text-base md:text-lg font-semibold text-[#213448] mb-3">
            Detailed Data Tables
          </h2>

          {/* GLS Data Table */}
          <ErrorBoundary name="GLS Data Table" compact>
            <GLSDataTable height={tableHeight} />
          </ErrorBoundary>

          {/* Upcoming Launches Table */}
          <ErrorBoundary name="Upcoming Launches" compact>
            <UpcomingLaunchesTable height={tableHeight} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default SupplyInsightsContent;
