import React from 'react';
import { PowerBIFilterProvider } from '../context/PowerBIFilterContext';
import { FilterBar } from '../components/powerbi/FilterBar';
import { NewVsResaleChart } from '../components/powerbi/NewVsResaleChart';
import { ErrorBoundary, ChartWatermark } from '../components/ui';
import { useChartHeight, MOBILE_CAPS } from '../hooks';
import { PageHeader } from '../components/ui';

/**
 * Primary Market Page - New Sale vs Resale Comparison
 *
 * This page is dedicated to comparing New Sale and Resale market segments.
 * Unlike Market Core (which is Resale-only), this page shows both sale types.
 *
 * Has its own INDEPENDENT filter context - filter state is not shared with Market Core.
 */
export function PrimaryMarketContent() {
  // Desktop-first chart height with mobile guardrail
  const chartHeight = useChartHeight(400, MOBILE_CAPS.tall);

  return (
    <div className="min-h-full bg-[#EAE0CF]/40">
      {/* Main Content Area - scrolling handled by parent DashboardLayout */}
      <div className="p-3 md:p-4 lg:p-6">
          {/* Header */}
          <div className="mb-4 md:mb-6">
            <PageHeader
              title="New Launch Market"
              subtitle="Compare New Sale vs Recently TOP transactions across the market"
            />
          </div>

          {/* Filter Bar - Unified component (desktop: sticky horizontal, mobile: drawer) */}
          <FilterBar />

          {/* Chart Grid */}
          <div className="animate-view-enter">
            {/* New Sale vs Recently TOP Chart - Full width */}
            <ErrorBoundary name="New vs Resale Chart" compact>
              <ChartWatermark>
                <NewVsResaleChart height={chartHeight} />
              </ChartWatermark>
            </ErrorBoundary>
          </div>
        </div>
      </div>
  );
}

/**
 * Standalone PrimaryMarket with Independent Filter Context
 *
 * This page has its own PowerBIFilterProvider, completely isolated from Market Core.
 * Filter selections here do NOT affect Market Core and vice versa.
 */
export default function PrimaryMarket() {
  return (
    <PowerBIFilterProvider>
      <PrimaryMarketContent />
    </PowerBIFilterProvider>
  );
}
