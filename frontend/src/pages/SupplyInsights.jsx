import React from 'react';
import { GLSDataTable } from '../components/powerbi/GLSDataTable';
import { UpcomingLaunchesTable } from '../components/powerbi/UpcomingLaunchesTable';
import { SupplyWaterfallChart } from '../components/powerbi/SupplyWaterfallChart';
import { SupplyKpiCards } from '../components/powerbi/SupplyKpiCards';
import { SupplyBreakdownTable } from '../components/powerbi/SupplyBreakdownTable';
import { SupplyDataProvider } from '../context/SupplyDataContext';
import { ErrorBoundary } from '../components/ui';
import { useChartHeight, MOBILE_CAPS } from '../hooks';

// Page-level filter configuration (shared via SupplyDataProvider)
const INCLUDE_GLS = true;
const LAUNCH_YEAR = 2026;

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
 *
 * PERFORMANCE: Uses SupplyDataProvider to share a single API call across all
 * supply components (KPI cards, waterfall charts, breakdown table).
 * This eliminates 4 duplicate calls to /api/supply/summary.
 */
export function SupplyInsightsContent() {
  const tableHeight = useChartHeight(400, MOBILE_CAPS.tall);
  const chartHeight = useChartHeight(350, MOBILE_CAPS.medium);

  return (
    <SupplyDataProvider includeGls={INCLUDE_GLS} launchYear={LAUNCH_YEAR}>
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
              <SupplyKpiCards />
            </ErrorBoundary>

            {/* ===== Two-Chart Grid (Always side by side) ===== */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-stretch">

              {/* Chart 1: TRUE Waterfall (Supply Accumulator) */}
              <ErrorBoundary name="Supply Accumulator Chart" compact>
                <SupplyWaterfallChart
                  view="regional"
                  height={chartHeight}
                />
              </ErrorBoundary>

              {/* Chart 2: District Breakdown (always visible, shows all by default) */}
              <ErrorBoundary name="District Supply Chart" compact>
                <SupplyWaterfallChart
                  view="district"
                  height={chartHeight}
                />
              </ErrorBoundary>
            </div>

            {/* ===== Supply Breakdown Table ===== */}
            <ErrorBoundary name="Supply Breakdown Table" compact>
              <SupplyBreakdownTable />
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
    </SupplyDataProvider>
  );
}

export default SupplyInsightsContent;
