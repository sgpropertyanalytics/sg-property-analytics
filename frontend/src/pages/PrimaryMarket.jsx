import React from 'react';
// Phase 3.4: PowerBIFilterProvider removed - useZustandFilters is self-contained
import { FilterBar } from '../components/powerbi/FilterBar';
import { NewVsResaleChart } from '../components/powerbi/NewVsResaleChart';
import { NewLaunchTimelineChart } from '../components/powerbi/NewLaunchTimelineChart';
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
    <div className="min-h-full">
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
          <div className="animate-view-enter space-y-4 md:space-y-6">
            {/* New Sale vs Recently TOP Chart - Full width */}
            <ErrorBoundary name="New vs Resale Chart" compact>
              <ChartWatermark>
                <NewVsResaleChart height={chartHeight} />
              </ChartWatermark>
            </ErrorBoundary>

            {/* New Launch Activity Timeline - Units launched per period with absorption rate */}
            <ErrorBoundary name="New Launch Timeline Chart" compact>
              <ChartWatermark>
                <NewLaunchTimelineChart height={chartHeight} />
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
 * Phase 3.4: No longer needs PowerBIFilterProvider - useZustandFilters is self-contained.
 * Each page automatically gets its own filter store instance based on route.
 */
export default function PrimaryMarket() {
  return <PrimaryMarketContent />;
}
